import realData from './real-data.json';
import realAlerts from './real-alerts.json';
import {
  CrisisAlert, DashboardMetrics, FeedbackFilters, FeedbackRecord, IFeedbackService,
} from './types';

/**
 * Реальні дані: 19.5 тис. згадок про Vodafone, Київстар і lifecell
 * за рік з Google Play, App Store, Google News і телеграм-каналів.
 * Тональність — класифікатор, навчений на 16 600 зірках (точність 0.912).
 *
 * Той самий інтерфейс, що й у MockFeedbackService, тому перемикання —
 * один рядок у feedback-service.ts.
 */
export class RealFeedbackService implements IFeedbackService {
  private data = realData as unknown as FeedbackRecord[];

  private apply(filters?: FeedbackFilters): FeedbackRecord[] {
    let result = [...this.data];
    if (!filters) return result;

    if (filters.problemType?.length) {
      result = result.filter(f => filters.problemType!.includes(f.problemType));
    }
    if (filters.isRelevant !== undefined) {
      result = result.filter(f => f.isRelevant === filters.isRelevant);
    }
    if (filters.isConstructive !== undefined) {
      result = result.filter(f => f.isConstructive === filters.isConstructive);
    }
    if (filters.minRelevance !== undefined) {
      result = result.filter(f => f.relevanceScore >= filters.minRelevance!);
    }
    if (filters.minConstructiveness !== undefined) {
      result = result.filter(f => f.constructivenessScore >= filters.minConstructiveness!);
    }
    if (filters.location) {
      result = result.filter(f => f.locationName === filters.location);
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      result = result.filter(f => new Date(f.timestamp).getTime() >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      result = result.filter(f => new Date(f.timestamp).getTime() <= end);
    }
    return result;
  }

  async getFeedbacks(filters?: FeedbackFilters): Promise<FeedbackRecord[]> {
    return this.apply(filters).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getFeedbackById(id: string): Promise<FeedbackRecord | null> {
    return this.data.find(f => f.id === id) ?? null;
  }

  /** Алерти детектора криз — для стрічки подій. */
  async getAlerts(): Promise<CrisisAlert[]> {
    return realAlerts as unknown as CrisisAlert[];
  }

  async getMetrics(filters?: FeedbackFilters): Promise<DashboardMetrics> {
    const feedbacks = await this.getFeedbacks(filters);
    if (feedbacks.length === 0) {
      return {
        totalComplaints: 0, averageRiskScore: 0, highRiskIssuesCount: 0,
        averageRelevance: 0, averageConstructiveness: 0,
        sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
        topLocations: [], timelineData: [],
      };
    }

    const sentimentDistribution = { positive: 0, neutral: 0, negative: 0 };
    // Середній ризик рахуємо ЛИШЕ по згадках із ненульовим ризиком.
    // Середнє по всьому масиві безглузде: 98% записів це не скарги
    // ("дякую, все супер" має ризик 0) і вони тягнуть показник у нуль.
    let riskyCount = 0;
    const locationMap: Record<string, number> = {};
    const timelineMap: Record<string, { count: number; totalRisk: number }> = {};
    let totalRisk = 0;
    let highRiskIssuesCount = 0;
    let totalRelevance = 0;
    let totalConstructiveness = 0;

    for (const f of feedbacks) {
      sentimentDistribution[f.sentiment] += 1;
      if (f.reputationalRiskScore > 0) {
        totalRisk += f.reputationalRiskScore;
        riskyCount += 1;
      }
      // Поріг 70 — рівень "високий" за шкалою інтерпретації ризику.
      // Окрема криза видна не тут, а в алертах детектора (getAlerts).
      if (f.reputationalRiskScore >= 70) highRiskIssuesCount += 1;
      totalRelevance += f.relevanceScore;
      totalConstructiveness += f.constructivenessScore;

      // "Невідомо" у топ локацій не показуємо: це не місце.
      if (f.locationName && f.locationName !== 'Невідомо') {
        locationMap[f.locationName] = (locationMap[f.locationName] ?? 0) + 1;
      }

      const date = f.timestamp.slice(0, 10);
      timelineMap[date] ??= { count: 0, totalRisk: 0 };
      timelineMap[date].count += 1;
      timelineMap[date].totalRisk += f.reputationalRiskScore;
    }

    return {
      totalComplaints: feedbacks.length,
      averageRiskScore: riskyCount ? Math.round(totalRisk / riskyCount) : 0,
      highRiskIssuesCount,
      averageRelevance: Math.round((totalRelevance / feedbacks.length) * 100) / 100,
      averageConstructiveness: Math.round((totalConstructiveness / feedbacks.length) * 100) / 100,
      sentimentDistribution,
      topLocations: Object.entries(locationMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      timelineData: Object.entries(timelineMap)
        .map(([date, d]) => ({
          date,
          issuesCount: d.count,
          averageRisk: Math.round(d.totalRisk / d.count),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
