# Rolling back the API on an appliance

**This is not the upstream rollback runbook, and it should not become one
again.**

`lospor-api` is developed against a hosted, serverless deployment. Its own
rollback document is written for that world: promote a previous build from a
hosting dashboard, take a point-in-time restore of a managed database, reason
about a build command that runs migrations during deployment. That document was
vendored into this appliance verbatim for months.

None of it applies here. This appliance runs its own PostgreSQL in a container,
is updated from signed release bundles rather than deployments, and the overlay
gate refuses to let the hosting platform's configuration file exist in this
tree at all. An operator who found the upstream document during an incident
would have been following instructions for infrastructure that is not present,
at the worst possible moment to discover it.

## What to do instead

| You want to | Read |
| --- | --- |
| Undo an appliance update | [`docs/updates-compatibility.md`](../../docs/updates-compatibility.md) |
| Restore the database | [`docs/backup-restore.md`](../../docs/backup-restore.md) |
| Know what a release promises about rollback | `release-compatibility.tsv` |

The compatibility row is the authoritative statement for a given release. It
records the migration range that release spans, its rollback policy, and — when
the policy claims a service-compatible rollback — the proof backing that claim.
The current policy is `backup-required`, which means what it says: restore from
a verified backup, and do not expect to step the schema backwards.

## Why the schema still decides this

Migrations run forward on update. The appliance ships no schema downgrades, so
rolling the software back below the schema already applied is not supported and
is not made safe by attempting it. That is why the policy is `backup-required`
rather than something more convenient.

The upstream project's own deployment history — its migration rehearsals, and
the blockers found while rehearsing them — lives in the `lospor-api`
repository, which is where it applies.
