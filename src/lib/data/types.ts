// 'review' — відгуки з Google Play і App Store. Це 85% наших реальних
// даних (16 600 записів), без нього збірка падає на типах.
export type SourceType = 'telegram' | 'twitter' | 'facebook' | 'news' | 'review';
export type SentimentType = 'positive' | 'neutral' | 'negative';
/** 'none' — згадка про звʼязок, у якій проблеми немає (похвала, нейтральна новина). */
export type ProblemType = 'no_signal' | 'slow_internet' | 'dropped_calls' | 'other' | 'none';

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
  /** Матеріал про телеком-ринок загалом, а не про цього оператора. */
  isMarketWide?: boolean;
  churnIntent?: boolean;      // намір піти від оператора
  churnScore?: number;        // 0-10
  reachWeight?: number;       // охоплення джерела, 0-10
  resonance?: number;         // relevanceScore x охоплення
}

/** Алерт детектора криз: сплеск скарг, що перевищив норму. */
export interface CrisisAlert {
  level: 'watch' | 'wake';
  /** media_attention — сплеск публікацій на одну тему незалежно від тональності. */
  event_type: 'incident' | 'grid_outage' | 'media_attention';
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
  /** Кількість НЕГАТИВНИХ згадок. Саме це слово "скарга" й означає. */
  totalComplaints: number;
  /** Усі згадки за період, разом із позитивними та нейтральними. */
  totalMentions?: number;
  /** Медіана негативних згадок на добу — норма, порахована з даних. */
  negativeBaseline?: number;
  /** Чи був сплеск рівня "будити команду". Рівень визначає детектор. */
  hasWakeAlert?: boolean;
  alertsToday?: number;
  averageRiskScore: number;
  highRiskIssuesCount: number; // risk >= 50
  averageRelevance: number;
  averageConstructiveness: number;

  // 3 Enterprise Actionable Metrics
  churnIntentRate: number;      // % скарг із наміром відтоку (LTV ризик)
  churnIntentCount: number;     // кількість абонентів із загрозою відтоку
  averageResonance: number;     // коефіцієнт резонансу / вірусності (Reach x Relevance)
  spikeVelocityRatio: number;   // швидкість спалаху скарг (перевищення норми baseline, x разів)

  date?: string;                // YYYY-MM-DD — останній день вікна
  /** Перший день вікна звіту. Бриф має описувати той самий період,
   *  що й цифри над ним, а не одну добу. */
  windowStart?: string;         // YYYY-MM-DD
  dateLabel?: string;           // Наприклад "19 вересня 2026"

  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topLocations: { name: string; count: number }[];
  timelineData: { date: string; issuesCount: number; averageRisk: number }[];
}

export interface DailyBriefing {
  date: string;               // YYYY-MM-DD
  dateLabel: string;          // Наприклад "18 вересня 2026"
  generatedAt: string;        // ISO timestamp
  status: 'normal' | 'warning' | 'critical';
  statusLabel: string;        // "Нормально" | "Підвищена увага" | "Критична загроза"
  executiveSummary: string;   // Головний вердикт
  keyDrivers: {
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
  }[];
  churnRiskAnalysis: string;  // Аналіз ризику відтоку абонентів
  mediaViralityRisk: string;  // Аналіз резонансу та вірусності
  recommendedActions: {
    team: 'PR & Комунікації' | 'Служба підтримки' | 'Технічний департамент';
    action: string;
    priority: 'high' | 'medium' | 'low';
  }[];
  metricsSnapshot: {
    complaintsCount: number;
    avgRisk: number;
    highRiskCount: number;
    churnRate: number;
    resonance: number;
    spikeRatio: number;
  };
}

export interface FeedbackFilters {
  /** Оператор. За замовчуванням 'vodafone' — це продукт для Vodafone,
   *  конкуренти показуються окремим порівнянням, а не впереміш. */
  brand?: string;
  startDate?: string;
  endDate?: string;
  problemType?: ProblemType[];
  location?: string;
  isRelevant?: boolean;
  isConstructive?: boolean;
  churnOnly?: boolean;
  minRelevance?: number;
  minConstructiveness?: number;
  minResonance?: number;
}

export interface IFeedbackService {
  getFeedbacks(filters?: FeedbackFilters): Promise<FeedbackRecord[]>;
  getMetrics(filters?: FeedbackFilters): Promise<DashboardMetrics>;
  getFeedbackById(id: string): Promise<FeedbackRecord | null>;
}
