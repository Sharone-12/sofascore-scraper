"""Fetch football data from Sofascore's API via Playwright.

Sofascore uses Cloudflare challenges that block plain HTTP clients.
Playwright launches a headless Chromium, solves the challenge once,
then fetches all data via JS inside the page context.

Three levels of data, each progressively more request-heavy:

1. Season aggregate stats per player (bulk endpoint, ~1 req per league/position/page)
2. Match results, events and team-level stats (1 req per round + 1 per match for stats)
3. Per-match player detail: heatmaps, shotmaps, average positions (1 req per item)

Everything is cached to data/raw/ so repeat runs are free. Only the current
season is re-fetched by default.

    python data_loader.py                 fetch season stats + match results
    python data_loader.py --detail        also fetch heatmaps/shotmaps (slow, rate-limited)
    python data_loader.py --offline       build from cache only
    python data_loader.py --league pl     Premier League only
    python data_loader.py --league liga   La Liga only
"""

from __future__ import annotations

import argparse
import builtins
import json
import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

_real_print = builtins.print
def print(*args, **kwargs):
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

SOFASCORE = "https://www.sofascore.com"

LEAGUES = {
    "Premier League": {"tournament": 17, "slug": "premier_league"},
    "La Liga": {"tournament": 8, "slug": "la_liga"},
}

POSITIONS = {"D": "Defender", "M": "Midfielder", "F": "Forward"}

MIN_MINUTES = 300

COUNTING_STATS = {
    "goals": "goals",
    "assists": "assists",
    "expectedGoals": "xg",
    "expectedAssists": "xa",
    "totalShots": "shots",
    "shotsOnTarget": "shots_on_target",
    "bigChancesCreated": "big_chances_created",
    "bigChancesMissed": "big_chances_missed",
    "accuratePasses": "passes",
    "totalPasses": "total_passes",
    "keyPasses": "key_passes",
    "accurateLongBalls": "long_balls",
    "totalLongBalls": "total_long_balls",
    "accurateCrosses": "crosses",
    "totalCrosses": "total_crosses",
    "accurateFinalThirdPasses": "final_third_passes",
    "successfulDribbles": "dribbles",
    "totalDribbles": "total_dribbles",
    "dispossessed": "dispossessed",
    "touches": "touches",
    "tacklesWon": "tackles_won",
    "totalTackles": "total_tackles",
    "interceptions": "interceptions",
    "ballRecovery": "recoveries",
    "clearances": "clearances",
    "blockedShots": "blocked_shots",
    "errorLeadToGoal": "errors_to_goal",
    "aerialDuelsWon": "aerials_won",
    "aerialDuelsTotal": "total_aerials",
    "yellowCards": "yellows",
    "redCards": "reds",
    "penaltyWon": "penalties_won",
    "penaltyConceded": "penalties_conceded",
}

EXTRA_FIELDS = {"minutesPlayed": "minutes", "appearances": "appearances"}

FEATURES = list(COUNTING_STATS.values())
ALL_FIELDS = {**COUNTING_STATS, **EXTRA_FIELDS}


# ── Browser-based fetcher ──

_page = None
_playwright = None
_context = None

BROWSER_PROFILE = ROOT / "data" / "browser_profile"


def _init_browser():
    global _page, _playwright, _context
    if _page is not None:
        return
    from playwright.sync_api import sync_playwright
    _playwright = sync_playwright().start()
    BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
    # persistent context keeps cloudflare clearance between runs
    _context = _playwright.chromium.launch_persistent_context(
        user_data_dir=str(BROWSER_PROFILE),
        headless=False,
        args=["--disable-blink-features=AutomationControlled"],
    )
    _page = _context.pages[0] if _context.pages else _context.new_page()
    _page.goto(f"{SOFASCORE}/football", wait_until="load", timeout=30000)
    if "captcha" in _page.url:
        print("  captcha detected — solve it in the browser window...")
        _page.wait_for_function(
            '!window.location.href.includes("captcha")', timeout=120000,
        )
        print("  captcha solved, clearance saved for future runs")
    _page.wait_for_timeout(2000)
    print("  browser ready")


