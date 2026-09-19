import { FeedbackRecord, ImportanceLevel, ProblemType, SentimentType, SourceType } from './types';

const sources: SourceType[] = ['telegram', 'twitter', 'facebook', 'news'];
const sentiments: SentimentType[] = ['positive', 'neutral', 'negative'];
const problemTypes: ProblemType[] = ['no_signal', 'slow_internet', 'dropped_calls', 'other'];
const importances: ImportanceLevel[] = ['low', 'medium', 'high', 'critical'];

const locations = [
  'Київ, Оболонь', 'Траса Київ-Чоп (Житомир)', 'Невідомо', 'Львів, Центр', 
  'Харківська область', 'Харків, Салтівка', 'Київ, Троєщина', 'Одеса, Аркадія',
  'Дніпро, Перемога', 'Траса Київ-Одеса', 'Полтава, Центр', 'Запоріжжя, Бабурка',
  'Івано-Франківськ, Пасічна', 'Чернівці, Кобилянської'
];

const templates = [
  "Знову немає зв'язку на {loc}! Вже третю годину телефон показує 'Немає мережі'.",
  "{loc} - суцільна біла пляма. Зв'язок обривається кожні 5 хвилин.",
  "Vodafone взагалі не тягне в районі {loc}.",
  "{loc} - 4G ледве тягне, швидкість жахлива.",
  "Масштабний збій у мережі Vodafone: {loc}. Абоненти повідомляють про відсутність зв'язку.",
  "Дякую за швидке відновлення вишки: {loc}! Зв'язок повернувся.",
  "{loc} знову без 4G, тільки Edge.",
  "Чому в {loc} постійно пропадає сигнал під час дощу?",
  "Не можу додзвонитися до рідних. Локація: {loc}.",
  "Швидкість інтернету на {loc} просто чудова сьогодні, дякую!",
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateData(count: number): FeedbackRecord[] {
  const data: FeedbackRecord[] = [];
  
  // Create a realistic distribution of dates over the last 30 days
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const loc = getRandomItem(locations);
    const template = getRandomItem(templates);
    const content = template.replace('{loc}', loc);
    
    // Randomize timestamp within last 30 days
    const timestamp = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    
    // Correlate sentiment with problem type slightly
    const problemType = getRandomItem(problemTypes);
    const sentiment = content.includes('Дякую') || content.includes('чудова') ? 'positive' : 'negative';
    const isConstructive = Math.random() > 0.3; // 70% constructive
    const importance = sentiment === 'positive' ? 'low' : getRandomItem(importances);
    const riskScore = sentiment === 'positive' ? 0 : Math.floor(Math.random() * 80) + 20; // 20-100 for negatives

    data.push({
      id: `f-${i}`,
      source: getRandomItem(sources),
      originalUrl: `https://example.com/post/${i}`,
      content,
      timestamp: timestamp.toISOString(),
      isRelevant: true,
      isConstructive,
      importance,
      sentiment,
      locationName: loc,
      problemType,
      reputationalRiskScore: riskScore,
    });
  }
  
  return data;
}

export const mockFeedbacks: FeedbackRecord[] = generateData(10000);
