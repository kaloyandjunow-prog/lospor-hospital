# Security model

## Required controls

- full-disk encryption on the host and every backup destination;
- TLS for all user and Central traffic;
- mutual TLS plus manifest signatures for Hospital-to-Central delivery;
- VPN or identity-aware access for research and administration;
- least-privilege local accounts and protected administrator credentials;
- host firewall, automatic security patching, malware/EDR policy, NTP, and
  centralized monitoring;
- offline escrow for patient, pseudonym, signing, and database recovery keys.

The contents of `secrets/`, `.env`, `backups/`, PostgreSQL volumes, and runtime
export volumes are sensitive. They are excluded from Git but still require
filesystem permissions and encrypted media.

## Secret separation

Secrets are split by runtime boundary:

- `.env` contains appliance configuration and application/database secrets;
- `secrets/api/` contains the Hospital signing keypair, the Central client key
  and CSR, and, after enrollment, the Central-issued client certificate and
  CA; and
- `secrets/status/` contains Status snapshot/event tokens, rate-limit key,
  restricted database-probe password, and loopback fallback TLS material.

The API container mounts `secrets/api/` plus only its individual Status
snapshot and event-producer tokens. It cannot see the remaining Status secret
directory. Status cannot see the API/Central key directory, clinical database
credential, patient-data volumes, or Docker socket. Its PostgreSQL role can
connect and execute `SELECT 1` but has no schema, table, or sequence privileges.

## Status access and credentials

The normal `/status/` route requires both an address in
`HOSPITAL_STATUS_ALLOWED_CIDRS` and the independent Status login. The fallback
listener is bound to host loopback and must be accessed through an authenticated
SSH tunnel. Do not publish port `3443` to a LAN or public interface.

The initial appliance email/password is verified separately by the clinical
database and Status SQLite. Credential generations, not password hashes, are
compared to detect drift. Use `scripts/appliance-operator.sh` for every
initialization, rotation, transfer, repair, and restore reconciliation; never
edit either credential store directly. Console recovery tokens are one-use,
expire after 15 minutes by default, and grant Status access only.

## Logging and telemetry

Status accepts only strict, versioned aggregate snapshots, fixed-schema service
markers, and allowlisted operational event codes. These operational feeds
reject arbitrary text and do not collect clinical payloads, raw identifiers,
request bodies, stack traces, or Docker logs. Status stores the appliance
operator email only in its separate login credential store. Raw service logs
remain local to the appliance host and are size-rotated by Compose.

The appliance deliberately has no Sentry integration, external log drain, or
external application telemetry. Releases must pass:

```sh
npm run verify:no-external-telemetry
npm run verify:safe-runtime-logs
```

## Data minimization

The clinical model rejects likely direct identifiers. Patient linkage is a
separate encrypted local concern. Central receives only the approved
pseudonymized OMOP projection and technical provenance required to verify it.

## Certificate lifecycle

Hospital signing and mTLS keys are installation-specific. Rotate them after
suspected compromise and on the institutional schedule. Central must revoke a
site before accepting a replacement identity. Standalone setup creates a CSR,
but no client certificate or Central CA; those arrive only through explicit
Central enrollment. The separate self-signed Status fallback certificate is
valid only for the loopback `localhost` operations page and has no Central role.

## Incident rule

If key compromise, unauthorized export, database exposure, or unexplained
revision mismatch is suspected:

1. stop Central delivery without deleting the queue;
2. preserve logs, receipts, and host evidence;
3. revoke the site at Central;
4. notify the hospital security/data-protection process;
5. restore service only with reviewed replacement credentials.

## Reverse proxies

The reference Caddy service is the public edge and does not trust forwarded
client-IP headers. If Hospital IT places another proxy or CDN in front, it must
configure only that proxy's exact address ranges and revalidate every VPN/LAN
allowlist. Until then, restricted surfaces fail closed behind an upstream proxy.
