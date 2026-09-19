"""
Збір згадок з публічних Telegram-каналів через веб-превʼю (t.me/s/<канал>).

Учасник №2. Запасний шлях на випадок, коли my.telegram.org не видає API-ключі.
Працює БЕЗ логіну, без api_id і без сесії.

Обмеження проти Telethon:
  - лише канали з увімкненим публічним превʼю (більшість новинних — з ним);
  - одна сторінка = ~20 постів, історія гортається повільніше;
  - немає кількості підписників і реакцій.
Формат даних той самий, тому для №3, №4 і №5 різниці немає.

Запуск:
    python collector_telegram_web.py --check                 # які канали доступні
    python collector_telegram_web.py --days 2 --no-db        # свіже, у JSON
    python collector_telegram_web.py --since 2023-12-12 --until 2023-12-15
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup

import channels as channels_cfg
from collector_telegram import (
    MIN_TEXT_LEN,
    build_matchers,
    detect_brands,
    save_json,
    save_to_db,
    to_iso,
)

BASE = 'https://t.me/s/{channel}'
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; VodafoneMonitor/1.0)'}

MAX_PAGES = 60          # запобіжник: ~1200 постів на канал
SLEEP_BETWEEN_PAGES = 0.7
REQUEST_TIMEOUT = 20


def fetch_page(channel, before=None):
    url = BASE.format(channel=channel)
    params = {'before': before} if before else None
    r = requests.get(url, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    if r.status_code == 302 or r.history:
        return None          # превʼю вимкнене, нас перекинуло на сторінку-заглушку
    r.raise_for_status()
    return r.text


def parse_posts(html, channel):
    """Витягує з HTML пости: id, час, текст. Дані про авторів не читаємо."""
    soup = BeautifulSoup(html, 'lxml')
    posts = []

    for node in soup.select('div.tgme_widget_message'):
        data_post = node.get('data-post', '')        # вигляду "channel/12345"
        if '/' not in data_post:
            continue
        try:
            msg_id = int(data_post.rsplit('/', 1)[1])
        except ValueError:
            continue

        time_node = node.select_one('time[datetime]')
        if not time_node:
            continue
        published = datetime.fromisoformat(time_node['datetime'])

        text_node = node.select_one('div.tgme_widget_message_text')
        text = text_node.get_text('\n', strip=True) if text_node else ''

        posts.append({'id': msg_id, 'published': published, 'text': text})

    posts.sort(key=lambda p: p['id'])
    return posts


def collect_channel(channel, matchers, since, until):
    """Гортає канал назад у часі, доки не вийде за межі вікна."""
    mentions = []
    scanned = 0
    before = None
    seen_ids = set()

    for _ in range(MAX_PAGES):
        try:
            html = fetch_page(channel, before)
        except requests.RequestException as e:
            print(f"  [!] {channel}: помилка запиту ({e})")
            break

        if html is None:
            print(f"  [НЕМА] {channel}: публічне превʼю вимкнене")
            return []

        posts = parse_posts(html, channel)
        new_posts = [p for p in posts if p['id'] not in seen_ids]
        if not new_posts:
            break
        seen_ids.update(p['id'] for p in new_posts)

        for p in new_posts:
            scanned += 1
            if not (since <= p['published'] <= until):
                continue
            text = p['text'].strip()
            if len(text) < MIN_TEXT_LEN:
                continue

            for brand in detect_brands(text, matchers):
                mentions.append({
                    'source_type': 'telegram',
                    'source_name': channel,
                    'url': f'https://t.me/{channel}/{p["id"]}',
                    'published_at': to_iso(p['published']),
                    'text': text,
                    'brand_query': brand,
                })

        # Найстаріший пост сторінки вже раніший за вікно — далі гортати нема сенсу.
        oldest = min(p['published'] for p in new_posts)
        if oldest < since:
            break

        before = min(p['id'] for p in new_posts)
        time.sleep(SLEEP_BETWEEN_PAGES)

    print(f"  {channel}: переглянуто {scanned}, згадок {len(mentions)}")
    return mentions


def check_channels(names):
    """Які канали віддають публічне превʼю."""
    if not names:
        print("CHANNELS порожній — впиши канали в channels.py")
        return
    good = []
    for name in names:
        try:
            html = fetch_page(name)
        except requests.RequestException as e:
            print(f"  [ПОМИЛКА] {name}: {e}")
            continue
        if html is None:
            print(f"  [НЕМА] {name}: превʼю вимкнене або канал не існує")
            continue
        posts = parse_posts(html, name)
        if not posts:
            print(f"  [ПУСТО] {name}: постів не видно")
            continue
        last = max(p['published'] for p in posts)
        print(f"  [OK ] {name:<24} постів на сторінці {len(posts):>3} | останній {to_iso(last)}")
        good.append(name)
        time.sleep(0.4)

    print(f"\nДоступні: {len(good)} з {len(names)}")
    if good:
        print("\nДля channels.py -> CHANNELS:\n")
        for n in good:
            print(f"    '{n}',")


def parse_date(s):
    return datetime.strptime(s, '%Y-%m-%d').replace(tzinfo=timezone.utc)


def main():
    p = argparse.ArgumentParser(description='Збір з публічних Telegram-каналів без API-ключів')
    p.add_argument('--days', type=int)
    p.add_argument('--since', type=parse_date)
    p.add_argument('--until', type=parse_date)
    p.add_argument('--json', default='telegram_mentions.json')
    p.add_argument('--no-db', action='store_true')
    p.add_argument('--loose', action='store_true')
    p.add_argument('--check', action='store_true', help='перевірити доступність каналів')
    p.add_argument('--channels', nargs='*', help='перекрити список каналів вручну')
    args = p.parse_args()

    names = args.channels if args.channels else channels_cfg.CHANNELS

    if args.check:
        check_channels(names)
        return

    if not names:
        sys.exit("CHANNELS порожній. Спочатку: python collector_telegram_web.py --check --channels ім_я_каналу")

    now = datetime.now(timezone.utc)
    since = args.since or (now - timedelta(days=args.days or 1))
    until = args.until or now
    print(f"Вікно: {to_iso(since)} -> {to_iso(until)}")

    matchers = build_matchers(loose=args.loose)
    all_mentions = []
    for name in names:
        all_mentions.extend(collect_channel(name, matchers, since, until))

    print(f"\nВсього зібрано: {len(all_mentions)}")
    if not all_mentions:
        return
    save_json(all_mentions, args.json)
    if not args.no_db:
        save_to_db(all_mentions)


if __name__ == '__main__':
    main()
