"""
Експорт реальних даних у формат дашборда №6.

Формує FeedbackRecord[] точно за його types.ts і кладе поруч із
mock-data.ts, щоб він замінив імпорт одним рядком.

    python export_dashboard.py
    python export_dashboard.py --limit 500 --relevant-only
"""

import argparse
import json
import os
import sqlite3

DB_PATH = 'mentions.db'
OUT_JSON = 'src/lib/data/real-data.json'   # застосунок живе в корені репо

IMPORTANCE = {0: 'low', 1: 'medium', 2: 'high', 3: 'critical'}
SENTIMENT = {0: 'positive', 1: 'neutral', 2: 'negative'}
PROBLEM = {0: 'no_signal', 1: 'slow_internet', 2: 'dropped_calls', 3: 'other'}

# У його types.ts SourceType = telegram | twitter | facebook | news.
# Відгуків там немає, а це 85% наших даних. Поки мапимо review -> news,
# але правильно додати 'review' у тип — написано в README експорту.
SOURCE_MAP = {'telegram': 'telegram', 'news': 'news', 'review': 'review'}


# Причини, що стосуються покриття та звʼязку — тема, яку ми вирішуємо.
COVERAGE_CAUSES = ('coverage', 'internet', 'calls', 'outage', 'blackout')


def fetch(scope='problems', limit=None, days=None):
    """
    scope='coverage' — усе про звʼязок: і скарги, І ПОХВАЛИ (за замовчуванням).
                       Без позитиву цифра "1106 скарг" ні про що не говорить:
                       незрозуміло, це багато чи мало. Співвідношення дає
                       відповідь на питання "де працює, а де ні" — саме те,
                       заради чого будувався продукт.
    scope='problems' — лише скарги на звʼязок.
    scope='negative' — весь негатив, включно з тарифами й застосунком.
    scope='all'      — увесь потік, разом із похвалами.

    Чому за замовчуванням 'problems': дашборд підписує кожен запис
    словом "скарга". Якщо віддати все підряд, "Всього скарг 5498"
    включатиме "дякую, все супер" на пʼять зірок, а "Топ проблемних
    ділянок: Київ 593" рахуватиме й похвали. Цифри стають великими
    й беззмістовними.
    """
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    conds = ["a.sentiment IS NOT NULL"]
    params = []
    if scope in ('problems', 'negative'):
        conds.append("a.sentiment IN ('negative','mixed')")
    if scope in ('problems', 'coverage'):
        placeholders = ','.join('?' * len(COVERAGE_CAUSES))
        conds.append(f"a.cause IN ({placeholders})")
        params.extend(COVERAGE_CAUSES)
    if days:
        conds.append("m.published_at >= date('now', ?)")
        params.append(f'-{days} days')

    sql = f"""
        SELECT m.id, m.source_type, m.url, m.text, m.published_at, m.brand_query,
               a.is_relevant, a.is_constructive, a.importance, a.sentiment_enum,
               a.problem_type, a.risk_score, a.address_name, a.lat, a.lng,
               a.relevance_score, a.constructive_score, a.cause, a.context,
               a.churn_intent, a.churn_score, a.reach_weight, a.resonance,
               a.is_market_wide
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {' AND '.join(conds)}
        ORDER BY m.published_at DESC
        {'LIMIT ' + str(int(limit)) if limit else ''}
    """

    out = []
    for r in con.execute(sql, params):
        out.append({
            'id': str(r['id']),
            'source': SOURCE_MAP.get(r['source_type'], 'news'),
            'originalUrl': r['url'] or '',
            'content': r['text'] or '',
            'timestamp': r['published_at'],

            'isRelevant': bool(r['is_relevant']),
            'isConstructive': bool(r['is_constructive']),
            'relevanceScore': r['relevance_score'],
            'constructivenessScore': r['constructive_score'],
            'sentiment': SENTIMENT.get(r['sentiment_enum'], 'neutral'),

            # у типах поле рядкове; "Невідомо" замість порожнього,
            # як у його ж мок-даних
            'locationName': r['address_name'] or 'Невідомо',

            'problemType': PROBLEM.get(r['problem_type'], 'other'),
            'reputationalRiskScore': r['risk_score'] or 0,

            # понад контракт — знадобиться для карти й фільтрів
            'brand': r['brand_query'],
            'lat': r['lat'],
            'lng': r['lng'],
            'cause': r['cause'],
            'context': r['context'],

            # Чия це аварія. Під час відключень світла базові станції
            # сідають на акумулятори — звʼязок падає, але оператор
            # ні до чого. Для тривоги це не наша аварія, для бізнесу —
            # окрема тема про автономність станцій, тож не ховаємо,
            # а позначаємо.
            'attribution': ('grid' if (r['context'] == 'blackout'
                                       or r['cause'] == 'blackout')
                            else 'network'),
            'isCoverageProblem': r['cause'] in COVERAGE_CAUSES,
            # Матеріал про ринок, а не про конкретного оператора.
            # Такі зберігаються по разу на бренд, тому без цієї ознаки
            # галузева стаття потрапляє у стрічку кожного оператора.
            'isMarketWide': bool(r['is_market_wide']),
            'churnIntent': bool(r['churn_intent']),
            'churnScore': r['churn_score'],
            'reachWeight': r['reach_weight'],
            'resonance': r['resonance'],
        })
    return out


