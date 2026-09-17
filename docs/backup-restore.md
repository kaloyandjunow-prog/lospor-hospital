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
sudo env LOSPOR_DEFAULT_LOCALE=en sh /opt/lospor-hospital/current/scripts/backup-now.sh
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

### Encrypted off-host copies

The appliance can make those copies itself, to a network share mounted on the
server (SMB or NFS) or to an SFTP server. A timer checks every 15 minutes. Each
new verified backup is encrypted on the server (AES-256, with an HMAC-SHA256
over the object name, manifest digest and ciphertext) and copied to the
destination. It is then read back and compared, and only then written to
`.last-offhost-verified.v1`. Set it up from **Maintenance** in Status, or at the
console.

For a share, Hospital IT mounts it first, under `/mnt`, `/media` or `/srv`.
The adapter refuses a path that is only an ordinary local directory. An SMB
example for `/etc/fstab`, with the password in a root-only credentials file
(`username=`, `password=`, `domain=` lines, mode 0600, and the `cifs-utils`
package installed):

```text
//fileserver.hospital.local/lospor-backups  /mnt/lospor-backups  cifs  credentials=/etc/lospor-backups.cred,uid=0,gid=0,file_mode=0600,dir_mode=0700,nofail,_netdev  0  0
```

For SFTP, configuration generates an SSH key for the appliance and pins the
server's host keys. Install the printed public key for the SFTP user, and check
the printed host-key fingerprints with the server's administrator. There is no
password option.

```sh
sudo losporctl backup offhost configure mount /mnt/lospor-backups
sudo losporctl backup offhost configure sftp backup.hospital.local 22 lospor lospor-backups
sudo losporctl backup offhost test
sudo losporctl backup offhost run
sudo losporctl backup offhost drill
sudo losporctl backup offhost state
```

`test` stores a probe file, reads it back and deletes it. `drill` fetches the
newest acknowledged copy, checks its authentication, decrypts it and restores it
into a temporary database, then removes it. That is the quarterly restore from
the real off-host medium described below. The encryption key is
`secrets/backup/offhost-encryption.key`. It is generated once and never
replaced, because every copy needs it. Escrow `secrets/` again after the first
setup: until you do, Status reports the escrow acknowledgement as out of date.
The destination's own retention is Hospital IT's to set.

The hospital must escrow `site.env`, `.env` (including the installation's exact
`OMOP_PSEUDONYM_SALT`), the complete `secrets/` directory (including
`secrets/backup/manifest-hmac-key` and `secrets/api/external-ai-seal-key`), and
the verified recovery objects in a
separate encrypted, access-controlled system outside the appliance VM and
storage. Monitor local and acknowledged off-host ages independently and carry
out a recorded restore from the real off-host medium at least quarterly.

### Escrow the secrets from Status

**Maintenance → Secrets escrow → Create the escrow copy.** Status asks for the
administrator password and a code from the authenticator app, then shows a
passphrase once: write it down before leaving that page. The host writes the
same encrypted file the console command below writes, decrypts it and requires
it to match the files in use, and offers it for 30 minutes to the administrator
who asked. Download it to a USB stick on your own computer. The download is
reported to the host, which records the acknowledgement Go-live checks and
removes the copy from the server.

Because the file and its passphrase together open every secret of the
installation, Status offers this only while its own network list is limited to
the IT management networks, allows at most three copies in 24 hours (counted by
the host), logs every request and download, and notes a download on the
overview for a week. A console-recovery session cannot use it.

### Escrow the secrets at the console

Plug in a USB stick or mount a share from outside this server, then:

```sh
sudo losporctl secrets escrow /media/usb
```

It writes `site.env`, `.env`, `advanced.env` (when present) and all of
`secrets/` as one encrypted file (`lospor-hospital-secrets-<time>.tar.gz.enc`,
AES-256 with a PBKDF2-derived key) with a `.sha256` beside it, decrypts the copy
and requires it to match the files in use, and only then records the
acknowledgement Go-live checks. It refuses a directory on the server's own
disk. The passphrase is generated and shown once: keep it in the IT password
vault, apart from the USB stick. A hospital that manages its own passphrase can
give it with `--passphrase-file FILE` instead. Run it again after any change to
the secrets: a credential rotation, or the off-host encryption key created by
the first off-host setup.

To restore on a replacement server, as root in `/opt/lospor-hospital`:

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in lospor-hospital-secrets-<time>.tar.gz.enc | tar -xz
```

Secrets escrowed another way are recorded with
`sudo sh /opt/lospor-hospital/current/scripts/acknowledge-secrets-escrow.sh`.
Neither the acknowledgement nor Status ever holds a key: only one-way
fingerprints, so a later change of keys shows the escrow as out of date.

## Create and inspect recovery points

Create an ordinary manual point:

```sh
sudo sh /opt/lospor-hospital/current/scripts/backup-now.sh
```

Protected kinds are reserved for the matching workflow:

```sh
sudo sh /opt/lospor-hospital/current/scripts/backup-now.sh --kind pre-update
sudo sh /opt/lospor-hospital/current/scripts/backup-now.sh --kind pre-restore
sudo sh /opt/lospor-hospital/current/scripts/backup-now.sh --kind immutable
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
sudo sh /opt/lospor-hospital/current/scripts/restore-backup.sh --temporary \
  backups/lospor-YYYYMMDDTHHMMSSZ-RANDOM.backup
```

A restore drill proves a backup restores without keeping the copy. It runs the
same checks, restore, migrations and validation as a temporary restore, then
removes the temporary database. Nobody types a confirmation, because nothing a
clinician uses changes. `losporctl backup drill` drills the newest backup, and
**Maintenance** in Status runs the same drill and keeps its results:

```sh
sudo sh /opt/lospor-hospital/current/scripts/restore-backup.sh --drill \
  backups/lospor-YYYYMMDDTHHMMSSZ-RANDOM.backup
sudo losporctl backup drill
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
sudo sh /opt/lospor-hospital/current/scripts/restore-backup.sh --in-place \
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
