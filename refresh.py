"""Refetch current season data, rebuild CSVs, commit and push.

Runs via launchd on a schedule. Uses the persistent browser profile
so Cloudflare clearance carries over from the initial manual solve.

    python refresh.py             fetch, rebuild, commit and push
    python refresh.py --no-push   leave the commit local
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG = ROOT / "refresh.log"
OUTPUTS = ["data/processed"]

# A laptop that wakes at 08:00 fires this before Wi-Fi is up: on 2026-10-08 both
# `git pull` and the Sofascore fetch died on "Could not resolve host", three
# minutes apart, and the whole day's run was lost. Wait for DNS first.
NETWORK_HOSTS = ("github.com", "www.sofascore.com")
NETWORK_WAIT = 900  # seconds; a wake-from-sleep usually reconnects within a minute


def log(msg: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M} {msg}"
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    # Deliberately not printed: launchd redirects stdout into this same file,
    # so printing wrote every line twice.


def wait_for_network(timeout: int = NETWORK_WAIT) -> bool:
    """Block until every host resolves, or give up after `timeout` seconds."""
    deadline = time.time() + timeout
    announced = False
    while True:
        try:
            for host in NETWORK_HOSTS:
                socket.getaddrinfo(host, 443)
            if announced:
                log("network is up")
            return True
        except OSError:
            if time.time() >= deadline:
                return False
            if not announced:
                log("no network yet, waiting...")
                announced = True
            time.sleep(15)


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

    # Supabase + image mirror calls routinely die mid-run when the laptop's
    # Wi-Fi flickers. Retry with backoff and a network wait so the operator
    # doesn't have to kick off a manual re-sync for a transient blip.
    def with_retry(label: str, fn, attempts: int = 3) -> bool:
        for i in range(1, attempts + 1):
            try:
                fn()
                return True
            except Exception as exc:
                log(f"{label} attempt {i}/{attempts} failed: {exc}")
                if i == attempts:
                    log(f"{label} FAILED after {attempts} attempts")
                    return False
                wait_for_network(timeout=120)
                time.sleep(5 * i)
        return False

    from sync_db import sync
    log("syncing to supabase")
    if with_retry("supabase sync", sync):
        log("supabase sync done")

    # Images are cosmetic, and only new ids are fetched, so a failure here must
    # not stop the data commit below.
    from sync_images import sync_images
    log("mirroring images")
    if with_retry("image mirror", sync_images):
        log("image mirror done")

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
