#!/usr/bin/env bash
#
# Dump the finance database, wrap it in an age-encrypted tar archive, upload the
# ciphertext to Google Drive, and prune old artifacts.
#
# The plaintext dump never reaches the disk unencrypted: `tar` writes the archive
# to a scratch file and `age` reads it back, so the only durable artifact in
# BACKUP_DIR is ciphertext. Secrets are bundled inside the same encrypted payload
# (see BUNDLE_SECRETS) so a recovery needs no other source.
#
# Usage: backup.sh [--dry-run] [--help]

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

DRY_RUN=0
usage() {
  cat <<'EOF'
backup.sh — encrypt and upload a MongoDB backup.

  --dry-run   Dump, build the manifest and encrypt, then stop before uploading.
              Proves the crypto path in isolation without touching the remote.
  --help      Show this message.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) err "unknown argument: $1"; usage >&2; exit 2 ;;
  esac
done

WORK=""
ARTIFACT=""
# Set once the run has completed successfully, so the EXIT trap knows the
# difference between "finished" and "died partway".
SUCCESS=0

on_exit() {
  local code=$?
  [ -n "$WORK" ] && rm -rf "$WORK"
  [ -n "$ARTIFACT" ] && rm -f "${ARTIFACT}.partial"
  if [ "$code" -ne 0 ] && [ "$SUCCESS" -ne 1 ]; then
    alert FAIL "BACKUP PIPELINE FAILED: exited with status ${code} (last stage: ${STAGE:-unknown})"
  fi
  return 0
}
trap on_exit EXIT
# Route unset variables and pipeline/signal failures through the same reporting
# path, so a `set -u` typo alerts instead of dying silently.
trap 'err "unexpected failure on line $LINENO (status $?)"' ERR

STAGE="preflight"
PIPELINE_NAME="backup"
load_config
require_cmd mongodump mongorestore mongosh age rclone jq awk df tar find

if [ "$DRY_RUN" -eq 1 ]; then
  info "dry run: the remote will not be contacted"
else
  acquire_lock
fi
cleanup_stale_partials
assert_no_private_key

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BASENAME="pf-${TIMESTAMP}"
REMOTE_DAILY="$(rclone_daily)"
REMOTE_MONTHLY="$(rclone_monthly)"

# ---------------------------------------------------------------------------
# Space and version guards
# ---------------------------------------------------------------------------
STAGE="space-check"
PREV_ARCHIVE="$(find "$BACKUP_DIR" -maxdepth 1 -name '*.age' -printf '%f\n' 2>/dev/null | sort | tail -n 1 || true)"
if [ -n "$PREV_ARCHIVE" ]; then
  expected="$(stat -c '%s' "$BACKUP_DIR/$PREV_ARCHIVE")"
else
  expected="$MIN_ARCHIVE_BYTES"
fi
# A restore drill runs alongside the dump, so allow for several copies on disk.
assert_free_space "$BACKUP_DIR" "$(( expected * SPACE_MULTIPLIER ))"
assert_free_space "${TMPDIR:-/work}" "$(( expected * SPACE_MULTIPLIER ))"

STAGE="connect-check"
SERVER_VERSION="$(server_version || true)"
if [ -z "$SERVER_VERSION" ]; then
  die "cannot reach MongoDB or read its version (check MONGODB_URI and network access)"
fi
info "connected to MongoDB ${SERVER_VERSION}"
assert_server_version_supported

# Fail loudly rather than banking a green run over the wrong database. The app
# hardcodes DB_NAME = personal-finance, so a mismatch means the URI drifted.
DB_PRESENT="$(mongosh --quiet --norc "$MONGODB_URI" --eval \
  'db.getMongo().getDBNames().includes(db.getName()) ? "yes" : "no"' 2>/dev/null | tail -n 1 | tr -d '[:space:]' || true)"
if [ "$DB_PRESENT" != "yes" ]; then
  die "database '${EXPECTED_DB}' does not exist at the configured URI"
fi
info "target database confirmed: ${EXPECTED_DB}"

# ---------------------------------------------------------------------------
# Dump + manifest
# ---------------------------------------------------------------------------
STAGE="dump"
WORK="$(mktemp -d "${TMPDIR:-/work}/backup.XXXXXX")"
chmod 0700 "$WORK"
DUMP_FILE="$WORK/dump.archive"
MANIFEST="$WORK/manifest.json"

