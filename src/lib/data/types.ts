export type SourceType = 'telegram' | 'twitter' | 'facebook' | 'news';
export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';
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
  importance: ImportanceLevel;
  sentiment: SentimentType;
  
  locationName: string; 
  
  problemType: ProblemType;
  reputationalRiskScore: number; // 0 to 100
}

export interface DashboardMetrics {
  totalComplaints: number;
  averageRiskScore: number;
  criticalIssuesCount: number;
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
  importance?: ImportanceLevel[];
  problemType?: ProblemType[];
  location?: string;
}

export interface IFeedbackService {
  getFeedbacks(filters?: FeedbackFilters): Promise<FeedbackRecord[]>;
  getMetrics(filters?: FeedbackFilters): Promise<DashboardMetrics>;
  getFeedbackById(id: string): Promise<FeedbackRecord | null>;
}
