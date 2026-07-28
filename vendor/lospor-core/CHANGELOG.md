# Changelog - LOSPOR Core

## [7.3.0] - 2026-07-28

### Added

- Research export records now expose revision-manifest version, artifact expiry,
  and current download availability through the shared API/Browser contract.

### Changed

- Consumer documentation now includes the API and standalone Database Browser.

## [7.2.0] - 2026-07-27

### Added

- Action-specific research scope DTOs, protected cohort-count ranges, valid
  observation denominators, and binary complement suppression.
- Immutable background-export metadata for source cutoffs, definition and
  revision-manifest hashes, matching-case counts, source commits, artifact
  status, checksums, filenames, byte sizes, and legacy records.

### Changed

- Aggregate research queries and permission-authorized case queries now have
  separate response contracts.

## [7.1.0] - 2026-07-27

### Added

- Canonical `@lospor/core/display` registry with 950 clinician-reviewed English
  and Bulgarian labels, aliases, provenance, deterministic fallbacks, and stable
  code identity for every first-party client.
- Provider-independent `@lospor/core/research` contracts for governed cohorts,
  comparisons, quality metrics, benchmarks, pseudonymous case inspection,
  grants, exports, and small-cell suppression.

### Changed

- Clinical catalogs, summaries, event descriptions, case statuses, laboratory
  terms, and complication displays now expose shared presentation metadata
  without changing persisted clinical codes.

## [7.0.1] - 2026-07-25

- Coordinated reliability release tag. Core clinical and synchronization
  behavior is unchanged from v7.0.0.
- The release gate packs this exact Core revision and verifies it against API,
  web, and mobile/PWA before the ecosystem is tagged.

## [7.0.0] - 2026-07-25

### Added

- Framework-free API version, capability, health, error, and session contracts
  for the dedicated LOSPOR API service and all first-party clients.
- Repository boundary checks that keep Core independent of Next.js, Prisma,
  React, Expo, storage, and network implementations.

### Changed

- Core is now the shared contract layer for a five-repository architecture:
  API, web, mobile/PWA, Core, and documentation.
- The release package remains source-only TypeScript and is consumed from the
  immutable `v7.0.0` Git tag.

## [6.0.0] - 2026-07-24

### Added

- The complete authored clinical option catalog now lives in Core, including
  deterministic IDs, aliases, trees, profile metadata, and the bundled offline
  fallback used by every client.
- Shared laboratory search/ranges, ICD-10 body-system classification, ASA and
  risk bands, preoperative section completion, intraoperative blockers and
  warnings, postoperative/Aldrete rules, and handover normalization.
- Shared monitoring and airway decisions, semantic event descriptions,
  timetable/case summary models, lifecycle timing, and measurement display
  metadata.
- Framework-free option-cache, case-lock, polling, revision/conflict, account,
  and typed clinical-search contracts with storage and transport adapters.
- Autosave now quarantines fields rejected by the server as non-retryable PII
  while continuing to save safe sibling fields.
- Rejected values remain in durable local storage, survive reopening, and are
  retried only after the clinician changes the affected field.
- Shared blocked-save metadata carries the field, reason, display message, and
  equivalent wire keys to web, PWA, and mobile.
- Gas settings at a timetable column are resolved by one shared helper,
  including FGF, carrier-gas fractions, FiO2, and the change column.
- Shared intraoperative timing converts exact instants and IANA timezones
  consistently across web, PWA, mobile, overnight cases, and DST boundaries.
- Autosave flushes the intraoperative timing patch before appending or mutating
  timetable events, including after an offline restart.

### Changed

- `GENERAL_BALANCED` is canonical; legacy `GENERAL_COMBINED` values normalize
  on read and write.
- Web and mobile can now consume the same `CaseDetailDto`, clinical catalogs,
  summaries, validation results, and synchronization decisions without Core
  depending on either framework.

## [5.6.1] - 2026-07-24

### Added

- Canonical case-detail DTOs and intraoperative event/timetable wire types are
  shared by web and mobile instead of being declared independently.
- Runtime parsers validate legacy timetable snapshots and queued events before
  either app hydrates them. Invalid rows are dropped while vital-sign column
  alignment is preserved.

### Changed

- Legacy infusion rates accept number-or-text input at the wire boundary; each
  app converts them explicitly where arithmetic is required.

## [5.6.0] - 2026-07-23

### Added

- A single `createAutosaveManager()` now owns durable-first section saves,
  per-case write ordering, revisions, snapshots, event appends, targeted event
  edits/deletes, replay, status, and cleanup for both apps.
- A durable event-mutation journal preserves offline edits and deletions without
  replaying stale whole-timeline snapshots.
- Section revisions may be integer counters or legacy timestamps during the
  migration period. Pending event appends adopt a newer server revision and
  retry once.
- Explicit partial-section saves merge confirmed fields into the manager's
  snapshot instead of replacing the full snapshot with a fragment.
- Per-case discard clears patches, pending events, mutations, revisions, and
  snapshots together.

## [5.5.1] - 2026-07-23

### Added

- Canonical intraoperative vital auto-fill preferences and planning helpers now
  live in core, so web and mobile share the same master-toggle, BP/HR, and
  backfill-on-reopen semantics.

### Fixed

- Auto-fill planning now handles multi-column gaps, skips columns that already
  contain a vital event, and refuses to generate observations before the chart
  start.

## [5.5.0] - 2026-07-23

Version alignment with web, mobile, and docs. No shared core API or runtime code
changes in this release line.
