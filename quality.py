"""
Ознаки якості згадки за таксономією №4. Роль №4, реалізація без LLM.

Ідея: більшість маркерів, які він описав, детерміновані. Капс, знаки
оклику, наявність міста, швидкості в Мбіт/с, дати — це рахується правилами
на всіх 19 тисячах записів за секунди й безкоштовно.

Модель потрібна тільки там, де треба зрозуміти ЗМІСТ: причина скарги,
тональність із сарказмом, локація в непрямій формі.

Три показники, 0..1:
  emotional_noise — крик без інформації: "ЗЛОДІЇ!!! ПОВЕРНІТЬ ГРОШІ!!!"
  promo_like      — схоже на замовний позитив: захват без жодної деталі
  actionability   — наскільки з цього можна діяти: є місце, час, суть

Головний із них actionability. Комунікаційній команді потрібен не обсяг
негативу, а ті кілька повідомлень, де сказано що саме і де зламалось.
"""

import re

# ------------------------------------------------------------------ міста

# Основа слова без закінчення: ловить "у Львові", "зі Львова", "Львів".
CITY_STEMS = {
    'Київ': r'київ|києв',
    'Львів': r'львів|львов',
    'Харків': r'харків|харьков',
    'Одеса': r'одес',
    'Дніпро': r'дніпр|днепр',
    'Запоріжжя': r'запоріж|запорож',
    'Вінниця': r'вінниц|винниц',
    'Полтава': r'полтав',
    'Чернігів': r'черніг|черниг',
    'Черкаси': r'черкас',
    'Житомир': r'житомир',
    'Луцьк': r'луцьк|луцк',
    'Тернопіль': r'тернопіл|тернопол',
    'Івано-Франківськ': r'франківськ|франковск|франик',
    'Ужгород': r'ужгород',
    'Чернівці': r'чернівц|черновц',
    'Хмельницький': r'хмельниц',
    'Миколаїв': r'миколаїв|николаев',
    'Херсон': r'херсон',
    'Кропивницький': r'кропивниц',
    'Кривий Ріг': r'кривому\s+роз|кривий\s+ріг|кривом\s+рог',
    'Маріуполь': r'маріупол|мариупол',
}

# Ці дві назви збігаються зі звичайними словами: "суми" грошей, "рівне"
# покриття. Беремо лише у формах, які не сплутати.
AMBIGUOUS_CITIES = {
    'Суми': r'\bу\s+сумах\b|\bсумах\b|\bм\.?\s*суми\b',
    'Рівне': r'\bу\s+рівном|\bрівном[у]\b|\bм\.?\s*рівне\b',
}

CITY_RX = {name: re.compile(p, re.IGNORECASE) for name, p in CITY_STEMS.items()}
AMBIG_RX = {name: re.compile(p, re.IGNORECASE) for name, p in AMBIGUOUS_CITIES.items()}

# ------------------------------------------------------------------ маркери

# Загальні захвати без змісту — ознака замовного відгуку.
GENERIC_PRAISE = re.compile(
    r'все\s+(супер|чудово|класно|відмінно)|найкращ\w+|чудова\s+компані|'
    r'рекомендую\s+(всім|усім)?|дуже\s+задоволен|топ\b|супер\b|'
    r'лучший\s+оператор|отличн\w+\s+связь',
    re.IGNORECASE)

# Узагальнені звинувачення без конкретики.
GENERIC_BLAME = re.compile(
    r'завжди\s+(крад|обман|дур)|ніде\s+і\s+ніколи|взагалі\s+ніде|'
    r'постійно\s+(обман|крад)|всегда\s+(крад|обман)',
    re.IGNORECASE)

INSULT = re.compile(
    r'злодій|злодії|шахра|кидал|обманщик|воры|жулик|мраз|тварин',
    re.IGNORECASE)

# Конкретика, яка робить відгук придатним до дії.
TECH_DETAIL = re.compile(
    r'\d+\s*(мбіт|мбит|mbps|кбіт|мб/с|гб|gb|мс|ms|ping|пінг)|'
    r'\b[345]g\b|\blte\b|\bwi-?fi\b|базов\w+\s+станц|'
    r'генератор|акумулятор|антен',
    re.IGNORECASE)

PROCESS_DETAIL = re.compile(
    r'звернув\w+|написав\w*\s+в\s+підтримк|підтримка\s+відповіл|'
    r'чекав\s+\d+|оператор\s+сказав|заявк\w+|звернення|'
    r'обратил\w+|техподдержк',
    re.IGNORECASE)

