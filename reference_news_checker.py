"""
vodafone_news_checker.py
=========================

Інструмент для сортування новин про Vodafone Україна (тема: відключення світла,
зв'язок/інтернет під час блекаутів) та оцінки їхньої достовірності.

ВАЖЛИВО ПРО МЕЖІ ЦЬОГО ІНСТРУМЕНТУ:
Жоден скрипт не може зі 100% точністю сказати "це фейк, а це правда" —
це робить лише перевірка по першоджерелах. Цей інструмент автоматизує
рутинну частину фактчекінгу: збирає новини в одну таблицю і рахує
"бал довіри" (trust_score) за прозорими, перевірюваними ознаками.
Остаточне рішення все одно ухвалюєте ви, дивлячись на деталі.

Ознаки, які враховуються:
  1. Надійність джерела (офіційний сайт Vodafone/Укренерго > велике ЗМІ > невідомий канал)
  2. Крос-референс — чи підтверджують новину інші незалежні джерела
  3. Наявність прямої цитати/коментаря прес-служби Vodafone або Укренерго
  4. Мовні маркери "жовтизни" (клікбейт, надмірна емоційність, відсутність цифр/дат)
  5. Наявність перевірки фактчекерами (StopFake, VoxCheck тощо) — якщо є посилання

Як користуватись:
  1. Заповніть список NEWS_ITEMS нижче (вручну, скопіювавши дані з відкритих джерел:
     Google News, Telegram-моніторинги, сайти ЗМІ) АБО завантажте той самий формат
     з CSV/JSON файлу (див. функцію load_from_csv/load_from_json).
  2. Запустіть: python vodafone_news_checker.py
  3. Отримаєте таблицю з рейтингом news_report.csv, відсортовану за trust_score.
"""

import csv
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from difflib import SequenceMatcher
from typing import List, Optional


# ---------------------------------------------------------------------------
# 1. Довідники надійності джерел — редагуйте під свої потреби
# ---------------------------------------------------------------------------

# Офіційні джерела — найвищий рівень довіри
OFFICIAL_SOURCES = {
    "vodafone.ua",
    "ukrenergo.energy",
    "mtu.gov.ua",          # Мінцифри
    "president.gov.ua",
}

# Великі, редакційно відповідальні ЗМІ (перевіряють факти, мають редакцію)
REPUTABLE_MEDIA = {
    "suspilne.media",
    "interfax.com.ua",
    "ukrinform.net",
    "nv.ua",
    "liga.net",
    "pravda.com.ua",
    "tsn.ua",
    "fakty.com.ua",
    "glavcom.ua",
    "forbes.ua",
    "epravda.com.ua",
}

# Фактчекінгові ресурси — якщо новина фігурує тут, це сильний сигнал
FACTCHECK_SOURCES = {
    "stopfake.org",
    "voxcheck.org",
    "texty.org.ua",
}

# Домени/типи джерел, які традиційно дають більше маніпулятивних чи неперевірених новин
LOW_TRUST_MARKERS = {
    "telegram",       # анонімні тг-канали
    "невідомий канал",
    "анонімне джерело",
}

CLICKBAIT_PATTERNS = [
    r"\bШОК\b", r"\bсенсац", r"\bтерміново\b!+", r"\bне вір(иш|ите)\b",
    r"\b(зникне|скасовано) назавжди\b", r"!!!+", r"\bексклюзив(?!но)\b",
]


@dataclass
class NewsItem:
    title: str
    source_domain: str          # напр. "nv.ua", "t.me/somechannel", "vodafone.ua"
    url: str
    date: str                   # формат "YYYY-MM-DD"
    text: str                   # текст або короткий опис новини
    has_official_quote: bool = False   # чи є цитата Vodafone/Укренерго
    verified_by_factcheck: Optional[str] = None  # None / "confirmed" / "debunked"

    # обчислювані поля
    trust_score: float = field(default=0.0, init=False)
    verdict: str = field(default="", init=False)
    flags: List[str] = field(default_factory=list, init=False)
    corroborated_by: List[str] = field(default_factory=list, init=False)


# ---------------------------------------------------------------------------
# 2. ВХІДНІ ДАНІ — CSV-файл, який ви завантажуєте з відкритих джерел
# ---------------------------------------------------------------------------
#
# Створіть файл news.csv (або будь-яку іншу назву й передайте її як аргумент:
#   python vodafone_news_checker.py моя_підбірка.csv
# ) з такими колонками (заголовок рядка — рівно ці назви):
#
#   title                  — заголовок новини
#   source_domain          — домен джерела, напр. nv.ua, vodafone.ua, t.me/канал
#   url                    — посилання на новину
#   date                   — дата у форматі YYYY-MM-DD
#   text                   — текст новини або її суть (2-5 речень достатньо)
#   has_official_quote     — так/ні (чи є пряма цитата Vodafone/Укренерго)
#   verified_by_factcheck  — залиште порожнім, або "confirmed"/"debunked",
#                            якщо новину вже перевіряв stopfake.org/voxcheck.org
#
# Приклад рядків дивіться у news_example.csv поруч зі скриптом.
DEFAULT_CSV_PATH = "news.csv"


