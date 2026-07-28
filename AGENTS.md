# LOSPOR Hospital engineering rules

This repository is the independent, locally hosted Hospital product.

- Never add Hospital-only code, deployment files, patient identity logic, or
  Central-delivery logic to the public serverless repositories.
- Never configure a Hospital client to fall back to `lospor.org` or any public
  demo endpoint.
- Raw hospital patient numbers stay in `PatientLink`; they must not enter
  clinical JSON, audit details, logs, telemetry, research files, or Central.
- Central is push-only. It cannot query or write the Hospital database.
- Only complete, locally approved cases may be exported. Advance checkpoints
  only after verifying a signed Central receipt.
- Treat `vendor/lospor-core` and `vendor/exchange-contract` as pinned imports.
  Update them deliberately, record source versions, and update the contract
  checksum.
- Run the root typecheck, test, strict lint, build, PostgreSQL integration, and
  appliance gates before a release.
- Do not push, tag, deploy, import licensed terminology, or alter a production
  database without explicit authorization.
