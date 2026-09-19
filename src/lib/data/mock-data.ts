import { FeedbackRecord, ProblemType, SentimentType, SourceType } from './types';

const sources: SourceType[] = ['telegram', 'twitter', 'facebook', 'news'];
const problemTypes: ProblemType[] = ['no_signal', 'slow_internet', 'dropped_calls', 'other'];

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

function roundTwo(num: number): number {
  return Math.round(num * 100) / 100;
}

function generateData(count: number): FeedbackRecord[] {
  const data: FeedbackRecord[] = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const loc = getRandomItem(locations);
    const template = getRandomItem(templates);
    const content = template.replace('{loc}', loc);
    
    // Randomize timestamp within last 30 days
    const timestamp = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    
    const isPositive = content.includes('Дякую') || content.includes('чудова');
    const sentiment: SentimentType = isPositive ? 'positive' : (Math.random() > 0.85 ? 'neutral' : 'negative');
    const problemType = getRandomItem(problemTypes);
    
    // Scalar scores between 0 and 1
    // Relevance to network coverage problem
    const relevanceScore = isPositive 
      ? roundTwo(0.3 + Math.random() * 0.4) 
      : roundTwo(0.5 + Math.random() * 0.5);

    // Constructiveness score (does it have details like place, time, symptoms vs raw emotion)
    const isVague = content.includes('взагалі не тягне') || content.includes('жахлива');
    const constructivenessScore = isVague 
      ? roundTwo(0.1 + Math.random() * 0.4) 
      : roundTwo(0.45 + Math.random() * 0.55);

    const riskScore = isPositive 
      ? 0 
      : Math.floor(relevanceScore * 60 + Math.random() * 40);

    data.push({
      id: `f-${i}`,
      source: getRandomItem(sources),
      originalUrl: `https://example.com/post/${i}`,
      content,
      timestamp: timestamp.toISOString(),
      isRelevant: relevanceScore >= 0.5,
      isConstructive: constructivenessScore >= 0.5,
      relevanceScore,
      constructivenessScore,
      sentiment,
      locationName: loc,
      problemType,
      reputationalRiskScore: Math.min(100, Math.max(0, riskScore)),
    });
  }
  
  return data;
}

export const mockFeedbacks: FeedbackRecord[] = generateData(10000);
