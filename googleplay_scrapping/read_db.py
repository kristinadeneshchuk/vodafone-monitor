import sqlite3

with sqlite3.connect('mentions.db') as conn:
    cursor = conn.cursor()
    # Виведемо 5 останніх збережених згадок
    cursor.execute("SELECT source_name, text FROM mentions ORDER BY id DESC LIMIT 1000")
    for row in cursor.fetchall():
        print(f"Джерело: {row[0]}\nТекст: {row[1][:100]}...\n{'-'*40}")