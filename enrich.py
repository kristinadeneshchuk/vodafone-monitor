"""
Збагачення згадок: тональність, причина, локація, довіра. Роль №4.

Працює БЕЗ платного API. Три шари:

  1. Правила (keywords.py)  — причина, контекст, наявність бренду
  2. Правила (quality.py)   — місто, емоційний шум, замовність, придатність до дії
  3. Модель (sentiment_model.py) — тональність, навчена на 16 600 зірках

Чотири класи тональності за таблицею №4, з рівнем довіри:

  extreme_positive       захват без жодної деталі        довіра низька
  hysterical_negative    емоції без суті, капс, лайка    довіра низька
  constructive_negative  спокійний опис проблеми, факти  довіра висока
  mixed                  і плюси, і мінуси               довіра найвища

Рівень довіри — не оцінка людини, а оцінка КОРИСНОСТІ повідомлення
для комунікаційної команди. Істеричний крик і замовна похвала однаково
не дають відповіді на питання "що саме сталось і де".

    python enrich.py            # обробити все необроблене
    python enrich.py --redo     # перерахувати заново
"""

import argparse
import json
import sqlite3
import time

import re

import contract
import keywords
import quality
import sentiment_model

DB_PATH = 'mentions.db'
BATCH = 2000


SCHEMA = """
CREATE TABLE IF NOT EXISTS analysis (
    mention_id     INTEGER PRIMARY KEY,
    sentiment      TEXT NOT NULL,      -- negative | positive | neutral | mixed
    confidence     REAL,
    tonality       TEXT,               -- 4 класи за таблицею №4
    trust          TEXT,               -- low | medium | high | highest
    cause          TEXT NOT NULL,      -- з фіксованого списку keywords.CAUSE_PATTERNS
    city           TEXT,               -- нормалізована назва, NULL якщо не визначено
    context        TEXT,               -- transport | terrain | blackout | indoor
    actionability  REAL,
    emotional_noise REAL,
    promo_like     REAL,
    features       TEXT,               -- сирі ознаки, JSON

    -- контракт для №6: enum числами заради місця
    is_market_wide    INTEGER,
    is_ad             INTEGER,
    genre             TEXT,
    is_relevant       INTEGER,
    relevance_score   REAL,
    is_constructive   INTEGER,
    constructive_score REAL,
    importance        INTEGER,          -- 0 low .. 3 critical
    sentiment_enum    INTEGER,          -- 0 positive, 1 neutral, 2 negative
    problem_type      INTEGER,          -- 0 no_signal .. 3 other
    risk_score        INTEGER,          -- 0..100
    churn_intent      INTEGER,
    churn_score       REAL,
    reach_weight      REAL,
    resonance         REAL,
    lat               REAL,
    lng               REAL,
    address_name      TEXT,

    FOREIGN KEY(mention_id) REFERENCES mentions(id)
)
"""


# Модель тональності навчена на ВІДГУКАХ. Новини — інший жанр: там немає
# емоційних слів, і модель на них помиляється. Реальний приклад: новину
# "У Києві запустили 5G" вона відносила до негативу з ризиком 96.
# Тому для новин тональність визначається за явними маркерами, а за
# замовчуванням — нейтральна. Це чесніше, ніж вгадувати не своїм жанром.
NEWS_NEGATIVE = re.compile(
    # Найпряміші скарги починаються з "немає" і "відсутній". Без них
    # пост "Немає звʼязку третій день у Львові" ставав нейтральним
    # і випадав із набору скарг.
    r'\b(нема(є)?|відсутн|зник|пропа|обрив|впав)\w*\s*(зв|інтернет|мереж|сигнал|світл)|'
    r'\b(зв\W?язку?|інтернет\w*|мереж\w*|сигнал\w*)\s*(нема(є)?|відсутн|зник|пропа)|'
    r'\bне\s+лови\w*|\bпоган\w*\s+(зв|інтернет|покритт|сигнал)|'
    r'збій|збо[ії]|аварі|не\s+працю|скарг|атак|зламал|витік\s+даних|'
    r'штраф|суд\b|позов|критик|розслідуванн|перебо|обмеженн|'
    r'подорожч|підвищ\w*\s+(цін|тариф)|відключ', re.IGNORECASE)
