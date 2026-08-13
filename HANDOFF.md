# Hospital product handoff

## Product state

LOSPOR Hospital `1.0.0` is a locally hosted Linux container appliance. It
contains pinned clinical clients and Core, a local API and PostgreSQL contract,
encrypted patient linkage, local research access, policy-controlled OMOP
delivery, independent operational Status, and backup/restore tooling.

The canonical source is the private `kaloyandjunow-prog/lospor-hospital`
repository. Releases are created only from an immutable `hospital-X.Y.Z` tag
after the ordinary quality workflow, the candidate workflow, and the complete
release drill have passed. The release record, not a developer workstation or
an untagged checkout, identifies the software delivered to a hospital.

The public serverless repositories are not modified by Hospital releases. This
repository has no public-demo fallback, Vercel/EAS deployment files, EAS
project identity, default analytics, or self-registration link. The appliance
ships a desktop Web app, a separate PWA, a VPN/LAN-restricted research Browser,
and a failure-independent Status service.

## Non-negotiable boundaries

- Raw patient numbers remain encrypted in local `PatientLink` records.
- Central never connects to or writes the Hospital database.
- Only complete, locally approved cases are exported.
- Checkpoints advance only after a verified Central-signed receipt.
- Hospital-only work never enters the public serverless repositories.
- A release tag and published release are immutable; fixes require a new
  version rather than moving a tag or replacing release assets.
- Production installation, terminology import, and Central enrollment remain
  explicit operator decisions.

## Release evidence

The exact evidence for a release is generated from its tagged commit and kept
with the candidate and final release artifacts. It includes:

- clean dependency installation, typecheck, lint, unit and PostgreSQL tests;
- API, Web, PWA, Browser, Status, migration, and exchange-contract builds;
- resolved source, publication, and runtime Compose-model checks;
- provenance, Hospital-overlay, distribution-boundary, telemetry, and safe-log
  checks;
- vulnerability reports and SBOMs bound to the exact ten image identities;
- migrator, backup/restore, clean-install, clinical Web/PWA/Browser, Status,
  online-install, and offline-install gates; and
- a canonical release lock and SHA-256 sidecar covering the deployment kit,
  evidence, and exact image digests.

Do not substitute this file, a local test count, or a workstation state for the
version-specific CI and release evidence.

## Required Linux release gate

The supported production target is a 64-bit Linux server or Linux VM running
Docker Engine and Compose v2. Before tagging, complete and record the disposable
installation drill and every required failure test in
`docs/release-validation.md`, including offline recovery, interrupted upload,
receipt, replay, withdrawal, backup/restore, credential rotation, Status outage
access, certificate failures, and full-disk behavior. Do not tag when a required
test or capacity prerequisite is skipped.
