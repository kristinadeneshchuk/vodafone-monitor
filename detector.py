"""
Детекція криз. Роль №5.

Перетворює потік окремих згадок на кілька подій, вартих дії.

Логіка:
  1. Базовий рівень — медіана негативних згадок у вікні за попередні
     28 днів, окремо для кожної пари (бренд, причина).
  2. Сплеск — перевищення норми в K разів ПЛЮС мінімальна абсолютна
     кількість. Без другої умови 2 згадки замість 0.5 дають "зростання
     в 4 рази", і система кричить на порожньому місці.
  3. Два рівні:
       watch — у робочий чат, нікого не будить;
       wake  — потрібні ЩОНАЙМЕНШЕ ДВА різні типи джерел.
               Один вірусний пост, передрукований десятьма каналами,
               це одне джерело, а не десять.
  4. Атрибуція знеструмлень: сплеск, де переважає тег blackout,
     міняє тип на "знеструмлення" і падає з wake до watch.
     Базові станції сідають на акумулятори, оператор ні до чого.
  5. Хронічне виключається: скарги з дороги й гір не піднімають тривогу,
     це структурна прогалина покриття, а не аварія.

    python detector.py --run            # прогін по всій історії
    python detector.py --day 2026-07-02 --window 6
    python detector.py --false-alarms   # скільки разів підняли б дарма
"""

import argparse
import json
import sqlite3
import statistics
from datetime import datetime, timedelta, timezone

DB_PATH = 'mentions.db'

# ------------------------------------------------------------------ пороги
# Підібрані на наших даних (медіана 10 негативних згадок на добу,
# p90 = 18, максимум 56). Це припущення, яке треба перевіряти на
# довшому періоді — 1 рік для сезонності замало.

WINDOW_HOURS = 24          # вікно спостереження
BASELINE_DAYS = 28         # на скільки назад рахуємо норму
MIN_HISTORY_DAYS = 7       # менше історії — детектор мовчить

WATCH_RATIO = 2.0          # у скільки разів вище норми
WATCH_MIN_ABS = 5          # і не менше стількох згадок

WAKE_RATIO = 3.0
WAKE_MIN_ABS = 12
WAKE_MIN_SOURCE_TYPES = 2  # головний запобіжник від хибних тривог

# Скарги з цим контекстом — хронічні, не аварія.
CHRONIC_CONTEXT = ('transport', 'terrain', 'rural')

# Частка blackout-згадок, за якої подія вважається знеструмленням.
BLACKOUT_SHARE = 0.4

CAUSE_UA = {
    'internet': 'мобільний інтернет', 'coverage': 'покриття і сигнал',
    'calls': 'дзвінки', 'blackout': 'відключення світла',
    'outage': 'масовий збій', 'billing': 'списання коштів',
    'tariffs': 'тарифи', 'app': 'застосунок', 'support': 'підтримка',
    'roaming': 'роумінг', 'esim': 'eSIM', 'number': 'номер', 'other': 'інше',
}