DATE_DETAIL = re.compile(
    r'\b\d{1,2}\s+(січня|лютого|березня|квітня|травня|червня|липня|'
    r'серпня|вересня|жовтня|листопада|грудня)\b|'
    r'\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\b|'
    r'\b(вчора|сьогодні|зранку|ввечері|вночі)\b|'
    r'\b\d{1,2}:\d{2}\b',
    re.IGNORECASE)

# Район/вулиця — локація точніша за місто.
MICRO_LOCATION = re.compile(
    r'\bрайон\w*\b|\bвул\.?\s|\bвулиц|мікрорайон|\bм-?н\b|'
    r'\bсмт\b|\bс\.\s*[А-ЯІЇЄA-Z]|селищ',
    re.IGNORECASE)


def caps_ratio(text):
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 10:
        return 0.0
    return sum(c.isupper() for c in letters) / len(letters)


def detect_cities(text):
    """Міста, згадані в тексті. Неоднозначні — лише в безпечних формах."""
    found = [n for n, rx in CITY_RX.items() if rx.search(text)]
    found += [n for n, rx in AMBIG_RX.items() if rx.search(text)]
    return found


def score(text):
    """Повертає ознаки й три показники для одного тексту."""
    t = text or ''
    words = len(t.split())

    exclaims = t.count('!')
    caps = caps_ratio(t)
    cities = detect_cities(t)

    f = {
        'words': words,
        'exclaims': exclaims,
        'caps_ratio': round(caps, 2),
        'cities': cities,
        'has_location': bool(cities),
        'has_micro_location': bool(MICRO_LOCATION.search(t)),
        'has_tech_detail': bool(TECH_DETAIL.search(t)),
        'has_process_detail': bool(PROCESS_DETAIL.search(t)),
        'has_date': bool(DATE_DETAIL.search(t)),
        'generic_praise': bool(GENERIC_PRAISE.search(t)),
        'generic_blame': bool(GENERIC_BLAME.search(t)),
        'insult': bool(INSULT.search(t)),
    }

    # Крик без інформації.
    noise = 0.0
    noise += min(exclaims, 5) * 0.12          # знаки оклику
    noise += 0.4 if caps > 0.5 else 0.0       # КАПС
    noise += 0.25 if f['insult'] else 0.0
    noise += 0.25 if f['generic_blame'] else 0.0
    noise -= 0.2 if f['has_location'] else 0.0
    f['emotional_noise'] = round(max(0.0, min(1.0, noise)), 2)

    # Захват без деталей.
    promo = 0.0
    promo += 0.45 if f['generic_praise'] else 0.0
    promo += 0.2 if exclaims >= 2 else 0.0
    promo += 0.2 if words < 12 else 0.0
    promo -= 0.3 if (f['has_location'] or f['has_tech_detail']
                     or f['has_process_detail']) else 0.0
    f['promo_like'] = round(max(0.0, min(1.0, promo)), 2)

    # Придатність до дії: чи є де, коли і що саме.
    act = 0.0
    act += 0.35 if f['has_location'] else 0.0
    act += 0.15 if f['has_micro_location'] else 0.0
    act += 0.2 if f['has_tech_detail'] else 0.0
    act += 0.15 if f['has_process_detail'] else 0.0
    act += 0.1 if f['has_date'] else 0.0
    act += 0.1 if words >= 20 else 0.0
    act -= 0.2 if f['emotional_noise'] > 0.6 else 0.0
    f['actionability'] = round(max(0.0, min(1.0, act)), 2)

    return f


SELF_TEST = [
    ("ЗЛОДІЇ!!!!! ПОВЕРНІТЬ ГРОШІ!!!!!!", 'шум'),
    ("Дякую Vodafone!!! Найкращі!!! Все супер", 'промо'),
    ("У районі Позняків у Києві третій день інтернет 2 Мбіт замість 100. "
     "Звернувся в підтримку 12 вересня, чекав 40 хвилин", 'дія'),
    ("Зв'язку немає", 'ніщо'),
]

if __name__ == '__main__':
    for text, label in SELF_TEST:
        f = score(text)
        print(f"[{label:<6}] шум {f['emotional_noise']:.2f} | промо {f['promo_like']:.2f} | "
              f"дія {f['actionability']:.2f} | міста {f['cities']} | {text[:50]}")
