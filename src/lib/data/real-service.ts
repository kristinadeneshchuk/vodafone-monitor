import realData from './real-data.json';
import realAlerts from './real-alerts.json';
import {
  CrisisAlert, DashboardMetrics, FeedbackFilters, FeedbackRecord, IFeedbackService,
} from './types';
import { format, parseISO, subDays } from 'date-fns';
import { uk } from 'date-fns/locale';

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
        churnIntentRate: 0, churnIntentCount: 0, averageResonance: 0,
        spikeVelocityRatio: 0,
        sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
        topLocations: [], timelineData: [],
      };
    }

    // 1. Графік останніх днів (Timeline) формуємо за всіма останніми днями (30 днів)
    const timelineMap: Record<string, { count: number; totalRisk: number }> = {};
    for (const f of feedbacks) {
      const date = f.timestamp.slice(0, 10);
      timelineMap[date] ??= { count: 0, totalRisk: 0 };
      timelineMap[date].count += 1;
      timelineMap[date].totalRisk += f.reputationalRiskScore;
    }

    const timelineData = Object.entries(timelineMap)
      .map(([date, d]) => ({
        date,
        issuesCount: d.count,
        averageRisk: d.count > 0 ? Math.round(d.totalRisk / d.count) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // 2. Визначаємо «вчорашній день» для Morning Briefing (повністю завершена 24-годинна доба)
    const now = new Date();
    const yesterday = subDays(now, 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    const hasYesterday = feedbacks.some(f => f.timestamp.startsWith(yesterdayStr));

    // Якщо вчорашній день є в базі — використовуємо його.
    // Якщо відкрили іншого дня — беремо останній повний завершений день з бази
    const effectiveDayStr = filters?.startDate?.slice(0, 10) 
      || (hasYesterday ? yesterdayStr : (() => {
          const allDates = [...new Set(feedbacks.map(f => f.timestamp.slice(0, 10)))].sort();
          return allDates.length >= 2 ? allDates[allDates.length - 2] : allDates[allDates.length - 1] || yesterdayStr;
      })());

    let dateLabel = effectiveDayStr;
    try {
      dateLabel = format(parseISO(effectiveDayStr), 'd MMMM yyyy', { locale: uk });
    } catch {
      dateLabel = effectiveDayStr;
    }

    // 3. Всі інші метрики розраховуємо СУВОРО за вчорашній день (Morning Briefing)
    // ВІКНО ЗВІТУ — 7 ДНІВ, а не одна доба.
    // Медіана скарг на звʼязок — 2 на добу, і 41 день на рік має нуль.
    // Порівнювати "вчора проти норми" на таких числах означає міряти шум:
    // дашборд показував усюди нулі просто тому, що 18 вересня випало 0.
    // Тиждень дає 14-20 скарг — на цьому вже видно динаміку.
    const WINDOW_DAYS = 7;
    const windowStart = format(subDays(parseISO(effectiveDayStr), WINDOW_DAYS - 1), 'yyyy-MM-dd');
    const dayFeedbacks = feedbacks.filter(
      f => f.timestamp.slice(0, 10) >= windowStart
        && f.timestamp.slice(0, 10) <= effectiveDayStr);
    const sentimentDistribution = { positive: 0, neutral: 0, negative: 0 };

    let riskyCount = 0;
    let totalRisk = 0;
    let highRiskIssuesCount = 0;
    let totalRelevance = 0;
    let totalConstructiveness = 0;
    let churnIntentCount = 0;
    let totalResonance = 0;
    const locationMap: Record<string, number> = {};

    for (const f of dayFeedbacks) {
      sentimentDistribution[f.sentiment] += 1;
      if (f.reputationalRiskScore > 0) {
        totalRisk += f.reputationalRiskScore;
        riskyCount += 1;
      }
      if (f.reputationalRiskScore >= 50) {
        highRiskIssuesCount += 1;
      }
      totalRelevance += f.relevanceScore;
      totalConstructiveness += f.constructivenessScore;

      if (f.churnIntent) {
        churnIntentCount += 1;
      }
      totalResonance += (f.resonance ?? (f.relevanceScore * (f.reachWeight ?? 1)));

      if (f.locationName && f.locationName !== 'Невідомо') {
        locationMap[f.locationName] = (locationMap[f.locationName] ?? 0) + 1;
      }
    }

    const dayCount = dayFeedbacks.length;

    // СКАРГА — це негативна згадка. Раніше сюди йшла загальна кількість
    // згадок, і бриф писав "34 скарги" у день, коли негативних було 5,
    // а 14 згадок були позитивні. На тихому дні виходила "критична загроза".
    const dayNegatives = dayFeedbacks.filter(f => f.sentiment === 'negative').length;

    // Норма береться З ДАНИХ, а не константою. Було baseline = 45 —
    // число нізвідки, через нього будь-який день здавався або кризою,
    // або порожнім.
    const negativesByDay: Record<string, number> = {};
    for (const f of this.data) {
      if (f.sentiment !== 'negative') continue;
      const d = f.timestamp.slice(0, 10);
      negativesByDay[d] = (negativesByDay[d] ?? 0) + 1;
    }
    const dailyCounts = Object.values(negativesByDay).sort((a, b) => a - b);
    // Норма теж тижнева: порівнювати тижневу суму з добовою медіаною
    // означало б отримувати семикратний "сплеск" щотижня.
    const dailyMedian = dailyCounts.length
      ? dailyCounts[Math.floor(dailyCounts.length / 2)]
      : 1;
    const baseline = Math.max(1, dailyMedian * WINDOW_DAYS);

    const alerts = realAlerts as unknown as CrisisAlert[];
    const dayAlerts = alerts.filter(a =>
      a.window_start.startsWith(effectiveDayStr) ||
      a.window_end.startsWith(effectiveDayStr)
    );
    // Рівень тривоги бере детектор, а не текстова модель. Якщо wake
    // немає — кризи немає, і бриф не має права писати "критична загроза".
    const wakeAlert = dayAlerts.find(a => a.level === 'wake');
    const spikeVelocityRatio = wakeAlert
      ? wakeAlert.ratio
      : Math.round((dayNegatives / Math.max(baseline, 1)) * 10) / 10;

    const churnIntentRate = dayNegatives > 0
      ? Math.round((churnIntentCount / dayNegatives) * 1000) / 10
      : 0;

    const averageResonance = dayCount > 0
      ? Math.round((totalResonance / dayCount) * 10) / 10
      : 0;

    const topLocations = Object.entries(locationMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      date: effectiveDayStr,
      dateLabel,
      totalComplaints: dayNegatives,
      totalMentions: dayCount,
      negativeBaseline: baseline,
      hasWakeAlert: Boolean(wakeAlert),
      alertsToday: dayAlerts.length,
      averageRiskScore: riskyCount > 0 ? Math.round(totalRisk / riskyCount) : 0,
      highRiskIssuesCount,
      averageRelevance: dayCount > 0 ? Math.round((totalRelevance / dayCount) * 100) / 100 : 0,
      averageConstructiveness: dayCount > 0 ? Math.round((totalConstructiveness / dayCount) * 100) / 100 : 0,
      
      // 3 Enterprise Actionable Metrics (Resolution lag видалено)
      churnIntentRate,
      churnIntentCount,
      averageResonance,
      spikeVelocityRatio,
      
      sentimentDistribution,
      topLocations,
      timelineData,
    };
  }
}
