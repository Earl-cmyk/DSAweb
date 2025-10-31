import os
import sys
import sqlite3

def main():
    # Determine DB path (env > CLI arg > default)
    db_path = os.environ.get("DSA_DB_PATH")
    if not db_path:
        db_path = sys.argv[1] if len(sys.argv) > 1 else "dsa.db"

    schema_path = "schema.sql"

    if not os.path.exists(schema_path):
        print(f"Error: '{schema_path}' not found in project root.")
        sys.exit(1)

    # Connect to SQLite database
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Read and execute schema.sql
    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()
    cur.executescript(schema_sql)

    # Seed collaborator data
    collaborators = [
        ("lead engineer", "Earl Jhon D. Dimla", "2024-03779-MN-0", "Earl-cmyk", None),
        ("developer", "Placeholder 2", "2024-03741-MN-0", "Placeholder2", None),
        ("developer", "Placeholder 3", "2024-03742-MN-0", "Placeholder3", None),
        ("designer", "Franzen D. Baluyot", "2024-03740-MN-0", "K4thars15", None),
        ("writer", "Placeholder 5", "2024-03744-MN-0", "Placeholder5", None),
        ("tester", "Placeholder 6", "2024-03745-MN-0", "Placeholder6", None),
    ]

    cur.executemany("""
        INSERT INTO collaborators (role, name, student_id, github, avatar)
        VALUES (?, ?, ?, ?, ?);
    """, collaborators)

    conn.commit()
    conn.close()

    print(f"✅ Database initialized successfully at '{os.path.abspath(db_path)}'")

if __name__ == "__main__":
    main()
