# Changelog - LOSPOR Core

## [8.5.0] - 2026-08-07

### Fixed

- **Background sync could stop for the rest of a session.** `createSingleFlightPoller`
  re-armed only inside the in-flight poll's `.finally()`, and `trigger()` returned
  the pending promise while one was running. A single request that never settled
  therefore left the poller permanently asleep — queued clinical work sat until
  the clinician pressed sync by hand, and returning to the foreground did not
  help, because that received the same stuck promise.

  Polls now run under a watchdog (three intervals, or 30s, whichever is longer).
  An overrunning poll is abandoned so the loop always re-arms, and a run that
  finishes after being abandoned cannot clear a newer one.

## [8.4.0] - 2026-08-06

### Added

- `@lospor/core/vocabulary` — the offline clinical vocabulary: 16,175 ICD-10
  codes with Bulgarian and English labels, and 330 procedure groups reduced from
  82,121 PCS rows. Generated from the database and `pcs.json`, stamped with a
  version, and expanded lazily so the phone never parses it at startup. Each
  procedure group carries the vocabulary of every code within it, so a group
  stays reachable by the wording of the codes the reduction drops — without that,
  "resection" stopped finding Gastrectomy.
- ICD-10 ranking in `@lospor/core/search`: `searchIcd10`, `selectIcd10Candidates`,
  `mergeIcd10Results`, `formatIcd10Result`, `isIcd10CodeLikeQuery`. Moved from the
  API so the server, the web app and the offline mobile copy cannot disagree
  about which diagnosis a query returns. Parity with the live database is
  verified, not assumed.
- Procedure ranking (`searchProcedures`, `PROCEDURE_COMMON_GROUPS`) for the same
  reason.
- `CanonicalSearchTag.vocabularyVersion`, set only on tags chosen from the
  offline copy. `PreopDiagnosis.code` is a plain string with no foreign key, so a
  code from a stale bundle is stored silently rather than rejected; the stamp is
  what makes such a case findable afterwards.

### Fixed

- Procedure results are ordered by score and then by group name. Ties previously
  fell out of whatever order the rows arrived in, so the full PCS table and the
  reduced offline copy listed the same groups differently — the clinician saw a
  different first suggestion depending on the network.

## [8.3.2] - 2026-08-06

### Added

- Weight-based paediatric premedication dosing (`pediatric-premedication.ts`).
  The premedication catalogue holds fixed adult amounts — midazolam 7.5 mg,
  paracetamol 1 g — with no weight or age term anywhere in the type. Mobile
  handled that by offering a child nothing at all; web offered the adult numbers
  unchanged. This resolves a starting dose from the child's own weight and age
  for 19 drugs, capped at the adult dose and rounded to a giveable increment.
  It never falls back to the adult amount: a drug with no paediatric rule is
  reported as manual entry, and a request with no weight recorded asks for one
  rather than dosing on an assumption.
- Drugs that should not be given to a child are withheld with the reason rather
  than silently dropped — codeine at any paediatric age, aspirin under 16,
  tramadol under 12, ibuprofen under 3 months.
- Intranasal dexmedetomidine, 4 mcg/kg capped at 200 mcg, new to the
  premedication catalogue. Intranasal only; the intravenous product is an
  intraoperative infusion and already lives in that catalogue.
- `pediatric-premedication-library.ts` rebuilds a whole premedication library
  for one child. It lives here rather than in either client because both render
  the same list for the same patient, and two implementations would eventually
  disagree about a dose.

### Fixed

- A haematocrit printed as a fraction is converted to a percentage. Analysers
  commonly report it as `0.41`, sometimes unlabelled and sometimes labelled `%`
  regardless; the latter passed as already-canonical and was offered pre-ticked.
  This is a magnitude test, which this module otherwise refuses to do, so it is
  confined to the one analyte where the two scales cannot overlap — haematocrit
  is 0.10–0.75 as a fraction and 10–75 as a percentage. It is deliberately not
  applied to the other percentage tests: reticulocytes are normal at 0.5–2.5%
  and eosinophils at 1–6%, where scaling a sub-1 result would invent pathology.

### Fixed

- An unassessed Aldrete score is no longer a score of zero. `aldreteTotal`
  counted a missing component as zero, so one recorded subscore produced a total
  as though the other four had been assessed and found absent. That is not a
  cautious default: zero on every component describes a patient who is
  unresponsive, apnoeic and shut down — the labels are "no movement", "apnoeic",
  "BP more than 50% from baseline". A patient nobody had assessed was documented
  with the worst score the scale can express, and it reached the research export
  as fact. A genuine zero is still recorded as zero; "not assessed" and
  "assessed as zero" are different statements and now have different values.
- `canonicalizePostopPatch` did the same from the other side, computing a total
  as soon as any one component appeared. It now waits for all five, and clears a
  stale total when a save leaves the set incomplete.
- Finalisation no longer accepts a preoperative record that merely exists.
  Existence was the only test, so a draft with nothing but an id could be
  finalised through the API while every client refused to. It now runs the
  section-completion validator, which reduces to the five genuinely required
  sections because the optional ones report `"optional"` rather than `"empty"`.
  A partial Aldrete is refused too.

### Added

- `isAldreteComplete`, for asking the question directly rather than inferring it
  from a total.
- `NO_INSTITUTION_ID` and `canHaveHeadOfDepartment` in `account.ts`. Web and
  mobile both need to know which institution means "none" — the settings menus
  must not offer "Leave" to somebody already there, and registration has to be
  able to steer people to it. The API re-exports these rather than keeping its
  own copy, so the string exists once instead of three times.
- The clinical issue code `incomplete_preop`.

### Changed

