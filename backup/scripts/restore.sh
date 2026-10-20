#!/usr/bin/env bash
#
# Download an encrypted backup, decrypt it, and either prove it restores
# (--mode=drill) or put it back where it came from (--mode=restore).
#
# The scheduled drill is the only mechanism that turns "we think the backups
# work" into a checked fact: it catches a corrupt artifact, a wrong or lost
# encryption key, and a dump that cannot actually be restored. Those failures are
# invisible on backup day.
#
# Usage:
#   restore.sh [--mode=drill] [--latest] [--artifact=PATH|NAME] [--uri=URI]
#   restore.sh  --mode=restore --target-db=NAME [--force] [--dry-run]
#   restore.sh  --check-staleness
#
#   --mode=drill     (default) restore into a throwaway DB, compare counts, drop it
#   --mode=restore   restore into --target-db (default the configured database)
#   --check-staleness  fail if no successful backup has been recorded recently
#   --artifact       local path, or a remote object name in the daily tier
#   --uri            override MONGODB_URI (the drill uses it to read live counts)

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

MODE="drill"
ARTIFACT_ARG=""
URI_OVERRIDE=""
TARGET_DB=""
FORCE=0
DRY_RUN=0
# Set before the trap is armed so cleanup can never mistake the live database for
# the throwaway one.
TEMP_DB=""
RESTORE_DB=""
WORK=""
ARTIFACT_LOCAL=""
SUCCESS=0

usage() {
  cat <<'EOF'
restore.sh — decrypt a backup, then prove it restores or put it back.

  --mode=drill        (default) restore into a throwaway DB, compare document
                      counts against the manifest, then drop it
  --mode=restore      restore into --target-db (default: the archived database)
  --check-staleness   fail if no successful backup was recorded recently
  --artifact=PATH     local path, or an object name inside the daily tier
  --uri=URI           override MONGODB_URI (the drill reads live counts from it)
  --target-db=NAME    destination for --mode=restore
  --force             allow --mode=restore against a non-local host
  --dry-run           download, decrypt and inspect, but do not touch the database

The private key must be supplied via AGE_IDENTITY_FILE, which is mounted only for
one-shot runs. It is never part of the long-running backup service.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mode=*) MODE="${1#*=}"; shift ;;
    --artifact=*) ARTIFACT_ARG="${1#*=}"; shift ;;
    --uri=*) URI_OVERRIDE="${1#*=}"; shift ;;
    --target-db=*) TARGET_DB="${1#*=}"; shift ;;
    --latest) shift ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --check-staleness) MODE="staleness"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) err "unknown argument: $1"; usage >&2; exit 2 ;;
  esac
done

case "$MODE" in
  drill|restore|staleness) : ;;
  *) err "--mode must be one of: drill, restore, staleness"; exit 2 ;;
esac

on_exit() {
  local code=$?
  if [ -n "$TEMP_DB" ] && [ "$DRY_RUN" -ne 1 ]; then
    # Always remove the throwaway database, including after a failed comparison,
    # so repeated drills cannot accumulate databases on the server.
    if mongosh --quiet --norc "${URI_OVERRIDE:-$MONGODB_URI}" --eval \
         "db.getSiblingDB('${TEMP_DB}').dropDatabase()" >/dev/null 2>&1; then
      info "dropped throwaway database ${TEMP_DB}"
    else
      err "could not drop throwaway database ${TEMP_DB}; drop it manually"
    fi
  fi
  [ -n "$WORK" ] && rm -rf "$WORK"
  if [ "$code" -ne 0 ] && [ "$SUCCESS" -ne 1 ]; then
    alert FAIL "${MODE^^} FAILED: exited with status ${code} (last stage: ${STAGE:-unknown})"
  fi
  return 0
}
trap on_exit EXIT
trap 'err "unexpected failure on line $LINENO (status $?)"' ERR

STAGE="preflight"
PIPELINE_NAME="restore drill"
load_config
require_cmd mongorestore mongosh age rclone jq tar find

