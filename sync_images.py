"""Mirror Sofascore player headshots and team crests into Supabase Storage.

Hotlinking works (see lib/images.ts) but spends Sofascore's bandwidth on a path
they gate, so they can cut it off whenever they like. This copies each image
once into our own public bucket; re-runs only fetch ids that aren't there yet.

    python sync_images.py            mirror anything missing
    python sync_images.py --dry-run  report what's missing, fetch nothing
"""

from __future__ import annotations

import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
PROCESSED = ROOT / "data" / "processed"
BUCKET = "images"

# Cloudflare serves img.sofascore.com only when the request carries no foreign
# referer, and 403s a request with no User-Agent at all. Both are load-bearing.
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
SOURCE = "https://img.sofascore.com/api/v1"


def _env() -> tuple[str, str]:
    load_dotenv(ROOT / ".env.local")
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return url, key


def _request(url: str, *, method="GET", data=None, headers=None, timeout=30,
             tries=4):
    """HTTP with retries on transport errors.

    Over ~1100 requests a dropped connection or DNS blip is a certainty, and
    one of those must not end the run. HTTPError is NOT retried: it carries a
    real answer (404 = no image) that callers need to see.
    """
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def ids_from_csvs() -> tuple[set[str], set[str]]:
    """Every distinct player_id and team_id across the processed seasons."""
    players: set[str] = set()
    teams: set[str] = set()
    for path in sorted(PROCESSED.glob("players_*.csv")):
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("player_id"):
                    players.add(row["player_id"])
                if row.get("team_id"):
                    teams.add(row["team_id"])
    return players, teams


def ensure_bucket(base: str, key: str) -> None:
    hdr = {"Authorization": f"Bearer {key}", "apikey": key,
           "Content-Type": "application/json"}
    # Fetching a missing bucket answers HTTP 400 with a 404 in the body, so the
    # status code can't distinguish "absent" from "broken" — list instead.
    _, raw = _request(f"{base}/storage/v1/bucket", headers=hdr)
    if any(b.get("name") == BUCKET for b in json.loads(raw)):
        return
    body = json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode()
    _request(f"{base}/storage/v1/bucket", method="POST", data=body, headers=hdr)
    print(f"  created public bucket '{BUCKET}'")


def existing(base: str, key: str, prefix: str) -> set[str]:
    """Object names already in the bucket under `prefix`, paged out in full."""
    hdr = {"Authorization": f"Bearer {key}", "apikey": key,
           "Content-Type": "application/json"}
    found: set[str] = set()
    offset = 0
    while True:
        body = json.dumps({"prefix": prefix, "limit": 1000,
                           "offset": offset}).encode()
        _, raw = _request(
            f"{base}/storage/v1/object/list/{BUCKET}",
            method="POST", data=body, headers=hdr,
        )
        page = json.loads(raw)
        if not page:
            break
        found.update(o["name"] for o in page)
        if len(page) < 1000:
            break
        offset += len(page)
    return found


def mirror(base: str, key: str, kind: str, ids: set[str],
           dry: bool) -> tuple[int, int]:
    """kind is 'player' or 'team'. Returns (uploaded, missing_at_source)."""
    prefix = f"{kind}s/"
    have = existing(base, key, prefix)
    todo = sorted(i for i in ids if f"{i}.png" not in have)
    print(f"  {kind}s: {len(ids)} known, {len(have)} mirrored, "
          f"{len(todo)} to fetch")
    if dry or not todo:
        return 0, 0

    up_hdr = {"Authorization": f"Bearer {key}", "apikey": key,
              "Content-Type": "image/png", "x-upsert": "true"}
    done = 0
    gone = 0
    for n, i in enumerate(todo, 1):
        try:
            status, blob = _request(
                f"{SOURCE}/{kind}/{i}/image", headers={"User-Agent": UA},
            )
        except urllib.error.HTTPError as e:
            # A 404 just means Sofascore has no image for this id; the UI falls
            # back to initials, so it isn't worth failing the whole run over.
            gone += 1
            if e.code not in (403, 404):
                print(f"    {kind} {i}: HTTP {e.code}")
            continue
        if status != 200 or len(blob) < 500:
            gone += 1
            continue
        _request(
            f"{base}/storage/v1/object/{BUCKET}/{prefix}{i}.png",
            method="POST", data=blob, headers=up_hdr,
        )
        done += 1
        if n % 100 == 0:
            print(f"    {n}/{len(todo)}...", flush=True)
        time.sleep(0.1)
    return done, gone


def sync_images(dry: bool = False) -> None:
    base, key = _env()
    players, teams = ids_from_csvs()
    ensure_bucket(base, key)
    p_done, p_gone = mirror(base, key, "player", players, dry)
    t_done, t_gone = mirror(base, key, "team", teams, dry)
    print(f"  mirrored {p_done} players, {t_done} teams "
          f"({p_gone + t_gone} with no image at source)")


if __name__ == "__main__":
    sync_images(dry="--dry-run" in sys.argv)
