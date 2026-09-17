# Encrypted MongoDB backups to Google Drive

Nightly `mongodump` of the `personal-finance` database, wrapped in an
age-encrypted archive, uploaded to Google Drive as ciphertext, plus a weekly
drill that proves the archive actually restores.

This exists to make the move off Atlas reversible. It is also a **credentials**
backup: `plaid_items.accessToken` and `syncCursor` live in this database, and
losing them means re-linking every institution, which issues new `transaction_id`s
and duplicates your transaction history (see [Plaid](#plaid-and-why-the-tokens-matter)).

## Design in one picture

```
mongodump --gzip  ──►  tar czf ──►  age -r <public key>  ──►  rclone  ──►  Drive
   (archive)          (+manifest)        (X25519)            (ciphertext only)
                        (+secrets)
```

The plaintext dump exists only as a file inside the container's scratch
directory. `tar` reads it and streams into `age`, so **no unencrypted copy is ever
written to disk**, and the only durable artifact is the `.age` ciphertext.

Inside the encrypted payload:

| Member | Why it exists |
|---|---|
| `manifest.json` | Self-describing archive: database, timestamp, tool versions, per-collection counts. Lets the drill validate without unpacking the dump. |
| `dump.archive` | The gzipped `mongodump` output, restorable wholesale with `mongorestore`. |
| `secrets/` | The app env plus an inventory of the secrets that are deliberately *not* inside (see [Recovery set](#what-a-full-recovery-needs)). |

## What is and is not protected

- **Protected by the encryption:** full transaction history, account metadata,
  Plaid access tokens and sync cursors, and the bundled application secrets.
  Google cannot read any of it, and neither can anyone who obtains your Google
  password, a shared link, or a subpoena to Google.
- **Not protected:** the Google Drive account itself can be *deleted* (this is a
  single remote — see [Risks](#known-risks-and-limits)). Losing the age private
  key makes every archive permanently unreadable.

## One-time setup

### 1. Tooling (host)

```bash
cd backup
mkdir -p backups state secrets
chmod 700 backups state secrets
docker compose -f compose.backup.yml build      # fetches and checksum-verifies every tool
```

Everything the image needs is pinned by version **and** checksum in the
`Dockerfile`. MongoDB stopped shipping the database tools in its container images
([SERVER-120643](https://jira.mongodb.org/browse/SERVER-120643)) and no longer
publishes them to apt/yum, so the tools tarball from `fastdl.mongodb.org` is the
only supported source.

### 2. Encryption key — do this before anything else

```bash
# Generate OFF the server. The private key must never be stored on the host that
# runs the backup: if the server could decrypt its own archives, one server
# compromise would expose every historical backup.
age-keygen -o ~/pf-backup-identity.txt

# The public key goes to the server. Only this file is mounted.
grep '^# public key:' ~/pf-backup-identity.txt | sed 's/^# public key: //' \
  > backup/secrets/age_recipient
chmod 600 backup/secrets/age_recipient
```

**The ceremony, which is the whole point:**

1. `~/pf-backup-identity.txt` → password manager (as a secure note).
2. A second copy → offline, physical (printed or on a USB key in a drawer).
3. Delete the file from any machine you do not intend to keep it on.
4. **Rehearse the recovery now, before you need it:** decrypt one artifact on a
   *different* machine using only the password-manager copy, with this server
   powered off. A key you have never used to decrypt is an assumption.

There is no key escrow and no recovery path without one of those two copies. If
both are lost, treat every archive in Drive as already gone.

### 3. Google Drive

Create a Google OAuth client (Desktop app) in the Cloud console, then:

```bash
rclone config       # n) new remote → name: gdrive → type: drive
                    # → use your own client_id/secret when prompted
                    # → scope: drive.file
cp ~/.config/rclone/rclone.conf backup/rclone.conf
chmod 600 backup/rclone.conf
```

Use `drive.file` scope so rclone can only see files it created. Google Drive's
service accounts are the wrong tool here: they have no Drive quota of their own.
Note that `rclone.conf` holds a refresh token — keep it out of git (already
ignored) and record the OAuth client id/secret in your password manager so the
remote can be rebuilt from scratch.

### 4. Configuration

```bash
cp backup.env.example backup.env
$EDITOR backup.env         # MONGODB_URI, RCLONE_REMOTE, NTFY_URL
chmod 600 backup.env

cp /path/to/app/.env.production secrets/app.env   # bundled inside the archive
```

### 5. First run, then schedule

```bash
# Proves dump + manifest + encryption without touching Drive.
docker compose -f compose.backup.yml run --rm backup backup.sh --dry-run

# Real run: uploads and verifies the remote size.
docker compose -f compose.backup.yml run --rm backup backup.sh

# Start the schedule (see backup/scripts/crontab).
docker compose -f compose.backup.yml up -d backup
```

An alternative to the in-container crontab is a host systemd timer with
`Persistent=true`, which also runs a backup missed while the machine was off:

```ini
# /etc/systemd/system/pf-backup.service
[Unit]
Description=Encrypted MongoDB backup
[Service]
Type=oneshot
WorkingDirectory=/srv/personal-finance/backup
ExecStart=/usr/bin/docker compose -f compose.backup.yml run --rm --no-deps backup backup.sh
# /etc/systemd/system/pf-backup.timer
[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
```

## Scheduled jobs

| Job | Schedule | What it does |
|---|---|---|
| `backup.sh` | daily 03:15 UTC | dump → encrypt → upload → verify remote size → prune → heartbeat |
| `restore.sh --check-staleness` | daily 12:00 | fail if no success within `STALE_AFTER_HOURS` |
| `restore.sh --mode=drill` | **operator-run** (see below) | download newest → decrypt → restore to `_verify_<ts>` → compare counts → drop it |

The staleness check exists because a schedule that quietly stops firing produces
no error of its own — the most common way backup systems fail.

### Automating the drill

The drill needs the age private key, and this design keeps that key off the
server so a compromised server cannot decrypt its own archives. Those two goals
conflict, so the default is the safe one: the drill is **operator-run**, and the
weekly cron line is commented out in `backup/scripts/crontab`.

Run it whenever you like, from your own machine, mounting the key for that one run:

```bash
docker compose -f compose.backup.yml run --rm \
  -e AGE_IDENTITY_FILE=/run/secrets/age_identity \
  -v ~/pf-backup-identity.txt:/run/secrets/age_identity:ro \
  verify --mode=drill
```

To make it unattended instead, decide the tradeoff deliberately:

1. Copy the private key to `backup/secrets/age_identity` (`chmod 600`, owned by the
   uid the container runs as, `10001`).
2. Uncomment the `age_identity` secret in `compose.backup.yml` and add it to the
   `verify` service's `secrets:` list, plus
   `AGE_IDENTITY_FILE=/run/secrets/age_identity` to `backup.env`.
3. Uncomment the drill line in `scripts/crontab`.

**What you give up:** anyone with read access to that file — or to the Docker
host — can decrypt every archive in Drive. `key_hygiene`'s
`assert_no_private_key` check will refuse to run the backup while a key sits in
`/backup`, `/state` or `/etc/backup`, so putting it at
`/run/secrets/age_identity` (which that check does not scan) is required, not
incidental.

A middle path that keeps automation without storing a usable key: hold a second,
independent age keypair whose private half lives only in the password manager, and
run the automated drill against archives encrypted to *that* recipient. It proves
the pipeline works end to end, and you keep the real recovery key cold.

## Restore runbook

### Verify a backup restores (routine)

```bash
docker compose -f compose.backup.yml run --rm \
  -e AGE_IDENTITY_FILE=/run/secrets/age_identity \
  -v ~/pf-backup-identity.txt:/run/secrets/age_identity:ro \
  verify --mode=drill
```

The drill restores into `_verify_<timestamp>` and **always drops it**, including
after a failed comparison, so repeated drills cannot accumulate databases.

### Restore for real

```bash
# Into a spare database first, leaving the live one untouched.
docker compose -f compose.backup.yml run --rm ... verify \
  --mode=restore --target-db=personal-finance-restored

# Then point MONGODB_URI at that database, or rename it into place.
```

`--mode=restore` refuses any target that is not loopback, a compose service name,
or a private-range address unless you pass `--force`. This is deliberate: a
restore with `--drop` aimed at production is a data-loss event, not a rescue.

### Full disaster (server gone)

1. On any machine: install `age`. Retrieve the private key from the password
   manager (or the offline copy).
2. Download the newest `*.age` from Drive.
3. `age -d -i pf-backup-identity.txt pf-<ts>.tar.gz.age | tar xz`
4. `tar xzf` is already done by step 3; unpack with `tar xzf <archive>` if you
   decrypted to a file instead. You now have `manifest.json`, `dump.archive`,
   and `secrets/`.
5. Stand up MongoDB, then `mongorestore --uri="$URI" --archive=dump.archive --gzip`.
6. Read `secrets/EXTERNAL_SECRETS.md` for the credentials that are intentionally
   not in the archive, and rebuild `SERVICE_ENV` from the values in `secrets/app.env`.
7. Let the app connect. Plaid sync resumes from the restored `syncCursor` with no
   re-linking.

**Measured RTO: not yet measured.** Record it the first time you run the drill on
the real server, and update this line.

## Plaid, and why the tokens matter

Plaid's Item, `access_token`, `account_id`s and `transaction_id`s live on Plaid's
side; this database holds copies. Restoring those copies recreates the **same**
Item, so sync resumes incrementally from the restored `syncCursor` and upserts
land on existing documents through the unique `transaction_id_idx`. **No re-link,
no ID changes, no reconciliation.**

IDs change only if the tokens are lost and you re-link: `exchangePublicToken`
creates a new Item with new `transaction_id`s, and your history would be
duplicated under them. This is the concrete reason `plaid_items` is in scope and
not treated as disposable cache.

Two upstream cases force a re-link regardless of backups: you revoke access at the
bank, or Plaid requires re-authentication.

## What a full recovery needs

Everything in this table is needed; only the bottom two rows are *inside* the
archive. `secrets/EXTERNAL_SECRETS.md` (bundled in every archive) repeats this
list for whoever is recovering, possibly years from now.

| Secret | Where it lives | In the archive? |
|---|---|---|
| age private key | password manager + offline copy | no — it decrypts the archive |
| rclone OAuth token | password manager | no — it fetches the archive |
| Google OAuth client id/secret | Google Cloud console | no |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid dashboard | yes (`secrets/app.env`) |
| `MONGODB_URI` | app env | yes |
| `NTFY_URL` | password manager | yes |

The rclone config is excluded on purpose: bundling the credential that fetches the
archive inside the archive is circular. It is recoverable from the OAuth client,
which is why that goes in the password manager.

## Migration to a local database

The backup is deliberately agnostic about where MongoDB runs — it only needs
`MONGODB_URI`. The migration itself gets its own plan, but the sequencing that
matters for the backup:

1. Take a fresh backup and confirm the drill passes.
2. Stand up local `mongod` **with authentication enabled**.
3. Restore into it (`--mode=restore --target-db=...`), then run a drill against
   the local instance.
4. Repoint `MONGODB_URI`, verify Plaid sync advances `syncCursor`, then revoke the
   Atlas user.
5. **Watch the cutover window:** any transaction between the final Atlas dump and
   the switch is not in the archive. Either take the final dump during a quiet
   period or re-run it immediately before cutting over.

## Known risks and limits

| Risk | Status |
|---|---|
| **Loss of the age private key** | Permanent, unrecoverable. Mitigated by two off-server copies and a rehearsed recovery. |
| **Drill automation vs. key custody** | The scheduled drill needs the key, which this design keeps off the server. Default is an operator-run drill; `README.md` documents the explicit tradeoff for automating it. |
| **Single remote (Drive)** | A suspended Google account takes the off-site copy with it. Adding a second remote is a few lines in `backup.sh`, and is the highest-value remaining improvement. |
| Cross-collection consistency | `mongodump` is not a cluster snapshot, so collections can be moments apart under a live app. Acceptable at this scale; documented rather than fixed. |
| Remote-credential circularity | Handled by excluding rclone config from the archive and documenting the OAuth client. |
| Plaid token validity | Always exposed to upstream revocation; re-linking duplicates history, so keep the archived tokens intact. |

## Verification status

What has actually been exercised, and where:

- `backup/tests/rehearse.sh` — 25 assertions covering the happy path and the
  failure paths (upload failure, remote size mismatch, unreachable database,
  server newer than policy, leaked private key, drill count mismatch, non-local
  restore refusal, wrong key, corrupt artifact, unreadable identity, staleness,
  and credential leakage into logs). It stubs `mongosh`/`mongodump`/`rclone` and
  runs the **real** `age`, `jq` and `tar`, so the crypto and archive layers are
  genuinely exercised. Run it with `bash backup/tests/rehearse.sh`.
- Every pinned download in the `Dockerfile` was fetched and checksum-verified
  during development, and the amd64 binaries were executed to confirm they run.

**Still to verify on the real server, in this order:**

1. `docker compose -f compose.backup.yml build` (this repo's dev environment has
   no Docker, so the image build has not been run here).
2. A `--dry-run` against Atlas.
3. A real run, confirming a new object appears in Drive and `rclone size` matches.
4. `--mode=drill` with the real key, confirming counts match.
5. Deliberately trigger each alert once — kill the network, corrupt an artifact,
   break `MONGODB_URI` — and confirm ntfy fires.
6. arm64 support is written but unverified: checksums for arm64 artifacts are
   pinned, but only amd64 binaries were executed here.
