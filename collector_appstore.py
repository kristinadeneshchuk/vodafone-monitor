"""
Відгуки про застосунки операторів з App Store. Учасник №2.

Публічний RSS Apple, без ключів і авторизації.
Максимум 10 сторінок по 50 відгуків = до 500 найсвіжіших на застосунок.

Чому це джерело цінне саме для покриття:
  - люди пишуть конкретно: "в Ужгороді не ловить", "в метро інтернету нема";
  - є зірки 1-5 — це готова людська розмітка тональності.
    №4 може виміряти точність своєї моделі без ручної розмітки:
    1-2 зірки ~ негатив, 4-5 ~ позитив.

Імена авторів НЕ зберігаються.

    python collector_appstore.py --pages 10 --no-db
"""

import argparse
import time
from datetime import datetime, timezone

import requests

from collector_telegram import save_json, save_to_db, to_iso

RSS = ('https://itunes.apple.com/ua/rss/customerreviews/'
       'page={page}/id={app_id}/sortby=mostrecent/json')

APPS = {
    'vodafone': 1178894933,    # My Vodafone UA
    'kyivstar': 771788824,     # Мій Київстар
    'lifecell': 580080545,     # My lifecell
}

MAX_PAGES = 10          # обмеження Apple, більше не віддає
SLEEP = 0.5


def collect_app(brand, app_id, pages):
    mentions = []
    for page in range(1, pages + 1):
        url = RSS.format(page=page, app_id=app_id)
        try:
            r = requests.get(url, timeout=25)
            r.raise_for_status()
            entries = r.json().get('feed', {}).get('entry', [])
        except Exception as e:
            print(f"  [!] {brand} стор.{page}: {e}")
            break

        if not entries:
            break

        for e in entries:
            # 'author' навмисно не читаємо — це персональні дані
            title = e.get('title', {}).get('label', '')
            content = e.get('content', {}).get('label', '')
            text = f"{title}. {content}".strip('. ')
            if not text:
                continue

            published = datetime.fromisoformat(e['updated']['label'])
            review_id = e.get('id', {}).get('label', '')

            mentions.append({
                'source_type': 'review',
                'source_name': 'app_store',
                'url': f'appstore_{app_id}_{review_id}',
                'published_at': to_iso(published),
                'text': text,
                'brand_query': brand,
                # зірки в базу не йдуть, але лишаються в JSON:
                # це готова розмітка тональності для перевірки моделі №4
                'rating': int(e.get('im:rating', {}).get('label', 0)),
            })

        time.sleep(SLEEP)

    print(f"  {brand}: {len(mentions)} відгуків")
    return mentions


def main():
    p = argparse.ArgumentParser(description='Відгуки App Store про застосунки операторів')
    p.add_argument('--pages', type=int, default=MAX_PAGES)
    p.add_argument('--json', default='appstore_mentions.json')
    p.add_argument('--no-db', action='store_true')
    args = p.parse_args()

    all_mentions = []
    for brand, app_id in APPS.items():
        all_mentions.extend(collect_app(brand, app_id, min(args.pages, MAX_PAGES)))

    print(f"\nВсього: {len(all_mentions)}")
    if not all_mentions:
        return

    by_rating = {}
    for m in all_mentions:
        by_rating[m['rating']] = by_rating.get(m['rating'], 0) + 1
    print("Розподіл зірок:", dict(sorted(by_rating.items())))

    save_json(all_mentions, args.json)
    if not args.no_db:
        save_to_db(all_mentions)


if __name__ == '__main__':
    main()
