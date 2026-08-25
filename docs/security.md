# Security model

[Български](security.bg.md) | **English**

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

Hospital software releases use a detached, raw 64-byte Ed25519 signature over
the exact `release.lock`. The maintainer generates and holds the release private
key outside GitHub and never gives it to Actions, repository secrets, the
installation USB, or a hospital. A site pins the reviewed public key only after
matching its fingerprint through a separate channel. The installation-specific
keys under `secrets/api/` remain necessary for Hospital-to-Central exchange and
must never be treated as software distribution credentials.

The software distribution trust boundary consists of:

- the private GitHub repository and private GHCR packages;
- the maintainer's GitHub account, MFA, recovery methods, sessions, and scoped
  tokens;
- the exact tag-triggered CI candidate and its test/security evidence;
- the maintainer's separate manual publication decision;
- repository-level Immutable Releases;
- SHA-256 checks for the release lock and every payload, plus exact registry,
  platform-manifest, configuration and root-filesystem identities; and
- the maintainer's uninterrupted physical custody of the installation USB; and
- the Ed25519 signature checked against the independently pinned release public
  key.

The canonical `release.lock.sha256` sidecar detects corruption or a changed
lock. The verified lock then detects changed payload bytes and changed image
identities. SHA-256 alone proves only internal consistency with the values
downloaded or recorded from GitHub. Once the site has pinned the release public
key, the Ed25519 signature independently authenticates the exact lock: an
attacker who controls only GitHub or replaces a USB bundle cannot create an
acceptable lock. A site that deliberately has no pinned key remains on
per-release out-of-band digest verification. Immutable Releases prevent
replacement after publication but do not substitute for the independent
signature.

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
the lock sidecar, the raw `release.lock.sig` against the reviewed public key,
and the complete payload set (manifest, deployment archive, security evidence,
and every offline image part) before disconnecting the clean encrypted USB.
Portable image identities are verified later by the production
online launcher after digest-pinned pulls, or by the offline launcher after
loading the checked image parts. The on-site first-install bootstrap verifies the
deployment archive before extracting its embedded launcher and then re-verifies
the full asset set. Record the device identifier, version, lock hash, download
time, and custody changes. The maintainer keeps the device under personal
control and performs the installation on site; the device is not used for
unrelated files.

If the repository/account, publication run, release record, signing workstation
or key, review workstation, or USB custody chain may have been compromised,
stop installation and publication. Revoke affected sessions, tokens, and
registry credentials; preserve the run, audit, endpoint, signing, and media
evidence; assess already installed sites; and issue a new version from a
reviewed clean commit and candidate. A compromised release-signing key requires
an explicit key rotation and a new fingerprint delivered to every site through
the original out-of-band channel. Recomputing hashes from the suspect bundle
alone is not sufficient evidence of recovery.

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

## Which keys can be rotated

Changing a file is not the same as rotating a credential. Ordinary database,
session, worker/cron, and internal Status credentials use the supported
prepare/overlap/commit/verify/rollback transaction in
[Operational credential rotation](secret-rotation.md). The independent Status
operator password uses `scripts/appliance-operator.sh rotate`. Do not edit
either verifier directly.

Session rotation intentionally invalidates every current session. Worker and
Status bearer rotation temporarily accepts current plus previous credentials,
moves the producer, then removes and proves rejection of the old value. The
PostgreSQL role and every dependent service move under the shared maintenance
lock. The fixed audit records only scope, generation, time, transaction ID, and
phase.

Central client/signing identity is not yet supported by that ordinary command.
It requires a Central-authorized replacement protocol that preserves the same
site, batch sequence, receipts, and withdrawal history. Blindly replacing the
files is prohibited.

**Not rotatable: `HOSPITAL_PATIENT_HMAC_KEY`.** This key derives
`PatientLink.identifierHash`, which is the unique index a patient is found by,
and it feeds every pseudonym exported to Central. Changing it does not
re-encrypt anything — it makes every existing linkage unfindable, because the
same patient identifier now hashes to a value that matches no stored row. A
patient's prior operations stop linking to their next one, and every person
already delivered to Central acquires a second, unrelated identity there.

There is no re-key procedure and this release does not add one. Writing one
means re-deriving every linkage locally and reconciling the result with Central,
which is a coordinated migration between two systems and not a script.