def build_locations(records):
    """
    ГОЛОВНИЙ артефакт продукту: локації, а не окремі скарги.

    Vodafone ухвалює рішення не по повідомленнях, а по місцях —
    куди ставити базову станцію, де потрібне резервне живлення,
    де проблема взагалі не наша. Тому одиниця аналізу — локація.

    Для кожної рахуємо не лише кількість скарг, а РОЗПОДІЛ У ЧАСІ.
    19 скарг за 18 різних днів і 19 скарг за один день — це різні
    речі: перше хронічний фон, друге аварія.
    """
    from collections import defaultdict

    groups = defaultdict(lambda: {
        'complaints': 0, 'praise': 0, 'grid': 0, 'chronic': 0,
        'days': set(), 'brands': defaultdict(int),
        'causes': defaultdict(int), 'samples': [],
        'lat': None, 'lng': None,
    })

    for r in records:
        if r['lat'] is None:
            continue
        name = r['locationName']
        if name == 'Невідомо':
            continue
        g = groups[name]
        g['lat'], g['lng'] = r['lat'], r['lng']
        if r['sentiment'] == 'negative':
            g['complaints'] += 1
        elif r['sentiment'] == 'positive':
            g['praise'] += 1
        g['days'].add(r['timestamp'][:10])
        g['brands'][r['brand']] += 1
        g['causes'][r['cause']] += 1
        if r['attribution'] == 'grid':
            g['grid'] += 1
        if r['context'] in ('transport', 'terrain', 'rural'):
            g['chronic'] += 1
        if len(g['samples']) < 3:
            g['samples'].append(' '.join(r['content'].split())[:120])

    out = []
    for name, g in groups.items():
        n = g['complaints']
        if n == 0 and g['praise'] == 0:
            continue
        days = len(g['days'])
        grid_share = round(100 * g['grid'] / n, 1) if n else 0.0

        # Частка негативу — головний показник локації. Саме він
        # відповідає на питання "де звʼязок працює, а де ні":
        # 14% в Одесі й 95% у Полтаві це два різні світи.
        both = n + g['praise']
        negativity = round(100 * n / both, 1) if both else 0.0

        # Що це насправді: разова аварія чи постійний фон.
        # Скарги, розмазані по багатьох днях, — це не подія,
        # і команду по них піднімати не треба.
        intensity = n / days if days else 0
        if both and negativity <= 35:
            pattern = 'healthy'       # тут хвалять частіше, ніж скаржаться
        elif grid_share >= 50:
            pattern = 'grid'          # проблема не в мережі оператора
        elif days >= 10 and intensity < 2.5:
            pattern = 'chronic'       # постійний фон, питання інвестицій
        elif intensity >= 3:
            pattern = 'incident'      # сплеск, питання реагування
        else:
            pattern = 'sporadic'

        out.append({
            'name': name, 'lat': g['lat'], 'lng': g['lng'],
            'complaints': n,
            'praise': g['praise'],
            'negativityShare': negativity,
            'daysWithComplaints': days,
            'intensity': round(intensity, 2),
            'gridShare': grid_share,
            'chronicGapShare': round(100 * g['chronic'] / n, 1) if n else 0.0,
            'pattern': pattern,
            'topCause': max(g['causes'], key=g['causes'].get),
            'byBrand': dict(sorted(g['brands'].items(), key=lambda x: -x[1])),
            'samples': g['samples'],
        })
    return sorted(out, key=lambda x: -x['complaints'])


