# Changelog - LOSPOR Database

## [0.6.0] - 2026-08-24 - 1.2.0 Browser wave

### Added

- Bulgarian-first Browser UI with retained English, a prominent pre-auth
  selector, appliance-default discovery, and account-locale authority after
  login. Automated parity tests cover every shipped message key.
- Eight-hour aggregate-only self-authorization for clinical accounts, limited
  to one activation per rolling 24 hours and explicitly excluding inspection,
  export, OMOP, and sharing.

### Changed

- The login research-context panel and browser metadata now follow the same
  live BG/EN locale as the form and legal links. Switching to English no longer
  leaves Bulgarian promotional copy or a Bulgarian tab title on the screen;
  component and catalog tests cover both states.
- Authentication redirects now retain only a validated, same-origin research
  workspace path and return there after sign-in. Absolute, scheme-relative,
  control-character, unknown, and authentication-loop destinations fall back
  to `/overview`. Sign-out remains on the authenticated screen if server-side
  revocation fails instead of pretending the HttpOnly session is gone.
- Browser no longer grants or revokes research access. Hospital Status is the
  authority for granular, time-bounded grants; Browser displays the effective
  query, inspect, CSV/JSON, OMOP, and sharing capabilities read from the API.
- Case links and labels use stable research pseudonyms. Operational case IDs,
  case codes, patient-link IDs, identifier hashes, and patient numbers are not
  rendered.
- Aggregate and inspect-capable views preserve `<5` small-cell and
  complementary suppression instead of treating inspection authority as a
  privacy bypass.
- Saved-cohort metadata and complete filter definitions can now be edited in
  the Browser. Every filter in the current shared research contract is
  reachable, multi-value fields and exact dates round-trip, and unknown future
  filters are preserved. Updates use the last observed revision and show a
  conflict instead of overwriting a newer change. Edit and delete
  controls require both the exact cohort owner and the save capability; a
  shared cohort no longer appears mutable merely because it has an owner ID.
  Visibility is not silently rewritten when sharing permission changes, while
  the owner can still deliberately make the cohort private.

### Changed

- Migrated Vitest config to ESM (`vitest.config.mts`) and declared trusted
  install scripts under npm 11's `allowScripts`.

## [0.5.0] - 2026-08-11

### Fixed

- **Three different answers were rendered as the same blank chart.** The
  benchmark picker hard-coded seven metrics, two of which — paediatric rate and
  mean age in days — benchmarking has no evaluator for, so choosing either drew
  an empty chart. An empty chart also meant "no matching cases" and "withheld
  because too few cases to report". A researcher had no way to tell a missing
  feature, or a privacy rule, from a finding about the data.

  The picker now comes from the server's `supportedBenchmarkMetrics`, so a
  metric that cannot be plotted is not offered at all. The remaining two states
  say which they are, in both languages. Partial suppression keeps the chart and
  names how many periods were withheld, because withholding some periods is not
  the same as having nothing to show.

### Changed

- `@lospor/core` moved from v8.3.2 to v9.0.0. The browser had been a version
  behind the API, which is how it came to be reading a list of metrics the API
  had already stopped meaning.

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
