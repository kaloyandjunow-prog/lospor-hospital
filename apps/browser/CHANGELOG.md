# Changelog - LOSPOR Database

## [0.4.4] - 2026-08-06

### Changed

- Repinned to `@lospor/core` v8.3.2. No behaviour change; the pin would
  otherwise name a core version no other repo is running.

## [0.4.3] - 2026-08-05

### Changed

- Repinned to `@lospor/core` v8.3.0.

### Fixed

- The first sign-in of an end-to-end run is given room to compile the page it
  lands on. The first test of every run failed and every repeat of the same test
  passed: the first sign-in is also the first request for `/overview`, which the
  dev server compiles on demand, and a five-second assertion expired while the
  build was still finishing. It read as a broken login.

## [0.4.2] - 2026-08-05

### Changed

- Repinned to `@lospor/core` v8.2.1.

## [0.4.0] - 2026-08-04

Released alongside LOSPOR v8.0.0.

Requires `@lospor/core` v8.0.0.

### Added

- Pediatric mode is surfaced in cohort building and case views.
- Clinical display terms are shared with the other apps, so a cohort reads the
  same way as the record it came from.

## [0.3.0] - 2026-07-28

- Export history shows each artifact retention deadline and clearly marks expired
  or unavailable files while retaining checksums and generation history.
- Download controls now follow the API artifact-availability contract and also
  reject an expired timestamp in a stale Browser session.

## [0.2.1] - 2026-07-27

- Updated Next.js and its PostCSS/Sharp runtime chain to patched versions.
- Cleared the Database dependency audit and moved CI to Node.js 24 actions.
- Research permissions, disclosure controls, and persisted data are unchanged.

## [0.2.0] - 2026-07-27

- Case and export navigation now follows each action's individual grant and
  institution scope. Direct URLs are server-guarded.
- Aggregate-only researchers receive protected totals and metrics without any
  case-row request or case table.
- Research export creation queues immutable jobs, polls their status, and
  downloads completed artifacts directly without buffering the file in the
  Browser process.
- OMOP CSV is identified as a multi-table ZIP and remains hidden without the
  dedicated OMOP export permission.
- Browser/API tests cover full-access and aggregate-only accounts, disclosure
  ranges, navigation visibility, export polling, and legacy artifact blocking.
- Action-specific scope labels show clinicians exactly which institutions each
- Finalized-date filters now use whole calendar months, matching the
  month-level dates exposed by pseudonymous research records.
- Diagnosis, comorbidity, procedure, and medication filters now reuse the
  existing API searches and Core canonical result parser instead of accepting
  unassisted code text.
  surface can use.

## [0.1.0] - 2026-07-27

- First standalone release for governed cohort building, comparison,
  pseudonymous case review, quality reporting, benchmarking, saved cohorts,
  exports, and research access administration.
- Uses the versioned LOSPOR API exclusively and never receives PostgreSQL
  credentials.
- Uses Core v7.1.0 research contracts and the canonical clinician-reviewed
  English/Bulgarian display registry.