- **Breaking:** `aldreteTotal` now returns `number | null` rather than `number`.
  Callers that render it must handle the null — showing "—" rather than a total
  the patient does not have.

## [8.2.1] - 2026-08-05

### Fixed

- A weight entered in tenths is now shown in tenths.
  `measurementDisplayValues` returned a precision of 0 from its canonical-unit
  branch whatever step it was given. That is right for an adult weight, which
  moves in whole kilograms, and wrong for a paediatric one, which moves in
  tenths: the mobile weight wheel rendered every value through `Math.round`, so
  1.0 to 1.4 all printed "1" and 1.5 to 2.4 all printed "2". Every value on the
  wheel was distinct and correct — only the labels collapsed, which reads as a
  broken control rather than a display bug. Precision now follows the step, via
  the new `precisionForStep`.
- This was not only paediatric: any adult range with a 0.5 kg step showed
  "5 5 6 6 7 7" for the same reason.

## [8.2.0] - 2026-08-05

Clinical safety fixes to dosing, lab conversion and ideal body weight.

### Fixed

- Paediatric quick-dose buttons are kept to doses the child in front of you
  could plausibly receive. Quick values are authored per drug, not per patient,
  and a band spans a 4 kg neonate and an 80 kg adolescent — so its buttons were
  sized for the largest child it covers. Across the platform ruleset, 78 of 82
  auto-dosing bands offered a one-tap value more than three times the calculated
  dose; a 3.5 kg neonate was offered 800 mg of sugammadex against a calculated
  7 mg. The slider, its maximum and manual entry are unchanged: this decides
  what is worth one tap, not what may be given. Paediatric only — adult ladders
  are authored for adults and several carry a legitimate dose far above the
  routine one, such as sugammadex 16 mg/kg for immediate reversal.
- A tall adolescent gets an ideal body weight again. The CDC growth reference
  ends at the median stature for twenty years — about 163 cm for a girl, 176 cm
  for a boy — and above that every weight-based dose silently stopped being
  suggested. Devine covers that range and the two overlap, so the hand-over
  happens where the growth reference runs out, which is also where the two
  methods agree most closely. A preterm infant, an unrecorded height, age or sex
  keeps its own reason, and the hand-over is gated on Devine's five-foot anchor
  so a small child is never given an adult formula.
- Devine no longer clamps its result at zero. Below five feet the estimate
  degrades with every centimetre and passes through zero around 102 cm, and the
  clamp presented that as an answer — a zero ideal weight, and a zero
  weight-based dose. It now declines below 140 cm, which keeps short adults
  dosing normally (43 kg at 150 cm) while refusing the part of the line that has
  collapsed (25 kg at 130 cm).
- Lab values imported from a report are converted once, from the unit the report
  printed, instead of being converted again downstream.

### Changed

- `PEDIATRIC_DRUG_DOSE` is retired for authoring. It was a second, independent
  way to state a paediatric dose — its own age bands, its own arithmetic — and
  no cover from the authoring scope guard, so a dose written in that format
  bypassed every per-kilogram, ceiling and age-band protection guarding drug
  profiles. No rule of the kind has ever been authored. Reading is unaffected
  and the runtime bundle keeps its `doseProfiles` field, so cached clients keep
  working.
- `resolveDrugSelectionSurface` takes an optional
  `clampQuickValuesToCalculatedDose`. Additive; existing callers are unchanged.

## [8.1.0] - 2026-08-04

Pediatric dosing is cleared for production.

### Changed

- `PEDIATRIC_PRODUCTION_READY` is now `true`. This is a clinical sign-off, not a
  deployment switch: it asserts the pediatric drug profiles have been reviewed
  as fit to calculate a dose for a real child. Production still additionally
  requires `PEDIATRIC_MODE_ENABLED=true`; either alone is not enough.

  Signed off against LOSPOR_PEDIATRICS v2 (335 rules): identical drug coverage to
  the adult ruleset — 181 bolus drugs, 48 infusions, 22 fluids — with three drugs
  withheld from children entirely, nine gated by age or weight, and no
  overlapping bands once age and weight are considered together.

### Fixed

- `PEDIATRIC_RULESET_VERSION` no longer says `draft`. It is stamped onto every
  pediatric dose as `clinicalRulesVersion`, so while it read
  `2026.07.29-draft.1` any dose recorded in production would have carried a
  draft as its permanent provenance. Now `2026.08.04-release.1`. No pediatric
  case existed in production at the time of the change, so no record refers to
  the draft value.

## [8.0.0] - 2026-08-04

First stable release. Adds pediatric clinical mode and the clinical-ruleset
engine that decides what a clinician is offered and how a dose is calculated.

### Added

- Pediatric clinical mode: age and weight bands matched on half-open intervals,
  McLaren/CDC ideal body weight alongside Devine, and a CDC growth reference.
- Clinical rulesets: rule kinds, payload validation, and the PLATFORM /
  INSTITUTION / USER hierarchy resolved into the rules that take effect.
- Drug selection surfaces for adult and pediatric profiles, carrying provenance
  (rule key, version, source ids) through to the recorded administration so a
  dose stays reproducible.
- Practical dose rounding, so a calculated dose lands on an amount that can
  actually be drawn up: 67.5 mg rounds to 70, not to an undosable 68. A rule's
  own `roundTo` is honoured only where it is coarser than the practical step.

### Changed

- `clinical-rules.ts` is now a barrel over focused modules in
  `./clinical-rules/`. The import path and all 75 exports are unchanged.

### Fixed

- Hidden options are marked rather than removed from option lists. Those lists
  are the lookup source for units, routes and concentrations, so deleting an
  entry left a drug already recorded on a case unresolvable and took it out of
  search. Pickers filter through `visibleClinicalOptions` instead.

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
