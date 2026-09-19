"""
Достовірність новин. Автоматична версія vodafone_news_checker.py.

Оригінальний скрипт рахує довіру за списком, який заповнюють руками.
Тут та сама логіка, але застосована до 2702 новин у базі, і додано
те, чого в ручному варіанті бути не могло: крос-референс рахується
автоматично, бо ми бачимо всі публікації за день.

Чотири складові trust_score (0-100):

  Надійність видання        до 40   офіційне > велике ЗМІ > агрегатор
  Крос-референс             до 30   скільки НЕЗАЛЕЖНИХ видань дали ту саму тему
  Офіційний коментар        до 20   пряма мова прес-служби або компанії
  Відсутність жовтизни      до 10   мінус за клікбейт, плюс за цифри й дати

ЧОГО ЦЕЙ ІНСТРУМЕНТ НЕ РОБИТЬ. Він не каже "це фейк". Жоден скрипт цього
не може — це робить перевірка по першоджерелах. Він сортує потік так,
щоб людина починала з найнадійнішого, і підсвічує те, що варто
перевірити руками.

    python trust.py --run      # порахувати для всіх новин у базі
    python trust.py --top 15   # найнадійніші й найсумнівніші
"""

import argparse
import re
import sqlite3
from collections import defaultdict

DB_PATH = 'mentions.db'

# ------------------------------------------------------------------ видання

# Google News додає назву видання в кінець заголовка: "Заголовок - Видання".
PUBLISHER_RX = re.compile(r'\s[-–—]\s([^.\-–—]{2,45})(?:\.|$)')

OFFICIAL = {
    'vodafone', 'vodafone україна', 'київстар', 'kyivstar', 'lifecell',
    'укренерго', 'ukrenergo', 'мінцифри', 'дтек', 'нкек',
}

REPUTABLE = {
    'суспільне | новини', 'суспільне', 'укрінформ', 'ukrinform', 'interfax',
    'інтерфакс-україна', 'економічна правда', 'українська правда', 'liga.net',
    'ліга', 'nv.ua', 'nv бизнес', 'нв', 'forbes', 'forbes.ua', 'dou',
    'ain', 'itc.ua', 'мінфін', 'тсн', 'унiан', 'унiан', 'унiaн', 'унian',
    'унiан', 'уніан', 'унiан', 'the page', 'радіо свобода', 'бабель',
    'hromadske', 'громадське', 'детектор медіа', 'ukr.net',
}

# Агрегатори й контент-ферми: не фейк за замовчуванням, але вони
# передруковують чуже без власної редакційної перевірки.
AGGREGATOR = {
    'obozrevatel', 'обозреватель', 'politeka', 'ukr.net', 'informator.ua',
    'знай.ua', 'знай', 'depo.ua', 'techtoday.in.ua', 'технофан', 'ukr life',
    'новини.live', 'tsn.ua', 'apostrophe', 'апостроф',
}


def extract_publisher(text):
    """Назва видання із заголовка Google News або None."""
    head = (text or '').split('. ')[0]
    matches = PUBLISHER_RX.findall(head)
    if not matches:
        return None
    # Беремо останнє входження: у заголовку теж бувають тире.
    return matches[-1].strip()


def source_score(publisher):
    """Надійність видання, 0-40."""
    if not publisher:
        return 10, 'невідоме'
    p = publisher.lower().strip()
    if any(o in p for o in OFFICIAL):
        return 40, 'офіційне'
    if any(r == p or r in p for r in REPUTABLE):
        return 32, 'велике ЗМІ'
    if any(a in p for a in AGGREGATOR):
        return 16, 'агрегатор'
    return 20, 'інше ЗМІ'


# ------------------------------------------------------------------ крос-референс

STOP = set('про для над під від при за на та і в у з із як що це який'.split())


def keywords_of(text, n=6):
    """Опорні слова заголовка для зіставлення однакових новин."""
    head = (text or '').split('. ')[0].lower()
    words = re.findall(r'[а-яїієґa-z]{4,}', head)
    return frozenset(w for w in words if w not in STOP)[:n] if False else \
        frozenset(list(dict.fromkeys(w for w in words if w not in STOP))[:n])


def cross_reference_score(n_publishers):
    """
    Скільки незалежних видань дали ту саму тему того ж дня.

    Одне видання — це ще не підтверджена новина. П'ять незалежних —
    подія справді сталася. Саме це відрізняє реальну кризу від
    вкидання, і порахувати це можна лише маючи весь потік.
    """
    if n_publishers >= 5:
        return 30
    if n_publishers >= 3:
        return 22
    if n_publishers == 2:
        return 12
    return 0


# ------------------------------------------------------------------ цитати й жовтизна

OFFICIAL_QUOTE = re.compile(
    r'прес-?служб|у\s+компанії\s+(повідом|зазнач|додал)|повідомили\s+в\s+'
    r'(vodafone|київстар|lifecell|укренерго)|заявив\w*\s+(у|в)\s+|'
    r'офіційн\w*\s+(заяв|коментар|повідомлен)|у\s+відповідь\s+на\s+запит',
    re.IGNORECASE)