def _close_browser():
    global _page, _playwright, _context
    if _context:
        _context.close()
    if _playwright:
        _playwright.stop()
    _page = _playwright = _context = None


def _get(url: str, cache_path: Path, refresh: bool = False) -> dict:
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    _init_browser()
    api_path = url.replace(SOFASCORE, "")
    for attempt in range(4):
        try:
            result = _page.evaluate(f"""async () => {{
                const r = await fetch('{api_path}');
                if (!r.ok) return {{__status: r.status}};
                return await r.json();
            }}""")
        except Exception as e:
            if attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            raise RuntimeError(f"browser fetch failed for {api_path}: {e}")
        status = result.get("__status") if isinstance(result, dict) else None
        if status is None:
            break
        if status in (403, 429) or status >= 500:
            wait = 5 * (attempt + 1)
            print(f"  got {status}, waiting {wait}s...")
            time.sleep(wait)
            continue
        raise RuntimeError(f"API returned {status} for {api_path}")
    else:
        raise RuntimeError(f"gave up on {api_path} (last status {status})")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(result), encoding="utf-8")
    time.sleep(0.3)
    return result


# ── Seasons ──

def current_season(today: date | None = None) -> int:
    today = today or date.today()
    return today.year if today.month >= 7 else today.year - 1


def season_label(start: int) -> str:
    return f"{start}/{(start + 1) % 100:02d}"


def season_tag(start: int) -> str:
    return f"{start % 100}_{(start + 1) % 100}"


def get_season_ids(tournament: int, refresh: bool = False) -> dict[int, int]:
    data = _get(
        f"{SOFASCORE}/api/v1/unique-tournament/{tournament}/seasons",
        RAW / f"seasons_{tournament}.json",
        refresh,
    )
    out = {}
    for s in data["seasons"]:
        parts = s["year"].split("/")
        year = 2000 + int(parts[0]) if len(parts[0]) <= 2 else int(parts[0])
        out[year] = s["id"]
    return out


# ── 1. Season aggregate player stats ──

def fetch_player_stats(start: int, leagues: dict | None = None, refresh: bool = False) -> pd.DataFrame:
    leagues = leagues or LEAGUES
    fields = ",".join(ALL_FIELDS.keys())
    rows = []
    for league, cfg in leagues.items():
        tournament = cfg["tournament"]
        sid = get_season_ids(tournament, refresh).get(start)
        if sid is None:
            print(f"  no season {season_label(start)} for {league}")
            continue
        for code, position in POSITIONS.items():
            page = 0
            while True:
                url = (
                    f"{SOFASCORE}/api/v1/unique-tournament/{tournament}/season/{sid}/statistics"
                    f"?limit=100&offset={page * 100}&order=-minutesPlayed&accumulation=total"
                    f"&fields={fields}&filters=position.in.{code}"
                )
                cache = RAW / f"stats_{tournament}_{sid}_{code}_{page}.json"
                data = _get(url, cache, refresh)
                for r in data.get("results", []):
                    row = {col: r.get(sf) for sf, col in ALL_FIELDS.items()}
                    row["player_id"] = r["player"]["id"]
                    row["player"] = r["player"]["name"]
                    row["slug"] = r["player"].get("slug", "")
                    row["team"] = r["team"]["name"]
                    row["team_id"] = r["team"]["id"]
                    row["league"] = league
                    row["position"] = position
                    rows.append(row)
                page += 1
                last_mins = data["results"][-1].get("minutesPlayed", 0) if data.get("results") else 0
                if page >= data.get("pages", 1) or (last_mins or 0) < MIN_MINUTES:
                    break
        print(f"  {league} {season_label(start)}: {sum(1 for r in rows if r['league'] == league)} players")
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    num_cols = FEATURES + ["minutes", "appearances"]
    df[num_cols] = df[num_cols].fillna(0)
    df["season"] = season_label(start)
    return df


