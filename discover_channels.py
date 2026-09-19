"""
Масовий підбір регіональних каналів. Учасник №2.

Українські регіональні канали називаються за кількома повторюваними
шаблонами. Скрипт перебирає їх по всіх обласних центрах і перевіряє,
які юзернейми реально існують — через публічне превʼю, без API-ключів.

    python discover_channels.py            # перевірити кандидатів
    python discover_channels.py --days 7   # лише канали зі свіжими постами
"""

import argparse
import time
from datetime import datetime, timedelta, timezone

from collector_telegram_web import fetch_page, parse_posts
from collector_telegram import to_iso

# Обласні центри плюс великі міста. Латинська транслітерація така,
# як її зазвичай пишуть у юзернеймах.
CITIES = [
    'kyiv', 'lviv', 'kharkiv', 'odesa', 'odessa', 'dnipro', 'dnepr',
    'zaporizhzhia', 'zp', 'vinnytsia', 'vinnica', 'poltava', 'chernihiv',
    'cherkasy', 'sumy', 'zhytomyr', 'rivne', 'lutsk', 'ternopil',
    'ivanofrankivsk', 'frankivsk', 'uzhgorod', 'uzhhorod', 'chernivtsi',
    'khmelnytskyi', 'mykolaiv', 'nikolaev', 'kherson', 'kropyvnytskyi',
    'kryvyirih', 'krivoyrog', 'mariupol',
]

# Шаблони юзернеймів. {c} — місто.
TEMPLATES = [
    'truexa{c}',
    '{c}truexa',
    'truxa{c}',
    'typical{c}',
    '{c}_news',
    'news_{c}',
    'novyny_{c}',
    '{c}_info',
    'info_{c}',
    '{c}operativ',
    '{c}_online',
]

SLEEP = 0.35


def candidates():
    seen = set()
    for city in CITIES:
        for tpl in TEMPLATES:
            name = tpl.format(c=city)
            if name not in seen:
                seen.add(name)
                yield name


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--days', type=int, default=30,
                   help='канал вважається живим, якщо постив за стільки днів')
    args = p.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    live, dead, stale = [], 0, 0

    names = list(candidates())
    print(f"Перевіряю {len(names)} кандидатів...\n")

    for name in names:
        try:
            html = fetch_page(name)
        except Exception:
            dead += 1
            continue
        if html is None:
            dead += 1
            continue

        posts = parse_posts(html, name)
        if not posts:
            dead += 1
            continue

        last = max(p['published'] for p in posts)
        if last < cutoff:
            stale += 1
            continue

        print(f"  [OK ] {name:<26} останній пост {to_iso(last)}")
        live.append(name)
        time.sleep(SLEEP)

    print(f"\nЖивих: {len(live)} | застарілих: {stale} | не існує: {dead}")
    if live:
        print("\nДля channels.py:\n")
        for n in live:
            print(f"    '{n}',")


if __name__ == '__main__':
    main()
