"""Push processed CSVs to Supabase. Idempotent — uses upsert via ON CONFLICT."""

from __future__ import annotations

import csv
import os
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

PROCESSED = Path(__file__).resolve().parent / "data" / "processed"


def _connect():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env.local")
    url = os.environ["POSTGRES_URL_NON_POOLING"].split("?")[0]
    return psycopg2.connect(url)


def _upsert_csv(cur, path: Path, table: str, conflict_cols: list[str]):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        rows = []
        for row in reader:
            rows.append(tuple(row[c] if row[c] != "" else None for c in cols))
    if not rows:
        return 0
    conflict_idxs = [cols.index(c) for c in conflict_cols]
    seen = set()
    deduped = []
    for r in rows:
        key = tuple(r[i] for i in conflict_idxs)
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    rows = deduped
    col_names = ",".join(cols)
    update_cols = [c for c in cols if c not in conflict_cols]
    on_conflict = ",".join(conflict_cols)
    set_clause = ",".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
    q = (
        f"INSERT INTO {table} ({col_names}) VALUES %s "
        f"ON CONFLICT ({on_conflict}) DO UPDATE SET {set_clause}"
    )
    execute_values(cur, q, rows, page_size=500)
    return len(rows)


def sync():
    conn = _connect()
    cur = conn.cursor()
    total = 0
    for f in sorted(PROCESSED.glob("players_*.csv")):
        n = _upsert_csv(cur, f, "players", ["player_id", "season", "league"])
        conn.commit()
        print(f"  players {f.stem}: {n} rows", flush=True)
        total += n
    for f in sorted(PROCESSED.glob("matches_*.csv")):
        n = _upsert_csv(cur, f, "matches", ["event_id"])
        conn.commit()
        print(f"  matches {f.stem}: {n} rows", flush=True)
        total += n
    for f in sorted(PROCESSED.glob("match_stats_*.csv")):
        n = _upsert_csv(cur, f, "match_stats", ["event_id", "stat"])
        conn.commit()
        print(f"  match_stats {f.stem}: {n} rows", flush=True)
        total += n
    cur.close()
    conn.close()
    print(f"  synced {total} total rows", flush=True)


if __name__ == "__main__":
    sync()
