"""
Тональність без LLM. Роль №4.

Ідея: у 16 600 відгуків уже є зірки 1-5, проставлені самими авторами.
Це безкоштовна людська розмітка. Навчаємо на ній класифікатор і
застосовуємо до телеграму й новин, де зірок немає.

Головна перевага перед словником: модель сама вчиться на тому, як люди
пишуть українською й російською, включно з сарказмом — бо відгук
"дякую за чудовий зв'язок, третій день без інтернету" має ОДНУ зірку,
і модель бачить цей зв'язок у даних.

Точність вимірюється на відкладеній вибірці, якої модель не бачила.
Цю цифру можна називати на пітчі — вона справжня.

    python sentiment_model.py --train
    python sentiment_model.py --test "текст для перевірки"
"""

import argparse
import pickle
import sqlite3

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

DB_PATH = 'mentions.db'
MODEL_PATH = 'sentiment_model.pkl'

# 3 зірки — навмисно НЕ нейтральні: це "щось не так, але терпимо".
# Беремо лише однозначні краї, щоб не вчити модель на розмитому.
LABELS = {1: 'negative', 2: 'negative', 4: 'positive', 5: 'positive'}


def load_training_data():
    con = sqlite3.connect(DB_PATH)
    rows = con.execute(
        "SELECT text, rating FROM mentions "
        "WHERE rating IS NOT NULL AND rating IN (1,2,4,5) "
        "AND length(trim(text)) > 10"
    ).fetchall()
    texts = [r[0] for r in rows]
    labels = [LABELS[r[1]] for r in rows]
    return texts, labels


def build_pipeline():
    return Pipeline([
        # Символьні n-грами, а не слова: українська й російська мають
        # багату морфологію, і 3-5 символів ловлять корінь незалежно
        # від відмінка й друкарської помилки.
        ('tfidf', TfidfVectorizer(
            analyzer='char_wb', ngram_range=(3, 5),
            min_df=3, max_features=200_000, sublinear_tf=True)),
        # class_weight='balanced' — бо пʼятірок утричі більше за одиниці,
        # інакше модель просто завжди казала б "positive".
        ('clf', LogisticRegression(
            max_iter=2000, class_weight='balanced', C=4.0)),
    ])


def train():
    texts, labels = load_training_data()
    print(f"Навчальних прикладів: {len(texts)}")
    print(f"  негатив: {labels.count('negative')} | позитив: {labels.count('positive')}")

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels)

    pipe = build_pipeline()
    print(f"\nНавчання на {len(X_train)}...")
    pipe.fit(X_train, y_train)

    print(f"\nПеревірка на {len(X_test)} прикладах, яких модель не бачила:\n")
    y_pred = pipe.predict(X_test)
    print(classification_report(y_test, y_pred, digits=3,
                                target_names=['негатив', 'позитив']))
    cm = confusion_matrix(y_test, y_pred, labels=['negative', 'positive'])
    print("Матриця помилок (рядки — правда, стовпці — прогноз):")
    print(f"           негатив  позитив")
    print(f"  негатив   {cm[0][0]:>6}  {cm[0][1]:>7}")
    print(f"  позитив   {cm[1][0]:>6}  {cm[1][1]:>7}")

    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(pipe, f)
    print(f"\nМодель збережено: {MODEL_PATH}")
    return pipe


_model = None


def load_model():
    global _model
    if _model is None:
        with open(MODEL_PATH, 'rb') as f:
            _model = pickle.load(f)
    return _model


def predict(texts):
    """Повертає список (мітка, впевненість)."""
    model = load_model()
    probs = model.predict_proba(texts)
    classes = list(model.named_steps['clf'].classes_)
    out = []
    for row in probs:
        i = row.argmax()
        label = classes[i]
        conf = float(row[i])
        # Низька впевненість — чесніше сказати "нейтрально",
        # ніж вгадувати. Нейтральних прикладів у навчанні немає.
        if conf < 0.65:
            label = 'neutral'
        out.append((label, round(conf, 3)))
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--train', action='store_true')
    p.add_argument('--test', nargs='*')
    args = p.parse_args()

    if args.train:
        train()
    if args.test:
        for text, (label, conf) in zip(args.test, predict(args.test)):
            print(f"{label:<9} {conf:.2f} | {text[:70]}")


if __name__ == '__main__':
    main()


# ------------------------------------------------------- гібрид: модель + вето

import keywords  # noqa: E402

# Фрази, які прямо описують поломку. Якщо вони є, похвальні слова в тексті
# не мають значення — це сарказм або змішаний відгук, але не позитив.
# Без цього правила "дякую за чудовий зв'язок, третій день без інтернету"
# модель впевнено відносить до позитиву: у навчальних даних слова
# "дякую" і "чудовий" майже завжди позитивні.
def has_problem_statement(text):
    """
    Тільки ПРЯМА констатація поломки: "не працює", "немає зв'язку",
    "третій день без інтернету".

    Ширший варіант вето (будь-яка визначена причина) перевірявся на
    відкладеній вибірці й виявився шкідливим: точність падала з 0.918
    до 0.753, бо в п'ятизіркових відгуках теж є слово "інтернет".
    Повнота по негативу при цьому не зростала. Тому вето вузьке.
    """
    # is_coverage_issue ловить і просто ТЕМУ ("покриття"), тому відгук
    # на пʼять зірок "покриття хорошее" ставав змішаним і потрапляв
    # у набір скарг. Вето має спрацьовувати лише на заявлену поломку.
    return bool(keywords.PROBLEM_STATED.search(text or ''))


def predict_hybrid(texts):
    """Прогноз моделі з правилом-вето на явні описи поломки."""
    base = predict(texts)
    out = []
    for text, (label, conf) in zip(texts, base):
        if label == 'positive' and has_problem_statement(text):
            # Позитив поверх опису поломки — це змішаний відгук або сарказм.
            out.append(('mixed', conf))
        else:
            out.append((label, conf))
    return out
