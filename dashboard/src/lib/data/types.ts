// 'review' — відгуки з Google Play і App Store. Це 85% наших реальних
// даних (16 600 записів), без нього збірка падає на типах.
export type SourceType = 'telegram' | 'twitter' | 'facebook' | 'news' | 'review';
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

  // Поля понад базовий контракт — з аналітичного рівня.
  // Опціональні, щоб мок-дані лишались валідними.
  brand?: string;
  lat?: number | null;
  lng?: number | null;
  cause?: string;
  context?: string | null;
  churnIntent?: boolean;      // намір піти від оператора
  churnScore?: number;        // 0-10
  reachWeight?: number;       // охоплення джерела, 0-10
  resonance?: number;         // relevanceScore x охоплення
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
  ratio: number;              // Spike Velocity
  n_source_types: number;
  summary: string;
  recommended_action: string;
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
