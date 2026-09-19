"""
Список джерел для збору. Учасник №2.

CHANNELS — юзернейми, знайдені через --find і підтверджені через --check.
Клони й підробки (назва правильна, юзернейм безглуздий) відкинуті свідомо:
вони передруковують чужі пости і роздувають лічильники.

    python collector_telegram.py --find     # підібрати юзернейми за назвою
    python collector_telegram.py --check    # підтвердити, що канал живий
"""

# Національні. Дають резонанс: якщо тема тут — вона вже в медіа.
NATIONAL = [
    'truexanewsua',      # Труха Україна, найбільший
    'ukrpravda_news',    # Українська правда
    'suspilnenews',      # Суспільне Новини
    'uniannet',          # УНІАН
]

# Технології і телеком. Тут збої розбирають по суті, а не заголовком.
TECH = [
    'itcua',
    'ain_ua_tg',
]

# Регіональні. ГОЛОВНЕ джерело локальних скарг на звʼязок.
# Саме вони дають сигнал "у Львові не працює інтернет".
REGIONAL = [
    'chernihiv_info',
    'chernihiv_online',
    'dnepr_operativ',
    'dnipro_news',
    'info_cherkasy',
    'info_chernivtsi',
    'info_zp',
    'khmlives',
    'lutsk_info',
    'lvivtp',
    'lvivtruexa',
    'lvivych_news',
    'news_mariupol',
    'news_rivne',
    'novyny_odessa',
    'novyny_vinnytsia',
    'odesatruexa',
    'odessa_infonews',
    'odessa_online',
    'poltava_online',
    'rivne_golovne',
    'rivnetruexa',
    'svoiKR',
    'ternopiltruexa',
    'truexadnepr',
    'truexafrankivsk',
    'truexakharkiv',
    'truexakyiv',
    'truexalutsk',
    'truexanikolaev',
    'truexapoltava',
    'truexarivne',
    'truexaternopil',
    'truexavinnica',
    'typicalvinnytsia',
    'vinnicatruexa',
]

CHANNELS = NATIONAL + TECH + REGIONAL

# Канали про відключення світла. Потрібні, щоб відрізнити збій мережі
# від знеструмлення: базові станції сідають на акумулятори, люди пишуть
# "Vodafone не працює", хоча оператор ні до чого.
# Збираються окремо, у brand_query не потрапляють.
BLACKOUT_CHANNELS = [
    'Ukrenergo',
    'dtek_ua',
]

# Назви для пошуку юзернеймів (--find), якщо треба додати ще міст.
SEARCH_QUERIES = [
    'Труха Суми',
    'Труха Чернівці',
    'Вінниця новини',
    'Полтава новини',
    'Житомир новини',
    'Ужгород новини',
    'Тернопіль новини',
    'Миколаїв новини',
]

BLACKOUT_QUERIES = [
    'Укренерго',
    'ДТЕК',
]
