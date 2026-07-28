# Hospital product handoff

## Product state

LOSPOR Hospital `1.0.0` is an independent source tree for a locally hosted
hospital appliance. It contains pinned clinical clients and Core, a local API
and PostgreSQL contract, encrypted patient linkage, local research access,
policy-controlled OMOP delivery, backup/restore, and Linux Docker packaging.

Final local repository: `C:\LOSPOR-HOSPITAL` on `main`. It has one local
initial commit, no remotes, and no tags.

The public serverless repositories were not modified. This repository has no
public-demo fallback, Vercel/EAS deployment files, EAS project identity,
default analytics, or self-registration link. The reference appliance ships a
desktop web app, a separate PWA, and a VPN/LAN-restricted research Browser.

## Non-negotiable boundaries

- Raw patient numbers remain encrypted in local `PatientLink` records.
- Central never connects to or writes the Hospital database.
- Only complete, locally approved cases are exported.
- Checkpoints advance only after a verified signed Central receipt.
- Hospital-only work never enters the public serverless repositories.
- No push, tag, production install, terminology import, or Central enrollment
  occurs without a separate decision.

## Verified on 28 July 2026

- Clean `npm ci`: API, web, PWA, Browser, Core, and exchange contract.
- API, web, and Browser clean-clone typechecks generate Next route types from
  an empty `.next` state before running TypeScript.
- Public and internal OpenAPI contracts advertise the current Hospital
  appliance, never the serverless demo.
- Dependency audit: zero known vulnerabilities in all six packages.
- Typecheck: all six packages pass.
- Lint: API, web, PWA, and Browser pass with zero warnings.
- Tests: 910 pass.
- Builds: API and web Next.js production builds, PWA web export, Browser
  production build, and exchange-contract build pass.
- Exported PWA contains no public-demo URL, old mobile package ID, or EAS
  project ID.
- Hospital and Central exchange sources match and are pinned by SHA-256
  `21dd744dde8818f97d32e8a10774056856998fbd6a45eaea3bdfabcdb1be4b57`.
- All 23 appliance shell scripts pass shell syntax validation.
- Compose and GitHub workflow files pass YAML parsing.
- The final tree matches audited staging byte-for-byte and contains no
  ignored/generated files or common private-key/token signatures.

## Required Linux release gate

Docker, Caddy, and PostgreSQL are unavailable on the verification workstation.
Five PostgreSQL test files containing 13 tests are therefore locally skipped.
The repository workflow enables them against PostgreSQL 17.6 and builds all
appliance images. A release also requires the complete drill in
`docs/release-validation.md`, including offline recovery, interrupted upload,
receipt, replay, withdrawal, backup, and restore.