Treat this key as escrow-only: back it up with the same care as the database,
keep it for the life of the installation, and do not rotate it as part of
routine credential hygiene.

**Not rotatable in 1.2: `OMOP_PSEUDONYM_SALT`.** The appliance uses the exact
canonical salt text to derive deterministic numeric source identifiers in the
OMOP projection. Replacing it would give restored or newly projected records
different identifiers and break continuity with existing projections. Keep the
raw value in the encrypted `.env` escrow for the life of the installation. Its
non-secret SHA-256 fingerprint is persisted in `.env`, authenticated inside
every backup manifest, and compared before restore may mutate a database.

If it is genuinely compromised, rotating it is not the remedy and will not
undo the disclosure. The remedy is the incident process below, plus a decision
with Central about the affected site's identifiers.

**Not yet rotatable: `HOSPITAL_PATIENT_ENCRYPTION_KEY`,** for the same reason in
a milder form. `PatientLink` rows record a ciphertext format/key version, but
the appliance does not yet carry a retained-key ring and transactional
re-encryption procedure. Replacing the sole configured key leaves existing
ciphertext undecryptable. Do not mistake the version field for a supported
rotation workflow.

The patient HMAC/encryption keys, export pseudonym key, OMOP pseudonym salt,
administrator/Status MFA encryption keys, external-AI seal key, and
backup-manifest authentication key remain escrowed, migration-bound secrets.
Their backup fingerprints make a wrong restore fail closed; they do not make
blind replacement safe.

## Status access and credentials

The normal `/status/` route requires both an address in
`HOSPITAL_STATUS_ALLOWED_CIDRS` and the independent Status login. The fallback
listener is bound to host loopback and must be accessed through an authenticated
SSH tunnel. `HOSPITAL_STATUS_PORT` changes the number only: the appliance
always binds it to loopback, and it must stay that way. Do not publish the
Status port to a LAN or public interface.

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

Step 5 does not include `HOSPITAL_PATIENT_HMAC_KEY` or
`HOSPITAL_PATIENT_ENCRYPTION_KEY`. See "Which keys can be rotated" above:
replacing either destroys existing patient linkage rather than protecting it,
and a compromise of the HMAC key is handled with Central, not by rotation.

## Reverse proxies

The reference Caddy service is the public edge and does not trust forwarded
client-IP headers. If Hospital IT places another proxy or CDN in front, it must
configure only that proxy's exact address ranges and revalidate every VPN/LAN
allowlist. Until then, restricted surfaces fail closed behind an upstream proxy.

## The update request channel widens what a Status compromise can do

Status can ask the host agent to apply a release. It cannot apply one itself —
it runs unprivileged, has no Docker socket, and mounts the agent's state
read-only — but it *is* the authorised writer of the request, and that is worth
stating plainly rather than leaving implied.

A remote-code-execution bug in the Status app is therefore a forged request. No
shared secret fixes this: any secret Status can read in order to sign a request,
an intruder inside Status reads too. The confirmation token binds a
confirmation to a session and a release, which stops a stale page and a
cross-site post; it does not stop code running as Status.

What bounds the damage is the agent's own content check. A request names the
version it believes is installed, and the exact release it approves. The agent
compares both against what it independently finds, and `release_state_assert_transition`
already refuses a downgrade and a same-identity reapplication. So the worst
outcome of a forged request is **a genuine, maintainer-signed, strictly newer
release applied at an inconvenient moment** — an unplanned restart of the
clinical services, not arbitrary code on the appliance.

That is a real widening of blast radius compared with an appliance that could
only be updated from a console, and it is the price of a site being able to
apply a security fix at all without an SSH session. A site that does not want it
simply does not install the agent: without it, the status page reports updates
and nothing more, exactly as before.

Two further limits are deliberate:

- **Recovery sessions cannot apply.** A recovery token is break-glass for
  someone who has lost the password; the one thing it must be able to do is fix
  the credential. The agent checks this itself as well as Status, so a
  compromised Status cannot promote its own session by lying about how it
  authenticated.
- **The maintenance window is the agent's.** Status never reads it, so the hours
  during which the clinical services may be restarted cannot be widened from the
  web page.
