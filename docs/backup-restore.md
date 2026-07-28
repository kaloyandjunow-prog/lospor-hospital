# Backup and restore

The reference appliance creates a PostgreSQL custom-format dump every 24 hours
and a SHA-256 sidecar. Dumps remain on the local host for the configured
retention period. PostgreSQL WAL files are also archived locally.

Local copies are not sufficient disaster recovery. Hospital IT must copy
backups and the required secret escrow to a separate encrypted, access-
controlled system. Test restore at least quarterly.

Create a backup:

```sh
./scripts/backup-now.sh
```

Restore a selected dump:

```sh
./scripts/restore-backup.sh backups/lospor-YYYYMMDDTHHMMSSZ.dump
```

Restore stops clinical services, verifies the checksum, replaces the local
database, reapplies migrations, and restarts the appliance. It is intentionally
not a zero-downtime operation.

The supported automated recovery point is the latest completed dump. WAL
archives are retained for specialist recovery work, but point-in-time recovery
is not automated by this reference package.