# ---------------------------------------------------------------------------
# 3. Логіка оцінки
# ---------------------------------------------------------------------------

def source_tier_score(domain: str) -> float:
    domain = domain.lower()
    if any(d in domain for d in OFFICIAL_SOURCES):
        return 40.0
    if any(d in domain for d in REPUTABLE_MEDIA):
        return 25.0
    if "t.me" in domain or "telegram" in domain:
        return 5.0
    return 12.0  # невідомий, але не обов'язково анонімний сайт


def clickbait_penalty(text: str, title: str) -> float:
    combined = f"{title} {text}"
    hits = sum(1 for pat in CLICKBAIT_PATTERNS if re.search(pat, combined, re.IGNORECASE))
    return -8.0 * hits


def specificity_bonus(text: str) -> float:
    """Наявність конкретних цифр/дат/назв підвищує довіру (ознака перевіреного матеріалу)."""
    has_number = bool(re.search(r"\d", text))
    has_date_word = bool(re.search(r"(вересня|жовтня|годин|області|МВт|%)", text, re.IGNORECASE))
    return (5.0 if has_number else 0.0) + (5.0 if has_date_word else 0.0)


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def find_corroboration(item: NewsItem, all_items: List[NewsItem], threshold: float = 0.45) -> List[str]:
    """Шукає інші новини зі схожим заголовком/текстом — це і є 'крос-референс'."""
    matches = []
    for other in all_items:
        if other is item:
            continue
        sim = max(similarity(item.title, other.title), similarity(item.text, other.text))
        if sim >= threshold:
            matches.append(other.source_domain)
    return matches


def evaluate(item: NewsItem, all_items: List[NewsItem]) -> None:
    score = 0.0
    flags = []

    score += source_tier_score(item.source_domain)

    if item.has_official_quote:
        score += 20.0
    else:
        flags.append("Немає прямої цитати Vodafone/Укренерго")

    cb_penalty = clickbait_penalty(item.text, item.title)
    if cb_penalty < 0:
        flags.append("Клікбейтна/маніпулятивна мова")
    score += cb_penalty

    score += specificity_bonus(item.text)

    corroborated_by = find_corroboration(item, all_items)
    item.corroborated_by = corroborated_by
    if len(corroborated_by) >= 2:
        score += 20.0
    elif len(corroborated_by) == 1:
        score += 8.0
    else:
        flags.append("Жодне інше джерело новину не підтверджує")

    if item.verified_by_factcheck == "confirmed":
        score += 30.0
    elif item.verified_by_factcheck == "debunked":
        score -= 60.0
        flags.append("Спростовано фактчекерами")

    item.trust_score = round(score, 1)
    item.flags = flags

    if score >= 55:
        item.verdict = "Ймовірно достовірна"
    elif score >= 30:
        item.verdict = "Потребує додаткової перевірки"
    else:
        item.verdict = "Висока ймовірність фейку/маніпуляції"


# ---------------------------------------------------------------------------
# 4. Завантаження з файлів (опційно, замість ручного списку вище)
# ---------------------------------------------------------------------------

def load_from_csv(path: str) -> List[NewsItem]:
    items = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            items.append(NewsItem(
                title=row["title"],
                source_domain=row["source_domain"],
                url=row.get("url", ""),
                date=row.get("date", ""),
                text=row.get("text", ""),
                has_official_quote=row.get("has_official_quote", "").lower() in ("1", "true", "так"),
                verified_by_factcheck=row.get("verified_by_factcheck") or None,
            ))
    return items


def load_from_json(path: str) -> List[NewsItem]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return [NewsItem(**entry) for entry in raw]


# ---------------------------------------------------------------------------
# 5. Запуск і збереження звіту
# ---------------------------------------------------------------------------

def run(items: List[NewsItem], out_path: str = "news_report.csv") -> None:
    for item in items:
        evaluate(item, items)

    items_sorted = sorted(items, key=lambda i: i.trust_score, reverse=True)

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["trust_score", "verdict", "date", "source_domain", "title",
                          "corroborated_by", "flags", "url"])
        for i in items_sorted:
            writer.writerow([
                i.trust_score, i.verdict, i.date, i.source_domain, i.title,
                "; ".join(i.corroborated_by), "; ".join(i.flags), i.url,
            ])

    print(f"Готово. Результат збережено у {out_path}\n")
    for i in items_sorted:
        print(f"[{i.trust_score:5.1f}] {i.verdict:35s} | {i.source_domain:20s} | {i.title}")
        if i.flags:
            print(f"          ⚠ {', '.join(i.flags)}")


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV_PATH

    if not os.path.exists(csv_path):
        print(f"Не знайдено файл '{csv_path}'.")
        print("Створіть CSV з колонками: title, source_domain, url, date, text, "
              "has_official_quote, verified_by_factcheck")
        print("(структура і приклад описані у коментарях на початку скрипта "
              "та у news_example.csv)")
        sys.exit(1)

    items = load_from_csv(csv_path)
    if not items:
        print(f"Файл '{csv_path}' порожній або не містить рядків з даними.")
        sys.exit(1)

    run(items)
