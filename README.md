# Vodafone Reputation & Crisis Intelligence

Моніторинг згадок про Vodafone та конкурентів, з детекцією сплесків скарг по локаціях.

## Швидкий старт

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Telegram потребує ключів з [my.telegram.org](https://my.telegram.org) → API development tools:

```bash
cp .env.example .env     # заповни своїми значеннями
export TG_API_ID=...
export TG_API_HASH=...
```

Перевірити фільтр брендів без Telegram (працює одразу, без логіну):

```bash
python collector_telegram.py --self-test
```

Зібрати дані:

```bash
python collector_telegram.py --days 2                            # свіжі пости
python collector_telegram.py --since 2023-12-12 --until 2023-12-15  # історія під бектест
python collector_news.py                                          # RSS + Google Play
python run_pipeline.py                                            # весь ланцюжок
```

## Модулі

| Файл | Хто | Що робить |
|---|---|---|
| `db.py` | №3 | Схема SQLite, `save_mentions()`, `get_unanalyzed()` |
| `collector_telegram.py` | №2 | Публічні Telegram-канали |
| `collector_news.py` | №3 | Google News RSS + відгуки Google Play |
| `analyzer.py` | №4 | LLM-аналіз: тональність, причина, локація |
| `detector.py` | №5 | Детекція сплесків, алерти |
| `dashboard.py` | №6 | Streamlit-дашборд і бриф |
| `run_pipeline.py` | №3 | Запускає все по черзі |

Модулі спілкуються **тільки через базу**. Жоден не імпортує інший напряму,
крім `db`. Тому зламаний збирач не валить дашборд.

## Контракт даних

`mentions` — пишуть №2 і №3:

| Поле | Значення |
|---|---|
| `source_type` | `telegram` \| `news` \| `review` |
| `source_name` | назва каналу / сайту / `google_play` |
| `url` | посилання на пост (порожній рядок, якщо немає) |
| `published_at` | ISO 8601 UTC: `2026-09-19T14:05:00+00:00` |
| `text` | текст згадки |
| `brand_query` | `vodafone` \| `kyivstar` \| `lifecell` |

`id`, `collected_at` і `text_hash` база проставляє сама.

**Полів про авторів немає.** Збираємо зміст і динаміку, не людей.

## Приватність

- З Telegram беремо тільки пости публічних каналів: текст, час, посилання.
- Імена, юзернейми, ID і телефони не зберігаються і не потрапляють в аналіз.
- Коментарі під постами (де є приватні автори) не читаємо.
- Файл `*.session` — це доступ до акаунта. Він у `.gitignore`, не комітити.
