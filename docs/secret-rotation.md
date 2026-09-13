# Operational credential rotation

[Български](secret-rotation.bg.md) | **English**

LOSPOR Hospital has a supported, two-phase host workflow for ordinary
credentials. It does not ask an operator to edit `.env`, Status files, SQLite,
or PostgreSQL by hand.

Run it only from the appliance console as root:

```sh
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh prepare ordinary
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh state
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh commit
```

Operator summaries and failures follow `LOSPOR_DEFAULT_LOCALE` (Bulgarian by
default). A visiting technician can prefix one command with
`LOSPOR_DEFAULT_LOCALE=en` to read it in English. Action, scope, phase,
environment-variable, role, and file tokens remain exact in both languages so
runbooks and audit evidence are not ambiguous.

`prepare` creates a mode-0600 pending transaction under `secrets/rotation/` and
does not change a running service. Review the reported scope and generation,
then use `commit`. Use `rollback` to discard or reverse the prepared
transaction. A failed commit automatically attempts and verifies rollback; if
that cannot be proved, the transaction remains in `ROLLBACK_REQUIRED` and no
operator should guess, remove files, or start another rotation.

After verification, the tool first marks the transaction `COMMITTED`, then
removes its protected copy of the old values. A filesystem cleanup failure can
therefore never undo an already verified rotation. `state` reports that narrow
condition; repair the reported ownership or permissions and run:

```sh
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh cleanup
```

`cleanup` accepts only a protected transaction whose identifier and metadata
both prove that it reached `COMMITTED`. It never changes a running credential.

The command shares `.data/io-mutation.lock` with backup, restore, and release
activation. A rotation therefore cannot overlap a database backup or update.
Every phase is appended to
`.data/security/secret-rotations.v1.jsonl` with only the transaction ID, scope,
generation, time, and fixed phase. Secret values never enter that audit file,
arguments, console output, or container logs.

## Supported scopes

| Scope | What changes | Expected effect |
| --- | --- | --- |
| `sessions` | `LOSPOR_AUTH_SECRET` | All Web/PWA/native sessions and print tokens are deliberately invalidated. Users sign in again. No previous session key is accepted. |
| `workers` | delivery, research-export, retention/cron, and option-snapshot credentials | The API first accepts current and previous credentials, producers move to the new values, verification runs, then the previous values are removed and proved rejected. |
| `status-tokens` | Status snapshot, account/control-plane, API-event, and read-only PostgreSQL probe credentials | Status and API overlap both bearer generations. Operator identity proofs are bound to the exact bearer used for each request. The probe role is changed with the same rollback transaction. Status login sessions and MFA are unchanged. |
| `database` | the `lospor` owner role and `lospor_app` API role passwords | Both roles, `.env`, PostgreSQL, migrator, API, backup, and dependent services move as one maintenance transaction. For each role, the new password's acceptance and the old password's rejection are checked over the service address, where passwords are enforced. |
| `ordinary` | all four scopes above | One generation and one maintenance transaction. This is the normal scheduled rotation. |

The generated monotonic generation is stored as
`HOSPITAL_OPERATIONAL_SECRET_GENERATION`. During worker rotation, temporary
`*_PREVIOUS` variables exist only for the overlap. A successful commit removes
them and recreates the affected services before it records `COMMITTED`.

The independent appliance-operator password has its existing database/Status
two-store transaction and MFA lifecycle. Rotate it separately:

```sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh rotate
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh verify
```

## Deliberately outside this command

Do not use ordinary rotation for patient HMAC/encryption keys, export
pseudonym keys, backup-manifest authentication, administrator or Status MFA
encryption, the external-AI seal key, release-signing trust, or Hospital ↔
Central mTLS/site-signing identity. Those values protect persisted ciphertext,
stable linkage, enrolled authenticators, backups, or a remote protocol identity.
Blind replacement makes data unreadable or breaks Central sequence/withdrawal
continuity.

Hospital ↔ Central identity rotation requires an explicit protocol that keeps
the same site and sequence history while Central authorizes replacement
certificate and signing-key fingerprints. Until that protocol ships, suspend
delivery, preserve the queue/receipts, revoke the site in Central, and follow
the security incident procedure; never overwrite the files and call that a
rotation.

## Acceptance drill

On a disposable Linux appliance, prepare each individual scope and `ordinary`,
commit it, and verify:

1. API, Status, PostgreSQL, Web/PWA, Browser, backup, and delivery worker become
   healthy within the documented maintenance window;
2. old worker, Status, and database credentials are rejected after overlap;
3. sessions are rejected after `sessions`, and a fresh login works;
4. Status operator login/MFA still works after `status-tokens`;
5. a backup taken after rotation authenticates and restores in isolation; and
6. the audit contains phases but none of the old or new secret values.

The Windows contract test proves two-phase file behavior, unpublished-prepare
cleanup, overlap retirement, automatic rollback, commit-boundary cleanup,
hard-link refusal, and audit redaction. The real container, PostgreSQL, and
outage-duration drill remains a Linux release gate.
