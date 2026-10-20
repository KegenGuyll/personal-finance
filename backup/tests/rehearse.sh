#!/usr/bin/env bash
# Local rehearsal of the backup scripts against fakes.
#
# MongoDB, rclone and Google Drive are unavailable here, so `mongosh`, `mongodump`
# and `rclone` are stubbed. `age`, `jq` and `tar` are real, so the crypto and
# archive layers are genuinely exercised: that is where the bugs worth catching
# live. Each case asserts an exit code, so a script that "passes" by exiting 0 for
# the wrong reason is still a failure.
#
# Usage: bash backup/tests/rehearse.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS="$REPO_ROOT/backup/scripts"
T=/tmp/pftest
PASS=0
FAIL=0

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
check() {
  local name="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then
    printf '  \033[32mPASS\033[0m %s (exit %s)\n' "$name" "$got"; PASS=$((PASS+1))
  else
    printf '  \033[31mFAIL\033[0m %s (want exit %s, got %s)\n' "$name" "$want" "$got"; FAIL=$((FAIL+1))
  fi
}

# ---------------------------------------------------------------------------
say "scaffold"
rm -rf "$T"
mkdir -p "$T"/{bin,backups,state,work,secrets,etc,remote}
cp /tmp/jq "$T/bin/jq" 2>/dev/null || { echo "missing /tmp/jq"; exit 1; }
cp /tmp/age/age /tmp/age/age-keygen "$T/bin/" 2>/dev/null || { echo "missing /tmp/age binaries"; exit 1; }

"$T/bin/age-keygen" -o "$T/identity.txt" 2>/dev/null
grep '^# public key:' "$T/identity.txt" | sed 's/^# public key: //' > "$T/secrets/age_recipient"

cat > "$T/etc/backup.env" <<EOF
MONGODB_URI=mongodb+srv://pfuser:s3cret@cluster0.example.mongodb.net/personal-finance
EXPECTED_DB=personal-finance
RCLONE_REMOTE=gdrive
GDRIVE_FOLDER=finance-backups
AGE_RECIPIENT_FILE=$T/secrets/age_recipient
AGE_IDENTITY_FILE=$T/identity.txt
BACKUP_DIR=$T/backups
STATE_DIR=$T/state
TMPDIR=$T/work
RCLONE_CONFIG=$T/etc/rclone.conf
BUNDLE_SECRETS=1
APP_ENV_FILE=$T/secrets/app.env
MIN_ARCHIVE_BYTES=1024
NTFY_URL=
EOF
touch "$T/etc/rclone.conf"
printf 'PLAID_CLIENT_ID=abc\nPLAID_SECRET=def\n' > "$T/secrets/app.env"

# --- fakes ------------------------------------------------------------------
cat > "$T/bin/mongosh" <<'FAKE'
#!/usr/bin/env bash
args="$*"
# Simulated outage: used by the unreachable-database case.
[ -f /tmp/pftest/FAIL_DB_CONNECT ] && exit 0
if [[ "$args" == *"db.version()"* ]]; then echo "8.0.32"; exit 0; fi
if [[ "$args" == *"getDBNames()"* ]]; then echo "yes"; exit 0; fi
if [[ "$args" == *"countDocuments"* ]]; then
  # A drill that must fail: pretend the restore lost a collection.
  if [[ "$args" == *"_verify_"* ]] && [ -f /tmp/pftest/GROUND_TRUTH_MISMATCH ]; then
    echo '{"account_items":2,"budgets":14,"categories":9}'
  else
    echo '{"account_items":2,"budgets":14,"categories":9,"transactions":1234}'
  fi
  exit 0
fi
if [[ "$args" == *"dropDatabase"* ]]; then echo "dropped" >> /tmp/pftest/dropped.log; exit 0; fi
echo "{}"
FAKE

cat > "$T/bin/mongodump" <<'FAKE'
#!/usr/bin/env bash
if [[ "$*" == *"--version"* ]]; then echo "mongodump version: 100.14.0"; exit 0; fi
out=""
for a in "$@"; do case "$a" in --archive=*) out="${a#--archive=}";; esac; done
[ -n "$out" ] || { echo "no archive arg" >&2; exit 1; }
printf 'FAKE-BSON-PAYLOAD-%s' "$(date +%s%N)" > "$out"
FAKE