NEWS_POSITIVE = re.compile(
    r'запуст|розгорн|розшир|покращ|модерніз|рекорд|нагород|інвестув|'
    r'відновив|відновил|прискор|збільш\w*\s+швидк|нов\w*\s+послуг|'
    # позитив саме про звʼязок — без цього "lifecell тримає звʼязок
    # навіть без світла" і "інтернет зберігає стабільність"
    # потрапляли в негатив
    r'трима\w*\s+зв|зберіга\w*\s+стабільн|працює\s+стабільн|'
    r'стабільн\w*\s+(зв|інтернет|мереж)|хорош\w*\s+(покритт|зв|інтернет)|'
    r'відтепер\s+(і\s+)?(в|у)\s|вже\s+(в|у)\s+\w+\s*—|доступн\w*\s+(в|у)\s',
    re.IGNORECASE)


# Позитив ПРО ЗВʼЯЗОК перебиває загальні негативні слова. "Інтернет
# зберігає стабільність під час відключень" містить слово "відключень",
# але це не скарга, а протилежне.
STRONG_POSITIVE = re.compile(
    r'трима\w*\s+зв|зберіга\w*\s+стабільн|працює\s+стабільн|'
    r'стабільн\w*\s+(зв|інтернет|мереж)|хорош\w*\s+(покритт|зв|інтернет)|'
    # зворотний порядок: "Інтернет у Харкові: стабільність навіть без світла"
    r'(інтернет|зв\W?язок|мереж\w*)[^.]{0,40}стабільн'
    r'|запрацю\w*\s+(технологі|5g|4g|мереж|зв)'
    r'|офіційно\s+запрацю|встановил\w*\s+\d+\s+станц'
    r'|готовніст\w*\s+(мобільного\s+)?зв|передал\w*\s+понад\s+\d+'
    # "готують мережу до блекаутів", "забезпечили генераторами" —
    # це підготовка, а не скарга
    r'|готу\w*\s+(мобільн\w*\s+)?(мереж|станц|звʼязок|зв\W?язок)'
    r'|забезпечил\w*\s+\w*\s*(генератор|акумулятор|живлен)'
    r'|перевіря\w*\s+готовніст',
    re.IGNORECASE)

# Оголошення графіків відключень — інформування, а не скарга.
# Без цього кожен пост обленерго ставав негативною згадкою.
SCHEDULE_NOTICE = re.compile(
    r'графік\w*\s+відключ|опублікува\w*\s+графік|оновл\w*\s+графік|'
    r'діятимуть\s+(погодинні|відключ)|перелік\s+(вулиць|адрес)|'
    r'за\s+якими\s+адресами|де\s+(у|в)\s+\w+\s+нема\w*\s+світл',
    re.IGNORECASE)


def news_sentiment(text):
    if STRONG_POSITIVE.search(text):
        return 'positive'
    if SCHEDULE_NOTICE.search(text):
        return 'neutral'

    neg = bool(NEWS_NEGATIVE.search(text))
    pos = bool(NEWS_POSITIVE.search(text))
    if neg and not pos:
        return 'negative'
    if pos and not neg:
        return 'positive'
    if neg and pos:
        return 'mixed'
    return 'neutral'


def classify_tonality(sentiment, q):
    """
    Чотири класи з таблиці №4 плюс рівень довіри.

    Пороги підібрані на очі, не на розмічених даних — це припущення.
    Перевірити можна так: взяти 100 повідомлень, розмітити руками
    за цими ж чотирма класами і порахувати збіг.
    """
    if sentiment == 'mixed':
        return 'mixed', 'highest'

    if sentiment == 'positive':
        if q['promo_like'] >= 0.5:
            return 'extreme_positive', 'low'
        return 'positive', 'medium'

    if sentiment == 'negative':
        if q['emotional_noise'] >= 0.6 and q['actionability'] < 0.3:
            return 'hysterical_negative', 'low'
        if q['actionability'] >= 0.4:
            return 'constructive_negative', 'high'
        return 'negative', 'medium'

    return 'neutral', 'medium'


