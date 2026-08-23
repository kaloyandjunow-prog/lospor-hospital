# Central transport control from Status

[Български](central-status-control.bg.md) | **English**

Central is disabled on a fresh Hospital installation. When enabled it is
push-only: Hospital constructs encrypted, signed batches and sends them out;
Central has no route, credential, or database role with which to query or write
the Hospital database.

## Two independent locks

`/status/control` deliberately separates two actions. Each form requires the
current appliance-operator password again and produces its own audit event.

1. **Transport configuration** uses the one-use Central enrollment token,
   HTTPS endpoint, site code/name, institution, installed client certificate,
   and Central CA. The recorded configuration hash includes no token or private
   key. Successful enrollment stores the site/capability metadata and transport
   lock atomically with its local audit row.
2. **Clinical export approval** may be enabled only after a transport lock
   exists. It records whether export is enabled, whether redacted text is
   included, the fixed `bg-en-v1` redaction profile, approver, date, transport
   hash, and reason. Turning transport on never turns clinical export on.

The old clinical-ADMIN mutations `POST /v1/hospital/enroll`,
`PUT /v1/hospital/export-policy`, and `POST /v1/hospital/deliveries` are closed
with no-store `404` in 1.2.0. They bypassed the independent Status password
proof, the two-lock ordering, or the bounded audited retry operation. Their
read-only policy and delivery-history GETs remain compatibility views; they
cannot enable transport, approve export, or initiate a push.

## Automatic case delivery and withdrawal in the clinical application

After the appliance-wide transport and clinical-export locks have been set in
Status, every eligible finalized case is queued automatically. Drafts,
incomplete cases, and cases still inside the finalization undo window remain
local. There is no initial per-case include, approve, or exclude decision.

Hospital Web shows a bounded Central state to the Member who created the case,
the HOD responsible for its institution, and a clinical Admin. The immutable
creator keeps only this narrow delivery authority after a case is transferred;
ordinary case read/write, finalization, print, and research access remain under
their separate scopes. A paginated `/central-delivery` page lets that creator
find the control after transfer without reopening the clinical record. Its list
contains only an internal route key, finalization time, and bounded delivery
state. These controls are intentionally absent from Mobile and
PWA. The state distinguishes never exported, queued, accepted, withdrawal
pending, withdrawn, and rejected. It never returns a patient identifier,
Central pseudonym, raw batch identifier, payload, or free-text Central error.

An accepted case can be withdrawn, then sent again later. Both actions lock the
case row and the Central reservation advisory lock before changing state, and
the action plus its bounded audit row commit in one PostgreSQL transaction. A
case already reserved in an active batch cannot be changed while that delivery
is in progress; the UI waits for the signed result. Withdrawal stays
**pending** until a valid signed acceptance has committed locally, at which
point it becomes **withdrawn**. Sending it again queues a new UPSERT; it never
deletes or rewrites the Hospital case.

## What Status displays

Status receives operational metadata only: endpoint origin, site and
institution IDs, transport hash/time, certificate and CA SHA-256 fingerprints
and validity, signing/receipt key IDs, manifest compatibility and size policy,
enrollment/capability/delivery times, queue counts, batch sequence/status/case
count, ciphertext/manifest/receipt hashes, fixed failure code, attempts, next
retry, and signed-receipt acceptance time.

It never receives or displays the enrollment token, password, PEM certificate,
private/public key material, database credentials, case identifiers, clinical
fields, free-text failure details, or export payload. Retry is available only
for `RETRY` or `REJECTED` batches, requires password confirmation and a reason,
and commits with its audit row. Both new reservations and claims for existing
batches require a complete transport lock and an enabled, dated clinical-export
approval; disabling the policy therefore prevents a queued/failed batch from
being claimed or retried through a legacy path.

## Enrollment prerequisites and recovery

Central must first sign `secrets/api/site-client.csr`; Hospital IT installs the
returned client certificate as `secrets/api/site-client-cert.pem` and the CA as
`secrets/api/central-ca.pem`. Central then creates a one-use enrollment token.
Hospital IT opens Status, configures the transport lock, and separately decides
whether to approve clinical export.

Central enrollment crosses two independently committed systems. PostgreSQL can
atomically couple the local configuration and audit row, but it cannot make the
remote Central token consumption part of that same database transaction. If
Central accepts enrollment and the local commit then fails, stop and reconcile
the site in Central before requesting a replacement token; do not weaken the
local audit or certificate gates to retry blindly.

See [central-status-control.bg.md](central-status-control.bg.md) for Bulgarian.
