import sqlite3
import json

conn = sqlite3.connect(r'F:\BaiduNetdiskDownload\fabuya_win_x64\duck_data\duck.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cursor.fetchall()]
print("Tables:", tables)

for t in tables:
    cursor.execute(f"SELECT count(*) FROM {t}")
    cnt = cursor.fetchone()[0]
    print(f"{t}: {cnt} rows")
    if cnt > 0:
        cursor.execute(f"SELECT * FROM {t} LIMIT 2")
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
        print(f"Sample from {t}:", json.dumps(rows, ensure_ascii=False, indent=2))
