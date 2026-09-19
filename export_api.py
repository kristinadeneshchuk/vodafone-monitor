"""
Експорт для рівня №6. Роль №4.

Віддає JSON у форматі, який він просив. Enum числами.

    python export_api.py                         # усе релевантне
    python export_api.py --all --limit 500       # включно з нерелевантним
    python export_api.py --min-importance 2      # лише high і critical
    python export_api.py --human                 # enum рядками, для читання очима
"""

import argparse
import json
import sqlite3

import contract

DB_PATH = 'mentions.db'


def fetch(relevant_only=True, min_importance=0, brand=None, days=None, limit=None):
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    conds = ["a.importance >= ?"]
    params = [min_importance]
    if relevant_only:
        conds.append("a.is_relevant = 1")
    if brand:
        conds.append("m.brand_query = ?")
        params.append(brand)
    if days:
        conds.append("m.published_at >= date('now', ?)")
        params.append(f'-{days} days')

    sql = f"""
        SELECT m.id, m.published_at, m.source_type, m.source_name, m.url,
               m.brand_query, m.text,
               a.is_relevant, a.relevance_score,
               a.is_constructive, a.constructive_score,
               a.importance, a.sentiment_enum, a.problem_type, a.risk_score,
               a.lat, a.lng, a.address_name,
               a.cause, a.context, a.tonality, a.trust
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {' AND '.join(conds)}
        ORDER BY a.risk_score DESC, m.published_at DESC
        {'LIMIT ' + str(int(limit)) if limit else ''}
    """

    out = []
    for r in con.execute(sql, params):
        out.append({
            'id': r['id'],
            'publishedAt': r['published_at'],
            'source': {'type': r['source_type'], 'name': r['source_name'],
                       'url': r['url']},
            'brand': r['brand_query'],
            'text': r['text'],

            # контракт №6
            'isRelevant': bool(r['is_relevant']),
            'relevanceScore': r['relevance_score'],
            'isConstructive': bool(r['is_constructive']),
            'constructiveScore': r['constructive_score'],
            'importance': r['importance'],
            'sentiment': r['sentiment_enum'],
            'problemType': r['problem_type'],
            'reputationalRiskScore': r['risk_score'],
            'location': ({'lat': r['lat'], 'lng': r['lng'],
                          'addressName': r['address_name']}
                         if r['lat'] is not None else None),

            # додатково, якщо знадобиться
            'cause': r['cause'],
            'context': r['context'],
            'tonality': r['tonality'],
            'trust': r['trust'],
        })
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--all', action='store_true', help='включно з нерелевантним')
    p.add_argument('--min-importance', type=int, default=0)
    p.add_argument('--brand')
    p.add_argument('--days', type=int)
    p.add_argument('--limit', type=int)
    p.add_argument('--human', action='store_true', help='enum рядками')
    p.add_argument('--out', default='export_for_frontend.json')
    args = p.parse_args()

    rows = fetch(not args.all, args.min_importance, args.brand, args.days, args.limit)
    if args.human:
        rows = [contract.humanize(r) for r in rows]

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    with_geo = sum(1 for r in rows if r['location'])
    print(f"Записів: {len(rows)} | з координатами: {with_geo}")
    print(f"Файл: {args.out}")
    if rows:
        print("\nПерший запис:")
        print(json.dumps(rows[0], ensure_ascii=False, indent=1)[:700])


if __name__ == '__main__':
    main()
