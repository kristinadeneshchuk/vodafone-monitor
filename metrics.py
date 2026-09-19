"""
Метрики для аналітиків. Запит Олександра.

    1. Churn Intent Rate   — частка повідомлень із наміром піти
    2. Resonance / Reach   — вага скарги з урахуванням охоплення джерела
    3. Spike Velocity      — швидкість спалаху проти норми ділянки
    4. Resolution Lag      — час від аварії до перших "нарешті полагодили"

Перші дві рахуються для кожного повідомлення й лежать у таблиці analysis.
Третя живе в detector.py (поле ratio в alerts). Четверта рахується тут,
бо потребує зіставлення двох подій у часі.

    python metrics.py                    # зведення по всіх
    python metrics.py --brand vodafone --days 90
"""

import argparse
import sqlite3
from datetime import datetime, timedelta

import keywords

DB_PATH = 'mentions.db'

# Скільки днів після аварії шукаємо повідомлення про відновлення.
RESOLUTION_WINDOW_DAYS = 7


def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


# ------------------------------------------------------------------ 1. Churn

def churn_intent_rate(brand=None, days=None, cause=None):
    """
    Частка повідомлень із прямим наміром піти від оператора.

    Тригери ловить risk.f3_threat: від "піду до Київстар" (особистий
    намір) до "закликаю всіх переходити" (організований відтік).
    Поріг 4.0 — це рівень "особистий намір", нижче лише загальне
    незадоволення без планів.

    Рахується від НЕГАТИВНИХ повідомлень, а не від усіх: частка
    від загального потоку розмивається позитивними відгуками
    й не показує нічого корисного.
    """
    con = connect()
    conds = ["a.sentiment IN ('negative','mixed')"]
    params = []
    if brand:
        conds.append("m.brand_query = ?")
        params.append(brand)
    if cause:
        conds.append("a.cause = ?")
        params.append(cause)
    if days:
        conds.append("m.published_at >= date('now', ?)")
        params.append(f'-{days} days')

    row = con.execute(f"""
        SELECT count(*) AS total,
               sum(a.churn_intent) AS churn
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {' AND '.join(conds)}
    """, params).fetchone()

    total = row['total'] or 0
    churn = row['churn'] or 0
    return {
        'negative_total': total,
        'churn_intent': churn,
        'rate_pct': round(100 * churn / total, 2) if total else 0.0,
    }


def churn_by_cause(brand=None, days=None):
    """Через що саме люди збираються піти. Це і є пріоритет для бізнесу."""
    con = connect()
    conds = ["a.sentiment IN ('negative','mixed')"]
    params = []
    if brand:
        conds.append("m.brand_query = ?")
        params.append(brand)
    if days:
        conds.append("m.published_at >= date('now', ?)")
        params.append(f'-{days} days')

    return [dict(r) for r in con.execute(f"""
        SELECT a.cause,
               count(*) AS negatives,
               sum(a.churn_intent) AS churn,
               round(100.0 * sum(a.churn_intent) / count(*), 1) AS rate_pct
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {' AND '.join(conds)}
        GROUP BY a.cause HAVING negatives >= 10
        ORDER BY rate_pct DESC
    """, params)]


# ------------------------------------------------------------------ 2. Resonance

def top_by_resonance(brand=None, days=None, limit=10):
    """
    Найрезонансніші скарги: релевантність помножена на охоплення джерела.

    Сенс у тому, що скарга в каналі на 300 тисяч підписників вимагає
    реакції раніше за таку саму скаргу у відгуку, який побачать одиниці.
    """
    con = connect()
    conds = ["a.resonance > 0"]
    params = []
    if brand:
        conds.append("m.brand_query = ?")
        params.append(brand)
    if days:
        conds.append("m.published_at >= date('now', ?)")
        params.append(f'-{days} days')

    return [dict(r) for r in con.execute(f"""
        SELECT m.published_at, m.source_type, m.source_name, a.cause,
               a.address_name, a.reach_weight, a.relevance_score,
               a.resonance, a.risk_score, substr(m.text, 1, 90) AS text
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE {' AND '.join(conds)}
        ORDER BY a.resonance DESC LIMIT ?
    """, params + [limit])]


# ------------------------------------------------------------------ 4. Resolution Lag