def per_90(df: pd.DataFrame) -> pd.DataFrame:
    out = df[df["minutes"] >= MIN_MINUTES].copy()
    for col in FEATURES:
        out[f"{col}_p90"] = (out[col] / out["minutes"] * 90).round(4)
    out = out.sort_values("minutes", ascending=False).drop_duplicates(["player_id", "league"])
    return out.sort_values(["league", "team", "player"], kind="stable").reset_index(drop=True)


# ── 2. Match results and team stats ──

def fetch_matches(start: int, leagues: dict | None = None, refresh: bool = False) -> pd.DataFrame:
    leagues = leagues or LEAGUES
    rows = []
    for league, cfg in leagues.items():
        tournament = cfg["tournament"]
        sid = get_season_ids(tournament, refresh).get(start)
        if sid is None:
            continue
        rnd = 1
        while True:
            url = f"{SOFASCORE}/api/v1/unique-tournament/{tournament}/season/{sid}/events/round/{rnd}"
            cache = RAW / f"events_{tournament}_{sid}_r{rnd}.json"
            try:
                data = _get(url, cache, refresh)
            except RuntimeError:
                break
            events = data.get("events", [])
            if not events:
                break
            for ev in events:
                hs = ev.get("homeScore", {})
                aws = ev.get("awayScore", {})
                finished = ev.get("status", {}).get("type") == "finished"
                row = {
                    "event_id": ev["id"],
                    "league": league,
                    "season": season_label(start),
                    "round": rnd,
                    "date": ev.get("startTimestamp"),
                    "home": ev["homeTeam"]["name"],
                    "home_id": ev["homeTeam"]["id"],
                    "away": ev["awayTeam"]["name"],
                    "away_id": ev["awayTeam"]["id"],
                    "status": "finished" if finished else "upcoming",
                    "home_goals": hs.get("current") if finished else None,
                    "away_goals": aws.get("current") if finished else None,
                }
                rows.append(row)
            rnd += 1
        print(f"  {league} {season_label(start)}: {sum(1 for r in rows if r['league'] == league)} matches ({rnd - 1} rounds)")
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], unit="s", utc=True).dt.strftime("%Y-%m-%d")
    return df


def fetch_match_stats(event_ids: list[int], refresh: bool = False, limit: int | None = None) -> pd.DataFrame:
    rows = []
    done = 0
    for eid in event_ids:
        cache = RAW / f"match_stats_{eid}.json"
        try:
            data = _get(f"{SOFASCORE}/api/v1/event/{eid}/statistics", cache, refresh)
        except RuntimeError:
            continue
        for period in data.get("statistics", []):
            if period.get("period") != "ALL":
                continue
            for group in period.get("groups", []):
                for item in group.get("statisticsItems", []):
                    rows.append({
                        "event_id": eid,
                        "stat": item["name"],
                        "home": item.get("home"),
                        "away": item.get("away"),
                    })
        done += 1
        if limit and done >= limit:
            break
    return pd.DataFrame(rows)


# ── 3. Per-match player detail (heatmaps, shotmaps, positions) ──

def fetch_shotmap(event_id: int, refresh: bool = False) -> list[dict]:
    cache = RAW / f"shotmap_{event_id}.json"
    data = _get(f"{SOFASCORE}/api/v1/event/{event_id}/shotmap", cache, refresh)
    shots = []
    for s in data.get("shotmap", []):
        shots.append({
            "event_id": event_id,
            "player_id": s.get("player", {}).get("id"),
            "player": s.get("player", {}).get("name"),
            "x": s.get("playerCoordinates", {}).get("x"),
            "y": s.get("playerCoordinates", {}).get("y"),
            "xg": s.get("xg"),
            "type": s.get("shotType"),
            "body_part": s.get("bodyPart"),
            "situation": s.get("situation"),
            "goal_mouth_x": s.get("goalMouthLocation", {}).get("x"),
            "goal_mouth_y": s.get("goalMouthLocation", {}).get("y"),
            "is_home": s.get("isHome"),
        })
    return shots


