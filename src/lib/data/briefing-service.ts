import { DailyBriefing, DashboardMetrics, FeedbackRecord } from './types';
import { GoogleGenAI } from '@google/genai';
import { format, parseISO } from 'date-fns';
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
  let dateLabel = date;
  try {
    dateLabel = format(parseISO(date), 'd MMMM yyyy', { locale: uk });
  } catch {
    dateLabel = date;
  }

  // Рівень тривоги визначає ДЕТЕКТОР, а не бриф. Детектор має три умови
  // одночасно: перевищення норми, мінімальна абсолютна кількість і сигнал
  // із двох незалежних джерел. Без цього бриф оголошував "критичну загрозу"
  // у день із пʼятьма негативними згадками при нормі одинадцять.
  const baseline = metrics.negativeBaseline ?? 1;
  const aboveBaseline = metrics.totalComplaints > baseline;

  const isSevere = Boolean(metrics.hasWakeAlert)
    || (aboveBaseline && metrics.spikeVelocityRatio >= 3.0 && metrics.highRiskIssuesCount >= 3);
  const isModerate = !isSevere && (
    (aboveBaseline && metrics.spikeVelocityRatio >= 2.0)
    || metrics.highRiskIssuesCount >= 1
  );

  const status: 'normal' | 'warning' | 'critical' = isSevere ? 'critical' : isModerate ? 'warning' : 'normal';
  const statusLabel = isSevere 
    ? 'Критична загроза (Потрібне екстрене втручання)' 
    : isModerate 
    ? 'Підвищена увага (Локальні сплески)' 
    : 'Штатний режим (Фоновий рівень)';

  const topLoc = metrics.topLocations[0]?.name || 'Усі регіони';
  const topLocCount = metrics.topLocations[0]?.count || 0;

  let executiveSummary = '';
  if (isSevere) {
    executiveSummary = `Зафіксовано сплеск негативу: ${metrics.totalComplaints} негативних згадок проти норми ${baseline} (x${metrics.spikeVelocityRatio}). Середній репутаційний ризик зріс до ${metrics.averageRiskScore}/100. Головний епіцентр кризи зосереджено на ділянці: ${topLoc} (${topLocCount} звернень). Зафіксовано ризик ескалації скарг у медіа та активний відтік незадоволених клієнтів.`;
  } else if (isModerate) {
    executiveSummary = `Минула доба пройшла з помірною активністю (${metrics.totalComplaints} негативних згадок проти норми ${baseline}). Середній ризик оцінюється у ${metrics.averageRiskScore}/100. Виявлено локальні затримки в роботі мережі на ділянці ${topLoc}. Ситуація контрольована, але потребує уваги служби технічної підтримки та моніторингу соціальних мереж.`;
  } else {
    // Порожній звіт — теж результат. Кейс просить прямо: коли за добу
    // нічого не сталося, так і писати, а не вигадувати драму.
    const vsNorm = metrics.totalComplaints < baseline
      ? `це нижче за звичайний рівень (${baseline} за 7 днів)`
      : `це в межах звичайного рівня (${baseline} за 7 днів)`;
    executiveSummary = `Штатний режим. За 7 днів ${metrics.totalComplaints} негативних згадок із ${metrics.totalMentions ?? metrics.totalComplaints} загалом — ${vsNorm}. Сплесків, що потребують реакції, не зафіксовано.`;
  }

  const keyDrivers = [
    {
      title: 'Якість мобільного інтернету та покриття 4G',
      description: metrics.totalComplaints > 0 
        ? `Основний масив скарг за ${dateLabel} стосувався швидкості завантаження даних та стабільності сигналу під час пересування (${topLoc}).`
        : 'Нарікань на якість 4G-покриття не зафіксовано.',
      impact: (isSevere ? 'high' : isModerate ? 'medium' : 'low') as 'low' | 'medium' | 'high'
    },
    {
      title: 'Локалізація аварійних ділянок',
      description: topLocCount > 0 
        ? `Найбільша концентрація повідомлень зафіксована за локацією "${topLoc}" (${topLocCount} звернень).` 
        : 'Географічні концентрації скарг відсутні, навантаження рівномірне.',
      impact: (topLocCount >= 5 ? 'high' : topLocCount > 0 ? 'medium' : 'low') as 'low' | 'medium' | 'high'
    },
    {
      title: 'Тональність та конструктивність відгуків',
      description: `Частка позитивних/нейтральних відгуків склала ${metrics.sentimentDistribution.positive + metrics.sentimentDistribution.neutral} із ${metrics.totalComplaints}. Користувачі детально описують симптоми збоїв у ${Math.round(metrics.averageConstructiveness * 100)}% випадків.`,
      impact: 'low' as const
    }
  ];

  const churnRiskAnalysis = metrics.churnIntentCount > 0
    ? `⚠️ Високий ризик втрати абонентів (LTV Impact): ${metrics.churnIntentRate}% звернень містять прямі погрози переходу до конкурентів (${metrics.churnIntentCount} абонентів). Необхідна персоналізована робота retention-менеджерів.`
    : `🟢 Ризик відтоку мінімальний: погроз відмови від послуг або переходу до інших операторів за минулу добу не зафіксовано. Лояльність клієнтської бази залишається на високому рівні.`;

  const mediaViralityRisk = metrics.averageResonance >= 2.0
    ? `🚨 Потенційний медійний резонанс (${metrics.averageResonance}x): скарги публікуються у впливових Telegram-каналах та соцмережах. Висока ймовірність підхоплення інциденту національними ЗМІ, якщо не буде надано офіційний коментар.`
    : `Інформаційне поле нейтральне. Скарги мають приватний локальний характер та не мають вірусного поширення в медіа (індекс резонансу: ${metrics.averageResonance}x).`;

  const recommendedActions = [
    {
      team: 'PR & Комунікації' as const,
      action: isSevere 
        ? 'Опублікувати офіційний статус щодо відновлювальних робіт у Telegram та надати коментарі профільним ЗМІ.'
        : 'Продовжувати фоновий моніторинг згадок у Telegram-каналах та пабліках.',
      priority: (isSevere ? 'high' : 'medium') as 'high' | 'medium' | 'low'
    },
    {
      team: 'Служба підтримки' as const,
      action: metrics.churnIntentCount > 0
        ? `Терміново зв'язатися з ${metrics.churnIntentCount} абонентами, які погрожують змінити оператора, запропонувати компенсаційні гігабайти/бонуси.`
        : 'Обробляти вхідні запити у стандартному регламентному режимі (SLA < 15 хв).',
      priority: (metrics.churnIntentCount > 0 ? 'high' : 'low') as 'high' | 'medium' | 'low'
    },
    {
      team: 'Технічний департамент' as const,
      action: topLocCount > 0 
        ? `Перевірити навантаження та телеметрію базових станцій на локації: ${topLoc}.`
        : 'Провести планову перевірку резервних каналів передачі даних.',
      priority: (topLocCount >= 3 ? 'high' : 'low') as 'high' | 'medium' | 'low'
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

  let dateLabel = date;
  try {
    dateLabel = format(parseISO(date), 'd MMMM yyyy', { locale: uk });
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
      .slice(0, 15)
      .map(f => ({
        source: f.source,
        text: f.content.slice(0, 200),
        risk: f.reputationalRiskScore,
        location: f.locationName,
        churn: f.churnIntent
      }));

    const prompt = `Ти — провідний AI-радник із репутаційного ризик-менеджменту телеком-оператора Vodafone Україна.
Твоє завдання — скласти офіційний ранковий аналітичний бриф (Morning Briefing) для топ-менеджменту компанії за минулу добу (${dateLabel}).

Вхідні метрики за 7 днів:
- Всього звернень/скарг: ${metrics.totalComplaints}
- Середній репутаційний ризик: ${metrics.averageRiskScore} / 100
- Кількість критичних звернень (>50 ризику): ${metrics.highRiskIssuesCount}
- Індекс відтоку (Churn Intent): ${metrics.churnIntentRate}% (${metrics.churnIntentCount} абонентів загрожують перейти до конкурентів)
- Коефіцієнт резонансу / охоплення: ${metrics.averageResonance}x
- Перевищення норми спалаху (Spike Ratio): ${metrics.spikeVelocityRatio}x
- Топ проблемна локація: ${metrics.topLocations[0]?.name || 'Штатний стан'} (${metrics.topLocations[0]?.count || 0} згадок)
- Тональність: позитив: ${metrics.sentimentDistribution.positive}, нейтрально: ${metrics.sentimentDistribution.neutral}, негатив: ${metrics.sentimentDistribution.negative}

Приклади звернень за 7 днів:
${JSON.stringify(sampleFeedbacks, null, 2)}

Сформуй чіткий, професійний, діловий звіт українською мовою. Поверни виключно валідний JSON у наступному форматі без зайвого тексту чи markdown-обгорток:
{
  "status": "normal" | "warning" | "critical",
  "statusLabel": "Штатний стан" | "Підвищена увага" | "Критична загроза",
  "executiveSummary": "2-3 змістовні речення із загальним вердиктом за минулу добу: чи є загроза репутації, масштаби збою та загальний статус мережі.",
  "keyDrivers": [
    { "title": "Назва проблеми/драйвера", "description": "Пояснення причини скарг абонентів", "impact": "low" | "medium" | "high" },
    { "title": "...", "description": "...", "impact": "..." },
    { "title": "...", "description": "...", "impact": "..." }
  ],
  "churnRiskAnalysis": "Оцінка ризику відтоку абонентів до Київстар/lifecell та прямих фінансових втрат LTV.",
  "mediaViralityRisk": "Оцінка вірусності у Telegram-каналах та ЗМІ, чи є ризик репутаційного скандалу.",
  "recommendedActions": [
    { "team": "PR & Комунікації", "action": "Конкретна дія для піарників", "priority": "high" | "medium" | "low" },
    { "team": "Служба підтримки", "action": "Конкретна дія для сапорту", "priority": "high" | "medium" | "low" },
    { "team": "Технічний департамент", "action": "Конкретна дія для інженерів мережі", "priority": "high" | "medium" | "low" }
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
      statusLabel: parsed.statusLabel || 'Штатний стан',
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
