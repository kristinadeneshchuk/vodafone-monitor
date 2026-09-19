"""
Збирач згадок з публічних Telegram-каналів.

Учасник №2. Формат даних — контракт mentions:
    source_type, source_name, url, published_at, text, brand_query

Дані про авторів не збираються: з каналу беремо тільки текст поста,
час і посилання на пост. Імена, ID та телефони користувачів
у пам'ять не потрапляють взагалі.

Запуск:
    python collector_telegram.py --self-test          # перевірка фільтра, без Telegram
    python collector_telegram.py --days 2             # свіжі пости за 2 доби
    python collector_telegram.py --since 2023-12-12 --until 2023-12-15   # бектест
    python collector_telegram.py --days 2 --no-db     # тільки в JSON
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

from telethon import TelegramClient
from telethon.errors import (
    ChannelPrivateError,
    FloodWaitError,
    UsernameNotOccupiedError,
)
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.contacts import SearchRequest

import channels as channels_cfg

# ---------------------------------------------------------------- налаштування

API_ID = os.getenv('TG_API_ID')
API_HASH = os.getenv('TG_API_HASH')
SESSION_NAME = 'vodafone_monitor'

# Список джерел живе в channels.py. Туди потрапляють лише канали,
# що пройшли `--check`.
CHANNELS = channels_cfg.CHANNELS

MAX_MESSAGES_PER_CHANNEL = 3000   # запобіжник, щоб не висіти годинами
SLEEP_BETWEEN_CHANNELS = 1.0      # секунди, бережемо rate limit

# ---------------------------------------------------------------- пошук брендів

# \w* дає всі відмінки: водафон / водафону / водафоні / водафонівський.
# re.IGNORECASE + re.UNICODE обов'язкові для кирилиці.
BRAND_PATTERNS = {
    'vodafone': [
        r'vodafone\w*',
        r'водафон\w*',
        r'водофон\w*',      # часта помилка в написанні
    ],
    'kyivstar': [
        r'kyivstar\w*',
        r'київстар\w*',
        r'киевстар\w*',
    ],
    'lifecell': [
        r'lifecell\w*',
        r'life\s?cell\w*',
        r'лайфсел\w*',
        r'лайфцел\w*',
    ],
}

# Ці варіанти дають багато шуму ("ВФ" = "Верховна Феда"? ні, але збігів вистачає).
# Вмикаються прапорцем --loose; відсів лишається на is_relevant у №4.
LOOSE_PATTERNS = {
    'vodafone': [r'\bвф\b', r'\bvf\b'],
    'lifecell': [r'\bлайф\b'],
}

MIN_TEXT_LEN = 15   # коротші за це — здебільшого підписи до фото


def build_matchers(loose=False):
    """Компілює по одному регексу на бренд."""
    matchers = {}
    for brand, patterns in BRAND_PATTERNS.items():
        all_patterns = list(patterns)
        if loose:
            all_patterns += LOOSE_PATTERNS.get(brand, [])
        joined = '|'.join(f'(?:{p})' for p in all_patterns)
        matchers[brand] = re.compile(joined, re.IGNORECASE | re.UNICODE)
    return matchers


def detect_brands(text, matchers):
    """Повертає список брендів, згаданих у тексті. Порожній — згадки немає."""
    return [brand for brand, rx in matchers.items() if rx.search(text)]


# ---------------------------------------------------------------- збір

def to_iso(dt):
    """Час у UTC в тому ж форматі, що й у db.py."""
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')


async def collect_channel(client, channel, matchers, since, until):
    """Проходить один канал і повертає згадки у форматі контракту."""
    mentions = []
    scanned = 0

    try:
        entity = await client.get_entity(channel)
    except (ValueError, UsernameNotOccupiedError):
        print(f"  [!] {channel}: канал не знайдено, пропускаю")
        return []
    except ChannelPrivateError:
        print(f"  [!] {channel}: канал закритий, пропускаю")
        return []

    try:
        # reverse=True + offset_date=since йде від старих до нових —
        # саме це потрібно для вивантаження історії під бектест.
        async for msg in client.iter_messages(
            entity,
            offset_date=since,
            reverse=True,
            limit=MAX_MESSAGES_PER_CHANNEL,
        ):
            if msg.date > until:
                break
            scanned += 1

            text = (msg.text or '').strip()
            if len(text) < MIN_TEXT_LEN:
                continue

            brands = detect_brands(text, matchers)
            if not brands:
                continue

            # Один пост може згадувати кількох операторів (порівняння тарифів).
            # Тоді пишемо його стільки разів, скільки брендів — кожен у свій зріз.
            for brand in brands:
                mentions.append({
                    'source_type': 'telegram',
                    'source_name': channel,
                    'url': f'https://t.me/{channel}/{msg.id}',
                    'published_at': to_iso(msg.date),
                    'text': text,
                    'brand_query': brand,
                })

    except FloodWaitError as e:
        print(f"  [!] {channel}: Telegram просить почекати {e.seconds} с. Зупиняю канал.")

    print(f"  {channel}: переглянуто {scanned}, знайдено згадок {len(mentions)}")
    return mentions


async def run_collector(days=None, since=None, until=None, loose=False):
    if not API_ID or not API_HASH:
        sys.exit(
            "Немає TG_API_ID / TG_API_HASH.\n"
            "Візьми їх на my.telegram.org -> API development tools, далі:\n"
            "  export TG_API_ID=123456\n"
            "  export TG_API_HASH=abcdef..."
        )

    now = datetime.now(timezone.utc)
    if since is None:
        since = now - timedelta(days=days or 1)
    if until is None:
        until = now

    print(f"Вікно збору: {to_iso(since)} -> {to_iso(until)}")
    matchers = build_matchers(loose=loose)

    all_mentions = []
    async with TelegramClient(SESSION_NAME, int(API_ID), API_HASH) as client:
        for channel in CHANNELS:
            all_mentions.extend(
                await collect_channel(client, channel, matchers, since, until)
            )
            await asyncio.sleep(SLEEP_BETWEEN_CHANNELS)

    return all_mentions


# ---------------------------------------------------------------- вивід

def save_json(mentions, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(mentions, f, ensure_ascii=False, indent=2)
    print(f"JSON: {len(mentions)} згадок -> {path}")


def save_to_db(mentions):
    """Підключення до бази №3. Якщо db.py ще немає — не падаємо."""
    try:
        import db
    except ImportError:
        print("[!] db.py не знайдено — згадки лишились тільки в JSON")
        return 0
    db.init_db()
    inserted = db.save_mentions(mentions)
    print(f"База: додано {inserted} нових (решта — дублікати)")
    return inserted


# ---------------------------------------------------------------- розвідка каналів

async def _client():
    if not API_ID or not API_HASH:
        sys.exit(
            "Немає TG_API_ID / TG_API_HASH.\n"
            "Візьми їх на my.telegram.org -> API development tools, далі:\n"
            "  export TG_API_ID=123456\n"
            "  export TG_API_HASH=abcdef..."
        )
    return TelegramClient(SESSION_NAME, int(API_ID), API_HASH)


async def find_channels(queries):
    """Шукає публічні канали за назвою і показує їхні юзернейми."""
    async with await _client() as client:
        for q in queries:
            print(f"\n=== {q}")
            try:
                res = await client(SearchRequest(q=q, limit=5))
            except FloodWaitError as e:
                print(f"  Telegram просить почекати {e.seconds} с")
                break
            found = False
            for chat in res.chats:
                username = getattr(chat, 'username', None)
                if not username:
                    continue          # без юзернейма канал недоступний для збору
                if getattr(chat, 'megagroup', False):
                    continue          # групи-чати пропускаємо, нас цікавлять канали
                found = True
                print(f"  @{username:<28} {chat.title}")
            if not found:
                print("  нічого публічного не знайдено")
            await asyncio.sleep(1)


async def check_channels(names):
    """Перевіряє, що канали зі списку існують і живі."""
    if not names:
        print("CHANNELS порожній. Спочатку: python collector_telegram.py --find")
        return

    good, bad = [], []
    async with await _client() as client:
        for name in names:
            try:
                entity = await client.get_entity(name)
                full = await client(GetFullChannelRequest(entity))
                subs = full.full_chat.participants_count

                last = await client.get_messages(entity, limit=1)
                last_date = to_iso(last[0].date) if last else 'постів немає'

                print(f"  [OK ] @{name:<26} {subs or '?':>9} підписників | останній пост {last_date}")
                good.append(name)
            except (ValueError, UsernameNotOccupiedError):
                print(f"  [НЕМА] @{name:<26} канал не знайдено")
                bad.append(name)
            except ChannelPrivateError:
                print(f"  [ЗАКР] @{name:<26} канал закритий")
                bad.append(name)
            except FloodWaitError as e:
                print(f"  Telegram просить почекати {e.seconds} с, зупиняюсь")
                break
            await asyncio.sleep(0.5)

    print(f"\nПрацюють: {len(good)}, не працюють: {len(bad)}")
    if good:
        print("\nВстав це у channels.py -> CHANNELS:\n")
        for n in good:
            print(f"    '{n}',")
    if bad:
        print(f"\nПрибери зі списку: {', '.join(bad)}")


# ---------------------------------------------------------------- самоперевірка

SELF_TEST_SAMPLES = [
    ("Водафон третій день не ловить у Львові", ['vodafone']),
    ("У Vodafone знову проблеми з інтернетом", ['vodafone']),
    ("Порівняння тарифів Київстар і lifecell на 2024 рік", ['kyivstar', 'lifecell']),
    ("Дякую водафону за чудовий звязок, четвертий день без мережі", ['vodafone']),
    ("Їду потягом Київ-Харків, зв'язку немає взагалі", []),
    ("Купив новий телефон, все працює", []),
    ("Підписуйтесь на канал", []),           # коротке — відсіється
]


def self_test(loose=False):
    """Перевіряє фільтр без Telegram. Запускай перед логіном."""
    matchers = build_matchers(loose=loose)
    ok = 0
    for text, expected in SELF_TEST_SAMPLES:
        if len(text) < MIN_TEXT_LEN:
            found = []
        else:
            found = sorted(detect_brands(text, matchers))
        passed = found == sorted(expected)
        ok += passed
        mark = 'OK ' if passed else 'ХИБА'
        shown = ', '.join(found) or '—'
        print(f"  [{mark}] {shown:<28} | {text[:55]}")
    print(f"\nПройдено {ok} з {len(SELF_TEST_SAMPLES)}")


# ---------------------------------------------------------------- CLI

def parse_date(s):
    return datetime.strptime(s, '%Y-%m-%d').replace(tzinfo=timezone.utc)


def main():
    p = argparse.ArgumentParser(description='Збір згадок з публічних Telegram-каналів')
    p.add_argument('--days', type=int, help='скільки останніх діб збирати')
    p.add_argument('--since', type=parse_date, help='початок вікна, YYYY-MM-DD')
    p.add_argument('--until', type=parse_date, help='кінець вікна, YYYY-MM-DD')
    p.add_argument('--json', default='telegram_mentions.json', help='файл для JSON-копії')
    p.add_argument('--no-db', action='store_true', help='не писати в базу')
    p.add_argument('--loose', action='store_true', help='увімкнути шумні варіанти (ВФ, лайф)')
    p.add_argument('--self-test', action='store_true', help='перевірка фільтра без Telegram')
    p.add_argument('--find', nargs='*', metavar='НАЗВА',
                   help='знайти юзернейми каналів за назвою (без аргументів — усі з channels.py)')
    p.add_argument('--check', action='store_true',
                   help='перевірити, що канали з channels.py існують і живі')
    args = p.parse_args()

    if args.self_test:
        self_test(loose=args.loose)
        return

    if args.find is not None:
        queries = args.find or (channels_cfg.SEARCH_QUERIES + channels_cfg.BLACKOUT_QUERIES)
        asyncio.run(find_channels(queries))
        return

    if args.check:
        asyncio.run(check_channels(CHANNELS))
        return

    if not args.days and not args.since:
        args.days = 1

    mentions = asyncio.run(run_collector(
        days=args.days, since=args.since, until=args.until, loose=args.loose
    ))

    print(f"\nВсього зібрано: {len(mentions)}")
    if not mentions:
        return

    save_json(mentions, args.json)          # JSON пишемо завжди — це резерв на демо
    if not args.no_db:
        save_to_db(mentions)


if __name__ == '__main__':
    main()