def fetch_heatmap(event_id: int, player_id: int, refresh: bool = False) -> list[dict]:
    cache = RAW / f"heatmap_{event_id}_{player_id}.json"
    data = _get(f"{SOFASCORE}/api/v1/event/{event_id}/player/{player_id}/heatmap", cache, refresh)
    return [
        {"event_id": event_id, "player_id": player_id, "x": p.get("x"), "y": p.get("y")}
        for p in data.get("heatmap", [])
    ]


def fetch_average_positions(event_id: int, refresh: bool = False) -> list[dict]:
    cache = RAW / f"avgpos_{event_id}.json"
    data = _get(f"{SOFASCORE}/api/v1/event/{event_id}/average-positions", cache, refresh)
    rows = []
    for side in ("home", "away"):
        for p in data.get(side, []):
            rows.append({
                "event_id": event_id,
                "side": side,
                "player_id": p.get("player", {}).get("id"),
                "player": p.get("player", {}).get("name"),
                "avg_x": p.get("averageX"),
                "avg_y": p.get("averageY"),
            })
    return rows


def fetch_lineups(event_id: int, refresh: bool = False) -> dict:
    cache = RAW / f"lineups_{event_id}.json"
    return _get(f"{SOFASCORE}/api/v1/event/{event_id}/lineups", cache, refresh)


def fetch_incidents(event_id: int, refresh: bool = False) -> list[dict]:
    cache = RAW / f"incidents_{event_id}.json"
    data = _get(f"{SOFASCORE}/api/v1/event/{event_id}/incidents", cache, refresh)
    rows = []
    for inc in data.get("incidents", []):
        rows.append({
            "event_id": event_id,
            "type": inc.get("incidentType"),
            "time": inc.get("time"),
            "added_time": inc.get("addedTime"),
            "player_id": inc.get("player", {}).get("id") if inc.get("player") else None,
            "player": inc.get("player", {}).get("name") if inc.get("player") else None,
            "is_home": inc.get("isHome"),
            "detail": inc.get("incidentClass"),
        })
    return rows


# ── Batch detail fetcher ──

def fetch_match_detail(event_ids: list[int], refresh: bool = False, max_events: int | None = None) -> dict:
    shotmaps, positions, incidents = [], [], []
    done = 0
    for eid in event_ids:
        try:
            shotmaps.extend(fetch_shotmap(eid, refresh))
            positions.extend(fetch_average_positions(eid, refresh))
            incidents.extend(fetch_incidents(eid, refresh))
        except RuntimeError as e:
            print(f"  skipping event {eid}: {e}")
            continue
        done += 1
        if max_events and done >= max_events:
            print(f"  hit detail limit ({max_events}), stopping")
            break
    return {
        "shotmaps": pd.DataFrame(shotmaps) if shotmaps else pd.DataFrame(),
        "positions": pd.DataFrame(positions) if positions else pd.DataFrame(),
        "incidents": pd.DataFrame(incidents) if incidents else pd.DataFrame(),
    }


# ── Build everything ──

