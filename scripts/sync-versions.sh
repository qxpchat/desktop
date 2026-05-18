#!/bin/sh
# Sync qxp's four version sites (see AGENTS.md "Versioning").
#
# The four manifests are the source of truth for `check`/`bump`; a bump
# also propagates into the two lockfiles (frontend/package-lock.json,
# src-tauri/Cargo.lock) so they don't show up as stray diffs.
#
# POSIX sh — no python/node needed, so it runs in any dev shell, CI, or
# sandbox where only a shell is available.
#
#   sync-versions.sh             print the shared version, exit 1 on drift
#   sync-versions.sh bump patch  bug fix        (0.2.1 -> 0.2.2)
#   sync-versions.sh bump minor  feature        (0.2.1 -> 0.3.0)
#   sync-versions.sh bump major  breaking       (0.2.1 -> 1.0.0)
#   sync-versions.sh set 1.2.3   explicit
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

# ERE fragment matching an X.Y.Z version.
semver='[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'

# "<path>|<line-matcher>". JSON files carry a `"version":` key; the TOML
# package version is the only `version =` anchored at column 0 (dependency
# tables use inline `{ version = ".." }`, never column 0).
files='frontend/package.json|^[[:space:]]*"version"[[:space:]]*:
src-tauri/tauri.conf.json|^[[:space:]]*"version"[[:space:]]*:
src-tauri/Cargo.toml|^version[[:space:]]*=
server/Cargo.toml|^version[[:space:]]*='

die() { echo "error: $*" >&2; exit 1; }

# Echo the version on <file>'s first line matching <pattern>.
read_one() {
  line=$(grep -E -m1 "$2" "$1") || die "no version line in $1"
  printf '%s\n' "$line" | sed -E "s/.*\"($semver)\".*/\1/"
}

# Replace the X.Y.Z on <file>'s version line with <new>.
write_one() {
  sed -E "/$2/ s/\"$semver\"/\"$3\"/" "$1" > "$1.qxptmp"
  mv "$1.qxptmp" "$1"
}

report_drift() {
  echo "version drift:" >&2
  while IFS='|' read -r path pat; do
    [ -n "$path" ] || continue
    echo "  $path: $(read_one "$repo_root/$path" "$pat")" >&2
  done <<EOF
$files
EOF
}

write_all() {
  while IFS='|' read -r path pat; do
    [ -n "$path" ] || continue
    write_one "$repo_root/$path" "$pat" "$1"
  done <<EOF
$files
EOF
  write_lockfiles "$1"
}

# Propagate <new> into the lockfiles. Each lockfile carries the project's
# own version inside its package entry — a `name` line immediately
# followed by a `version` line. We bump only the version line that trails
# a qxp `name`, so dependency versions are never touched. Multiple `-e`
# fragments keep the `{ }` block portable across BSD and GNU sed.
write_lockfiles() {
  pl="$repo_root/frontend/package-lock.json"
  if [ -f "$pl" ]; then
    sed -E -e '/"name": "qxp-web-frontend",/{' -e 'n' \
      -e "s/(\"version\": \")$semver(\")/\1$1\2/" -e '}' \
      "$pl" > "$pl.qxptmp"
    mv "$pl.qxptmp" "$pl"
  fi
  cl="$repo_root/src-tauri/Cargo.lock"
  if [ -f "$cl" ]; then
    sed -E -e '/^name = "qxp-(desktop|web)"$/{' -e 'n' \
      -e "s/^version = \"$semver\"/version = \"$1\"/" -e '}' \
      "$cl" > "$cl.qxptmp"
    mv "$cl.qxptmp" "$cl"
  fi
}

# Collect the four current versions. The heredoc keeps the loop in this
# shell — a pipe would subshell it and lose `seen`.
seen=''
while IFS='|' read -r path pat; do
  [ -n "$path" ] || continue
  seen="$seen$(read_one "$repo_root/$path" "$pat")
"
done <<EOF
$files
EOF

distinct=$(printf '%s' "$seen" | grep . | sort -u)
count=$(printf '%s\n' "$distinct" | grep -c .)
current=$(printf '%s\n' "$distinct" | head -n1)

case "${1:-check}" in
  check)
    [ "$count" -eq 1 ] || { report_drift; exit 1; }
    echo "$current"
    ;;
  bump)
    [ "$count" -eq 1 ] || { report_drift; die "drift — fix with: $0 set X.Y.Z"; }
    IFS=. read -r maj min pat <<EOF
$current
EOF
    case "${2:-}" in
      patch) pat=$((pat + 1)) ;;
      minor) min=$((min + 1)); pat=0 ;;
      major) maj=$((maj + 1)); min=0; pat=0 ;;
      *) die "usage: $0 bump patch|minor|major" ;;
    esac
    new="$maj.$min.$pat"
    write_all "$new"
    echo "$current -> $new"
    ;;
  set)
    new=${2:-}
    printf '%s\n' "$new" | grep -Eq "^$semver\$" || die "not a valid X.Y.Z: '$new'"
    write_all "$new"
    echo "-> $new"
    ;;
  *)
    die "usage: $0 [check | bump patch|minor|major | set X.Y.Z]"
    ;;
esac
