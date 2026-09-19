"""
Звʼязок під час відключень світла. Окремий фокус продукту.

Чому окремо. Під час блекауту базова станція працює від акумулятора.
Коли він сідає, абонент лишається без звʼязку — і пише, що не працює
оператор. Формально це не аварія мережі. Фактично це проблема абонента,
і вирішується вона грошима Vodafone: резервним живленням.

Тому це не "виняток, який треба відфільтрувати", а окремий напрям
з власним рішенням і власним бюджетом.

Що рахуємо:
  скільки скарг, де, коли — сезонність показує, коли готуватись;
  скільки годин автономності називають самі абоненти;
  де концентрація — туди й інвестувати в живлення насамперед.

    python blackout.py
"""

import json
import re
import sqlite3
from collections import Counter, defaultdict

DB_PATH = 'mentions.db'

MONTH_UA = {
    '01': 'січень', '02': 'лютий', '03': 'березень', '04': 'квітень',
    '05': 'травень', '06': 'червень', '07': 'липень', '08': 'серпень',
    '09': 'вересень', '10': 'жовтень', '11': 'листопад', '12': 'грудень',
}

# Опалювальний сезон: саме тоді віялові відключення й навантаження
# на акумулятори. Для планування живлення це ключове вікно.
WINTER = ('11', '12', '01', '02')

# "станція протримала 4 години", "третю добу без звʼязку"
DURATION_RX = re.compile(
    r'(\d+)\s*(годин\w*|год\b|днів|дня|день|доб\w*|тижд\w*)', re.IGNORECASE)

# Пряма згадка автономності станцій — найцінніші свідчення.
AUTONOMY_RX = re.compile(
    r'акумулятор\w*|батаре\w*|автономн\w*|'
    # "генератор" лише в енергетичному сенсі: інакше сюди потрапляє
    # "додаток перетворився на генератор реклами"
    r'генератор\w*\s+(для|на|в)\s+(забезпеч|живлен|станц|вишк)|'
    r'(живлен|електро|світл|станц|вишк)\w*.{0,30}генератор|'
    r'генератор\w*.{0,30}(живлен|електро|світл|станц|вишк)|'
    r'витрим\w*\s+\d+|трима\w*\s+\d+\s*годин|протрима\w*',
    re.IGNORECASE)

# Понад два тижні без звʼязку — це вже не про розряджений акумулятор,
# а про окупацію, переїзд чи помилку в тексті. У статистику автономності
# такі не беремо, щоб не роздувати діапазон.
MAX_PLAUSIBLE_HOURS = 24 * 14


def load():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con.execute("""
        SELECT m.published_at, m.text, m.brand_query, m.source_type,
               a.address_name, a.lat, a.lng, a.cause, a.context
        FROM analysis a JOIN mentions m ON m.id = a.mention_id
        WHERE a.sentiment IN ('negative','mixed')
          AND (a.context = 'blackout' OR a.cause = 'blackout')
    """).fetchall()


def analyse():
    rows = load()
    total = len(rows)

    by_month = Counter(r['published_at'][:7] for r in rows)
    winter = sum(n for m, n in by_month.items() if m[5:7] in WINTER)

    by_location = Counter(r['address_name'] for r in rows if r['address_name'])
    by_brand = Counter(r['brand_query'] for r in rows)

    # Тривалість без звʼязку зі слів абонентів. Переводимо в години,
    # щоб порівнювати між собою.
    hours = []
    autonomy_quotes = []
    for r in rows:
        text = r['text'] or ''
        m = DURATION_RX.search(text)
        if m:
            value, unit = int(m.group(1)), m.group(2).lower()
            if value > 100 and not unit.startswith(('годин', 'год')):
                continue                          # явно не про час
            if unit.startswith(('годин', 'год')):
                hours.append(value)
            elif unit.startswith(('дн', 'ден', 'доб')):
                hours.append(value * 24)
            elif unit.startswith('тижд'):
                hours.append(value * 24 * 7)
        if hours and hours[-1] > MAX_PLAUSIBLE_HOURS:
            hours.pop()
        if AUTONOMY_RX.search(text):
            autonomy_quotes.append(' '.join(text.split())[:150])

    coords = defaultdict(lambda: {'n': 0, 'lat': None, 'lng': None})
    for r in rows:
        if r['lat'] is None:
            continue
        c = coords[r['address_name']]
        c['n'] += 1
        c['lat'], c['lng'] = r['lat'], r['lng']

    return {
        'total': total,
        'winterShare': round(100 * winter / total, 1) if total else 0,
        'winterCount': winter,
        'byMonth': dict(sorted(by_month.items())),
        'byLocation': dict(by_location.most_common(15)),
        'byBrand': dict(by_brand.most_common()),
        'durationsHours': sorted(hours),
        'medianHours': sorted(hours)[len(hours) // 2] if hours else None,
        'autonomyMentions': len(autonomy_quotes),
        'quotes': autonomy_quotes[:8],
        'map': [{'name': k, **v} for k, v in
                sorted(coords.items(), key=lambda x: -x[1]['n'])],
    }


def report():
    d = analyse()
    print(f"=== ЗВʼЯЗОК ПІД ЧАС ВІДКЛЮЧЕНЬ СВІТЛА ===\n")
    print(f"Скарг за рік: {d['total']}")
    print(f"З них в опалювальний сезон (лис-лют): {d['winterCount']} "
          f"({d['winterShare']}%)\n")

    print("СЕЗОННІСТЬ:")
    peak = max(d['byMonth'].values()) if d['byMonth'] else 1
    for m, n in d['byMonth'].items():
        bar = '█' * int(30 * n / peak)
        print(f"  {MONTH_UA.get(m[5:7], m)[:9]:<10} {m[:4]}  {bar:<30} {n}")

    print("\nДЕ НАЙБІЛЬШЕ (куди ставити резервне живлення):")
    for name, n in list(d['byLocation'].items())[:8]:
        print(f"  {name:<18} {n}")

    if d['medianHours']:
        print(f"\nСКІЛЬКИ ЧАСУ БЕЗ ЗВʼЯЗКУ (зі слів абонентів):")
        print(f"  згадок із тривалістю: {len(d['durationsHours'])}")
        print(f"  медіана: {d['medianHours']} год")
        print(f"  діапазон: {d['durationsHours'][0]}-{d['durationsHours'][-1]} год")

    print(f"\nЗГАДОК ПРО АВТОНОМНІСТЬ СТАНЦІЙ: {d['autonomyMentions']}")
    for q in d['quotes'][:4]:
        print(f"  — {q}")

    print("\nПО ОПЕРАТОРАХ:")
    for b, n in d['byBrand'].items():
        print(f"  {b:<12} {n}")


if __name__ == '__main__':
    report()
    with open('blackout_analysis.json', 'w', encoding='utf-8') as f:
        json.dump(analyse(), f, ensure_ascii=False, indent=1)
    print("\nJSON: blackout_analysis.json")