cat > "$T/bin/mongorestore" <<'FAKE'
#!/usr/bin/env bash
if [ -f /tmp/pftest/FAIL_RESTORE ]; then
  echo "Failed: fake restore failure" >&2; exit 1
fi
echo "fake mongorestore ok" >&2
exit 0
FAKE

cat > "$T/bin/rclone" <<'FAKE'
#!/usr/bin/env bash
cmd="$1"; shift
positional=()
for a in "$@"; do case "$a" in --*) ;; *) positional+=("$a");; esac; done
resolve() { case "$1" in gdrive:*) printf '/tmp/pftest/remote/%s' "${1#*:}";; *) printf '%s' "$1";; esac; }
[ -f /tmp/pftest/FAIL_UPLOAD ] && [ "$cmd" = "copyto" ] && { echo "fake upload failure" >&2; exit 1; }
case "$cmd" in
  mkdir) exit 0 ;;
  copyto)
    src="$(resolve "${positional[0]}")"; dst="$(resolve "${positional[1]}")"
    mkdir -p "$(dirname "$dst")"; cp "$src" "$dst" || exit 1; exit 0 ;;
  size)
    f="$(resolve "${positional[0]}")"
    [ -f "$f" ] || { echo "not found" >&2; exit 1; }
    if [ -f /tmp/pftest/REMOTE_SIZE_LIE ]; then
      printf '{"count":1,"bytes":99}\n'
    else
      printf '{"count":1,"bytes":%s}\n' "$(stat -c '%s' "$f")"
    fi ;;
  lsf) ls "$(resolve "${positional[0]}")" 2>/dev/null; exit 0 ;;
  delete) exit 0 ;;
esac
FAKE

