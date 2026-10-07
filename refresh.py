"""Refetch current season data, rebuild CSVs, commit and push.

Runs via launchd on a schedule. Uses the persistent browser profile
so Cloudflare clearance carries over from the initial manual solve.

    python refresh.py             fetch, rebuild, commit and push
    python refresh.py --no-push   leave the commit local
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG = ROOT / "refresh.log"
OUTPUTS = ["data/processed"]


def log(msg: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M} {msg}"
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    print(line, flush=True)


def sh(*args: str) -> str:
    done = subprocess.run(
        args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
    )
    if done.returncode:
        log(f"FAILED: {' '.join(args)}\n{done.stderr[-2000:]}")
        raise SystemExit(1)
    return done.stdout.strip()


def py(*args: str) -> str:
    return sh(str(Path(sys.executable)), *args)


def main() -> None:
    push = "--no-push" not in sys.argv
    log("refresh started")

    try:
        sh("git", "pull", "--ff-only")
    except SystemExit:
        log("git pull failed, continuing with local state")

    output = py("data_loader.py")
    for line in output.splitlines():
        if "players" in line.lower() or "matches" in line.lower() or "saved" in line.lower():
            log(line.strip())

    try:
        from sync_db import sync
        log("syncing to supabase")
        sync()
        log("supabase sync done")
    except Exception as exc:
        log(f"supabase sync failed: {exc}")

    # Images are cosmetic, and only new ids are fetched, so a failure here must
    # not stop the data commit below.
    try:
        from sync_images import sync_images
        log("mirroring images")
        sync_images()
        log("image mirror done")
    except Exception as exc:
        log(f"image mirror failed: {exc}")

    changed = [
        line[3:] for line in sh("git", "status", "--porcelain", "--", *OUTPUTS).splitlines()
    ]
    if not changed:
        log("nothing new")
        return

    sh("git", "add", *OUTPUTS)
    sh("git", "commit", "-m", f"refresh {datetime.now():%Y-%m-%d}", "--", *OUTPUTS)
    if push:
        sh("git", "push")
    log(f"committed {len(changed)} files" + (" and pushed" if push else ""))


if __name__ == "__main__":
    main()