ACTIONS = {
    'outage': 'Технічній службі — підтвердити масштаб. Комунікації — заява '
              'протягом години: що саме не працює, які регіони, орієнтовний час.',
    'internet': 'Перевірити мережу в названих локаціях. Якщо підтверджено — '
                'проактивний пост до того, як тему підхоплять медіа.',
    'coverage': 'Перевірити базові станції в локації. Підготувати відповідь '
                'для звернень у підтримку.',
    'calls': 'Перевірити голосову мережу. Попередити кол-центр про зростання звернень.',
    'blackout': 'Це не наша аварія. Дати комунікацію про автономність станцій '
                'і час роботи від акумуляторів. Інженерів не піднімати.',
    'billing': 'Фінансовому відділу — перевірити біллінг. Підготувати механіку '
               'повернення коштів.',
    'app': 'Команді застосунку — перевірити останній реліз. Розглянути відкат.',
    'support': 'Перевірити навантаження на кол-центр і час відповіді.',
    'tariffs': 'Комунікаціям — пояснювальний матеріал щодо зміни умов.',
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,              -- watch | wake
    event_type TEXT NOT NULL,         -- incident | grid_outage
    brand TEXT NOT NULL,
    cause TEXT NOT NULL,
    cities TEXT,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    count INTEGER NOT NULL,
    baseline REAL NOT NULL,
    ratio REAL NOT NULL,
    n_source_types INTEGER NOT NULL,
    example_ids TEXT,
    summary TEXT,
    recommended_action TEXT,
    UNIQUE(brand, cause, window_start)
)
"""


def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def negatives_in_window(con, brand, cause, start, end):
    """Негативні згадки в вікні. Хронічні контексти виключені."""
    rows = con.execute("""
        SELECT m.id, m.source_type, m.published_at, a.city, a.context, m.text
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE m.brand_query = ? AND a.cause = ?
          AND a.sentiment IN ('negative','mixed')
          -- галузевий матеріал зберігається по разу на кожен бренд,
          -- тому одна стаття про ринок давала сплеск одразу в трьох
          AND a.is_market_wide = 0 AND a.is_ad = 0
          AND m.published_at >= ? AND m.published_at < ?
    """, (brand, cause, start, end)).fetchall()
    return [r for r in rows if r['context'] not in CHRONIC_CONTEXT]


def baseline_for(con, brand, cause, end_dt, window_hours):
    """
    Норма: медіана кількості негативних згадок у вікні тієї ж довжини
    за попередні BASELINE_DAYS. Медіана, а не середнє — одна аномалія
    не має піднімати норму й ховати наступну.
    """
    counts = []
    step = timedelta(hours=window_hours)
    for i in range(1, int(BASELINE_DAYS * 24 / window_hours) + 1):
        w_end = end_dt - step * i
        w_start = w_end - step
        n = len(negatives_in_window(
            con, brand, cause, w_start.isoformat(), w_end.isoformat()))
        counts.append(n)

    if len(counts) < MIN_HISTORY_DAYS:
        return None
    return statistics.median(counts)


def evaluate_window(con, brand, cause, start_dt, end_dt, window_hours):
    """Оцінює одне вікно. Повертає алерт або None."""
    rows = negatives_in_window(con, brand, cause,
                               start_dt.isoformat(), end_dt.isoformat())
    count = len(rows)
    if count < WATCH_MIN_ABS:
        return None

    base = baseline_for(con, brand, cause, end_dt, window_hours)
    if base is None:
        return None

    # Норма нуль — порівнювати ні з чим, беремо 0.5, щоб не ділити на нуль
    # і щоб поріг лишався абсолютним.
    ratio = count / max(base, 0.5)

    source_types = {r['source_type'] for r in rows}
    cities = [r['city'] for r in rows if r['city']]
    blackout_share = sum(1 for r in rows if r['context'] == 'blackout') / count

    level = None
    if (ratio >= WAKE_RATIO and count >= WAKE_MIN_ABS
            and len(source_types) >= WAKE_MIN_SOURCE_TYPES):
        level = 'wake'
    elif ratio >= WATCH_RATIO:
        level = 'watch'
    if not level:
        return None

    # Знеструмлення — не наша аварія. Понижуємо рівень.
    event_type = 'incident'
    if cause == 'blackout' or blackout_share >= BLACKOUT_SHARE:
        event_type = 'grid_outage'
        level = 'watch'

    top_cities = sorted(set(cities), key=cities.count, reverse=True)[:3]

    return {
        'level': level,
        'event_type': event_type,
        'brand': brand,
        'cause': cause,
        'cities': ', '.join(top_cities) if top_cities else None,
        'window_start': start_dt.isoformat(),
        'window_end': end_dt.isoformat(),
        'count': count,
        'baseline': round(base, 1),
        'ratio': round(ratio, 1),
        'n_source_types': len(source_types),
        'example_ids': json.dumps([r['id'] for r in rows[:5]]),
        'summary': build_summary(brand, cause, count, base, top_cities,
                                 source_types, event_type, start_dt),
        'recommended_action': (
            ACTIONS['blackout'] if event_type == 'grid_outage'
            else ACTIONS.get(cause, 'Перевірити суть скарг і підготувати відповідь.')),
    }


def build_summary(brand, cause, count, base, cities, source_types, event_type, start_dt):
    """Текст картки алерту. Без LLM — шаблон із реальних чисел."""
    where = f" у локаціях: {', '.join(cities)}" if cities else " без визначеної локації"
    kind = 'Знеструмлення' if event_type == 'grid_outage' else 'Сплеск скарг'
    return (
        f"{kind}: {CAUSE_UA.get(cause, cause)}, бренд {brand}. "
        f"{count} негативних згадок за {WINDOW_HOURS} год проти норми {base:.1f}"
        f"{where}. Джерел різних типів: {len(source_types)} "
        f"({', '.join(sorted(source_types))}). Початок вікна: {start_dt:%Y-%m-%d %H:%M} UTC."
    )


# ------------------------------------------------------------------ медійний сплеск

MEDIA_MIN_ITEMS = 4        # публікацій за добу на одну тему в одному місці
MEDIA_MIN_OUTLETS = 3      # і від скількох різних видань

def detect_media_bursts(con):
    """
    Сплеск МЕДІЙНОЇ УВАГИ, незалежно від тональності окремих матеріалів.

    Навіщо окремо від сплеску скарг. 14 вересня 2026 про генератори
    Vodafone на Полтавщині вийшло шість матеріалів за добу, з них
    негативним був лише один — критика від ОВА. Решта нейтральні:
    "станції готують до роботи без світла", "область відстає із
    забезпеченням". Детектор скарг це пропустив, бо рахує негатив.

    Але шість публікацій за добу на одну тему в одному регіоні — це
    вже репутаційна подія. Тему підхопили медіа, і комунікаційній
    команді треба реагувати незалежно від того, як розмічено настрій
    кожного окремого заголовка.
    """
    rows = con.execute("""
        SELECT substr(m.published_at,1,10) AS day, m.brand_query AS brand,
               a.cause, a.address_name AS place, m.source_name, m.text
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE m.source_type = 'news'
    """).fetchall()

    groups = {}
    for r in rows:
        key = (r['day'], r['brand'], r['cause'], r['place'])
        groups.setdefault(key, []).append(r)

    out = []
    for (day, brand, cause, place), items in groups.items():
        if len(items) < MEDIA_MIN_ITEMS:
            continue
        # Видання витягуємо із заголовка: "Заголовок - Видання"
        outlets = set()
        for r in items:
            head = (r['text'] or '').split('. ')[0]
            if ' - ' in head:
                outlets.add(head.rsplit(' - ', 1)[-1].strip().lower())
        if len(outlets) < MEDIA_MIN_OUTLETS:
            continue

        where = f" ({place})" if place else ""
        out.append({
            'level': 'watch',
            'event_type': 'media_attention',
            'brand': brand,
            'cause': cause,
            'cities': place,
            'window_start': day + 'T00:00:00+00:00',
            'window_end': day + 'T23:59:59+00:00',
            'count': len(items),
            'baseline': 0.0,
            'ratio': float(len(items)),
            'n_source_types': len(outlets),
            'example_ids': json.dumps([]),
            'summary': (f"Медійна увага: {CAUSE_UA.get(cause, cause)}, "
                        f"бренд {brand}{where}. {len(items)} публікацій за добу "
                        f"від {len(outlets)} різних видань. Тональність окремих "
                        f"матеріалів може бути нейтральною — значення має обсяг."),
            'recommended_action': (
                'Тему підхопили медіа. Перевірити, чи є офіційна позиція компанії, '
                'і чи не формується наратив без нашої участі.'),
        })
    return out


def run(window_hours=WINDOW_HOURS, brand=None, save=True):
    con = connect()
    con.execute(SCHEMA)

    brands = [brand] if brand else [
        r[0] for r in con.execute(
            "SELECT DISTINCT brand_query FROM mentions WHERE brand_query != 'unknown'")]
    causes = [r[0] for r in con.execute("SELECT DISTINCT cause FROM analysis")]

    first, last = con.execute(
        "SELECT min(published_at), max(published_at) FROM mentions").fetchone()
    start = datetime.fromisoformat(first) + timedelta(days=BASELINE_DAYS)
    end = datetime.fromisoformat(last)

    step = timedelta(hours=window_hours)
    alerts = []
    cur = start
    while cur < end:
        w_end = cur + step
        for b in brands:
            for c in causes:
                a = evaluate_window(con, b, c, cur, w_end, window_hours)
                if a:
                    alerts.append(a)
        cur = w_end

    alerts.extend(detect_media_bursts(con))

    if save and alerts:
        # Повний прогін перебудовує таблицю, а не доливає в стару.
        # З INSERT OR IGNORE рядок, порахований на попередній версії
        # класифікації, лишався назавжди: за 2 липня поруч стояли
        # застарілий 'інше x17' і свіжий 'масовий збій x36'.
        con.execute("DELETE FROM alerts")
        con.executemany("""
            INSERT OR IGNORE INTO alerts
            (level,event_type,brand,cause,cities,window_start,window_end,
             count,baseline,ratio,n_source_types,example_ids,summary,recommended_action)
            VALUES (:level,:event_type,:brand,:cause,:cities,:window_start,:window_end,
                    :count,:baseline,:ratio,:n_source_types,:example_ids,
                    :summary,:recommended_action)""", alerts)
        con.commit()

    return alerts


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--run', action='store_true')
    p.add_argument('--window', type=int, default=WINDOW_HOURS)
    p.add_argument('--brand')
    p.add_argument('--day', help='детально по одній добі, YYYY-MM-DD')
    args = p.parse_args()

    if args.day:
        con = connect()
        start = datetime.fromisoformat(args.day + 'T00:00:00')
        for h in range(0, 24, args.window):
            w0 = start + timedelta(hours=h)
            w1 = w0 + timedelta(hours=args.window)
            for b in ('vodafone', 'kyivstar', 'lifecell'):
                for c in [r[0] for r in con.execute("SELECT DISTINCT cause FROM analysis")]:
                    a = evaluate_window(con, b, c, w0, w1, args.window)
                    if a:
                        print(f"[{a['level'].upper()}] {a['summary']}")
                        print(f"   дія: {a['recommended_action']}\n")
        return

    alerts = run(args.window, args.brand)
    wake = [a for a in alerts if a['level'] == 'wake']
    grid = [a for a in alerts if a['event_type'] == 'grid_outage']
    print(f"Алертів усього: {len(alerts)}")
    print(f"  wake (будимо):   {len(wake)}")
    print(f"  watch (у чат):   {len(alerts) - len(wake)}")
    print(f"  з них знеструмлення: {len(grid)}")
    print(f"\nПеріод: рік. Тобто wake спрацьовує "
          f"{len(wake)/12:.1f} разів на місяць.\n")
    for a in sorted(wake, key=lambda x: -x['ratio'])[:8]:
        print(f"[{a['window_start'][:10]}] ×{a['ratio']} {a['summary'][:120]}")


if __name__ == '__main__':
    main()
