import rawMentions from './real-data.json';
import rawLocations from './real-locations.json';
import rawMarket from './real-market.json';

export interface SqlQueryResult {
  success: boolean;
  sql: string;
  data?: any[];
  error?: string;
  rowCount: number;
  durationMs: number;
}

const DAY_NAMES_UA = [
  'Неділя',
  'Понеділок',
  'Вівторок',
  'Середа',
  'Четвер',
  'П’ятниця',
  'Субота'
];

export interface MentionRow {
  id: string;
  date: string;
  month: string;
  day_of_week: string;
  source: string;
  brand: string;
  sentiment: string;
  location: string;
  problem_type: string;
  risk_score: number;
  cause: string;
  churn_intent: boolean;
  content: string;
}

// Map dataset into in-memory table records
const mentionsTable: MentionRow[] = (rawMentions as any[]).map(r => {
  const ts = r.timestamp || '';
  const dateStr = ts ? ts.slice(0, 10) : '2026-09-18';
  const d = new Date(dateStr);
  const dayOfWeek = isNaN(d.getDay()) ? 'Невідомо' : DAY_NAMES_UA[d.getDay()];

  return {
    id: String(r.id),
    date: dateStr,
    month: ts ? ts.slice(0, 7) : '2026-09',
    day_of_week: dayOfWeek,
    source: r.source || 'review',
    brand: r.brand || 'unknown',
    sentiment: r.sentiment || 'neutral',
    location: r.locationName || 'Невідомо',
    problem_type: r.problemType || 'none',
    risk_score: Number(r.reputationalRiskScore) || 0,
    cause: r.cause || 'other',
    churn_intent: Boolean(r.churnIntent),
    content: (r.content || '').replace(/\s+/g, ' ').trim()
  };
});

const locationsTable = (rawLocations as any[]).map(l => ({
  name: l.name,
  complaints: Number(l.complaints) || 0,
  praise: Number(l.praise) || 0,
  negativity_share: Number(l.negativityShare) || 0,
  pattern: l.pattern || 'sporadic',
  top_cause: l.topCause || 'coverage'
}));

const marketTable = ((rawMarket as any)?.items || []).map((m: any, idx: number) => ({
  id: idx + 1,
  date: m.timestamp ? m.timestamp.slice(0, 10) : '2026-09-18',
  source: m.source || 'news',
  cause: m.cause || 'coverage',
  sentiment: m.sentiment || 'neutral',
  content: (m.content || '').replace(/\s+/g, ' ').trim()
}));

/**
 * Evaluates WHERE conditions against a database row
 */
function evaluateRowCondition(row: any, expr: string): boolean {
  if (!expr || !expr.trim()) return true;

  try {
    const jsExpr = expr
      .replace(/\bLOWER\(([^)]+)\)/gi, 'String(row.$1 || "").toLowerCase()')
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+LIKE\s+'%([^%']+)%'/gi, 'String(row.$1 || "").toLowerCase().includes("$2".toLowerCase())')
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+LIKE\s+'([^%']+)%'/gi, 'String(row.$1 || "").toLowerCase().startsWith("$2".toLowerCase())')
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+BETWEEN\s+'([^']+)'\s+AND\s+'([^']+)'/gi, '(row.$1 >= "$2" && row.$1 <= "$3")')
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+IN\s*\(([^)]+)\)/gi, '[$2].map(v => String(v).toLowerCase()).includes(String(row.$1).toLowerCase())')
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(TRUE|FALSE)\b/gi, (_, p1, p2) => `Boolean(row.${p1}) === ${p2.toUpperCase() === 'TRUE'}`)
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*'([^']*)'/g, 'String(row.$1) === "$2"')
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(!=|<>)\s*'([^']*)'/g, 'String(row.$1) !== "$3"')
      .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*([><]=?)\s*([0-9.]+)/g, 'Number(row.$1) $2 $3')
      .replace(/\bAND\b/gi, '&&')
      .replace(/\bOR\b/gi, '||');

    const fn = new Function('row', `return Boolean(${jsExpr});`);
    return fn(row);
  } catch {
    return true;
  }
}

