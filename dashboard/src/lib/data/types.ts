// 'review' додано: відгуки з Google Play і App Store — це 85% наших
// реальних даних (16 600 записів). Без нього збірка падає на типах.
export type SourceType = 'telegram' | 'twitter' | 'facebook' | 'news' | 'review';
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

  // Поля понад базовий контракт — приходять з аналітичного рівня.
  // Опціональні, щоб мок-дані лишались валідними.
  brand?: string;
  lat?: number | null;
  lng?: number | null;
  relevanceScore?: number;
  constructiveScore?: number;
  cause?: string;
  context?: string | null;
}

/** Алерт детектора криз: сплеск скарг, що перевищив норму. */
export interface CrisisAlert {
  level: 'watch' | 'wake';
  event_type: 'incident' | 'grid_outage';
  brand: string;
  cause: string;
  cities: string | null;
  window_start: string;
  window_end: string;
  count: number;
  baseline: number;
  ratio: number;
  n_source_types: number;
  summary: string;
  recommended_action: string;
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
