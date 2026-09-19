import sqlite3
import hashlib
from datetime import datetime, timezone, timedelta
import random

DB_PATH = 'mentions.db'

def get_iso_now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS mentions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_type TEXT NOT NULL,
                source_name TEXT NOT NULL,
                url TEXT,
                published_at TEXT NOT NULL,
                text TEXT NOT NULL,
                brand_query TEXT NOT NULL,
                text_hash TEXT UNIQUE NOT NULL,
                collected_at TEXT NOT NULL
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS analysis (
                mention_id INTEGER PRIMARY KEY,
                sentiment TEXT NOT NULL,
                category TEXT NOT NULL,
                city TEXT,
                llm_raw TEXT,
                FOREIGN KEY(mention_id) REFERENCES mentions(id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trigger_time TEXT NOT NULL,
                description TEXT NOT NULL,
                severity TEXT NOT NULL
            )
        ''')
        conn.commit()

def generate_text_hash(mention):
    """
    Хеш для відсіювання ДУБЛІКАТІВ ЗБОРУ, а не однакових скарг.

    Раніше хеш рахувався тільки з тексту і мав UNIQUE. Наслідок: якщо
    20 людей у різних каналах напишуть "нема інтернету", у базу потрапляла
    одна згадка, сплеску не виникало і детектор нічого не бачив.

    Тепер у ключ входять джерело й URL. Повторний збір того самого поста
    так само відсікається, а однакові скарги від різних людей зберігаються —
    саме вони і є сигналом.
    """
    key = '|'.join([
        mention['source_type'],
        mention['source_name'],
        mention.get('url', '') or '',
        mention['text'].strip().lower(),
    ])
    return hashlib.sha256(key.encode('utf-8')).hexdigest()

def save_mentions(mentions_list):
    inserted_count = 0
    collected_at = get_iso_now()
    
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        for m in mentions_list:
            text_hash = generate_text_hash(m)
            try:
                cursor.execute('''
                    INSERT INTO mentions (source_type, source_name, url, published_at, text, brand_query, text_hash, collected_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (m['source_type'], m['source_name'], m.get('url', ''), m['published_at'], m['text'], m['brand_query'], text_hash, collected_at))
                inserted_count += 1
            except sqlite3.IntegrityError:
                continue
        conn.commit()
    return inserted_count

def get_unanalyzed():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM mentions WHERE id NOT IN (SELECT mention_id FROM analysis)')
        return [dict(row) for row in cursor.fetchall()]

def seed_fake_data():
    init_db()
    fake_mentions = []
    base_time = datetime.now(timezone.utc)
    
    # Відгуки (review)
    for i in range(8):
        fake_mentions.append({
            'source_type': 'review', 'source_name': 'google_play', 'url': '',
            'text': random.choice(['Немає мережі в центрі!', 'Інтернет ледве повзає', 'Знову відвалився 4G']),
            'published_at': (base_time - timedelta(minutes=i*15)).strftime('%Y-%m-%dT%H:%M:%S+00:00'),
            'brand_query': 'vodafone'
        })
        
    # Новини (news)
    news_samples = [
        ("Vodafone звітує про розширення покриття", "news_1", "vodafone"),
        ("Київстар оновлює тарифи для бізнесу", "news_2", "kyivstar"),
        ("lifecell додав нову послугу в застосунок", "news_3", "lifecell")
    ]
    for text, url, brand in news_samples:
        fake_mentions.append({
            'source_type': 'news', 'source_name': 'Google News', 'url': url,
            'text': text, 
            'published_at': (base_time - timedelta(hours=random.randint(1, 48))).strftime('%Y-%m-%dT%H:%M:%S+00:00'),
            'brand_query': brand
        })
        
    save_mentions(fake_mentions)
    
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, text FROM mentions WHERE id NOT IN (SELECT mention_id FROM analysis)")
        for m_id, text in cursor.fetchall():
            sentiment = 'negative' if 'мережі' in text or 'повзає' in text else 'neutral'
            cursor.execute('''
                INSERT INTO analysis (mention_id, sentiment, category, city, llm_raw)
                VALUES (?, ?, ?, ?, ?)
            ''', (m_id, sentiment, 'network_issue' if sentiment == 'negative' else 'news', 'Poltava' if sentiment == 'negative' else None, '{}'))
        conn.commit()

if __name__ == "__main__":
    seed_fake_data()