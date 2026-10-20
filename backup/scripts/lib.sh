#!/usr/bin/env bash
# Shared helpers for the backup, verify and restore scripts.
#
# Sourced, never executed. Every function assumes `set -Eeuo pipefail` is already
# active in the caller, and every failure path routes through `die` so that a
# single trap in the caller can both alert and clean up.

# ---------------------------------------------------------------------------
# Logging. Everything goes to stdout/stderr so supercronic forwards it to the
# container log; nothing is written to a file on the server.
# ---------------------------------------------------------------------------

# shellcheck disable=SC2034  # read by logf, kept uppercase for callers
readonly LOG_TS_FMT="%Y-%m-%dT%H:%M:%SZ"

log() { printf '%s %s\n' "$(date -u "+$LOG_TS_FMT")" "$*"; }
logf() { printf '%s %-5s %s\n' "$(date -u "+$LOG_TS_FMT")" "$1" "${*:2}"; }
info() { logf INFO "$@"; }
warn() { logf WARN "$@"; }
err() { logf ERROR "$@" >&2; }

# Any credential that could appear in a tool's stderr must be scrubbed before it
# reaches the container log or a push notification.
redact() {
  local s="$1"
  if [ -n "${MONGODB_URI:-}" ]; then s="${s//"$MONGODB_URI"/<redacted-uri>}"; fi
  s="$(printf '%s' "$s" | sed -E \
        -e 's#(mongodb(\+srv)?://)[^@/[:space:]]+@#\1<redacted>@#g' \
        -e 's#(AGE-SECRET-KEY-)[A-Z0-9]+#\1<redacted>#g' \
        -e 's#("?(access_token|accessToken|refresh_token|client_secret|password)"?[=:][[:space:]]*")[^"]+#\1<redacted>#g')"
  printf '%s' "$s"
}

# Safe to log: hosts and database names are useful for diagnosis, credentials are
# not. Use this instead of interpolating a URI into any message.
redact_uri() {
  printf '%s' "$1" | sed -E 's#(mongodb(\+srv)?://)[^@/]+@#\1<credentials>@#'
}

# Best effort: a failed alert must never change the exit status of the backup.
# ALERTED latches after the first FAIL so that a `die` (which alerts itself) does
# not get a second notification from the caller's EXIT trap: duplicate pages are
# how alerting gets ignored.
alert() {
  local kind="$1" msg="$2"
  local body
  body="$(redact "$msg")"
  err "[$kind] $body"
  # Latch before the delivery checks below, or a deployment with no NTFY_URL would
  # still reach the duplicate-report path it is meant to suppress.
  if [ "$kind" = FAIL ]; then
    if [ "${ALERTED:-0}" -eq 1 ]; then
      return 0
    fi
    ALERTED=1
  fi
  if [ -z "${NTFY_URL:-}" ]; then
    warn "NTFY_URL is not set; this failure was logged only"
    return 0
  fi
  local prio=default
  [ "$kind" = FAIL ] && prio=high
  # curl is allowed to fail here; the notification is strictly informational.
  curl -fsS -m 20 -o /dev/null \
    -H "Title: personal-finance backup ${kind}" \
    -H "Priority: ${prio}" \
    -H "Tags: ${kind}" \
    -d "$body" \
    "${NTFY_URL%/}" >/dev/null 2>&1 || warn "failed to deliver ntfy alert"
}

# ---------------------------------------------------------------------------
# Config and secret loading
# ---------------------------------------------------------------------------

require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "required command not found: $c"
  done
}

