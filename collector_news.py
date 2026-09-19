"""
Новини та відгуки Google Play. Роль №3, доопрацьовано №2.

Дві виправлені помилки:

1. feedparser.parse(url) повертав НУЛЬ новин — Google блокує його запит.
   Той самий URL через requests з User-Agent віддає 100 записів.
   Тобто раніше новини в базу не потрапляли взагалі.

2. Кирилиця в URL не кодувалась.

Плюс глибина: Google News віддає максимум ~100 записів на запит, тому
за рік ходимо ПОМІСЯЧНО через after:/before:. Google Play гортається
посторінково через continuation_token.

    python collector_news.py --months 12
    python collector_news.py --months 12 --no-db
"""

import argparse
import re
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests
from google_play_scraper import Sort, reviews

import db
import keywords

_TAG = re.compile(r'<[^>]+>')
_ENT = re.compile(r'&(nbsp|amp|quot|#39|lt|gt);')


def clean_html(text):
    """Google News віддає опис із HTML-розміткою. Теги псують аналіз:
    у ознаки потрапляють href і назви доменів замість змісту новини."""
    return ' '.join(_ENT.sub(' ', _TAG.sub(' ', text or '')).split())


HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}

PLAY_STORE_APPS = {
    'vodafone': 'ua.vodafone.myvodafone',
    'kyivstar': 'com.kyivstar.mykyivstar',
    'lifecell': 'com.life.my',   # правильний id, com.lifecell.my не існує
}

# Варіанти назв через OR: одним запитом ловимо латиницю й кирилицю.
BRAND_QUERIES = {
    'vodafone': 'Vodafone OR Водафон OR "ВФ Україна"',
    'kyivstar': 'Київстар OR Киевстар OR Kyivstar',
    'lifecell': 'lifecell OR лайфселл OR "лайф селл"',
}

# Запити без назви бренду: ловлять тему покриття загалом.
# Зберігаються з brand_query = 'unknown'.
TOPIC_QUERIES = [
    'мобільний зв\'язок покриття Україна',
    'не працює мобільний інтернет Україна',
    'збій зв\'язку оператор Україна',
    'базові станції відключення світла зв\'язок',
]


def fetch_feed(query):
    """Google News RSS. Обовʼязково через requests: feedparser сам отримує 0."""
    url = ('https://news.google.com/rss/search?q='
           f'{urllib.parse.quote(query)}&hl=uk&gl=UA&ceid=UA:uk')
    try:
        r = requests.get(url, headers=HEADERS, timeout=25)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"    [!] {e}")
        return []
    return feedparser.parse(r.content).entries


def parse_rss_date(date_string):
    try:
        dt = parsedate_to_datetime(date_string)
        return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')
    except Exception:
        return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')


def month_windows(months):
    """Пари (початок, кінець) по місяцях назад від сьогодні."""
    end = datetime.now(timezone.utc).date()
    for _ in range(months):
        start = (end.replace(day=1) - timedelta(days=1)).replace(day=1)
        yield start.isoformat(), end.isoformat()
        end = start


def collect_news(months):
    """Новини за N місяців: помісячно, бо на один запит Google дає ~100."""
    mentions = []
    windows = list(month_windows(months))

    targets = [(b, q) for b, q in BRAND_QUERIES.items()]
    targets += [('unknown', q) for q in TOPIC_QUERIES]

    for brand, base_query in targets:
        got = 0
        for since, until in windows:
            query = f'{base_query} after:{since} before:{until}'
            for e in fetch_feed(query):
                mentions.append({
                    'source_type': 'news',
                    'source_name': 'google_news',
                    'url': e.link,
                    'published_at': parse_rss_date(e.get('published', '')),
                    'text': clean_html(f"{e.title}. {e.get('description', '')}"),
                    'brand_query': brand,
                })
                got += 1
            time.sleep(0.6)
        print(f"  новини {brand}: {got} за {months} міс.")
    return mentions


def collect_play_reviews(brand, app_id, target_days):
    """
    Відгуки Google Play. Стандартний виклик дає ~10 днів,
    тому гортаємо через continuation_token до потрібної глибини.
    """
    cutoff = datetime.now() - timedelta(days=target_days)
    mentions = []
    token = None
    pages = 0

    while True:
        try:
            batch, token = reviews(
                app_id, lang='uk', country='ua', sort=Sort.NEWEST,
                count=200, continuation_token=token,
            )
        except Exception as e:
            print(f"    [!] {brand}: {e}")
            break

        if not batch:
            break
        pages += 1

        for rev in batch:
            mentions.append({
                'source_type': 'review',
                'source_name': 'google_play',
                'url': f"play_store_{app_id}_{rev['reviewId']}",
                'published_at': rev['at'].astimezone(timezone.utc)
                                    .strftime('%Y-%m-%dT%H:%M:%S+00:00'),
                'text': rev['content'] or '',
                'brand_query': brand,
                'rating': rev.get('score'),
            })

        oldest = batch[-1]['at']
        if oldest < cutoff or token is None:
            break
        if pages % 10 == 0:
            print(f"    {brand}: {len(mentions)} відгуків, дійшли до {oldest.date()}")
        time.sleep(0.4)

    print(f"  Google Play {brand}: {len(mentions)} відгуків")
    return mentions


def run_collectors(months=12, no_db=False):
    all_mentions = []

    print("Google Play:")
    for brand, app_id in PLAY_STORE_APPS.items():
        all_mentions.extend(collect_play_reviews(brand, app_id, months * 30))

    print("Google News:")
    all_mentions.extend(collect_news(months))

    print(f"\nВсього: {len(all_mentions)}")
    if not no_db and all_mentions:
        db.init_db()
        print(f"База: додано {db.save_mentions(all_mentions)} нових")
    return all_mentions


def main():
    p = argparse.ArgumentParser(description='Новини та відгуки Google Play')
    p.add_argument('--months', type=int, default=12)
    p.add_argument('--no-db', action='store_true')
    p.add_argument('--json', default='data_news.json')
    args = p.parse_args()

    mentions = run_collectors(args.months, args.no_db)
    if mentions:
        import json
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(mentions, f, ensure_ascii=False, indent=1)
        print(f"JSON: {args.json}")


if __name__ == '__main__':
    main()
