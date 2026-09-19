<<<<<<< HEAD
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
=======
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
>>>>>>> fee986cf7489e67c02e4b01df97cb65bf76737cc
