import { DashboardMetrics, FeedbackFilters, FeedbackRecord, IFeedbackService } from './types';
import { mockFeedbacks } from './mock-data';
import { format, parseISO } from 'date-fns';

export class MockFeedbackService implements IFeedbackService {
  async getFeedbacks(filters?: FeedbackFilters): Promise<FeedbackRecord[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    let result = [...mockFeedbacks];

    if (filters) {
      if (filters.problemType && filters.problemType.length > 0) {
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
      if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        result = result.filter(f => new Date(f.timestamp).getTime() >= start);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate).getTime();
        result = result.filter(f => new Date(f.timestamp).getTime() <= end);
      }
    }
    
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getFeedbackById(id: string): Promise<FeedbackRecord | null> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return mockFeedbacks.find(f => f.id === id) || null;
  }

  async getMetrics(filters?: FeedbackFilters): Promise<DashboardMetrics> {
    const feedbacks = await this.getFeedbacks(filters);
    
    if (feedbacks.length === 0) {
      return {
        totalComplaints: 0,
        averageRiskScore: 0,
        highRiskIssuesCount: 0,
        averageRelevance: 0,
        averageConstructiveness: 0,
        churnIntentRate: 0,
        churnIntentCount: 0,
        averageResonance: 0,
        spikeVelocityRatio: 0,
        sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
        topLocations: [],
        timelineData: []
      };
    }

    const totalComplaints = feedbacks.length;
    const totalRisk = feedbacks.reduce((acc, curr) => acc + curr.reputationalRiskScore, 0);
    const averageRiskScore = Math.round(totalRisk / totalComplaints);
    const highRiskIssuesCount = feedbacks.filter(f => f.reputationalRiskScore >= 50).length;
    
    const avgRelevance = Math.round((feedbacks.reduce((acc, curr) => acc + curr.relevanceScore, 0) / totalComplaints) * 100) / 100;
    const avgConstructiveness = Math.round((feedbacks.reduce((acc, curr) => acc + curr.constructivenessScore, 0) / totalComplaints) * 100) / 100;

    const sentimentDistribution = {
      positive: feedbacks.filter(f => f.sentiment === 'positive').length,
      neutral: feedbacks.filter(f => f.sentiment === 'neutral').length,
      negative: feedbacks.filter(f => f.sentiment === 'negative').length,
    };

    // Calculate top locations
    const locationCounts: Record<string, number> = {};
    feedbacks.forEach(f => {
      if (f.locationName !== 'Невідомо') {
        locationCounts[f.locationName] = (locationCounts[f.locationName] || 0) + 1;
      }
    });
    
    const topLocations = Object.entries(locationCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate timeline data
    const timelineMap: Record<string, { count: number, totalRisk: number }> = {};
    feedbacks.forEach(f => {
      const date = format(parseISO(f.timestamp), 'yyyy-MM-dd');
      if (!timelineMap[date]) {
        timelineMap[date] = { count: 0, totalRisk: 0 };
      }
      timelineMap[date].count += 1;
      timelineMap[date].totalRisk += f.reputationalRiskScore;
    });

    const timelineData = Object.entries(timelineMap)
      .map(([date, data]) => ({
        date,
        issuesCount: data.count,
        averageRisk: Math.round(data.totalRisk / data.count)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const churnCount = feedbacks.filter(f => f.reputationalRiskScore >= 50 && f.relevanceScore >= 0.7).length;
    const churnIntentRate = Math.round((churnCount / totalComplaints) * 1000) / 10;

    return {
      totalComplaints,
      averageRiskScore,
      highRiskIssuesCount,
      averageRelevance: avgRelevance,
      averageConstructiveness: avgConstructiveness,
      churnIntentRate,
      churnIntentCount: churnCount,
      averageResonance: 3.8,
      spikeVelocityRatio: 4.5,
      sentimentDistribution,
      topLocations,
      timelineData
    };
  }
}

// Global instance for DI
// Реальні дані замість мок-даних. Щоб повернути мок — заміни на
// new MockFeedbackService(). Інтерфейс однаковий.
import { RealFeedbackService } from './real-service';
export const feedbackService: IFeedbackService = new RealFeedbackService();
