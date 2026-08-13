# Security model

## Required controls

- full-disk encryption on the host and every backup destination;
- TLS for all user and Central traffic;
- mutual TLS plus manifest signatures for Hospital-to-Central delivery;
- VPN or identity-aware access for research and administration;
- least-privilege local accounts and protected administrator credentials;
- host firewall, automatic security patching, malware/EDR policy, NTP, and
  centralized monitoring;
- offline escrow for patient, pseudonym, site-delivery, and database recovery
  keys.

The contents of `secrets/`, `.env`, `backups/`, PostgreSQL volumes, and runtime
export volumes are sensitive. They are excluded from Git but still require
filesystem permissions and encrypted media.

## Software release distribution trust

Hospital software releases do not use a release private key, detached
cryptographic approval, or public-key trust root. Do not create or request one
for this release process. The installation-specific keys under `secrets/api/`
remain necessary for Hospital-to-Central exchange and must never be treated as
software distribution credentials.

The software distribution trust boundary consists of:

- the private GitHub repository and private GHCR packages;
- the maintainer's GitHub account, MFA, recovery methods, sessions, and scoped
  tokens;
- the exact tag-triggered CI candidate and its test/security evidence;
- the maintainer's separate manual publication decision;
- repository-level Immutable Releases;
- SHA-256 checks for the release lock and every payload, plus exact registry
  digests and local image IDs; and
- the maintainer's uninterrupted physical custody of the installation USB.

The canonical `release.lock.sha256` sidecar detects corruption or a changed
lock. The verified lock then detects changed payload bytes and changed image
identities. These checks prove internal consistency with the values downloaded
or recorded from GitHub; they do not independently prove who published those
values. An attacker who controls the repository/account or replaces the USB
bundle and every comparison record before verification can produce a different
but internally consistent bundle. Immutable Releases prevent replacement after
publication; they do not create a publisher identity outside GitHub.

The maintainer must therefore use MFA, keep account recovery material offline,
review active sessions and tokens, and reserve repository write permission for
the release account. Each hospital registry credential must be separate,
read-only, and revocable. Immediately before dispatch, visually confirm the
repository's Immutable Releases setting and enter both exact version-bound
confirmations required by the workflow. The workflow does not hold an
administrator token for that settings check; after publication it requires
GitHub to report the resulting release as immutable. Stop publication if the
candidate run, attempt, commit, tag, expected lock hash, or setting does not
agree with the independently retained release record.

For physical delivery, download the final assets from the private immutable
GitHub Release into a new empty directory on a controlled workstation. Verify
the lock sidecar and the complete payload set (manifest, deployment archive,
security evidence, and every offline image part) before disconnecting the clean
encrypted USB. Registry image IDs are verified later by the production online
launcher after digest-pinned pulls, or by the offline launcher after loading
the checked image parts. The on-site first-install bootstrap verifies the
deployment archive before extracting its embedded launcher and then re-verifies
the full asset set. Record the device identifier, version, lock hash, download
time, and custody changes. The maintainer keeps the device under personal
control and performs the installation on site; the device is not used for
unrelated files.

If the repository/account, publication run, release record, workstation, or USB
custody chain may have been compromised, stop installation and publication.
Revoke affected sessions, tokens, and registry credentials; preserve the run,
audit, endpoint, and media evidence; assess already installed sites; and issue a
new version from a reviewed clean commit and candidate. Recomputing hashes from
the suspect bundle alone is not sufficient evidence of recovery.

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

Hospital site signing and mTLS keys are installation-specific and serve only
Hospital-to-Central exchange. They are unrelated to software release
verification. Rotate site keys after suspected compromise and on the
institutional schedule. Central must revoke a site before accepting a
replacement identity. Standalone setup creates a CSR, but no client certificate
or Central CA; those arrive only through explicit Central enrollment. The
separate self-signed Status fallback certificate is valid only for the loopback
`localhost` operations page and has no Central role.

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
