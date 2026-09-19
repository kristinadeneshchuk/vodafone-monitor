"""
Контракт для рівня №6. Роль №4.

Віддає рівно ті поля, які просив №6:

    isRelevant, relevanceScore
    isConstructive, constructiveScore
    importance          (enum 0..3)
    sentiment           (enum 0..2)
    location            {lat, lng, addressName} | null
    problemType         (enum 0..3)
    reputationalRiskScore (0..100)

Enum у базі зберігаються числами — економія місця, як просив №6.
Розшифровки нижче, конвертація в рядки на його боці.

ВАЖЛИВО про relevanceScore і constructiveScore. Це НЕ ймовірності
в статистичному сенсі: під ними немає навченої моделі з калібруванням.
Це зважені суми ознак, приведені до 0..1. Назва "score", а не
"probability", навмисна — не варто казати журі "ймовірність 0.8",
якщо це не ймовірність.

Єдине поле зі справжньою моделлю — sentiment (точність 0.912
на відкладеній вибірці, див. sentiment_model.py).
"""

import re

import geo
import keywords
import quality
import risk

# ------------------------------------------------------------------ enum

SENTIMENT = {'positive': 0, 'neutral': 1, 'negative': 2}
SENTIMENT_NAMES = {v: k for k, v in SENTIMENT.items()}

IMPORTANCE = {'low': 0, 'medium': 1, 'high': 2, 'critical': 3}
IMPORTANCE_NAMES = {v: k for k, v in IMPORTANCE.items()}

PROBLEM_TYPE = {'no_signal': 0, 'slow_internet': 1, 'dropped_calls': 2, 'other': 3}
PROBLEM_TYPE_NAMES = {v: k for k, v in PROBLEM_TYPE.items()}

# Причини, які взагалі стосуються покриття. Решта (тарифи, застосунок,
# списання) — не наша тема, isRelevant = false.
COVERAGE_CAUSES = {'coverage', 'internet', 'calls', 'outage', 'blackout'}

# "не працює" проти "повільно" — різні проблеми для технічної команди.
DEAD_RX = re.compile(
    r'не\s+працю|нема(є)?|відсутн|пропав|зник|не\s+лови|не\s+работает|нет\s+',
    re.IGNORECASE)
SLOW_RX = re.compile(
    r'повільн|ледве|тормоз|медленн|низьк\w*\s+швидк|просіда|лагає',
    re.IGNORECASE)


def problem_type(text, cause):
    if cause == 'calls':
        return PROBLEM_TYPE['dropped_calls']
    if cause in ('coverage', 'outage'):
        return PROBLEM_TYPE['no_signal']
    if cause == 'internet':
        # Інтернет може бути мертвий або повільний. Для технічної команди
        # це різні задачі: перша — аварія, друга — ємність мережі.
        if SLOW_RX.search(text):
            return PROBLEM_TYPE['slow_internet']
        if DEAD_RX.search(text):
            return PROBLEM_TYPE['no_signal']
        return PROBLEM_TYPE['slow_internet']
    return PROBLEM_TYPE['other']


def relevance_score(text, cause, has_location):
    """
    Наскільки повідомлення стосується покриття. Зважена сума ознак,
    не ймовірність. Ваги підібрані на очі — це припущення, яке
    перевіряється ручною розміткою 100 повідомлень.
    """
    s = 0.0
    if keywords.is_coverage_issue(text):
        s += 0.55                      # пряма фраза про проблему зі зв'язком
    if cause in COVERAGE_CAUSES:
        s += 0.30
    if has_location:
        s += 0.10                      # локація робить скаргу предметною
    if keywords.detect_context(text):
        s += 0.05                      # потяг / гори / світло
    return round(min(s, 1.0), 2)


def importance(sentiment_name, risk, is_constructive, source_type, is_coverage=False):
    """
    Важливість повідомлення. Від ризику, конструктивності й охоплення.

    Новина важить більше за один відгук не тому, що вона гірша,
    а тому що її вже побачили тисячі людей.

    Пороги відкалібровані на розподілі ризику в наших даних
    (p90 = 73, p95 = 81, p99 = 89). "critical" має лишатись рідкісним:
    якщо критичних тисячі, слово втрачає сенс і команда перестає реагувати.
    Критичним вважається лише те, що стосується покриття — поганий відгук
    про застосунок не є репутаційною кризою.
    """
    if sentiment_name == 'positive':
        return IMPORTANCE['low']

    score = risk
    if source_type == 'news':
        score += 15                    # медіа = охоплення
    if is_constructive:
        score += 10                    # з цим можна щось зробити

    if score >= 88 and is_coverage:
        return IMPORTANCE['critical']
    if score >= 75:
        return IMPORTANCE['high']
    if score >= 55:
        return IMPORTANCE['medium']
    return IMPORTANCE['low']


def reputational_risk(sentiment_name, q, cause, source_type, has_location):
    """
    Оцінка репутаційного ризику 0..100.

    Формула зважена вручну, це евристика, а не навчена модель.
    Чотири складові:
      негативність   до 40  — позитив ризику не створює
      охоплення      до 25  — новину бачать тисячі, відгук одиниці
      достовірність  до 20  — конкретна скарга шкодить більше за крик
      тип проблеми   до 15  — масовий збій гірший за повільний застосунок

    Перевірити формулу можна так: взяти 20 реальних інфоприводів
    минулого року, проставити їм ризик вручну і порівняти з нашим.
    """
    if sentiment_name == 'positive':
        return 0

    score = 0.0

    # негативність
    score += 40 if sentiment_name == 'negative' else 20

    # охоплення
    score += {'news': 25, 'telegram': 15, 'review': 8}.get(source_type, 5)

    # достовірність: конкретика шкодить більше за емоції, бо її
    # цитують і їй вірять
    score += 20 * q['actionability']
    score -= 10 * q['emotional_noise']
    if has_location:
        score += 5

    # тип проблеми
    score += {'outage': 15, 'coverage': 10, 'internet': 10,
              'calls': 8, 'billing': 8, 'blackout': 3}.get(cause, 2)

    return int(max(0, min(100, round(score))))