/**
 * Pure TypeScript in-memory SQL execution engine (Zero dependencies, Turbopack native)
 */
export function executeSqlQuery(rawSql: string): SqlQueryResult {
  const start = performance.now();
  let cleanSql = rawSql.trim().replace(/;+$/, '');

  const firstWord = cleanSql.split(/\s+/)[0]?.toUpperCase();
  if (firstWord !== 'SELECT') {
    return {
      success: false,
      sql: rawSql,
      error: 'Дозволені виключно SELECT-запити до бази даних.',
      rowCount: 0,
      durationMs: 0
    };
  }

  // Determine source table
  const fromMatch = cleanSql.match(/FROM\s+([a-zA-Z_]+)/i);
  const tableName = (fromMatch ? fromMatch[1].toLowerCase() : 'mentions');
  let dataset: any[] = mentionsTable;

  if (tableName === 'locations') {
    dataset = locationsTable;
  } else if (tableName === 'market' || tableName === 'market_news') {
    dataset = marketTable;
  }

  try {
    let filtered = dataset;

    // 1. WHERE
    const whereMatch = cleanSql.match(/WHERE\s+(.*?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      const whereExpr = whereMatch[1].trim();
      filtered = filtered.filter(row => evaluateRowCondition(row, whereExpr));
    }

    // 2. GROUP BY
    const groupMatch = cleanSql.match(/GROUP\s+BY\s+(.*?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    let resultRows: any[] = [];

    if (groupMatch) {
      const groupCols = groupMatch[1].split(',').map(s => s.trim());
      const groups: Record<string, { sample: any; rows: any[] }> = {};

      filtered.forEach(row => {
        const key = groupCols.map(c => String(row[c] ?? '')).join(':::');
        if (!groups[key]) {
          groups[key] = { sample: row, rows: [] };
        }
        groups[key].rows.push(row);
      });

      resultRows = Object.values(groups).map(g => {
        const res: Record<string, any> = {};
        groupCols.forEach(c => {
          res[c] = g.sample[c];
        });
        res.cnt = g.rows.length;
        const totalRisk = g.rows.reduce((sum, r) => sum + (Number(r.risk_score) || 0), 0);
        res.avg_risk = Math.round((totalRisk / (g.rows.length || 1)) * 10) / 10;
        return res;
      });
    } else {
      // Non-grouped projection
      const selectPart = cleanSql.match(/SELECT\s+(.*?)\s+FROM/i)?.[1] || '*';

      if (selectPart.trim() === '*' || selectPart.includes('*')) {
        resultRows = filtered;
      } else if (selectPart.toUpperCase().includes('COUNT(') || selectPart.toUpperCase().includes('AVG(')) {
        // Single row aggregate
        const totalRisk = filtered.reduce((sum, r) => sum + (Number(r.risk_score) || 0), 0);
        resultRows = [{
          cnt: filtered.length,
          avg_risk: Math.round((totalRisk / (filtered.length || 1)) * 10) / 10
        }];
      } else {
        const cols = selectPart.split(',').map(c => {
          const colAlias = c.trim().split(/\s+as\s+/i);
          return { key: colAlias[0].trim(), alias: (colAlias[1] || colAlias[0]).trim() };
        });
        resultRows = filtered.map(row => {
          const projected: Record<string, any> = {};
          cols.forEach(({ key, alias }) => {
            projected[alias] = row[key];
          });
          return projected;
        });
      }
    }

    // 3. ORDER BY
    const orderMatch = cleanSql.match(/ORDER\s+BY\s+([a-zA-Z_]+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderCol = orderMatch[1];
      const isDesc = !orderMatch[2] || orderMatch[2].toUpperCase() === 'DESC';

      resultRows.sort((a, b) => {
        const valA = a[orderCol] ?? 0;
        const valB = b[orderCol] ?? 0;
        return isDesc ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
      });
    }

    // 4. LIMIT
    const limitMatch = cleanSql.match(/LIMIT\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 50;
    const finalRows = resultRows.slice(0, Math.min(limit, 100));

    const durationMs = Math.round((performance.now() - start) * 10) / 10;

    return {
      success: true,
      sql: cleanSql,
      data: finalRows,
      rowCount: resultRows.length,
      durationMs
    };
  } catch (err: any) {
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      success: false,
      sql: cleanSql,
      error: err?.message || 'Помилка виконання SQL-запиту',
      rowCount: 0,
      durationMs
    };
  }
}

/**
 * Database schema documentation for Gemini AI prompt
 */
export const DATABASE_SCHEMA_PROMPT = `
[СХЕМА ТА СТРУКТУРА БАЗИ ДАНИХ VODAFONE REPUTATIONX (in-memory SQL)]:
Таблиця: mentions (1 051 запис за період 2025-09-01 — 2026-09-18)
Колонки:
- id (STRING): унікальний ідентифікатор запису
- date (STRING, 'YYYY-MM-DD'): найсвіжіша дата: '2026-09-18'
- month (STRING, 'YYYY-MM'): наприклад '2026-09', '2026-01', '2025-12'
- day_of_week (STRING): 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'
- source (STRING): 'review' (відгуки маркетів), 'news' (ЗМІ), 'telegram' (канали)
- brand (STRING): 'vodafone', 'kyivstar', 'lifecell', 'unknown'
- sentiment (STRING): 'negative' (скарга), 'positive' (похвала), 'neutral' (новина/інфо)
- location (STRING): 'Київ', 'Львів', 'Полтава', 'Тернопіль', 'Одеса', 'Дніпро', 'Запоріжжя', 'Невідомо'
- problem_type (STRING): 'no_signal', 'slow_internet', 'dropped_calls', 'other', 'none'
- risk_score (NUMBER 0-100): рівень репутаційного ризику (0-30 низький, 31-49 помірний, >=50 критичний)
- cause (STRING): 'internet', 'coverage', 'blackout', 'outage', 'other'
- churn_intent (BOOLEAN: TRUE або FALSE): чи погрожує абонент піти до іншого оператора
- content (STRING): повний оригінальний текст публікації / скарги
`;

/**
 * Extracts explicit Ukrainian date representations (DD.MM.YYYY, DD.MM, DD місяця)
 */
export function parseUaDate(rawQ: string): { startDate: string; endDate: string; label: string } | null {
  const q = rawQ.toLowerCase();

  // 1. Check DD.MM.YYYY or DD.MM (e.g. "14.09", "14.09.2026")
  const numMatch = q.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);
  if (numMatch) {
    const day = numMatch[1].padStart(2, '0');
    const month = numMatch[2].padStart(2, '0');
    let year = numMatch[3] || '2026';
    if (year.length === 2) year = '20' + year;
    if (!numMatch[3] && Number(month) >= 10) year = '2025';
    const isoDate = `${year}-${month}-${day}`;
    return { startDate: isoDate, endDate: isoDate, label: `${day}.${month}.${year}` };
  }

  // 2. Check DD [назва місяця] (e.g. "14 вересня", "5 січня")
  const monthsUa: Record<string, string> = {
    'січ': '01', 'лют': '02', 'берез': '03', 'квіт': '04',
    'трав': '05', 'черв': '06', 'лип': '07', 'серп': '08',
    'верес': '09', 'жовт': '10', 'листопад': '11', 'груд': '12'
  };
  const wordMatch = q.match(/\b(\d{1,2})\s+([а-яіїє]+)/i);
  if (wordMatch) {
    const day = wordMatch[1].padStart(2, '0');
    const word = wordMatch[2].toLowerCase();
    for (const [prefix, mNum] of Object.entries(monthsUa)) {
      if (word.startsWith(prefix)) {
        let year = '2026';
        if (Number(mNum) >= 10) year = '2025';
        const isoDate = `${year}-${mNum}-${day}`;
        return { startDate: isoDate, endDate: isoDate, label: `${day}.${mNum}.${year}` };
      }
    }
  }

  return null;
}

/**
 * Dynamic SQL query builder for Ukrainian user queries
 */
export function buildDynamicSqlQuery(userQuestion: string): {
  primarySql: string;
  secondarySql?: string;
  label: string;
} {
  const q = userQuestion.toLowerCase();

  // 0. User typed a custom SQL SELECT
  if (q.trim().startsWith('select ')) {
    return {
      primarySql: userQuestion.trim(),
      label: 'Користувацький SQL-запит'
    };
  }

  // 1. Day of week breakdown
  if (q.includes('дні тижня') || q.includes('днях тижня') || q.includes('понеділок') || q.includes('вівторок') || q.includes('середа') || q.includes('четвер') || q.includes('п’ятниц') || q.includes('субот') || q.includes('неділ')) {
    return {
      primarySql: `SELECT day_of_week, count(id) as cnt, round(avg(risk_score), 1) as avg_risk FROM mentions WHERE sentiment = 'negative' GROUP BY day_of_week ORDER BY cnt DESC`,
      label: 'Аналіз скарг за днями тижня'
    };
  }

  // 2. Churn / Відтік (Ukrainian declensions: відтік, відтоку, відтоком, піти, перехід, розірвати)
  if (q.includes('відтік') || q.includes('відток') || q.includes('churn') || q.includes('перехід') || q.includes('перейти') || q.includes('розірв') || q.includes('піти') || q.includes('втрат')) {
    return {
      primarySql: `SELECT brand, count(id) as cnt, round(avg(risk_score), 1) as avg_risk FROM mentions WHERE churn_intent = TRUE GROUP BY brand`,
      secondarySql: `SELECT date, brand, location, risk_score, content FROM mentions WHERE churn_intent = TRUE ORDER BY risk_score DESC LIMIT 7`,
      label: 'Аналіз загроз відтоку абонентів (Churn Intent)'
    };
  }

  // 3. Court, NKEK regulator, fines, penalties
  if (q.includes('суд') || q.includes('нкек') || q.includes('штраф') || q.includes('компенсац') || q.includes('амку')) {
    return {
      primarySql: `SELECT id, date, brand, risk_score, content FROM mentions WHERE LOWER(content) LIKE '%нкек%' OR LOWER(content) LIKE '%суд%' OR LOWER(content) LIKE '%штраф%' ORDER BY risk_score DESC LIMIT 8`,
      label: 'Згадки регулятора НКЕК, судів та штрафів'
    };
  }

  // 4. Top cities / Geography comparison ("топ міст", "де найбільше", "локації", "епіцентри")
  if ((q.includes('міст') || q.includes('локац') || q.includes('де найбільше') || q.includes('регіон')) && !q.includes('київ') && !q.includes('львів') && !q.includes('одес') && !q.includes('полтав')) {
    return {
      primarySql: `SELECT location, count(id) as cnt, round(avg(risk_score), 1) as avg_risk FROM mentions WHERE location != 'Невідомо' AND sentiment = 'negative' GROUP BY location ORDER BY cnt DESC LIMIT 7`,
      secondarySql: `SELECT date, brand, location, risk_score, content FROM mentions WHERE location != 'Невідомо' AND sentiment = 'negative' ORDER BY risk_score DESC LIMIT 5`,
      label: 'Географічний зріз: топ проблемних локацій'
    };
  }

  // 5. Competitor comparison ("порівняй", "конкурент", "київстар чи водафон", "хто кращий")
  if (q.includes('порівняй') || q.includes('порівнян') || q.includes('конкурент') || (q.includes('київстар') && q.includes('lifecell')) || (q.includes('водафон') && q.includes('київстар'))) {
    return {
      primarySql: `SELECT brand, sentiment, count(id) as cnt, round(avg(risk_score), 1) as avg_risk FROM mentions WHERE brand IN ('vodafone', 'kyivstar', 'lifecell') GROUP BY brand, sentiment`,
      secondarySql: `SELECT date, brand, location, risk_score, content FROM mentions WHERE brand IN ('vodafone', 'kyivstar', 'lifecell') ORDER BY risk_score DESC LIMIT 6`,
      label: 'Порівняльний аналіз операторів (Vodafone vs Kyivstar vs lifecell)'
    };
  }

  // 6. Date filtering
  let dateFilter = '';
  let dateLabel = 'Вся база (рік)';

  const customDate = parseUaDate(userQuestion);
  if (customDate) {
    dateFilter = `date = '${customDate.startDate}'`;
    dateLabel = customDate.label;
  } else if (q.includes('сьогодні') || q.includes('today') || q.includes('зараз') || q.includes('поточний день') || q.includes('за добу')) {
    dateFilter = "date = '2026-09-18'";
    dateLabel = 'Остання активна доба (18.09.2026)';
  } else if (q.includes('вчора') || q.includes('yesterday')) {
    dateFilter = "date = '2026-09-17'";
    dateLabel = 'Попередня доба (17.09.2026)';
  } else if (q.includes('тиждень') || q.includes('7 днів')) {
    dateFilter = "date >= '2026-09-11'";
    dateLabel = 'Останні 7 днів (11.09 — 18.09.2026)';
  } else if (q.includes('місяць') || q.includes('30 днів')) {
    dateFilter = "date >= '2026-08-19'";
    dateLabel = 'Останні 30 днів (19.08 — 18.09.2026)';
  } else if (q.includes('вересень') || q.includes('вересні')) {
    dateFilter = "month = '2026-09'";
    dateLabel = 'Вересень 2026';
  } else if (q.includes('серпень') || q.includes('серпні')) {
    dateFilter = "month = '2026-08'";
    dateLabel = 'Серпень 2026';
  } else if (q.includes('липень') || q.includes('липні')) {
    dateFilter = "month = '2026-07'";
    dateLabel = 'Липень 2026';
  } else if (q.includes('червень') || q.includes('червні')) {
    dateFilter = "month = '2026-06'";
    dateLabel = 'Червень 2026';
  } else if (q.includes('зима') || q.includes('зим') || q.includes('холод') || q.includes('січень') || q.includes('лютий')) {
    dateFilter = "date >= '2025-11-01' AND date <= '2026-02-28'";
    dateLabel = 'Зимовий сезон (листопад 2025 — лютий 2026)';
  }

  // 7. Brand filtering
  let brandFilter = '';
  if (q.includes('київстар') || q.includes('kyivstar')) {
    brandFilter = "brand = 'kyivstar'";
  } else if (q.includes('лайф') || q.includes('lifecell')) {
    brandFilter = "brand = 'lifecell'";
  } else if (q.includes('водафон') || q.includes('vodafone')) {
    brandFilter = "brand = 'vodafone'";
  }

  // 8. Location filtering with Ukrainian declension stems
  let locationFilter = '';
  const cityPatterns: Array<{ name: string; patterns: string[] }> = [
    { name: 'Київ', patterns: ['київ', 'києв'] },
    { name: 'Львів', patterns: ['львів', 'львов'] },
    { name: 'Полтава', patterns: ['полтав'] },
    { name: 'Одеса', patterns: ['одес'] },
    { name: 'Дніпро', patterns: ['дніпр'] },
    { name: 'Тернопіль', patterns: ['терноп'] },
    { name: 'Запоріжжя', patterns: ['запоріж'] },
    { name: 'Харків', patterns: ['харків', 'харков'] },
    { name: 'Вінниця', patterns: ['вінниц'] },
    { name: 'Черкаси', patterns: ['черкас'] },
    { name: 'Миколаїв', patterns: ['миколаїв', 'миколаєв'] },
    { name: 'Херсон', patterns: ['херсон'] }
  ];
  for (const { name, patterns } of cityPatterns) {
    if (patterns.some(p => q.includes(p))) {
      locationFilter = `location = '${name}'`;
      break;
    }
  }

  // 9. Problem / Cause filtering
  let causeFilter = '';
  if (q.includes('блекаут') || q.includes('світл') || q.includes('знеструмл') || q.includes('генератор')) {
    causeFilter = "cause = 'blackout'";
  } else if (q.includes('покриття') || q.includes('сигнал') || q.includes('вишк')) {
    causeFilter = "(problem_type = 'no_signal' OR cause = 'coverage')";
  } else if (q.includes('інтернет') || q.includes('4g') || q.includes('швидкість')) {
    causeFilter = "(problem_type = 'slow_internet' OR cause = 'internet')";
  }

  const conditions: string[] = [];
  if (dateFilter) conditions.push(dateFilter);
  if (brandFilter) conditions.push(brandFilter);
  if (locationFilter) conditions.push(locationFilter);
  if (causeFilter) conditions.push(causeFilter);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const label = [dateLabel, brandFilter, locationFilter, causeFilter].filter(Boolean).join(' | ');

  const isListRequested = 
    q.includes('перечисл') || 
    q.includes('переліч') || 
    q.includes('список') || 
    q.includes('покажи всі') || 
    q.includes('які саме') || 
    q.includes('всі скарг') || 
    q.includes('всі звернення') ||
    q.includes('які скарг') || 
    q.includes('процитуй') || 
    q.includes('детальн') || 
    q.includes('що писали') || 
    q.includes('хто писав');

  const primarySql = isListRequested
    ? `SELECT id, date, brand, location, risk_score, content FROM mentions ${whereClause} ORDER BY risk_score DESC LIMIT 20`
    : `SELECT sentiment, count(id) as cnt, round(avg(risk_score), 1) as avg_risk FROM mentions ${whereClause} GROUP BY sentiment`;

  const secondarySql = isListRequested
    ? `SELECT sentiment, count(id) as cnt, round(avg(risk_score), 1) as avg_risk FROM mentions ${whereClause} GROUP BY sentiment`
    : `SELECT date, brand, location, risk_score, content FROM mentions ${whereClause} ORDER BY risk_score DESC LIMIT 6`;

  return {
    primarySql,
    secondarySql,
    label: label || 'Загальний річний масив (1 051 запис)'
  };
}

/**
 * Execute comprehensive analytics for user question
 */
export function queryDatabaseDirectly(userQuestion: string): {
  label: string;
  primaryResult: SqlQueryResult;
  secondaryResult?: SqlQueryResult;
  summaryText: string;
} {
  const plan = buildDynamicSqlQuery(userQuestion);
  const primaryResult = executeSqlQuery(plan.primarySql);
  const secondaryResult = plan.secondarySql ? executeSqlQuery(plan.secondarySql) : undefined;

  let summaryText = `[ПРЯМИЙ ЗАПИТ ДО БАЗИ ДАНИХ (in-memory SQL)]:
Критерій: ${plan.label}
Виконаний SQL: ${primaryResult.sql}
Час виконання: ${primaryResult.durationMs} мс
Результат запиту: ${JSON.stringify(primaryResult.data || [])}`;

  if (secondaryResult && secondaryResult.data && secondaryResult.data.length > 0) {
    summaryText += `\nВиконаний детальний SQL: ${secondaryResult.sql}
Зразки записів із бази:
${(secondaryResult.data || []).map((row: any, i: number) => 
  `${i + 1}. [${row.date || ''}, ${row.brand || ''}, ${row.location || ''}, ризик ${row.risk_score || 0}/100]: "${row.content || ''}"`
).join('\n')}`;
  }

  return {
    label: plan.label,
    primaryResult,
    secondaryResult,
    summaryText
  };
}
