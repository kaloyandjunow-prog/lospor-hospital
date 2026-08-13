# Backup and restore

The reference appliance creates a PostgreSQL custom-format dump every 24 hours
and verifies its SHA-256 sidecar before publishing the pair. Version 1.0.0 does
not archive PostgreSQL WAL files: an unbounded local WAL directory could fill
the clinical server, and point-in-time recovery is not promised in this
release. The supported recovery point is therefore the newest completed dump,
so a whole-host disaster may lose up to approximately 24 hours of changes.

Local retention defaults to 30 days through
`HOSPITAL_BACKUP_RETENTION_DAYS`. Cleanup runs only after a new dump has
completed and passed checksum verification. It removes only complete,
checksum-valid dump/sidecar pairs older than the retention window and always
preserves the newest two valid pairs. Orphaned, malformed, or checksum-invalid
files are reported and left for investigation; the scheduler never disguises
a backup failure by deleting them.

Local copies are not sufficient disaster recovery. Hospital IT must copy each
new valid pair and the required secret escrow to a separate encrypted,
access-controlled system, monitor that copy independently, and keep it outside
the appliance VM/storage. Test restore at least quarterly. The appliance does
not assume or embed the hospital's backup vendor, credentials, or retention
policy for that external system.

Every quality run also performs a destructive restore drill in a uniquely
named disposable Compose project with private temporary volumes. It creates a
sentinel record, makes a dump through the shipped backup script, proves a
checksum-corrupted copy is rejected before the database changes, drops the
sentinel table, restores the genuine dump through the shipped restore script,
and verifies the original record. The release workflow repeats that drill with
the exact digest-approved PostgreSQL image. This CI proof complements, but does
not replace, the hospital's quarterly restore of its off-host copy.

Create a backup:

```sh
./scripts/backup-now.sh
```

Restore a selected dump:

```sh
./scripts/restore-backup.sh backups/lospor-YYYYMMDDTHHMMSSZ.dump
```

Restore stops clinical services, verifies the checksum, replaces the local
database, reapplies migrations, recreates the restricted Status database probe,
and prompts for an active `ADMIN` present in the restored database. That prompt
reconciles the restored clinical password verifier with the monotonic Status
credential generation before the appliance restarts. It is intentionally not a
zero-downtime operation.

The Status container and Caddy remain running during this restore. Operators
can therefore follow progress at `/status/` or through the loopback HTTPS
fallback, although components that depend on the clinical database/API will
correctly show unavailable or unknown.

The PostgreSQL dump does not contain `/data/status.sqlite`. Status uses its own
Docker volume for its verifier, sessions, operational history, and incidents.
On the same appliance, keep that volume and use the supported restore command
above. If the Status volume itself has been lost while the restored clinical
database still has an appliance operator, rebuild the independent verifier
with:

```sh
./scripts/appliance-operator.sh repair-status
```

Operational history from a lost Status volume cannot be reconstructed. Do not
copy an unrelated Status database into place or manually alter credential
generations. See [Status monitor](status-monitor.md) for credential recovery.

The supported automated recovery point is the latest completed dump.
Point-in-time recovery is not available in version 1.0.0.