# Матеріал про РИНОК, а не про конкретного оператора: порівняння
# тарифів, галузеві пояснювальні статті, огляди вимог до всіх операторів.
# Такий текст зберігається по разу на кожен бренд, тому без цієї ознаки
# стаття "Київстар, Водафон, Лайфселл — куди скаржитися" потрапляє
# і в стрічку Vodafone, хоча вона не про Vodafone.
_OPERATOR_RX = [
    re.compile(r'vodafone|водафон|водофон', re.IGNORECASE),
    re.compile(r'kyivstar|київстар|киевстар', re.IGNORECASE),
    re.compile(r'lifecell|лайфсел|лайфцел', re.IGNORECASE),
]

MARKET_WIDE = re.compile(
    r'(усі|всі|три)\s+(мобільні\s+)?оператор|мобільн\w*\s+оператор\w*\s+україн|'
    r'телеком-?ринок|ринок\s+(мобільн|телеком)|оператор\w*\s+зобов|'
    r'вимог\w*\s+до\s+(мобільн\w*\s+)?оператор|нкек|нкрзі|мінцифри|'
    r'оператор\w*\s+(обіцяют|готуют|посилюют|переход)|'
    r'скільки\s+обіцяют|як\s+оператори\s+',
    re.IGNORECASE)


def is_market_wide(text):
    """Скільки операторів названо. Два й більше — це про ринок."""
    text = text or ''
    named = sum(1 for rx in _OPERATOR_RX if rx.search(text))
    return named >= 2 or bool(MARKET_WIDE.search(text))


def build(text, sentiment_name, source_type, source_name='', q=None):
    """
    Повний набір полів для №6.

    q — результат quality.score(text); якщо не передано, рахується тут.
    """
    text = text or ''
    q = q or quality.score(text, source_type)

    cause = keywords.detect_cause(text, source_type)
    location = geo.resolve(text, source_type)
    has_location = location is not None

    rel_score = relevance_score(text, cause, has_location)
    con_score = q['actionability']
    is_constructive = con_score >= 0.4 and q['emotional_noise'] < 0.6

    # Ризик за формулою чотирьох факторів (risk.py), шкала 0-10.
    # Стара евристика reputational_risk лишена нижче для порівняння,
    # у розрахунку не бере участі.
    r = risk.compute(text, sentiment_name, source_type, source_name, cause, q)
    risk_score = int(round(r['score'] * 10))       # контракт №6 чекає 0-100

    # Намір піти від оператора. F3 = 4.0 це "особистий намір" за шкалою,
    # нижче — просто незадоволення без планів.
    churn_score = r['factors']['f3']
    churn_intent = churn_score >= 4.0

    # Резонанс: релевантність, помножена на охоплення джерела.
    # Скарга в каналі на 300 тисяч вимагає реакції раніше за таку саму
    # у відгуку, який побачать одиниці.
    reach_weight = r['factors']['f1']
    resonance = round(rel_score * reach_weight, 2)

    return {
        'isRelevant': rel_score >= 0.5,
        'relevanceScore': rel_score,
        'isConstructive': is_constructive,
        'constructiveScore': con_score,
        # Важливість більше не рахується окремо: вона і є рівнем зі шкали
        # інтерпретації ризику (0-2.9 low, 3-5.9 medium, 6-7.9 high, 8+ critical).
        # Дві різні шкали для одного й того ж давали б суперечливі підказки.
        'importance': IMPORTANCE[r['grade']],
        # У нас є ще клас 'mixed' — для №6 зводимо його до негативу:
        # змішаний відгук містить скаргу, і репутаційно це не позитив.
        'sentiment': SENTIMENT.get(
            'negative' if sentiment_name == 'mixed' else sentiment_name, 1),
        'location': ({'lat': location['lat'], 'lng': location['lng'],
                      'addressName': location['addressName']}
                     if location else None),
        'problemType': problem_type(text, cause),
        'reputationalRiskScore': risk_score,
        'isMarketWide': is_market_wide(text),
        'churnIntent': churn_intent,
        'churnScore': churn_score,
        'reachWeight': reach_weight,
        'resonance': resonance,
        'riskFactors': r['factors'],
        'recommendedAction': r['action'],
    }


def humanize(row):
    """Для читання очима: enum -> назви."""
    r = dict(row)
    r['sentiment'] = SENTIMENT_NAMES.get(r['sentiment'])
    r['importance'] = IMPORTANCE_NAMES.get(r['importance'])
    r['problemType'] = PROBLEM_TYPE_NAMES.get(r['problemType'])
    return r


if __name__ == '__main__':
    import json
    samples = [
        ("У районі Позняків у Києві третій день інтернет 2 Мбіт замість 100. "
         "Звернувся в підтримку 12 вересня, чекав 40 хвилин", 'negative', 'review'),
        ("Їду потягом Київ - Харків, зв'язку немає взагалі", 'negative', 'telegram'),
        ("ЗЛОДІЇ!!!! ПОВЕРНІТЬ ГРОШІ!!!!", 'negative', 'review'),
        ("Vodafone повідомив про масовий збій мережі у Львові", 'negative', 'news'),
        ("Все супер, рекомендую!", 'positive', 'review'),
    ]
    for text, sent, src in samples:
        print(json.dumps(humanize(build(text, sent, src)),
                         ensure_ascii=False, indent=1))
        print(f"  ^ {text[:70]}\n")
