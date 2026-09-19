import time
import db
import collector_news

def step_collection():
    print("[1/4] Старт збору даних...")
    collector_news.run_collectors()

def step_analysis():
    print("[2/4] Старт LLM-аналізу...")
    unanalyzed = db.get_unanalyzed()
    if not unanalyzed:
        print("  -> Немає нових згадок для аналізу.")
        return

    print(f"  -> Знайдено {len(unanalyzed)} нових згадок. Передача в модуль №4...")
    try:
        import analyzer # Модуль від учасника №4
        analyzer.run(unanalyzed)
    except ImportError:
        print("  -> [!] Модуль analyzer.py ще не злито. Пропуск.")

def step_detection():
    print("[3/4] Старт детекції інцидентів...")
    try:
        import detector # Модуль від учасника №5
        detector.check_for_anomalies()
    except ImportError:
        print("  -> [!] Модуль detector.py ще не злито. Пропуск.")

def step_brief():
    print("[4/4] Генерація брифа/дашборда...")
    try:
        import dashboard # Модуль від учасника №6
        dashboard.generate_report()
    except ImportError:
        print("  -> [!] Модуль dashboard.py ще не злито. Пропуск.")

def main():
    print("=== ЗАПУСК ПАЙПЛАЙНУ ===")
    start_time = time.time()
    
    db.init_db()
    
    step_collection()
    step_analysis()
    step_detection()
    step_brief()
    
    elapsed = round(time.time() - start_time, 2)
    print(f"=== ПАЙПЛАЙН ЗАВЕРШЕНО за {elapsed} сек ===")

if __name__ == "__main__":
    main()