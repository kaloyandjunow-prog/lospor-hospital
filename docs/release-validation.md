# Hospital release validation

A Hospital release is acceptable only after the automated quality workflow and
this Linux appliance drill both pass. The serverless demonstration is not part
of the drill.

## Automated gate

The repository workflow must pass:

- clean installs for API, web, PWA, Browser, Core, and exchange contract;
- pinned-source and exchange-contract verification;
- typecheck, strict lint, unit tests, and production builds;
- PostgreSQL migrations and all PostgreSQL concurrency tests;
- dependency audit at high severity;
- Docker Compose validation and all application image builds.

## Disposable installation drill

1. Install on a disposable encrypted Linux host with production-like DNS.
2. Run `scripts/install.sh`, import approved reference data, and create two
   non-administrator users.
3. Create two cases for the same local patient number and one for a different
   patient. Confirm the raw number is visible only through authorized local
   identity views and never in logs, clinical JSON, audit details, or exports.
4. Disconnect Central and the internet. Complete a case from the PWA, reconnect,
   and verify one consistent local case without duplicate events or lost fields.
5. Approve only selected complete cases for Central export. Verify drafts,
   incomplete cases, and opted-out cases are excluded.
6. Interrupt an upload, restart the worker, and confirm the same batch resumes
   without a second publication.
7. Receive and verify Central's signed receipt. Confirm the local checkpoint
   advances only after receipt verification.
8. Replay the accepted batch and confirm Central returns the prior result
   without duplicate OMOP rows.
9. Submit a withdrawal and verify its signed receipt and local state.
10. Run `scripts/backup-now.sh`, restore to a disposable host, and compare case,
    audit, export-policy, delivery, and checkpoint records.

Record software versions, contract version, database migration, timestamps,
checksums, and the operators who performed the drill.

## Required failure tests

- two concurrent editors and finalization versus a clinical write;
- invalid or expired client certificate;
- altered manifest, ciphertext, signature, receipt, or chunk checksum;
- missing Central connectivity;
- full disk and unavailable backup destination;
- unsupported exchange version and out-of-order sequence.

Do not tag a release when any required test is skipped.
