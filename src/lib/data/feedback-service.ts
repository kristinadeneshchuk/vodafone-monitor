import { DashboardMetrics, FeedbackFilters, FeedbackRecord, IFeedbackService } from './types';
import { mockFeedbacks } from './mock-data';
import { format, parseISO } from 'date-fns';

export class MockFeedbackService implements IFeedbackService {
  async getFeedbacks(filters?: FeedbackFilters): Promise<FeedbackRecord[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    let result = [...mockFeedbacks];

    if (filters) {
      if (filters.importance && filters.importance.length > 0) {
        result = result.filter(f => filters.importance!.includes(f.importance));
      }
      if (filters.problemType && filters.problemType.length > 0) {
        result = result.filter(f => filters.problemType!.includes(f.problemType));
      }
      // Simple date filtering (ignoring time for simplicity in mock)
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
    await new Promise(resolve => setTimeout(resolve, 100));
    return mockFeedbacks.find(f => f.id === id) || null;
  }

  async getMetrics(filters?: FeedbackFilters): Promise<DashboardMetrics> {
    const feedbacks = await this.getFeedbacks(filters);
    
    if (feedbacks.length === 0) {
      return {
        totalComplaints: 0,
        averageRiskScore: 0,
        criticalIssuesCount: 0,
        sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
        topLocations: [],
        timelineData: []
      };
    }

    const totalComplaints = feedbacks.length;
    const totalRisk = feedbacks.reduce((acc, curr) => acc + curr.reputationalRiskScore, 0);
    const averageRiskScore = Math.round(totalRisk / totalComplaints);
    const criticalIssuesCount = feedbacks.filter(f => f.importance === 'critical' || f.importance === 'high').length;
    
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

    return {
      totalComplaints,
      averageRiskScore,
      criticalIssuesCount,
      sentimentDistribution,
      topLocations,
      timelineData
    };
  }
}

// Global instance for DI
export const feedbackService: IFeedbackService = new MockFeedbackService();
