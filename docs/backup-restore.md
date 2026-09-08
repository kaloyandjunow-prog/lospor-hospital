# Backup and restore

[Български](backup-restore.bg.md) | **English**

LOSPOR Hospital 1.2 creates an authenticated PostgreSQL recovery object every
four hours. A completed object is a private directory named
`backups/lospor-YYYYMMDDTHHMMSSZ-RANDOM.backup` containing the custom-format
database dump and a manifest published last. The manifest binds the dump hash
to the site, appliance, Hospital release, exchange/data-dictionary versions,
PostgreSQL major, migration and schema fingerprints, and fingerprints of the
clinical keys, the exact `OMOP_PSEUDONYM_SALT`, and the external-AI seal key.
It contains no raw secret or patient data and is authenticated with a separate
manifest HMAC key.

The scheduler retains every verified object for 48 hours and then one verified
object per UTC day for 14 days. Pre-update, pre-restore, and explicitly
immutable recovery points are protected from ordinary pruning. Cleanup runs
only after a newly verified or safely reused object; a failed dump never
deletes an older recovery point. Capacity is checked before `pg_dump` and the
manifest is published only after the dump catalog, checksum, schema, and
migration evidence pass.

This gives a four-hour logical-backup RPO target. PostgreSQL WAL/PITR is outside
the appliance, so recovery to an arbitrary transaction is not promised.

## Operator language

`backup-now.sh`, `ensure-backup-configuration.sh`, and `restore-backup.sh`
render operator instructions and failures in the appliance language selected by
`LOSPOR_DEFAULT_LOCALE` (Bulgarian by default). A visiting technician can select
English for one command without changing the appliance setting, for example:

```sh
LOSPOR_DEFAULT_LOCALE=en ./scripts/backup-now.sh
```

Only explanatory prose is translated. Stable process and recovery tokens such
as `BACKUP_BUSY`, `BACKUP_MAINTENANCE_BUSY`, `RESTORE_PREFLIGHT_OK`,
`NEEDS_OPERATOR`, the `TEMPORARY RESTORE` / `EMERGENCY RESTORE` typed values,
environment names, journal phases, paths, and commands remain exact in both
languages.

## Off-host copy and secret escrow

A local copy is not disaster recovery. `secrets/backup/offhost-copy` is the
fixed, vendor-neutral hook invoked with the path of each verified object. The
generated hook exits 75, meaning “deferred”; it never falsely acknowledges an
external copy. Hospital IT may replace that regular executable with its own
encrypted off-host transfer. Exit 0 means that exact object is durably
acknowledged, exit 75 defers it, and every other exit is a copy failure. LOSPOR
records only the privacy-safe object name, acknowledgement time, and manifest
hash in `.last-offhost-verified.v1`.

The hospital must escrow `.env` (including the installation's exact
`OMOP_PSEUDONYM_SALT`), the complete `secrets/` directory (including
`secrets/backup/manifest-hmac-key` and `secrets/api/external-ai-seal-key`), and
the verified recovery objects in a
separate encrypted, access-controlled system outside the appliance VM and
storage. Monitor local and acknowledged off-host ages independently and carry
out a recorded restore from the real off-host medium at least quarterly.

## Create and inspect recovery points

Create an ordinary manual point:

```sh
./scripts/backup-now.sh
```

Protected kinds are reserved for the matching workflow:

```sh
./scripts/backup-now.sh --kind pre-update
./scripts/backup-now.sh --kind pre-restore
./scripts/backup-now.sh --kind immutable
```

Concurrent scheduled, manual, and pre-update backup requests share the backup
mutex. A caller may reuse the same newly verified object; contention returns
the stable `BACKUP_BUSY` process result without overwriting the active backup’s
Status signal. Backup also takes the same persistent OS lock as release
migrations and service replacement. If maintenance owns it, the backup defers
before reading PostgreSQL with exit 75 and `BACKUP_MAINTENANCE_BUSY`; an update
never overlaps a dump.

## Safe restore

The default restores into an isolated temporary database while clinical
services and the live database remain unchanged:

```sh
./scripts/restore-backup.sh --temporary \
  backups/lospor-YYYYMMDDTHHMMSSZ-RANDOM.backup
```

Before creating anything, restore authenticates the closed manifest schema,
parses the dump catalog, verifies capacity, and compares site, appliance,
release, exchange/data-dictionary, PostgreSQL, migrations, schema, and all key
fingerprints. The external-AI fingerprint is SHA-256 over the decoded 32-byte
seal key, not over its base64 text. A missing or different seal key returns
`RESTORE_EXTERNAL_AI_SEAL_KEY_MISMATCH` before any database mutation, because
restored provider credentials would otherwise be unreadable. The OMOP
pseudonym-salt fingerprint is SHA-256 over the exact canonical 64-character
lowercase hexadecimal value in `.env`, with no newline. A different escrowed
salt returns `RESTORE_OMOP_PSEUDONYM_SALT_MISMATCH` before any database
mutation, because the restored OMOP projection would otherwise derive different
numeric source identifiers. Wrong-site, wrong-key, corrupt, unsupported, and
too-new objects fail before outage. The temporary database is migrated and
validated; a failed attempt removes only that isolated database.

An in-place switch is an emergency operation:

```sh
./scripts/restore-backup.sh --in-place \
  backups/lospor-YYYYMMDDTHHMMSSZ-RANDOM.backup
```

It additionally requires the exact displayed site/timestamp confirmation, a
new authenticated pre-restore safety snapshot, and a second destructive-
boundary acknowledgement. The live database is retained under a safe previous
name until the switch is proven. A fail-closed journal records each boundary.
Caddy may reopen only after `doctor.sh --restore-preopen` proves PostgreSQL,
migrations/schema, API, Web, PWA, Browser, Status, operator consistency, and
terminology readiness and emits `RESTORE_PREOPEN_OK`.

Status SQLite is operational state, not part of the clinical PostgreSQL
recovery object. Preserve its volume on the same appliance. If that volume is
lost but the restored clinical database still has an appliance operator, use
the supported `./scripts/appliance-operator.sh repair-status` flow; lost Status
history cannot be reconstructed by copying an unrelated SQLite database.

The release quality gates exercise corrupt, wrong-site, wrong-key,
incompatible, temporary, and emergency-boundary cases. That automated proof
does not replace the hospital’s quarterly off-host restore drill.