def resolution_lag(limit=None):
    """
    Час від алерту до перших повідомлень про відновлення.

    Шукаємо повідомлення з маркерами "нарешті полагодили" для того ж
    бренду протягом тижня після закінчення вікна алерту.

    ЧЕСНЕ ОБМЕЖЕННЯ: це не час усунення аварії, а час до першої ПУБЛІЧНОЇ
    реакції про відновлення. Люди пишуть "все працює" значно рідше, ніж
    "не працює", тому для частини алертів відповіді не буде взагалі —
    і це не означає, що проблему не усунули.
    """
    con = connect()
    alerts = con.execute("""
        SELECT id, brand, cause, cities, window_end, level, event_type, count
        FROM alerts ORDER BY window_end
    """).fetchall()

    out = []
    used = set()          # одне й те саме повідомлення не може підтверджувати
                          # відновлення для кількох різних алертів
    for a in alerts:
        end = datetime.fromisoformat(a['window_end'])
        until = end + timedelta(days=RESOLUTION_WINDOW_DAYS)

        # Звіряємо не лише бренд, а й ПРИЧИНУ. Інакше відгук
        # "дякую, відновили роботу додатку" зараховувався як підтвердження
        # відновлення мережі — різні проблеми, різні команди, різний час.
        rows = con.execute("""
            SELECT m.id, m.published_at, m.text
            FROM analysis an JOIN mentions m ON m.id = an.mention_id
            WHERE m.brand_query = ? AND an.cause = ?
              AND m.published_at > ? AND m.published_at <= ?
              AND an.sentiment IN ('positive','mixed')
            ORDER BY m.published_at
        """, (a['brand'], a['cause'], a['window_end'], until.isoformat())).fetchall()

        found = None
        for r in rows:
            if r['id'] in used:
                continue
            if keywords.is_recovery(r['text']):
                found = r
                used.add(r['id'])
                break

        lag_hours = None
        if found:
            lag_hours = round(
                (datetime.fromisoformat(found['published_at']) - end).total_seconds() / 3600, 1)

        out.append({
            'alert_id': a['id'], 'brand': a['brand'], 'cause': a['cause'],
            'cities': a['cities'], 'level': a['level'],
            'window_end': a['window_end'],
            'lag_hours': lag_hours,
            'recovery_text': ' '.join(found['text'].split())[:80] if found else None,
        })
        if limit and len(out) >= limit:
            break
    return out


# ------------------------------------------------------------------ звіт

CAUSE_UA = {
    'internet': 'мобільний інтернет', 'coverage': 'покриття і сигнал',
    'calls': 'дзвінки', 'blackout': 'відключення світла', 'outage': 'масовий збій',
    'billing': 'списання коштів', 'tariffs': 'тарифи', 'app': 'застосунок',
    'support': 'підтримка', 'roaming': 'роумінг', 'esim': 'eSIM',
    'number': 'номер', 'other': 'інше',
}


def report(brand=None, days=None):
    scope = (brand or 'усі бренди') + (f', {days} днів' if days else ', весь період')
    print(f"=== МЕТРИКИ: {scope} ===\n")

    c = churn_intent_rate(brand, days)
    print("1. CHURN INTENT RATE")
    print(f"   Негативних повідомлень: {c['negative_total']}")
    print(f"   З наміром піти: {c['churn_intent']}  ->  {c['rate_pct']}%")
    print("\n   Через що саме збираються піти:")
    for r in churn_by_cause(brand, days)[:8]:
        print(f"     {CAUSE_UA.get(r['cause'], r['cause']):<22} "
              f"{r['rate_pct']:>5.1f}%  ({r['churn']} із {r['negatives']})")

    print("\n2. РЕЗОНАНС (релевантність x охоплення)")
    for r in top_by_resonance(brand, days, 6):
        where = r['address_name'] or '—'
        print(f"   {r['resonance']:>5.2f} | {r['source_name'][:16]:<17} "
              f"охоплення {r['reach_weight']:>4.1f} | {where[:12]:<13} "
              f"{' '.join(r['text'].split())[:52]}")

    print("\n3. SPIKE VELOCITY — у detector.py, поле ratio в таблиці alerts")
    con = connect()
    for r in con.execute("""SELECT window_start, brand, cause, cities, count,
                                   baseline, ratio, level
                            FROM alerts ORDER BY ratio DESC LIMIT 5"""):
        print(f"   x{r['ratio']:<5} {r['window_start'][:10]} {r['brand']:<9} "
              f"{CAUSE_UA.get(r['cause'], r['cause']):<20} "
              f"{r['count']} проти норми {r['baseline']} [{r['level']}]")

    print("\n4. RESOLUTION LAG")
    lags = resolution_lag()
    measured = [x for x in lags if x['lag_hours'] is not None]
    print(f"   Алертів: {len(lags)} | з публічною реакцією про відновлення: {len(measured)}")
    if measured:
        vals = sorted(x['lag_hours'] for x in measured)
        print(f"   Медіана: {vals[len(vals)//2]} год | "
              f"найшвидше {vals[0]} год | найдовше {vals[-1]} год")
        for x in measured[:4]:
            print(f"     +{x['lag_hours']:>6} год  {x['brand']:<9} "
                  f"{CAUSE_UA.get(x['cause'], x['cause']):<20} «{x['recovery_text']}»")
    else:
        print("   Публічних повідомлень про відновлення не знайдено.")
        print("   Це не означає, що аварії не усували: про відновлення")
        print("   пишуть значно рідше, ніж про поломку.")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--brand')
    p.add_argument('--days', type=int)
    args = p.parse_args()
    report(args.brand, args.days)


if __name__ == '__main__':
    main()
