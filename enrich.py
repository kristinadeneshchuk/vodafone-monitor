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
    r'збій|збо[ії]|аварі|не\s+працю|скарг|атак|зламал|витік\s+даних|'
    r'штраф|суд\b|позов|критик|розслідуванн|перебо|обмеженн|'
    r'подорожч|підвищ\w*\s+(цін|тариф)|відключ', re.IGNORECASE)
NEWS_POSITIVE = re.compile(
    r'запуст|розшир|покращ|модерніз|рекорд|нагород|інвестув|'
    r'відновив|新|збільш\w*\s+швидк|нов\w*\s+послуг', re.IGNORECASE)


def news_sentiment(text):
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
        elif rating == 3:
            sent, conf = 'mixed', 1.0

        if source_type == 'news':
            sent, conf = news_sentiment(text), 0.6

        q = quality.score(text)
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
            "INSERT OR REPLACE INTO analysis VALUES (" + ",".join("?"*27) + ")",
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
