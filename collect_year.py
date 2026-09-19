"""
Вигрузка історії за рік з публічних Telegram-каналів. Учасник №2.

Розрахований на довгий безперервний прогін:
  - пише в базу порціями, а не в кінці;
  - веде контрольні точки по кожному каналу (checkpoints.json),
    тому після обриву продовжує з місця зупинки, а не з нуля;
  - переживає FloodWaitError: чекає скільки просить Telegram і йде далі;
  - канали обробляються за пріоритетом, тож навіть обірваний прогін
    дає найцінніші дані.

    python collect_year.py --days 365
    python collect_year.py --days 365 --resume        # продовжити після обриву
    python collect_year.py --days 365 --only lvivtp   # один канал
"""

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from telethon import TelegramClient
from telethon.errors import (
    ChannelPrivateError,
    FloodWaitError,
    UsernameNotOccupiedError,
)

import channels as channels_cfg
import db
import keywords
from collector_telegram import MIN_TEXT_LEN, build_mentions, to_iso

SESSION_NAME = 'vodafone_monitor'
CHECKPOINTS = 'checkpoints.json'

SAVE_EVERY = 500          # згадок між записами в базу
PROGRESS_EVERY = 2000     # повідомлень між рядками прогресу
MAX_FLOOD_WAIT = 600      # довше не чекаємо, переходимо до наступного каналу


def load_env():
    """Читає .env, щоб не експортувати змінні щоразу вручну."""
    if os.path.exists('.env'):
        for line in open('.env', encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"\''))


def load_checkpoints():
    if os.path.exists(CHECKPOINTS):
        with open(CHECKPOINTS, encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_checkpoint(state, channel, **fields):
    state.setdefault(channel, {}).update(fields)
    with open(CHECKPOINTS, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=1)


def flush(buffer, json_path):
    """Скидає накопичені згадки в базу і дописує в JSON."""
    if not buffer:
        return 0
    inserted = db.save_mentions(buffer)
    with open(json_path, 'a', encoding='utf-8') as f:
        for m in buffer:
            f.write(json.dumps(m, ensure_ascii=False) + '\n')
    buffer.clear()
    return inserted


async def collect_channel(client, channel, matchers, since, until, state, json_path):
    """Один канал: від since до until, з контрольними точками."""
    done = state.get(channel, {}).get('done')
    if done:
        print(f"  {channel}: вже зібрано ({done}), пропускаю")
        return 0

    try:
        entity = await client.get_entity(channel)
    except (ValueError, UsernameNotOccupiedError):
        print(f"  [НЕМА] {channel}")
        save_checkpoint(state, channel, done='канал не знайдено')
        return 0
    except ChannelPrivateError:
        print(f"  [ЗАКР] {channel}")
        save_checkpoint(state, channel, done='канал закритий')
        return 0

    # Продовжуємо з останнього обробленого id, якщо прогін уривався.
    last_id = state.get(channel, {}).get('last_id', 0)
    buffer = []
    scanned = 0
    found = 0
    started = time.time()

    while True:
        try:
            async for msg in client.iter_messages(
                entity, offset_date=since, reverse=True, min_id=last_id,
            ):
                if msg.date > until:
                    break
                scanned += 1
                last_id = msg.id

                text = (msg.text or '').strip()
                if len(text) >= MIN_TEXT_LEN:
                    got = build_mentions(
                        text, channel, f'https://t.me/{channel}/{msg.id}',
                        to_iso(msg.date), matchers,
                    )
                    buffer.extend(got)
                    found += len(got)

                if len(buffer) >= SAVE_EVERY:
                    flush(buffer, json_path)
                    save_checkpoint(state, channel, last_id=last_id,
                                    scanned=scanned, found=found)

                if scanned % PROGRESS_EVERY == 0:
                    speed = scanned / max(time.time() - started, 1)
                    print(f"    {channel}: {scanned} постів, {found} згадок, "
                          f"{speed:.0f}/с, зараз {to_iso(msg.date)[:10]}")
            break

        except FloodWaitError as e:
            if e.seconds > MAX_FLOOD_WAIT:
                print(f"  [!] {channel}: Telegram просить {e.seconds} с — це забагато, "
                      f"переходжу далі. Продовжити можна через --resume")
                break
            print(f"  [~] {channel}: чекаю {e.seconds} с на вимогу Telegram")
            await asyncio.sleep(e.seconds + 1)
            # цикл while повторить iter_messages з оновленого last_id

    flush(buffer, json_path)
    save_checkpoint(state, channel, last_id=last_id, scanned=scanned,
                    found=found, done=f'{found} згадок з {scanned} постів')
    print(f"  {channel}: готово — {scanned} постів, {found} згадок, "
          f"{time.time() - started:.0f} с")
    return found


async def run(days, only, json_path, loose):
    load_env()
    api_id, api_hash = os.getenv('TG_API_ID'), os.getenv('TG_API_HASH')
    if not api_id or not api_hash:
        sys.exit("Немає TG_API_ID / TG_API_HASH. Впиши їх у файл .env")

    until = datetime.now(timezone.utc)
    since = until - timedelta(days=days)
    print(f"Вікно: {to_iso(since)[:10]} -> {to_iso(until)[:10]} ({days} днів)\n")

    db.init_db()
    state = load_checkpoints()
    matchers = keywords.build_brand_matchers(loose=loose)

    # Пріоритет: спершу регіональні — у них живуть локальні скарги на звʼязок,
    # і саме вони потрібні детектору. Національні дають переважно новини.
    order = (channels_cfg.REGIONAL + channels_cfg.NATIONAL +
             channels_cfg.TECH + channels_cfg.BLACKOUT_CHANNELS)
    if only:
        order = [c for c in order if c in only]

    total = 0
    async with TelegramClient(SESSION_NAME, int(api_id), api_hash) as client:
        for i, channel in enumerate(order, 1):
            print(f"[{i}/{len(order)}] {channel}")
            total += await collect_channel(
                client, channel, matchers, since, until, state, json_path)

    print(f"\nВсього згадок: {total}")
    print(f"JSON: {json_path} | база: {db.DB_PATH}")


def main():
    p = argparse.ArgumentParser(description='Вигрузка історії телеграм-каналів за рік')
    p.add_argument('--days', type=int, default=365)
    p.add_argument('--json', default='data_year.jsonl')
    p.add_argument('--only', nargs='*', help='обробити лише ці канали')
    p.add_argument('--loose', action='store_true')
    p.add_argument('--resume', action='store_true',
                   help='продовжити перерваний прогін (контрольні точки вже є)')
    p.add_argument('--restart', action='store_true',
                   help='почати з нуля: забути контрольні точки')
    args = p.parse_args()

    if args.restart and os.path.exists(CHECKPOINTS):
        os.rename(CHECKPOINTS, CHECKPOINTS + '.bak')
        print(f"Контрольні точки відкладено в {CHECKPOINTS}.bak")

    asyncio.run(run(args.days, args.only, args.json, args.loose))


if __name__ == '__main__':
    main()