# Застереження після похвали: "все супер, АЛЕ інтернет поганий".
# Сполучник плюс названа проблема в тому ж реченні.
CAVEAT_RX = re.compile(
    r'\b(але|однак|проте|тільки\s+от|шкода\s+що|єдине|мінус|жаль)\b[^.!?]{0,120}'
    r'(не\s+прац|нема|відсутн|поган|слабк|жахлив|повільн|лага|тормоз|'
    r'не\s+лови|пропада|зника|не\s+задовіль)'
    # "але покриття НЕ по всій території задовільне" — заперечення
    # стоїть перед обставиною, а не перед оцінкою
    r'|\b(але|однак|проте|єдине|мінус)\b[^.!?]{0,120}'
    r'\bне\b[^.!?]{0,60}(задовіль|достатн|скрізь|всюди|по\s+всій)',
    re.IGNORECASE)

# Скарга без сполучника, просто поруч із похвалою: "купив тариф за
# 520 грн і отримав лагаючий інтернет, застосунок 10/10". Зірки
# кажуть "позитив", і скарга зникала цілком.
PLAIN_COMPLAINT_RX = re.compile(
    r'(інтернет|зв\W?яз|мереж|покритт|сигнал|4g|3g|5g)\w*[^.!?]{0,60}'
    r'(лага|тормоз|повільн|не\s+прац|не\s+лови|нема|жахлив|поган|слабк)'
    r'|(лага|тормоз|повільн|жахлив|слабк)\w*[^.!?]{0,40}'
    r'(інтернет|зв\W?яз|мереж|покритт|сигнал)',
    re.IGNORECASE)

# Проблема, названа поруч із конкурентом: "там де не ловить Київстар".
COMPETITOR_PROBLEM = re.compile(
    r'(київстар|kyivstar|лайфсел|lifecell|life\s?cell)\w*[^.!?]{0,40}'
    r'(не\s+прац|не\s+лови|нема|гірш|поган|слабк)'
    r'|(не\s+прац|не\s+лови|нема|гірш|поган|слабк)\w*[^.!?]{0,40}'
    r'(київстар|kyivstar|лайфсел|lifecell)',
    re.IGNORECASE)

# Офіційна заява оператора, переказана каналом чи виданням.
OFFICIAL_RX = re.compile(
    r'(vodafone|водафон|київстар|kyivstar|lifecell|оператор|компані)\w*\s*'
    r'[^.!?]{0,30}(попереди[вл]|повідоми[вл]|заяви[вл]|попереджа|'
    r'прокоментува|підтверди[вл])',
    re.IGNORECASE)

# Сліди новинного каналу в телеграм-пості.
NEWS_CHROME_RX = re.compile(
    r'надіслати\s+новину|підписат\w*|наш\s+чат|\|\s*\[|'
    r'\[[^\]]*\]\(https?://t\.me',
    re.IGNORECASE)


def detect_genre(text, source_type):
    """
    Хто говорить: абонент чи медіа.

    Це різні речі, хоч і лежать в одній стрічці. "Vodafone попередив
    про перебої" — не скарга абонента, а переказ офіційної заяви;
    таких у наборі 127 зі 792. Для детекції криз вони цінні: саме
    вони показують, що тему підхопили. Але підписувати їх словом
    "скарга" означає рахувати одну подію як сотню незадоволених людей.
    """
    if source_type == 'review':
        return 'user'
    if source_type == 'news':
        return 'news'
    if OFFICIAL_RX.search(text or '') or NEWS_CHROME_RX.search(text or ''):
        return 'news'
    return 'user'