def build_summary(records, alerts):
    """
    Бізнес-показники для головного екрана.

    Кожен підпис має бути правдою. "Всього скарг" мусить означати скарги,
    а не весь потік відгуків разом із подяками.
    """
    locations = build_locations(records)
    total = len(records)
    market = sum(1 for r in records if r.get('isMarketWide'))
    grid = sum(1 for r in records if r['attribution'] == 'grid')
    geo = sum(1 for r in records if r['lat'])
    chronic = sum(1 for r in records
                  if r['context'] in ('transport', 'terrain', 'rural'))

    by_brand = {}
    for r in records:
        by_brand[r['brand']] = by_brand.get(r['brand'], 0) + 1

    wake = [a for a in alerts if a['level'] == 'wake']

    return {
        # головне: скільки МІСЦЬ має проблему і якого вона типу
        'problemLocations': len(locations),
        'gridDriven': sum(1 for l in locations if l['pattern'] == 'grid'),
        'chronicLocations': sum(1 for l in locations if l['pattern'] == 'chronic'),
        'healthyLocations': sum(1 for l in locations if l['pattern'] == 'healthy'),
        'incidentLocations': sum(1 for l in locations if l['pattern'] == 'incident'),

        'marketWideMentions': market,
        'coverageMentions': total,
        'coverageComplaints': sum(1 for r in records if r['sentiment'] == 'negative'),
        'coveragePraise': sum(1 for r in records if r['sentiment'] == 'positive'),
        'gridOutageShare': round(100 * grid / total, 1) if total else 0,
        'gridOutageCount': grid,
        'withLocation': geo,
        'withLocationShare': round(100 * geo / total, 1) if total else 0,
        'chronicGaps': chronic,
        'byBrand': dict(sorted(by_brand.items(), key=lambda x: -x[1])),
        'wakeAlertsPerYear': len(wake),
        'alertsTotal': len(alerts),
        'maxSpikeVelocity': max((a['ratio'] for a in alerts), default=0),
    }


def fetch_alerts():
    """Алерти детектора — для стрічки подій на дашборді."""
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute("""
            SELECT level, event_type, brand, cause, cities, window_start, window_end,
                   count, baseline, ratio, n_source_types, summary, recommended_action
            FROM alerts ORDER BY window_start DESC
        """).fetchall()
    except sqlite3.OperationalError:
        return []
    return [dict(r) for r in rows]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--limit', type=int)
    p.add_argument('--days', type=int)
    p.add_argument('--scope', default='coverage',
                   choices=['coverage', 'problems', 'negative', 'all'])
    args = p.parse_args()

    records = fetch(args.scope, args.limit, args.days)
    alerts = fetch_alerts()

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False)

    loc_path = OUT_JSON.replace('real-data.json', 'real-locations.json')
    with open(loc_path, 'w', encoding='utf-8') as f:
        json.dump(build_locations(records), f, ensure_ascii=False, indent=1)

    summary_path = OUT_JSON.replace('real-data.json', 'real-summary.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(build_summary(records, alerts), f, ensure_ascii=False, indent=1)

    # Ринковий контекст: галузеві матеріали окремим файлом, щоб сторінка
    # аналітики показувала їх поруч зі скаргами, але не всередині них.
    market = [r for r in records if r.get('isMarketWide')]
    seen, uniq = set(), []
    for r in sorted(market, key=lambda x: x['timestamp'], reverse=True):
        # один і той самий матеріал збережено по разу на кожен бренд
        key = r['content'][:160]
        if key in seen:
            continue
        seen.add(key)
        uniq.append({'content': r['content'][:400], 'timestamp': r['timestamp'],
                     'source': r['source'], 'url': r.get('originalUrl'),
                     'cause': r.get('cause'), 'sentiment': r['sentiment']})
    market_path = OUT_JSON.replace('real-data.json', 'real-market.json')
    with open(market_path, 'w', encoding='utf-8') as f:
        json.dump({'total': len(market), 'unique': len(uniq),
                   'items': uniq[:40]}, f, ensure_ascii=False, indent=1)

    alerts_path = OUT_JSON.replace('real-data.json', 'real-alerts.json')
    with open(alerts_path, 'w', encoding='utf-8') as f:
        json.dump(alerts, f, ensure_ascii=False, indent=1)

    size = os.path.getsize(OUT_JSON) / 1024 / 1024
    with_geo = sum(1 for r in records if r['lat'])
    grid = sum(1 for r in records if r['attribution'] == 'grid')
    print(f"Записів: {len(records)} ({size:.1f} МБ) | з координатами: {with_geo} "
          f"| через світло: {grid}")
    print(f"Алертів: {len(alerts)}")
    print(f"  {OUT_JSON}")
    print(f"  {alerts_path}")
    print(f"  {summary_path}")
    print(f"  {loc_path}")


if __name__ == '__main__':
    main()
