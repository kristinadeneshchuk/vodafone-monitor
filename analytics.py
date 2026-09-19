"""
Кластеризація та аналітика. Ролі №4 і №5.

Кластер — це пара (причина, місто). Саме вона придатна до дії:
"18 скарг на інтернет у Львові" це завдання, а "багато негативу"
це не завдання.

Функції звідси використовує дашборд №6 і детектор №5.

    python analytics.py               # повний звіт
    python analytics.py --brand vodafone --days 90
"""

import argparse
import sqlite3
from collections import Counter

DB_PATH = 'mentions.db'

CAUSE_UA = {
    'internet': 'мобільний інтернет', 'coverage': 'покриття і сигнал',
    'calls': 'дзвінки', 'blackout': 'відключення світла',
    'outage': 'масовий збій', 'billing': 'списання коштів',
    'tariffs': 'тарифи і ціни', 'app': 'застосунок',
    'support': 'підтримка', 'roaming': 'роумінг', 'esim': 'eSIM',
    'number': 'номер і перенесення', 'other': 'інше',
}


def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


# Новина — це не скарга. "Vodafone запустив 5G у Києві" не має потрапляти
# в кластер скарг на інтернет у Києві: це медійне висвітлення, окремий
# потік із власним сенсом (чи підхопили тему медіа).
COMPLAINT_SOURCES = ("review", "telegram")


def _where(brand=None, days=None, complaints_only=False):
    conds, params = ["1=1"], []
    if complaints_only:
        conds.append("m.source_type IN ('review','telegram')")
    if brand:
        conds.append("m.brand_query = ?")
        params.append(brand)
    if days:
        conds.append("m.published_at >= date('now', ?)")
        params.append(f'-{days} days')
    return " AND ".join(conds), params


def clusters(brand=None, days=None, min_size=3, only_negative=True):
    """Кластери (причина, місто) зі скарг. Новини сюди не входять."""
    where, params = _where(brand, days, complaints_only=True)
    if only_negative:
        where += " AND a.sentiment IN ('negative','mixed')"

    sql = f"""
        SELECT a.cause, a.city,
               count(*) AS n,
               round(avg(a.actionability), 2) AS act,
               sum(a.trust IN ('high','highest')) AS trusted,
               count(DISTINCT m.source_name) AS sources,
               min(m.published_at) AS first_seen,
               max(m.published_at) AS last_seen
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {where}
        GROUP BY a.cause, a.city
        HAVING n >= ?
        ORDER BY n DESC
    """
    con = connect()
    return [dict(r) for r in con.execute(sql, params + [min_size])]


def by_cause(brand=None, days=None):
    where, params = _where(brand, days)
    sql = f"""
        SELECT a.cause,
               count(*) AS total,
               sum(a.sentiment='negative') AS neg,
               sum(a.sentiment='positive') AS pos,
               sum(a.tonality='constructive_negative') AS constructive,
               round(avg(a.actionability), 2) AS act
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {where}
        GROUP BY a.cause ORDER BY total DESC
    """
    return [dict(r) for r in connect().execute(sql, params)]


def share_of_voice(days=None):
    """Частка голосу і частка негативу по брендах."""
    where, params = _where(None, days)
    sql = f"""
        SELECT m.brand_query AS brand,
               count(*) AS total,
               sum(a.sentiment='negative') AS neg,
               round(100.0*sum(a.sentiment='negative')/count(*), 1) AS neg_pct
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {where} AND m.brand_query != 'unknown'
        GROUP BY m.brand_query ORDER BY total DESC
    """
    return [dict(r) for r in connect().execute(sql, params)]


def trust_breakdown(brand=None, days=None):
    where, params = _where(brand, days)
    sql = f"""
        SELECT a.tonality, a.trust, count(*) AS n
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {where}
        GROUP BY a.tonality, a.trust ORDER BY n DESC
    """
    return [dict(r) for r in connect().execute(sql, params)]


def actionable(brand=None, days=None, limit=10):
    """Найкорисніші скарги: конкретні, з локацією, без істерики."""
    where, params = _where(brand, days, complaints_only=True)
    sql = f"""
        SELECT m.published_at, m.source_name, a.cause, a.city, a.actionability, m.text
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {where} AND a.sentiment IN ('negative','mixed')
              AND a.trust IN ('high','highest')
        ORDER BY a.actionability DESC, m.published_at DESC LIMIT ?
    """
    return [dict(r) for r in connect().execute(sql, params + [limit])]


def media_coverage(brand=None, days=None):
    """Новини окремим потоком: показує, що підхопили медіа."""
    where, params = _where(brand, days)
    sql = f"""
        SELECT a.cause, count(*) AS n
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {where} AND m.source_type = 'news'
        GROUP BY a.cause ORDER BY n DESC
    """
    return [dict(r) for r in connect().execute(sql, params)]


def report(brand=None, days=None):
    scope = f"{brand or 'усі бренди'}" + (f", останні {days} днів" if days else ", весь період")
    print(f"=== АНАЛІТИКА: {scope} ===\n")

    print("ЧАСТКА ГОЛОСУ І ЧАСТКА НЕГАТИВУ")
    sov = share_of_voice(days)
    total = sum(r['total'] for r in sov) or 1
    for r in sov:
        print(f"  {r['brand']:<10} {r['total']:>6} згадок "
              f"({100*r['total']/total:>4.1f}% голосу) | негатив {r['neg_pct']:>5.1f}%")

    print("\nПРИЧИНИ")
    for r in by_cause(brand, days)[:10]:
        name = CAUSE_UA.get(r['cause'], r['cause'])
        print(f"  {name:<22} {r['total']:>6} | негатив {r['neg']:>5} | "
              f"конструктивних {r['constructive']:>4} | дієвість {r['act']:.2f}")

    print("\nМЕДІЙНЕ ВИСВІТЛЕННЯ (новини, окремо від скарг)")
    for r in media_coverage(brand, days)[:5]:
        print(f"  {r['cause']:<22} {r['n']:>5} новин")

    print("\nТОП КЛАСТЕРІВ СКАРГ (причина + місто, без новин)")
    cl = clusters(brand, days, min_size=3)
    with_city = [c for c in cl if c['city']][:12]
    for c in with_city:
        name = CAUSE_UA.get(c['cause'], c['cause'])
        print(f"  {c['city']:<18} {name:<22} {c['n']:>4} скарг | "
              f"джерел {c['sources']} | надійних {c['trusted']}")
    if not with_city:
        print("  кластерів із визначеним містом немає")

    print("\nЯКІСТЬ ТОНАЛЬНОСТІ (за таблицею №4)")
    for r in trust_breakdown(brand, days)[:8]:
        print(f"  {r['tonality']:<24} довіра {r['trust']:<8} {r['n']:>6}")

    print("\nНАЙКОРИСНІШІ СКАРГИ")
    for r in actionable(brand, days, limit=5):
        txt = ' '.join(r['text'].split())[:90]
        print(f"  [{r['published_at'][:10]}] {r['city'] or '—'} / "
              f"{CAUSE_UA.get(r['cause'], r['cause'])} ({r['actionability']:.2f})")
        print(f"      {txt}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--brand')
    p.add_argument('--days', type=int)
    args = p.parse_args()
    report(args.brand, args.days)


if __name__ == '__main__':
    main()
