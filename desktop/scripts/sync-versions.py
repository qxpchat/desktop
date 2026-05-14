#!/usr/bin/env python3
"""Sync qxp's four version sites (see AGENTS.md `## Versioning`).

Bug fix -> patch (0.1.1 -> 0.1.2). Feature -> minor (0.1.2 -> 0.2.0).
Breaking change -> major (0.2.0 -> 1.0.0).

Usage (run from anywhere):

  desktop/scripts/sync-versions.py             # print current, exit 1 on drift
  desktop/scripts/sync-versions.py bump patch
  desktop/scripts/sync-versions.py bump minor
  desktop/scripts/sync-versions.py bump major
  desktop/scripts/sync-versions.py set 1.2.3
"""

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Each site is matched by a line-anchored regex with three groups:
# (prefix-to-keep, current-version, suffix-to-keep). The package-level
# `version` is the first `^version = "..."` line in a Cargo.toml (deps use
# inline-table syntax, which never starts at column 0), and the first
# top-level `"version": "..."` line in the JSON files.
SITES: list[tuple[Path, re.Pattern[str]]] = [
    (
        REPO_ROOT / "desktop/frontend/package.json",
        re.compile(r'^(\s*"version":\s*")([^"]+)(")', re.MULTILINE),
    ),
    (
        REPO_ROOT / "desktop/src-tauri/tauri.conf.json",
        re.compile(r'^(\s*"version":\s*")([^"]+)(")', re.MULTILINE),
    ),
    (
        REPO_ROOT / "desktop/src-tauri/Cargo.toml",
        re.compile(r'^(version\s*=\s*")([^"]+)(")', re.MULTILINE),
    ),
    (
        REPO_ROOT / "desktop/server/Cargo.toml",
        re.compile(r'^(version\s*=\s*")([^"]+)(")', re.MULTILINE),
    ),
]

VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def read_site(path: Path, pat: re.Pattern[str]) -> str:
    m = pat.search(path.read_text())
    if not m:
        sys.exit(f"error: no version line in {path.relative_to(REPO_ROOT)}")
    return m.group(2)


def write_site(path: Path, pat: re.Pattern[str], new: str) -> None:
    text = path.read_text()
    updated, n = pat.subn(
        lambda m: f"{m.group(1)}{new}{m.group(3)}", text, count=1
    )
    if n != 1:
        sys.exit(f"error: substitution failed in {path.relative_to(REPO_ROOT)}")
    path.write_text(updated)


def parse(v: str) -> tuple[int, int, int]:
    m = VERSION_RE.match(v)
    if not m:
        sys.exit(f"error: not a valid X.Y.Z version: {v!r}")
    return int(m[1]), int(m[2]), int(m[3])


def bump(v: str, part: str) -> str:
    maj, mi, pa = parse(v)
    if part == "patch":
        return f"{maj}.{mi}.{pa + 1}"
    if part == "minor":
        return f"{maj}.{mi + 1}.0"
    if part == "major":
        return f"{maj + 1}.0.0"
    sys.exit(f"error: unknown bump part {part!r}")


def main() -> int:
    p = argparse.ArgumentParser(description="Sync qxp version sites.")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("check", help="print current version, exit 1 on drift")
    b = sub.add_parser("bump", help="bump major/minor/patch across all sites")
    b.add_argument("part", choices=["patch", "minor", "major"])
    s = sub.add_parser("set", help="set explicit X.Y.Z across all sites")
    s.add_argument("version")
    args = p.parse_args()
    cmd = args.cmd or "check"

    current = {path: read_site(path, pat) for path, pat in SITES}
    unique = set(current.values())
    drift = len(unique) > 1

    if drift:
        print("version drift:", file=sys.stderr)
        for path, v in current.items():
            print(f"  {path.relative_to(REPO_ROOT)}: {v}", file=sys.stderr)

    if cmd == "check":
        if drift:
            return 1
        print(unique.pop())
        return 0

    # bump / set: resolve a target version, write to all four sites.
    base = max(unique, key=parse)  # if drifted, treat the highest as canonical
    new = bump(base, args.part) if cmd == "bump" else args.version
    parse(new)  # validate format on `set`

    for path, pat in SITES:
        write_site(path, pat, new)
    print(f"{base} -> {new}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