# ---------------------------------------------------------------------------
# Staleness: an independent heartbeat check, because a schedule that quietly
# stops firing produces no error of its own.
# ---------------------------------------------------------------------------
if [ "$MODE" = "staleness" ]; then
  STAGE="staleness"
  HEARTBEAT="$STATE_DIR/last-success"
  if [ ! -r "$HEARTBEAT" ]; then
    die "no backup has ever recorded a success ($HEARTBEAT is missing)"
  fi
  last="$(tr -d '[:space:]' < "$HEARTBEAT")"
  last_epoch="$(date -u -d "$last" +%s 2>/dev/null || echo 0)"
  [ "$last_epoch" -gt 0 ] || die "unreadable heartbeat timestamp: ${last}"
  age_hours=$(( ( $(date -u +%s) - last_epoch ) / 3600 ))
  if [ "$age_hours" -gt "$STALE_AFTER_HOURS" ]; then
    die "last successful backup was ${age_hours}h ago (limit ${STALE_AFTER_HOURS}h)"
  fi
  info "heartbeat is fresh (${age_hours}h old, limit ${STALE_AFTER_HOURS}h)"
  SUCCESS=1
  exit 0
fi

if [ "$DRY_RUN" -ne 1 ]; then
  acquire_lock
  assert_no_private_key
fi

WORK="$(mktemp -d "${TMPDIR:-/work}/drill.XXXXXX")"
chmod 0700 "$WORK"
LIVE_URI="${URI_OVERRIDE:-$MONGODB_URI}"

# ---------------------------------------------------------------------------
# Fetch and decrypt
# ---------------------------------------------------------------------------
STAGE="fetch"
if [ -n "$ARTIFACT_ARG" ] && [ -f "$ARTIFACT_ARG" ]; then
  ARTIFACT_LOCAL="$ARTIFACT_ARG"
  info "using local artifact $ARTIFACT_LOCAL"
else
  REMOTE_DAILY="$(rclone_daily)"
  if [ -n "$ARTIFACT_ARG" ]; then
    OBJ="$ARTIFACT_ARG"
  else
    OBJ="$(rclone lsf "$REMOTE_DAILY" --files-only 2>/dev/null \
            | grep -E '^pf-[0-9]{8}-[0-9]{6}\.tar\.gz\.age$' | sort | tail -n 1 || true)"
    [ -n "$OBJ" ] || die "no backup artifacts found in ${REMOTE_DAILY}"
  fi
  ARTIFACT_LOCAL="$WORK/$(basename "$OBJ")"
  info "downloading ${REMOTE_DAILY}/${OBJ}"
  rclone copyto "${REMOTE_DAILY}/${OBJ}" "$ARTIFACT_LOCAL" \
    --retries 3 --low-level-retries 10 --timeout 5m --contimeout 30s \
    || die "could not download the artifact"
  [ -s "$ARTIFACT_LOCAL" ] || die "the downloaded artifact is empty"
  info "downloaded $(stat -c '%s' "$ARTIFACT_LOCAL") bytes"
fi
[ -s "$ARTIFACT_LOCAL" ] || die "artifact is missing or empty: $ARTIFACT_LOCAL"
DECRYPTED="$WORK/archive.tar.gz"

STAGE="decrypt"
# The private key lives in the operator's environment for a drill, never on the
# server: AGE_IDENTITY_FILE is mounted only for one-shot runs.
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:-}"
if [ -n "$AGE_IDENTITY_FILE" ]; then
  [ -r "$AGE_IDENTITY_FILE" ] || die "AGE_IDENTITY_FILE is not readable: $AGE_IDENTITY_FILE"
  age --decrypt -i "$AGE_IDENTITY_FILE" -o "$DECRYPTED" "$ARTIFACT_LOCAL" \
    || die "decryption failed (wrong key, or the artifact is corrupt)"
else
  die "AGE_IDENTITY_FILE is not set: decryption requires the private key, which must not be stored on this host"
fi
info "decrypted $(basename "$ARTIFACT_LOCAL") ($(stat -c '%s' "$ARTIFACT_LOCAL") bytes)"

STAGE="inspect"
tar -xzf "$DECRYPTED" -C "$WORK" manifest.json || die "archive has no manifest.json member"
MANIFEST="$WORK/manifest.json"
jq -e . "$MANIFEST" >/dev/null || die "manifest is not valid JSON"
ARCHIVE_DB="$(jq -r '.database' "$MANIFEST")"
ARCHIVE_CREATED="$(jq -r '.created_utc' "$MANIFEST")"
ARCHIVE_NAME="$(basename "$ARTIFACT_LOCAL")"
info "manifest: database=${ARCHIVE_DB} created=${ARCHIVE_CREATED} host=$(jq -r '.hostname' "$MANIFEST")"
info "artifact ${ARCHIVE_NAME} describes $(jq -r '.collection_counts | length' "$MANIFEST") collections"