# Loads config, then the age recipient, then validates. Called before any trap is
# armed, so `die` here must be able to alert without cleanup state.
#
# Secrets are mounted as files rather than env vars so they cannot leak through
# `docker inspect` or a process environment dump. That is why the recipient is
# read from AGE_RECIPIENT_FILE and not from AGE_RECIPIENT.
load_config() {
  local conf="${BACKUP_ENV_FILE:-/etc/backup/backup.env}"
  [ -r "$conf" ] || die "config file is missing or unreadable: $conf"

  # The identity file is the one setting a caller may legitimately override per
  # run (a drill mounts a key that the scheduled service never has), so preserve
  # the caller's value: sourcing below would otherwise clobber it. Presence is
  # tested with ${x+set} rather than emptiness, so an explicit empty value means
  # "no key supplied" instead of falling back to the config file.
  local identity_override_set=0 identity_override=""
  if [ -n "${AGE_IDENTITY_FILE+set}" ]; then
    identity_override_set=1
    identity_override="$AGE_IDENTITY_FILE"
  fi

  # shellcheck disable=SC1090  # path is deployment-supplied
  set -a; . "$conf"; set +a

  if [ "$identity_override_set" -eq 1 ]; then
    AGE_IDENTITY_FILE="$identity_override"
    export AGE_IDENTITY_FILE
  fi

  local recip_file="${AGE_RECIPIENT_FILE:-/run/secrets/age_recipient}"
  [ -r "$recip_file" ] || die "age recipient file is missing or unreadable: $recip_file"
  AGE_RECIPIENT="$(tr -d '[:space:]' < "$recip_file")"
  case "$AGE_RECIPIENT" in
    age1*) : ;;
    *) die "age recipient does not look like a public key (expected age1...)" ;;
  esac

  MONGODB_URI="${MONGODB_URI:-}"
  [ -n "$MONGODB_URI" ] || die "MONGODB_URI is not set"
  case "$MONGODB_URI" in
    *://*@*) : ;;  # credentials embedded, which is expected for a production URI
    *) warn "MONGODB_URI has no embedded credentials" ;;
  esac

  BACKUP_DIR="${BACKUP_DIR:-/backups}"
  STATE_DIR="${STATE_DIR:-/state}"
  GDRIVE_FOLDER="${GDRIVE_FOLDER:-finance-backups}"
  EXPECTED_DB="${EXPECTED_DB:-personal-finance}"
  RETENTION_DAILY_DAYS="${RETENTION_DAILY_DAYS:-30}"
  RETENTION_MONTHLY_MONTHS="${RETENTION_MONTHLY_MONTHS:-12}"
  RETENTION_LOCAL_DAYS="${RETENTION_LOCAL_DAYS:-7}"
  MIN_ARCHIVE_BYTES="${MIN_ARCHIVE_BYTES:-10240}"
  SHRINK_ALERT_PCT="${SHRINK_ALERT_PCT:-50}"
  SPACE_MULTIPLIER="${SPACE_MULTIPLIER:-3}"
  BUNDLE_SECRETS="${BUNDLE_SECRETS:-1}"
  APP_ENV_FILE="${APP_ENV_FILE:-/run/secrets/app_env}"
  STALE_AFTER_HOURS="${STALE_AFTER_HOURS:-36}"
  # Highest MongoDB server major release the pinned tools are known to handle.
  # Bump deliberately, together with MONGO_TOOLS_VERSION in the Dockerfile.
  MAX_SERVER_MAJOR="${MAX_SERVER_MAJOR:-8}"
  NTFY_URL="${NTFY_URL:-}"
  ALERT_ON_SUCCESS="${ALERT_ON_SUCCESS:-0}"

  case "$RCLONE_REMOTE" in
    "") die "RCLONE_REMOTE is not set" ;;
    *:*) die "RCLONE_REMOTE must be the remote name only, without a ':' or path" ;;
  esac
  case "$GDRIVE_FOLDER" in
    /*) die "GDRIVE_FOLDER must be relative to the remote root" ;;
  esac
  for f in "$BACKUP_DIR" "$STATE_DIR" "${TMPDIR:-/work}"; do
    [ -d "$f" ] || die "directory does not exist: $f"
    [ -w "$f" ] || die "directory is not writable: $f"
  done
  [ -r "${RCLONE_CONFIG:-/etc/backup/rclone.conf}" ] || die "rclone config is missing or unreadable"
  export AGE_RECIPIENT
}

# Confirm no run from a previous boot left a half-written artifact behind.
cleanup_stale_partials() {
  find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -mmin +120 -print -delete 2>/dev/null \
    | while read -r f; do warn "removed stale partial artifact: $f"; done || true
}

# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------

# The age private key must never live on the host that runs the backup: if the
# server could decrypt its own archives, a server compromise would expose every
# historical backup.
assert_no_private_key() {
  local hit
  hit="$(grep -rl -- 'AGE-SECRET-KEY-1' \
          /run/secrets /etc/backup "$BACKUP_DIR" "$STATE_DIR" 2>/dev/null | head -n 5 || true)"
  if [ -n "$hit" ]; then
    die "an age PRIVATE key is present on this host; it must be kept off-server (found: $(echo "$hit" | tr '\n' ' '))"
  fi
}

assert_free_space() {
  local dir="$1" needed="$2"
  local avail
  avail="$(df -Pk "$dir" | awk 'NR==2 {print $4}')"
  avail=$(( avail * 1024 ))
  if [ "$avail" -lt "$needed" ]; then
    die "insufficient free space in $dir: need ~$((needed / 1024 / 1024))MiB, have $((avail / 1024 / 1024))MiB"
  fi
}

# Excludes the random suffix so a container restart mid-second cannot collide.
acquire_lock() {
  local lockfile="$STATE_DIR/backup.lock"
  exec 9>"$lockfile"
  if ! flock -n 9; then
    die "another backup (or verify) run holds $lockfile"
  fi
}

server_version() {
  mongosh --quiet --norc "$MONGODB_URI" --eval 'db.version()' 2>/dev/null | tail -n 1 | tr -d '"[:space:]]'
}

# Exact per-collection document counts as a JSON object.
#
# The counts come from querying the database rather than by parsing `mongodump`
# output: the dump is written straight to an archive file, so its per-collection
# summary never reaches stdout. They are deliberately taken *before* the dump so
# the drill's comparison has an independent expectation rather than round-tripping
# the manifest's own numbers.
collection_counts_json() {
  local uri="${1:-$MONGODB_URI}" dbname="${2:-$EXPECTED_DB}"
  mongosh --quiet --norc "$uri" --eval "
    const out = {};
    for (const c of db.getSiblingDB('$dbname').getCollectionNames().sort()) {
      try { out[c] = db.getSiblingDB('$dbname').getCollection(c).countDocuments({}); }
      catch (e) { out[c] = -1; }
    }
    print(JSON.stringify(out));
  " 2>/dev/null | tail -n 1
}

# Refuses to run if a prior major-version lag exceeds the configured tolerance.

# mongodump/mongorestore do not publish which server versions they support (the
# 100.x tools series is versioned independently, and `mongodump --version` says
# nothing about the server), so compatibility cannot be inferred. It is a stated
# deployment fact instead: the operator records which server major release the
# pinned tools are known to handle, and this fails loudly when the database moves
# past it rather than letting a wire-protocol error surface mid-dump.
assert_server_version_supported() {
  local srv_major
  srv_major="${SERVER_VERSION%%.*}"
  case "$srv_major" in
    ''|*[!0-9]*) warn "could not parse a server major from '${SERVER_VERSION}'; skipping the version policy check"; return 0 ;;
  esac
  if [ "$srv_major" -gt "$MAX_SERVER_MAJOR" ]; then
    die "server ${SERVER_VERSION} is newer than the supported MAX_SERVER_MAJOR=${MAX_SERVER_MAJOR}; bump the pinned tools and this value together after checking the release notes"
  fi
  info "server ${SERVER_VERSION} is within the supported policy (MAX_SERVER_MAJOR=${MAX_SERVER_MAJOR})"
}

# ---------------------------------------------------------------------------
# Remote (rclone) helpers
# ---------------------------------------------------------------------------

rclone_daily() { printf '%s:%s/daily' "$RCLONE_REMOTE" "$GDRIVE_FOLDER"; }
rclone_monthly() { printf '%s:%s/monthly' "$RCLONE_REMOTE" "$GDRIVE_FOLDER"; }

# A destructive restore must not be pointed at production by accident. Anything
# that is not loopback, a compose service name, or a private-range host counts as
# remote and needs an explicit --force.
uri_is_local() {
  local uri="$1" host
  host="${uri#*://}"          # strip scheme
  host="${host##*@}"          # strip credentials
  host="${host%%/*}"          # strip /database
  host="${host%%\?*}"         # strip ?options
  case "$host" in
    localhost|localhost:*|mongodb|mongodb:*|mongo|mongo:*) return 0 ;;
    127.0.0.1|127.0.0.1:*|\[::1\]|\[::1\]:*) return 0 ;;
    10.*|192.168.*) return 0 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[01].*) return 0 ;;
    *) return 1 ;;
  esac
}

# A remote that has never been used fails path resolution rather than the upload,
# so make sure the folder exists before the first copy.
ensure_remote_dirs() {
  rclone mkdir "$(rclone_daily)" || die "could not create the remote daily folder"
  rclone mkdir "$(rclone_monthly)" || die "could not create the remote monthly folder"
}

# `rclone delete` plus a prefix filter is the only pruning mechanism used; the
# path prefix is always the daily folder so a monthly artifact can never match.
prune_remote_tier() {
  local tier="$1" age_spec="$2"
  info "pruning $tier older than $age_spec"
  rclone delete --min-age "$age_spec" --include '*.age' --drive-use-trash=false \
    "$tier" 2>&1 | while read -r l; do info "prune: $l"; done || warn "prune of $tier reported an error"
}

prune_local() {
  info "pruning the local retention window (${RETENTION_LOCAL_DAYS}d)"
  find "$BACKUP_DIR" -maxdepth 1 -name '*.age' -mtime "+${RETENTION_LOCAL_DAYS}" -print -delete 2>/dev/null \
    | while read -r f; do info "removed local artifact $f"; done || true
}

# ---------------------------------------------------------------------------
# Alerting driver
# ---------------------------------------------------------------------------

# Human-readable name for the failing stage, so the alert does not require log
# access to be actionable. PIPELINE_NAME lets each entry point describe itself
# (backup vs drill) so an alert is not misread as a failed backup.
die() {
  local msg="$*"
  err "$msg"
  alert FAIL "${PIPELINE_NAME:-backup}: FAILED at stage '${STAGE:-unknown}' — $msg"
  exit 1
}

PIPELINE_NAME="backup"

# shellcheck disable=SC2034  # STAGE is read by die
STAGE="startup"