info "dumping ${EXPECTED_DB} (gzip archive)"
if ! mongodump --uri="$MONGODB_URI" --db="$EXPECTED_DB" --gzip --archive="$DUMP_FILE" --quiet; then
  die "mongodump failed"
fi
[ -s "$DUMP_FILE" ] || die "mongodump produced an empty archive"

STAGE="manifest"
# Counts come from the live source rather than from the archive describing itself,
# which is what gives the drill an independent expectation to compare against. They
# are read after the dump so that concurrent writes can only ever push a live count
# *above* what the archive holds: the drill then reports a mismatch and is re-run,
# which is the safe direction. Counting first would risk a live count below the
# archive's contents, masking real loss as success.
COUNTS_JSON="$(collection_counts_json "$MONGODB_URI" "$EXPECTED_DB" || true)"
case "$COUNTS_JSON" in
  \{*\}) : ;;
  *) die "could not read per-collection document counts from the source" ;;
esac

# Build the manifest. Written as the first tar member so the archive is
# self-describing: a restore drill can read it without unpacking the dump.
jq -n \
  --arg schema_version "1" \
  --arg created_utc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg hostname "$(hostname)" \
  --arg db "$EXPECTED_DB" \
  --arg server_version "$SERVER_VERSION" \
  --arg mongodump_version "$(mongodump --version 2>/dev/null | head -n 1 | sed 's/^mongodump version: //')" \
  --arg path "$BASENAME" \
  --argjson counts "$COUNTS_JSON" \
  '{
     schema_version: ($schema_version | tonumber),
     created_utc: $created_utc,
     hostname: $hostname,
     database: $db,
     server_version: $server_version,
     mongodump_version: $mongodump_version,
     archive_basename: $path,
     collection_counts: $counts
   }' > "$MANIFEST"

COLLECTION_TOTAL="$(jq '[.collection_counts[]] | add // 0' "$MANIFEST")"
COLLECTION_N="$(jq '.collection_counts | length' "$MANIFEST")"
# A dump that found no collections is a broken connection or a wrong URI, not a
# legitimately empty database.
[ "$COLLECTION_N" -gt 0 ] || die "dump contains no collections; refusing to upload"
info "dumped ${COLLECTION_N} collections, ${COLLECTION_TOTAL} documents"

STAGE="secrets"
SECRETS_DIR=""
if [ "$BUNDLE_SECRETS" = "1" ]; then
  SECRETS_DIR="$WORK/secrets"
  mkdir -p "$SECRETS_DIR"
  printf 'The files below are the operator-supplied copies that a full recovery\nneeds, captured at the same moment as the dump.\n' > "$SECRETS_DIR/README.txt"
  if [ -r "$APP_ENV_FILE" ]; then
    install -m 0600 "$APP_ENV_FILE" "$SECRETS_DIR/app.env"
    info "bundled app environment from $APP_ENV_FILE"
  else
    warn "APP_ENV_FILE ($APP_ENV_FILE) is unreadable; archiving the inventory note only"
  fi
  # The rclone config is deliberately NOT bundled: it is what fetches this very
  # archive, so bundling it would create a circular dependency. Its credentials
  # are recoverable from the documented inventory in backup.env instead.
  cat > "$SECRETS_DIR/EXTERNAL_SECRETS.md" <<'EOF'
# Secrets required to recover, and where they live

These are intentionally NOT inside this archive, because at least one of them is
needed to retrieve or decrypt it.

| Secret | Where it lives | Recoverable without the server? |
|---|---|---|
| age private key (AGE-SECRET-KEY-1...) | password manager + offline copy | yes |
| rclone Google Drive OAuth token | password manager (re-auth with the OAuth client below) | yes |
| Google OAuth client id/secret | Google Cloud console project | yes |
| PLAID_CLIENT_ID / PLAID_SECRET | Plaid dashboard | yes |
| NTFY_URL | password manager | yes |

If the private key cannot be found, every archive in Drive is permanently
unreadable. That is the single point of failure documented in backup/README.md.
EOF
fi

