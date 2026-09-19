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
    FOREIGN KEY(mention_id) REFERENCES mentions(id)
)
"""


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
    """rows: [(id, text, rating)] -> список кортежів для вставки."""
    texts = [r[1] or '' for r in rows]
    preds = sentiment_model.predict_hybrid(texts)

    out = []
    for (mid, text, rating), (sent, conf) in zip(rows, preds):
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

        q = quality.score(text)
        cause = keywords.detect_cause(text)
        context = keywords.detect_context(text)
        cities = q['cities']
        tonality, trust = classify_tonality(sent, q)

        out.append((
            mid, sent, conf, tonality, trust, cause,
            cities[0] if len(cities) == 1 else None,   # два міста — локація неоднозначна
            context[0] if context else None,
            q['actionability'], q['emotional_noise'], q['promo_like'],
            json.dumps(q, ensure_ascii=False),
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
            "SELECT id, text, rating FROM mentions "
            "WHERE id NOT IN (SELECT mention_id FROM analysis) LIMIT ?", (BATCH,)
        ).fetchall()
        if not rows:
            break
        con.executemany(
            "INSERT OR REPLACE INTO analysis VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
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