def enrich_batch(rows):
    """rows: [(id, text, rating, source_type, source_name)] -> кортежі."""
    texts = [r[1] or '' for r in rows]
    preds = sentiment_model.predict_hybrid(texts)

    out = []
    for (mid, text, rating, source_type, source_name), (sent, conf) in zip(rows, preds):
        text = text or ''

        # Якщо зірки є — вони важливіші за модель. Це пряма оцінка автора,
        # а не здогадка. Модель потрібна там, де зірок немає.
        if rating in (1, 2):
            sent, conf = 'negative', 1.0
        elif rating in (4, 5):
            # але сарказм у 5 зірках не буває, а от у 1 зірці з похвалою — буває
            sent, conf = ('mixed', 1.0) if sent == 'mixed' else ('positive', 1.0)
            # "чудовий оператор, АЛЕ покриття не задовільне" на 4 зірки —
            # це не похвала й не скарга, а обидва разом. Зірки казали
            # "позитив", і скарга в другій половині речення зникала.
            if sent == 'positive' and (CAVEAT_RX.search(text)
                                       or PLAIN_COMPLAINT_RX.search(text)):
                sent, conf = 'mixed', 0.8
            # "Добрий звʼязок там де не ловить Київстар" — проблема
            # названа про КОНКУРЕНТА. На пʼять зірок це похвала нам.
            if sent == 'mixed' and COMPETITOR_PROBLEM.search(text) \
                    and not CAVEAT_RX.search(text):
                sent, conf = 'positive', 0.8
        elif rating == 3:
            # Три зірки самі по собі не означають "і добре, і погано".
            # "В Нікополь майже нема звʼязку" на три зірки — це скарга
            # без жодної похвали, і підписувати її "змішано" неправильно.
            # Нехай вирішує текст: похвали немає — значить скарга.
            sent, conf = ('negative', 0.9) if sent == 'negative' else ('mixed', 1.0)

        # Телеграм — теж не жанр відгуків: там новини, анонси й реклама.
        # Модель, навчена на відгуках, відносила до негативу пости
        # "5G від Київстар відтепер і в Одесі". Для обох жанрів
        # тональність визначається маркерами, за замовчуванням нейтральна.
        if source_type in ('news', 'telegram'):
            sent, conf = news_sentiment(text), 0.6

        q = quality.score(text, source_type)
        cause = keywords.detect_cause(text, source_type)
        context = keywords.detect_context(text)
        cities = q['cities']
        tonality, trust = classify_tonality(sent, q)

        c = contract.build(text, sent, source_type, source_name, q=q)
        loc = c['location']

        out.append((
            mid, sent, conf, tonality, trust, cause,
            cities[0] if len(cities) == 1 else None,   # два міста — локація неоднозначна
            context[0] if context else None,
            q['actionability'], q['emotional_noise'], q['promo_like'],
            json.dumps(q, ensure_ascii=False),
            int(c['isMarketWide']), int(c['isAd']),
            detect_genre(text, source_type),
            int(c['isRelevant']), c['relevanceScore'],
            int(c['isConstructive']), c['constructiveScore'],
            c['importance'], c['sentiment'], c['problemType'], c['reputationalRiskScore'],
            int(c['churnIntent']), c['churnScore'], c['reachWeight'], c['resonance'],
            loc['lat'] if loc else None,
            loc['lng'] if loc else None,
            loc['addressName'] if loc else None,
        ))
    return out


def run(redo=False):
    con = sqlite3.connect(DB_PATH)
    con.execute(SCHEMA)
    if redo:
        con.execute("DELETE FROM analysis")
        con.commit()
        print("Попередній аналіз очищено")

    total = con.execute(
        "SELECT count(*) FROM mentions WHERE id NOT IN (SELECT mention_id FROM analysis)"
    ).fetchone()[0]
    print(f"До обробки: {total}")
    if not total:
        return

    started = time.time()
    done = 0
    while True:
        rows = con.execute(
            "SELECT id, text, rating, source_type, source_name FROM mentions "
            "WHERE id NOT IN (SELECT mention_id FROM analysis) LIMIT ?", (BATCH,)
        ).fetchall()
        if not rows:
            break
        con.executemany(
            "INSERT OR REPLACE INTO analysis VALUES (" + ",".join("?"*30) + ")",
            enrich_batch(rows))
        con.commit()
        done += len(rows)
        print(f"  {done}/{total}  ({time.time()-started:.0f} с)")

    print(f"\nГотово за {time.time()-started:.0f} с")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--redo', action='store_true')
    args = p.parse_args()
    run(redo=args.redo)


if __name__ == '__main__':
    main()
