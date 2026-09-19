"""
Повний цикл: збір -> аналіз -> детекція -> дашборд. Одна команда.

    python run_pipeline.py                 # свіже вікно, 1 день
    python run_pipeline.py --days 7        # добрати тиждень
    python run_pipeline.py --skip-collect  # тільки переаналізувати наявне

Навіщо окремий файл. Кожен крок працює й сам по собі, але на пітчі
питають не "чи є збирач", а "з якою затримкою ви побачите кризу".
Відповідь на це — виміряний час цього циклу, який друкується в кінці.
Тому кроки не просто викликаються, а хронометруються.

Затримка складається з двох частин:
  1. час циклу — скільки триває прохід від джерел до дашборда;
  2. період запуску — як часто цикл стартує.
Друге планувальником поки НЕ автоматизоване: цикл запускається руками
або зовнішнім cron. Казати "перевірка кожні 10 хвилин" можна лише
після того, як cron справді поставлено — інакше це намір, а не факт.
"""

import argparse
import time
from datetime import datetime, timedelta, timezone

import db


def _timed(label, fn):
    """Виконує крок, друкує його тривалість, повертає (результат, секунди)."""
    print(f"\n=== {label} ===")
    t0 = time.time()
    result = fn()
    dt = time.time() - t0
    print(f"--- {label}: {dt:.1f} с")
    return result, dt


def step_collect(days):
    """Телеграм, новини та відгуки за останні `days` днів."""
    import channels as channels_cfg
    import collector_news
    import collector_telegram_web as tg

    until = datetime.now(timezone.utc)
    since = until - timedelta(days=days)

    matchers = tg.build_matchers()
    mentions = []
    for name in channels_cfg.CHANNELS:
        try:
            mentions.extend(tg.collect_channel(name, matchers, since, until))
        except Exception as e:                      # один канал не валить цикл
            print(f"  [!] {name}: {e}")

    db.init_db()
    added_tg = db.save_mentions(mentions) if mentions else 0
    print(f"Телеграм: {len(mentions)} згадок, нових у базі {added_tg}")

    # Новини й відгуки магазинів ідуть місяцями, не днями.
    news = collector_news.run_collectors(months=max(1, days // 30))
    print(f"Новини та відгуки: {len(news)}")
    return added_tg + len(news)


def step_analyse():
    import enrich
    enrich.run()


def step_detect():
    import detector
    alerts = detector.run()
    wake = [a for a in alerts if a['level'] == 'wake']
    print(f"Алертів: {len(alerts)}, з них будили команду: {len(wake)}")
    for a in wake[-3:]:
        print(f"  [WAKE] {a['summary'][:90]}")
    return alerts


def step_export():
    import blackout
    import export_dashboard
    export_dashboard.export()
    blackout.report()


def main():
    p = argparse.ArgumentParser(description='Повний цикл моніторингу')
    p.add_argument('--days', type=int, default=1,
                   help='за скільки останніх днів збирати (типово 1)')
    p.add_argument('--skip-collect', action='store_true',
                   help='не ходити в джерела, тільки переаналізувати базу')
    args = p.parse_args()

    started = datetime.now()
    steps = []

    if args.skip_collect:
        print("Збір пропущено (--skip-collect)")
    else:
        _, dt = _timed('1/4 ЗБІР', lambda: step_collect(args.days))
        steps.append(('збір', dt))

    _, dt = _timed('2/4 АНАЛІЗ', step_analyse)
    steps.append(('аналіз', dt))
    _, dt = _timed('3/4 ДЕТЕКЦІЯ', step_detect)
    steps.append(('детекція', dt))
    _, dt = _timed('4/4 ДАШБОРД', step_export)
    steps.append(('дашборд', dt))

    total = sum(dt for _, dt in steps)
    print(f"\n=== ЦИКЛ ЗАВЕРШЕНО за {total:.1f} с "
          f"({started:%H:%M:%S} -> {datetime.now():%H:%M:%S}) ===")
    for name, dt in steps:
        print(f"  {name:<10} {dt:7.2f} с   {100 * dt / total:4.1f}%")
    print("\nЦе час одного проходу. Затримка виявлення = цей час плюс "
          "інтервал між запусками; планувальник поки не налаштований.")


if __name__ == '__main__':
    main()