# A stale artifact is a real hazard: it restores cleanly and looks correct while
# silently missing recent history. Warn rather than fail, because deliberately
# drilling an old artifact is sometimes exactly what is wanted.
age_hours=$(( ( $(date -u +%s) - $(date -u -d "$ARCHIVE_CREATED" +%s) ) / 3600 ))
if [ "$age_hours" -gt "$STALE_AFTER_HOURS" ]; then
  warn "this artifact is ${age_hours}h old ($(date -u -d "$ARCHIVE_CREATED" +%Y-%m-%d)); check why newer backups are absent"
fi

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
if [ "$MODE" = "drill" ]; then
  RESTORE_DB="_verify_$(date -u +%Y%m%d%H%M%S)"
  TEMP_DB="$RESTORE_DB"
else
  RESTORE_DB="${TARGET_DB:-$ARCHIVE_DB}"
  if ! uri_is_local "$LIVE_URI" && [ "$FORCE" -ne 1 ]; then
    err "refusing to restore into '${RESTORE_DB}': $(redact_uri "$LIVE_URI") is not a local database"
    err "pass --force only if you are sure this is the intended target"
    exit 2
  fi
  if [ "$RESTORE_DB" = "$ARCHIVE_DB" ]; then
    warn "this restores OVER the live '${RESTORE_DB}' database"
    warn "drop-first is used: existing collections in that name will be replaced"
  fi
fi

STAGE="extract-dump"
tar -xzf "$DECRYPTED" -C "$WORK" dump.archive || die "archive has no dump.archive member"
DUMP="$WORK/dump.archive"
[ -s "$DUMP" ] || die "the archived dump is empty"

STAGE="restore"
info "restoring ${ARCHIVE_DB} -> ${RESTORE_DB} on $(redact_uri "$LIVE_URI")"

if [ "$DRY_RUN" -eq 1 ]; then
  info "dry run: decryption and manifest inspection succeeded; skipping mongorestore and the comparison"
  TEMP_DB=""   # nothing was created, so the trap must not try to drop anything
  SUCCESS=1
  exit 0
fi

mongorestore --uri="$LIVE_URI" \
  --archive="$DUMP" --gzip \
  --nsFrom="${ARCHIVE_DB}.*" --nsTo="${RESTORE_DB}.*" \
  --drop --quiet \
  || die "mongorestore failed; the archive is not restorable"
info "restore finished"

if [ "$MODE" = "restore" ]; then
  STAGE="summary"
  info "restored into '${RESTORE_DB}'; the application reads its database name from"
  info "MONGODB_URI, so point that at '${RESTORE_DB}' or rename the database to continue"
  SUCCESS=1
  exit 0
fi

# ---------------------------------------------------------------------------
# Drill: compare what landed against the manifest's expectation
# ---------------------------------------------------------------------------
STAGE="count-compare"
RESTORED_JSON="$(collection_counts_json "$LIVE_URI" "$RESTORE_DB" || true)"
case "$RESTORED_JSON" in
  \{*\}) : ;;
  *) die "could not read document counts from the restored database" ;;
esac

MISMATCHES="$(jq -n --argjson expected "$(jq '.collection_counts' "$MANIFEST")" \
                    --argjson actual "$RESTORED_JSON" '
  ($expected | to_entries) as $e
  | [ $e[] | .key as $k
      | (.value) as $want
      | ($actual[$k] // "missing") as $got
      | select($got != $want)
      | "\($k): manifest=\($want) restored=\($got)" ]
  | .[]')"

if [ -n "$MISMATCHES" ]; then
  err "document count mismatches:"
  printf '%s\n' "$MISMATCHES" | while read -r l; do err "  $l"; done
  die "drill FAILED: the archive restored, but its contents do not match the manifest"
fi

info "all $(jq -r '.collection_counts | length' "$MANIFEST") collections match the manifest"
SUCCESS=1