CLICKBAIT = re.compile(
    r'\bшок\w*\b|терміново!|всі\s+в\s+шоці|ви\s+не\s+повірите|'
    r'що\s+сталося\s+далі|українці\s+в\s+паніці|жах\b|сенсаці|'
    r'розкрит\w*\s+правд|нарешті\s+сказали',
    re.IGNORECASE)

HAS_NUMBER = re.compile(r'\d')
HAS_DATE = re.compile(
    r'\b\d{1,2}\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|'
    r'вересня|жовтня|листопада|грудня)\b|\b\d{1,2}\.\d{1,2}\b', re.IGNORECASE)


def quote_score(text):
    return 20 if OFFICIAL_QUOTE.search(text or '') else 0


def style_score(text):
    t = text or ''
    s = 5
    if CLICKBAIT.search(t):
        s -= 8
    if HAS_NUMBER.search(t):
        s += 2
    if HAS_DATE.search(t):
        s += 3
    return max(0, min(10, s))


# ------------------------------------------------------------------ підсумок

SCHEMA = """
CREATE TABLE IF NOT EXISTS news_trust (
    mention_id INTEGER PRIMARY KEY,
    publisher TEXT,
    publisher_tier TEXT,
    n_confirmations INTEGER,
    trust_score INTEGER,
    s_source INTEGER, s_cross INTEGER, s_quote INTEGER, s_style INTEGER,
    FOREIGN KEY(mention_id) REFERENCES mentions(id)
)
"""


def run():
    con = sqlite3.connect(DB_PATH)
    con.execute(SCHEMA)
    con.execute("DELETE FROM news_trust")

    rows = con.execute(
        "SELECT id, text, published_at FROM mentions WHERE source_type='news'"
    ).fetchall()
    print(f"Новин: {len(rows)}")

    # Групуємо за днем, щоб порахувати незалежні підтвердження.
    by_day = defaultdict(list)
    parsed = []
    for mid, text, published in rows:
        pub = extract_publisher(text)
        kws = keywords_of(text)
        parsed.append((mid, text, pub, kws))
        by_day[published[:10]].append((mid, pub, kws))

    out = []
    for mid, text, pub, kws in parsed:
        day = next(d for d, items in by_day.items()
                   if any(i[0] == mid for i in items))
        # Незалежні видання, що писали схоже того ж дня.
        publishers = set()
        for other_id, other_pub, other_kws in by_day[day]:
            if other_id == mid or not other_pub:
                continue
            if kws and len(kws & other_kws) >= 3:
                publishers.add(other_pub.lower())
        n_conf = len(publishers)

        s_src, tier = source_score(pub)
        s_cross = cross_reference_score(n_conf + 1)
        s_quote = quote_score(text)
        s_style = style_score(text)
        total = s_src + s_cross + s_quote + s_style

        out.append((mid, pub, tier, n_conf, total, s_src, s_cross, s_quote, s_style))

    con.executemany(
        "INSERT OR REPLACE INTO news_trust VALUES (?,?,?,?,?,?,?,?,?)", out)
    con.commit()

    scores = sorted(r[4] for r in out)
    known = sum(1 for r in out if r[1])
    print(f"Видання розпізнано: {known} ({100*known/len(out):.0f}%)")
    print(f"Медіана довіри: {scores[len(scores)//2]} | "
          f"p10 {scores[len(scores)//10]} | p90 {scores[9*len(scores)//10]}")
    return out


def show(limit=10):
    con = sqlite3.connect(DB_PATH)
    print("\nНАЙНАДІЙНІШІ:")
    for r in con.execute("""
        SELECT t.trust_score, t.publisher, t.n_confirmations, substr(m.text,1,62)
        FROM news_trust t JOIN mentions m ON m.id=t.mention_id
        ORDER BY t.trust_score DESC LIMIT ?""", (limit,)):
        print(f"  {r[0]:>3} | {str(r[1])[:22]:<23} підтверджень {r[2]:<3} | {' '.join(r[3].split())}")

    print("\nПОТРЕБУЮТЬ ПЕРЕВІРКИ РУКАМИ:")
    for r in con.execute("""
        SELECT t.trust_score, t.publisher, t.n_confirmations, substr(m.text,1,62)
        FROM news_trust t JOIN mentions m ON m.id=t.mention_id
        ORDER BY t.trust_score ASC LIMIT ?""", (limit,)):
        print(f"  {r[0]:>3} | {str(r[1])[:22]:<23} підтверджень {r[2]:<3} | {' '.join(r[3].split())}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--run', action='store_true')
    p.add_argument('--top', type=int, default=10)
    args = p.parse_args()
    if args.run:
        run()
    show(args.top)


if __name__ == '__main__':
    main()