chmod +x "$T"/bin/*
run() { BACKUP_ENV_FILE="$T/etc/backup.env" PATH="$T/bin:$PATH" bash "$SCRIPTS/$1" "${@:2}" >"$T/out.log" 2>&1; echo $?; }
echo "scaffold ready"

# ---------------------------------------------------------------------------
say "backup --dry-run"
rm -f "$T"/backups/*.age
check "dry-run succeeds" 0 "$(run backup.sh --dry-run)"
# The artifact name promises gzip, so verify the bytes really are a gzip stream.
ART="$(ls "$T"/backups/*.age 2>/dev/null | head -1)"
if [ -n "$ART" ]; then
  if "$T/bin/age" -d -i "$T/identity.txt" "$ART" | tar tzf - >"$T/members.txt" 2>/dev/null; then
    check "archive decrypts as gzip tar" 0 0
    for m in manifest.json dump.archive secrets/app.env; do
      if grep -q "$m" "$T/members.txt"; then
        check "member present: $m" 0 0
      else
        check "member present: $m" 0 1
      fi
    done
    if "$T/bin/age" -d -i "$T/identity.txt" "$ART" | tar xzOf - manifest.json | "$T/bin/jq" -e '.collection_counts.transactions == 1234' >/dev/null; then
      check "manifest carries real counts" 0 0
    else
      check "manifest carries real counts" 0 1
    fi
  else
    check "archive decrypts as gzip tar" 0 1
  fi
fi

# ---------------------------------------------------------------------------
say "backup (full, with upload)"
rm -f "$T"/backups/*.age "$T/state/last-success" "$T"/remote -r
check "full backup succeeds" 0 "$(run backup.sh)"
[ -f "$T/state/last-success" ] && check "heartbeat written" 0 0 || check "heartbeat written" 0 1

say "negative: upload fails"
touch "$T/FAIL_UPLOAD"
check "upload failure exits non-zero" 1 "$(run backup.sh)"
rm -f "$T/FAIL_UPLOAD"

say "negative: remote size mismatch"
touch "$T/REMOTE_SIZE_LIE"
check "size mismatch exits non-zero" 1 "$(run backup.sh)"
rm -f "$T/REMOTE_SIZE_LIE"

say "negative: unreachable database"
touch "$T/FAIL_DB_CONNECT"
check "unreachable db exits non-zero" 1 "$(run backup.sh)"
rm -f "$T/FAIL_DB_CONNECT"

say "negative: server newer than the supported policy"
sed -i 's#^MAX_SERVER_MAJOR=.*##' "$T/etc/backup.env"
echo "MAX_SERVER_MAJOR=7" >> "$T/etc/backup.env"
check "server 8 vs policy 7 exits non-zero" 1 "$(run backup.sh --dry-run)"
sed -i '/^MAX_SERVER_MAJOR=7$/d' "$T/etc/backup.env"

say "negative: private key present on the host"
cp "$T/identity.txt" "$T/backups/leaked.key"
check "leaked private key aborts the run" 1 "$(run backup.sh --dry-run)"
rm -f "$T/backups/leaked.key"

# ---------------------------------------------------------------------------
say "drill"
check "drill succeeds" 0 "$(run restore.sh --mode=drill)"

say "negative: drill count mismatch"
touch "$T/GROUND_TRUTH_MISMATCH"
check "count mismatch fails the drill" 1 "$(run restore.sh --mode=drill)"
rm -f "$T/GROUND_TRUTH_MISMATCH"

say "negative: restore refuses a non-local target"
check "non-local restore needs --force" 2 "$(run restore.sh --mode=restore --target-db=personal-finance)"

say "negative: wrong decryption key"
"$T/bin/age-keygen" -o "$T/other-identity.txt" 2>/dev/null
cp "$T/identity.txt" "$T/identity.good"
cp "$T/other-identity.txt" "$T/identity.txt"
check "wrong key fails the drill" 1 "$(run restore.sh --mode=drill)"
cp "$T/identity.good" "$T/identity.txt"

say "negative: corrupt artifact at the source"
ART="$(ls "$T"/remote/finance-backups/daily/*.age | head -1)"
cp "$ART" "$T/corrupt.age"
printf 'CORRUPT' | dd of="$T/corrupt.age" bs=1 seek=100 conv=notrunc status=none
check "corrupt artifact fails the drill" 1 "$(run restore.sh --mode=drill --artifact=$T/corrupt.age)"

say "negative: unreadable private key"
# A path that exists in config but cannot be read: the realistic failure is a
# missing or badly mounted identity file, not an unset variable.
check "unreadable identity file fails the drill" 1 \
  "$(BACKUP_ENV_FILE="$T/etc/backup.env" AGE_IDENTITY_FILE="$T/does-not-exist.txt" PATH="$T/bin:$PATH" \
     bash "$SCRIPTS/restore.sh" --mode=drill >"$T/out.log" 2>&1; echo $?)"
check "no identity configured fails the drill" 1 \
  "$(BACKUP_ENV_FILE="$T/etc/backup.env" AGE_IDENTITY_FILE= PATH="$T/bin:$PATH" \
     bash "$SCRIPTS/restore.sh" --mode=drill --uri=mongodb://localhost:27017/x >"$T/out.log" 2>&1; echo $?)"

say "staleness"
check "fresh heartbeat passes" 0 "$(run restore.sh --check-staleness)"
echo "2020-01-01T00:00:00Z" > "$T/state/last-success"
check "stale heartbeat fails" 1 "$(run restore.sh --check-staleness)"
rm -f "$T/state/last-success"
check "missing heartbeat fails" 1 "$(run restore.sh --check-staleness)"

# ---------------------------------------------------------------------------
say "secret hygiene in logs"
echo "2026-09-17T00:00:00Z" > "$T/state/last-success"
run backup.sh --dry-run >/dev/null
if grep -q 's3cret' "$T/out.log"; then
  check "no credentials in backup logs" 0 1
else
  check "no credentials in backup logs" 0 0
fi
run restore.sh --mode=drill >/dev/null
if grep -q 's3cret' "$T/out.log"; then
  check "no credentials in drill logs" 0 1
else
  check "no credentials in drill logs" 0 0
fi

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
