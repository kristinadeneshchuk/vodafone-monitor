export type SourceType = 'telegram' | 'twitter' | 'facebook' | 'news';
export type SentimentType = 'positive' | 'neutral' | 'negative';
export type ProblemType = 'no_signal' | 'slow_internet' | 'dropped_calls' | 'other';

export interface FeedbackRecord {
  id: string;
  source: SourceType;
  originalUrl: string;
  content: string;
  timestamp: string; // ISO format
  
  isRelevant: boolean;
  isConstructive: boolean;
  relevanceScore: number; // 0.0 to 1.0
  constructivenessScore: number; // 0.0 to 1.0
  sentiment: SentimentType;
  
  locationName: string; 
  
  problemType: ProblemType;
  reputationalRiskScore: number; // 0 to 100
}

export interface DashboardMetrics {
  totalComplaints: number;
  averageRiskScore: number;
  highRiskIssuesCount: number; // risk > 70
  averageRelevance: number;
  averageConstructiveness: number;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topLocations: { name: string; count: number }[];
  timelineData: { date: string; issuesCount: number; averageRisk: number }[];
}

export interface FeedbackFilters {
  startDate?: string;
  endDate?: string;
  problemType?: ProblemType[];
  location?: string;
  isRelevant?: boolean;
  isConstructive?: boolean;
  minRelevance?: number;
  minConstructiveness?: number;
}

export interface IFeedbackService {
  getFeedbacks(filters?: FeedbackFilters): Promise<FeedbackRecord[]>;
  getMetrics(filters?: FeedbackFilters): Promise<DashboardMetrics>;
  getFeedbackById(id: string): Promise<FeedbackRecord | null>;
}
