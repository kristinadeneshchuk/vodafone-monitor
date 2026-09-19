import feedparser
from google_play_scraper import reviews, Sort
from datetime import datetime, timezone
import time
from email.utils import parsedate_to_datetime
import db
import urllib.parse  # <--- Додано цей рядок

PLAY_STORE_APPS = {
    'vodafone': 'ua.vodafone.myvodafone',
    'kyivstar': 'com.kyivstar.mykyivstar',
    'lifecell': 'com.lifecell.my'
}

def parse_rss_date(date_string):
    try:
        dt = parsedate_to_datetime(date_string)
        return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')
    except Exception:
        return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')
def collect_google_news(brand_query, display_brand):
    mentions = []
    # Кодуємо пробіли та кирилицю у формат, зрозумілий для URL
    encoded_query = urllib.parse.quote(display_brand)
    rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=uk&gl=UA&ceid=UA:uk"
    feed = feedparser.parse(rss_url)
    
    for entry in feed.entries:
        mentions.append({
            'source_type': 'news',
            'source_name': 'google_news',
            'url': entry.link,
            'published_at': parse_rss_date(entry.published),
            'text': f"{entry.title}. {entry.description}",
            'brand_query': brand_query
        })
    return mentions

def collect_play_reviews(brand_query, app_id, count=50):
    mentions = []
    try:
        result, _ = reviews(app_id, lang='uk', country='ua', sort=Sort.NEWEST, count=count)
        for rev in result:
            mentions.append({
                'source_type': 'review',
                'source_name': 'google_play',
                'url': f"play_store_{app_id}_{rev['reviewId']}", 
                'published_at': rev['at'].astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00'),
                'text': rev['content'],
                'brand_query': brand_query
            })
    except Exception as e:
        print(f"Помилка збору відгуків {brand_query}: {e}")
    return mentions

def run_collectors():
    all_mentions = []
    
    for brand, app_id in PLAY_STORE_APPS.items():
        all_mentions.extend(collect_play_reviews(brand, app_id, count=1000))
        
    brands = {
    'vodafone': 'Vodafone OR Водафон', 
    'kyivstar': 'Київстар OR Киевстар OR Kyivstar', 
    'lifecell': 'lifecell OR лайфселл OR лайф'
}
    for brand_query, display_brand in brands.items():
        all_mentions.extend(collect_google_news(brand_query, display_brand))
        time.sleep(1) 
        
    db.save_mentions(all_mentions)

if __name__ == "__main__":
    run_collectors()