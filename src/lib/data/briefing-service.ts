import { DailyBriefing, DashboardMetrics, FeedbackRecord } from './types';
import { GoogleGenAI } from '@google/genai';
import { format, parseISO, subDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import fs from 'fs';
import path from 'path';

// Local database path for persistent storage
const DB_PATH = path.join(process.cwd(), 'src', 'lib', 'data', 'briefings-db.json');

/**
 * Reads the database of stored daily briefings
 */
export function getStoredBriefings(): Record<string, DailyBriefing> {
  try {
    if (typeof window === 'undefined' && fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(content || '{}');
    }
  } catch (err) {
    console.error('Error reading briefings-db.json:', err);
  }
  return {};
}

/**
 * Saves a daily briefing to persistent storage
 */
export function saveStoredBriefing(briefing: DailyBriefing): void {
  try {
    if (typeof window === 'undefined') {
      const current = getStoredBriefings();
      current[briefing.date] = briefing;
      fs.writeFileSync(DB_PATH, JSON.stringify(current, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Error writing to briefings-db.json:', err);
  }
}

/**
 * Intelligent analytical generator fallback for when Gemini API key is missing or quota is exceeded
 */
export function generateHeuristicBriefing(
  date: string,
  feedbacks: FeedbackRecord[],
  metrics: DashboardMetrics
): DailyBriefing {
  // Метрики рахуються за 7 днів, тому підпис теж має бути періодом,
  // а не однією датою: було "Основний масив скарг за 16 вересня".
  let dateLabel = date;
  try {
    const from = format(subDays(parseISO(date), 6), 'd MMM', { locale: uk });
    const to = format(parseISO(date), 'd MMMM yyyy', { locale: uk });
    dateLabel = `${from} — ${to}`;
  } catch {
    dateLabel = date;
  }

  // Рівень тривоги визначає ДЕТЕКТОР, а не бриф. Детектор має три умови
  // одночасно: перевищення норми, мінімальна абсолютна кількість і сигнал
  // із двох незалежних джерел. Без цього бриф оголошував "критичну загрозу"
  // у день із пʼятьма негативними згадками при нормі одинадцять.
  const isSevere = (metrics.averageRiskScore >= 50 && metrics.totalComplaints >= 20) || metrics.highRiskIssuesCount >= 3;
  const isModerate = (metrics.averageRiskScore >= 25 && metrics.totalComplaints >= 15) || metrics.highRiskIssuesCount >= 1 || (metrics.spikeVelocityRatio >= 2.0 && metrics.totalComplaints >= 50);

  const status: 'normal' | 'warning' | 'critical' = isSevere ? 'critical' : isModerate ? 'warning' : 'normal';
  const statusLabel = isSevere 
    ? 'Критична загроза' 
    : isModerate 
    ? 'Підвищена увага' 
    : 'Нормально';

  const topLoc = metrics.topLocations[0]?.name || 'Усі регіони';
  const topLocCount = metrics.topLocations[0]?.count || 0;

  let executiveSummary = '';
  if (isSevere) {
    executiveSummary = `Сплеск негативу: ${metrics.totalComplaints} скарг, ризик ${metrics.averageRiskScore}/100, епіцентр — ${topLoc} (${topLocCount} звернень). Зафіксовано ризик відтоку абонентів та медіа-ескалації.`;
  } else if (isModerate) {
    executiveSummary = `Помірна активність: ${metrics.totalComplaints} звернень, середній ризик ${metrics.averageRiskScore}/100. Локальні нарікання зафіксовано у ${topLoc}. Ситуація під контролем.`;
  } else {
    executiveSummary = `Нормальний режим: ${metrics.totalComplaints} звернень (фонова норма, ризик ${metrics.averageRiskScore}/100). Аномальних збоїв та репутаційних загроз бренду не зафіксовано.`;
  }

  const keyDrivers = [
    {
      title: 'Якість зв’язку та 4G',
      description: metrics.totalComplaints > 0 
        ? `Поодинокі нарікання на швидкість інтернету (${topLoc}).` 
        : 'Нарікань на покриття не виявлено.',
      impact: (isSevere ? 'high' : isModerate ? 'medium' : 'low') as 'low' | 'medium' | 'high'
    },
    {
      title: 'Географія звернень',
      description: topLocCount > 0 
        ? `Основна концентрація: ${topLoc} (${topLocCount} згадок).` 
        : 'Скарги розподілені рівномірно, без локальних скупчень.',
      impact: (topLocCount >= 5 && isModerate ? 'medium' : 'low') as 'low' | 'medium' | 'high'
    },
    {
      title: 'Тональність відгуків',
      description: `Позитив/нейтрал: ${metrics.sentimentDistribution.positive + metrics.sentimentDistribution.neutral}, негатив: ${metrics.sentimentDistribution.negative}.`,
      impact: 'low' as const
    }
  ];

  const churnRiskAnalysis = metrics.churnIntentCount > 0
    ? `⚠️ Ризик відтоку: ${metrics.churnIntentRate}% звернень (${metrics.churnIntentCount} абонентів загрожують піти до конкурентів).`
    : ` Ризик відтоку відсутній: погроз зміни оператора не зафіксовано.`;

  const mediaViralityRisk = metrics.averageResonance >= 3.0
    ? `🚨 Загроза резонансу (${metrics.averageResonance}x): скарги публікуються у великих TG-каналах.`
    : ` Резонанс відсутній (${metrics.averageResonance}x): згадки мають приватний характер без вірусності.`;

  const recommendedActions = [
    {
      team: 'PR & Комунікації' as const,
      action: isSevere ? 'Підготувати офіційне роз’яснення щодо термінів відновлення.' : 'Фоновий моніторинг згадок у соцмережах.',
      priority: (isSevere ? 'high' : 'low') as 'high' | 'medium' | 'low'
    },
    {
      team: 'Служба підтримки' as const,
      action: metrics.churnIntentCount > 0 ? `Персональний контакт із ${metrics.churnIntentCount} абонентами (пропозиція бонусів).` : 'Обробка запитів у штатному режимі (SLA < 15 хв).',
      priority: (metrics.churnIntentCount > 0 ? 'high' : 'low') as 'high' | 'medium' | 'low'
    },
    {
      team: 'Технічний департамент' as const,
      action: topLocCount >= 3 ? `Перевірити телеметрію БС на ділянці ${topLoc}.` : 'Плановий моніторинг стабільності мережі.',
      priority: (topLocCount >= 5 ? 'high' : 'low') as 'high' | 'medium' | 'low'
    }
  ];

  return {
    date,
    dateLabel,
    generatedAt: new Date().toISOString(),
    status,
    statusLabel,
    executiveSummary,
    keyDrivers,
    churnRiskAnalysis,
    mediaViralityRisk,
    recommendedActions,
    metricsSnapshot: {
      complaintsCount: metrics.totalComplaints,
      avgRisk: metrics.averageRiskScore,
      highRiskCount: metrics.highRiskIssuesCount,
      churnRate: metrics.churnIntentRate,
      resonance: metrics.averageResonance,
      spikeRatio: metrics.spikeVelocityRatio
    }
  };
}

/**
 * Generates an executive daily morning briefing using Gemini API (with heuristic fallback)
 */
export async function generateBriefingWithGemini(
  date: string,
  feedbacks: FeedbackRecord[],
  metrics: DashboardMetrics
): Promise<DailyBriefing> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  // Метрики рахуються за 7 днів, тому підпис теж має бути періодом,
  // а не однією датою: було "Основний масив скарг за 16 вересня".
  let dateLabel = date;
  try {
    const from = format(subDays(parseISO(date), 6), 'd MMM', { locale: uk });
    const to = format(parseISO(date), 'd MMMM yyyy', { locale: uk });
    dateLabel = `${from} — ${to}`;
  } catch {
    dateLabel = date;
  }

  // If no Gemini API key is configured, fallback to heuristic generation
  if (!apiKey) {
    console.log('[BriefingService] No GEMINI_API_KEY detected. Using analytical generator.');
    return generateHeuristicBriefing(date, feedbacks, metrics);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Sample top risky / representative feedback messages
    const sampleFeedbacks = feedbacks
      .slice(0, 10)
      .map(f => ({
        source: f.source,
        text: f.content.slice(0, 120),
        risk: f.reputationalRiskScore,
        location: f.locationName,
        churn: f.churnIntent
      }));

    const prompt = `Ти — AI-аналітик ризиків Vodafone Україна.
Склади КОРОТКИЙ ранковий бриф (Morning Briefing) за ${dateLabel}.
ВАЖЛИВО: Пиши МАКСИМАЛЬНО ЛАКОНІЧНО! Без зайвих слів, короткими фразами (1 речення на пункт), щоб топ-менеджер прочитав за 20 секунд.

Метрики:
- Скарг: ${metrics.totalComplaints}, Сер. ризик: ${metrics.averageRiskScore}/100, Ризик >50: ${metrics.highRiskIssuesCount}
- Churn Intent: ${metrics.churnIntentRate}%, Резонанс: ${metrics.averageResonance}x, Спалах: ${metrics.spikeVelocityRatio}x
- Епіцентр: ${metrics.topLocations[0]?.name || 'Немає'} (${metrics.topLocations[0]?.count || 0})
- Приклади: ${JSON.stringify(sampleFeedbacks)}

Поверни JSON:
{
  "status": "normal" | "warning" | "critical",
  "statusLabel": "Нормально" | "Підвищена увага" | "Критична загроза",
  "executiveSummary": "1-2 короткі речення із загальним вердиктом доби.",
  "keyDrivers": [
    { "title": "Коротко суть", "description": "1 коротке речення пояснення", "impact": "low" | "medium" | "high" },
    { "title": "...", "description": "...", "impact": "..." },
    { "title": "...", "description": "...", "impact": "..." }
  ],
  "churnRiskAnalysis": "1 коротке речення щодо ризику відтоку.",
  "mediaViralityRisk": "1 коротке речення щодо ризику в медіа.",
  "recommendedActions": [
    { "team": "PR & Комунікації", "action": "Коротка дія", "priority": "high" | "medium" | "low" },
    { "team": "Служба підтримки", "action": "Коротка дія", "priority": "high" | "medium" | "low" },
    { "team": "Технічний департамент", "action": "Коротка дія", "priority": "high" | "medium" | "low" }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const responseText = response.text?.trim() || '';
    const parsed = JSON.parse(responseText);

    const briefing: DailyBriefing = {
      date,
      dateLabel,
      generatedAt: new Date().toISOString(),
      status: parsed.status || 'normal',
      statusLabel: parsed.statusLabel || 'Нормально',
      executiveSummary: parsed.executiveSummary || '',
      keyDrivers: parsed.keyDrivers || [],
      churnRiskAnalysis: parsed.churnRiskAnalysis || '',
      mediaViralityRisk: parsed.mediaViralityRisk || '',
      recommendedActions: parsed.recommendedActions || [],
      metricsSnapshot: {
        complaintsCount: metrics.totalComplaints,
        avgRisk: metrics.averageRiskScore,
        highRiskCount: metrics.highRiskIssuesCount,
        churnRate: metrics.churnIntentRate,
        resonance: metrics.averageResonance,
        spikeRatio: metrics.spikeVelocityRatio
      }
    };

    return briefing;
  } catch (err) {
    console.error('[BriefingService] Gemini API call error, falling back to analytical generator:', err);
    return generateHeuristicBriefing(date, feedbacks, metrics);
  }
}
