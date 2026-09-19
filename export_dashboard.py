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
OUT_JSON = 'dashboard/src/lib/data/real-data.json'

IMPORTANCE = {0: 'low', 1: 'medium', 2: 'high', 3: 'critical'}
SENTIMENT = {0: 'positive', 1: 'neutral', 2: 'negative'}
PROBLEM = {0: 'no_signal', 1: 'slow_internet', 2: 'dropped_calls', 3: 'other'}

# У його types.ts SourceType = telegram | twitter | facebook | news.
# Відгуків там немає, а це 85% наших даних. Поки мапимо review -> news,
# але правильно додати 'review' у тип — написано в README експорту.
SOURCE_MAP = {'telegram': 'telegram', 'news': 'news', 'review': 'review'}


def fetch(relevant_only=False, limit=None, days=None):
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    conds = ["a.sentiment IS NOT NULL"]
    params = []
    if relevant_only:
        conds.append("a.is_relevant = 1")
    if days:
        conds.append("m.published_at >= date('now', ?)")
        params.append(f'-{days} days')

    sql = f"""
        SELECT m.id, m.source_type, m.url, m.text, m.published_at, m.brand_query,
               a.is_relevant, a.is_constructive, a.importance, a.sentiment_enum,
               a.problem_type, a.risk_score, a.address_name, a.lat, a.lng,
               a.relevance_score, a.constructive_score, a.cause, a.context,
               a.churn_intent, a.churn_score, a.reach_weight, a.resonance
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
            'churnIntent': bool(r['churn_intent']),
            'churnScore': r['churn_score'],
            'reachWeight': r['reach_weight'],
            'resonance': r['resonance'],
        })
    return out


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
    p.add_argument('--relevant-only', action='store_true')
    args = p.parse_args()

    records = fetch(args.relevant_only, args.limit, args.days)
    alerts = fetch_alerts()

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False)

    alerts_path = OUT_JSON.replace('real-data.json', 'real-alerts.json')
    with open(alerts_path, 'w', encoding='utf-8') as f:
        json.dump(alerts, f, ensure_ascii=False, indent=1)

    size = os.path.getsize(OUT_JSON) / 1024 / 1024
    with_geo = sum(1 for r in records if r['lat'])
    print(f"Записів: {len(records)} ({size:.1f} МБ), з координатами: {with_geo}")
    print(f"Алертів: {len(alerts)}")
    print(f"  {OUT_JSON}")
    print(f"  {alerts_path}")


if __name__ == '__main__':
    main()