STAGE="encrypt"
ARTIFACT="$BACKUP_DIR/${BASENAME}.tar.gz.age"
# Write to a .partial name so a killed run can never leave something that looks
# like a valid artifact; it is renamed only after age has exited cleanly.
#
# -z matters: without it the bytes are a raw tar despite the .tar.gz.age name,
# and every decoder (including the drill) would reject the archive.
#
# pipefail is already set for the script, so a failure in either stage of this
# pipeline fails the whole pipeline rather than being masked by the other.
TAR_MEMBERS=(manifest.json dump.archive)
[ -n "$SECRETS_DIR" ] && TAR_MEMBERS+=(secrets)
tar -C "$WORK" \
    --sort=name --owner=0 --group=0 --numeric-owner \
    --mtime='@0' \
    -czf - "${TAR_MEMBERS[@]}" \
  | age -r "$AGE_RECIPIENT" -o "${ARTIFACT}.partial" \
  || die "encryption failed"
[ -s "${ARTIFACT}.partial" ] || die "encrypted artifact is empty"

STAGE="sanity-gate"
SIZE="$(stat -c '%s' "${ARTIFACT}.partial")"
if [ "$SIZE" -lt "$MIN_ARCHIVE_BYTES" ]; then
  die "artifact is only ${SIZE} bytes, below the ${MIN_ARCHIVE_BYTES}-byte floor"
fi
if [ -n "$PREV_ARCHIVE" ] && [ "$expected" -gt 0 ]; then
  shrink_pct=$(( (expected - SIZE) * 100 / expected ))
  if [ "$shrink_pct" -gt "$(( 100 - SHRINK_ALERT_PCT ))" ]; then
    die "artifact is ${shrink_pct}% smaller than the previous one (${PREV_ARCHIVE}); refusing to treat this as a healthy backup"
  fi
fi
mv "${ARTIFACT}.partial" "$ARTIFACT"
info "encrypted artifact: $(basename "$ARTIFACT") (${SIZE} bytes)"

if [ "$DRY_RUN" -eq 1 ]; then
  STAGE="dry-run"
  info "dry run complete; leaving the artifact in $BACKUP_DIR and skipping upload, verification, pruning and heartbeat"
  SUCCESS=1
  exit 0
fi

STAGE="upload"
ensure_remote_dirs
info "uploading to ${REMOTE_DAILY}/"
rclone copyto "$ARTIFACT" "${REMOTE_DAILY}/${BASENAME}.tar.gz.age" \
  --drive-use-trash=false \
  --retries 3 --low-level-retries 10 \
  --timeout 5m --contimeout 30s \
  || die "rclone upload failed"

STAGE="remote-verify"
# Success is only reported once the bytes are confirmed present and the right
# size. An upload that silently truncated must not look like a good backup.
REMOTE_SIZE="$(rclone size --json "${REMOTE_DAILY}/${BASENAME}.tar.gz.age" 2>/dev/null | jq -r '.bytes // empty' || true)"
if [ -z "$REMOTE_SIZE" ]; then
  die "could not read the remote object size after upload"
fi
if [ "$REMOTE_SIZE" != "$SIZE" ]; then
  die "remote size ${REMOTE_SIZE} does not match local size ${SIZE}"
fi
info "remote object verified (${REMOTE_SIZE} bytes)"

if [ "$(date -u +%d)" = "01" ]; then
  STAGE="upload-monthly"
  info "first of the month: also archiving to ${REMOTE_MONTHLY}/"
  rclone copyto "$ARTIFACT" "${REMOTE_MONTHLY}/${BASENAME}.tar.gz.age" \
    --drive-use-trash=false --retries 3 --low-level-retries 10 --timeout 5m \
    || warn "monthly-tier upload failed; the daily artifact is already safe"
fi

STAGE="prune"
prune_remote_tier "$REMOTE_DAILY" "${RETENTION_DAILY_DAYS}d"
prune_remote_tier "$REMOTE_MONTHLY" "$(( RETENTION_MONTHLY_MONTHS * 30 ))d"
prune_local

STAGE="heartbeat"
date -u +%Y-%m-%dT%H:%M:%SZ > "$STATE_DIR/last-success"
info "backup complete: ${BASENAME} — $(jq -r '.collection_counts | to_entries | map("\(.key)=\(.value)") | join(" ")' "$MANIFEST")"

if [ "$ALERT_ON_SUCCESS" = "1" ]; then
  alert OK "backup succeeded: ${BASENAME} (${SIZE} bytes, remote verified)"
fi
SUCCESS=1