def build(
    refresh: bool = False,
    offline: bool = False,
    detail: bool = False,
    max_detail: int = 50,
    league_filter: str | None = None,
) -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)

    leagues = LEAGUES
    if league_filter:
        key = league_filter.lower()
        aliases = {"pl": "premier", "liga": "la liga", "laliga": "la liga"}
        key = aliases.get(key, key)
        leagues = {k: v for k, v in LEAGUES.items() if key in k.lower() or key in v["slug"]}
        if not leagues:
            raise ValueError(f"no league matching '{league_filter}', options: {list(LEAGUES.keys())}")

    now = current_season()
    seasons = [now - 1, now]
    out = {}

    try:
        for start in seasons:
            is_current = start == now
            do_refresh = (refresh or is_current) and not offline
            tag = season_label(start)

            print(f"\n{'='*40}\n{tag} {'(current)' if is_current else '(finished)'}\n{'='*40}")

            print("Fetching player stats...")
            try:
                players = fetch_player_stats(start, leagues, refresh=do_refresh)
            except RuntimeError as e:
                print(f"  API error ({e}), falling back to cache")
                players = fetch_player_stats(start, leagues, refresh=False)
            if not players.empty:
                p90 = per_90(players)
                p90.to_csv(PROCESSED / f"players_{season_tag(start)}.csv", index=False)
                print(f"  saved {len(p90)} players with {MIN_MINUTES}+ minutes")
                out[f"players_{tag}"] = p90

            print("Fetching matches...")
            try:
                matches = fetch_matches(start, leagues, refresh=do_refresh)
            except RuntimeError as e:
                print(f"  API error ({e}), falling back to cache")
                matches = fetch_matches(start, leagues, refresh=False)
            if not matches.empty:
                matches.to_csv(PROCESSED / f"matches_{season_tag(start)}.csv", index=False)
                finished = matches[matches["status"] == "finished"]
                upcoming = matches[matches["status"] == "upcoming"]
                print(f"  saved {len(finished)} results, {len(upcoming)} upcoming")
                out[f"matches_{tag}"] = matches

                finished_ids = finished["event_id"].tolist()
                cached_stats = [eid for eid in finished_ids if (RAW / f"match_stats_{eid}.json").exists()]
                new_ids = [eid for eid in finished_ids if eid not in cached_stats]
                if new_ids and not offline:
                    print(f"  fetching team stats for {len(new_ids)} new matches...")
                    fetch_match_stats(new_ids, refresh=True)
                all_stats = fetch_match_stats(finished_ids, refresh=False)
                if not all_stats.empty:
                    all_stats.to_csv(PROCESSED / f"match_stats_{season_tag(start)}.csv", index=False)
                    out[f"match_stats_{tag}"] = all_stats

                if detail and not offline:
                    need_detail = [eid for eid in finished_ids if not (RAW / f"shotmap_{eid}.json").exists()]
                    if need_detail:
                        print(f"  fetching detail for up to {min(len(need_detail), max_detail)} matches...")
                        detail_data = fetch_match_detail(need_detail, refresh=True, max_events=max_detail)
                        for name, df in detail_data.items():
                            if not df.empty:
                                path = PROCESSED / f"{name}_{season_tag(start)}.csv"
                                if path.exists():
                                    existing = pd.read_csv(path)
                                    df = pd.concat([existing, df]).drop_duplicates()
                                df.to_csv(path, index=False)
                                print(f"  {name}: {len(df)} rows")
    finally:
        _close_browser()

    return out


# ── Loaders for processed data ──

def load_players(start: int) -> pd.DataFrame:
    return pd.read_csv(PROCESSED / f"players_{season_tag(start)}.csv")


def load_matches(start: int) -> pd.DataFrame:
    return pd.read_csv(PROCESSED / f"matches_{season_tag(start)}.csv")


def load_match_stats(start: int) -> pd.DataFrame:
    return pd.read_csv(PROCESSED / f"match_stats_{season_tag(start)}.csv")


def load_shotmaps(start: int) -> pd.DataFrame:
    return pd.read_csv(PROCESSED / f"shotmaps_{season_tag(start)}.csv")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true", help="refetch the finished season too")
    parser.add_argument("--offline", action="store_true", help="build from cache only")
    parser.add_argument("--detail", action="store_true", help="also fetch shotmaps/positions/incidents (slow)")
    parser.add_argument("--max-detail", type=int, default=50, help="max matches to fetch detail for per run")
    parser.add_argument("--league", type=str, help="filter to one league (pl or liga)")
    args = parser.parse_args()
    build(
        refresh=args.refresh,
        offline=args.offline,
        detail=args.detail,
        max_detail=args.max_detail,
        league_filter=args.league,
    )


if __name__ == "__main__":
    main()
