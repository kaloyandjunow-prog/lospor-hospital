# Changelog - LOSPOR Core

## [9.7.1] - 2026-09-03

### Added

- **The seven arterial blood gas LOINC codes.** A blood gas arrives as one
  Observation whose *components* carry pH, PaCO₂, PaO₂, bicarbonate, base
  excess, saturation and lactate. Without these the components resolved to bare
  numbers — `2744-1` and the rest — so every panel landed as unrecognised tests
  for a site to map by hand, at every site. Each code names arterial blood in
  its Athena concept name, which is what makes them safe to ship: a venous pCO₂
  is a different code and a different reading of the same patient.

- **A check that every shipped mapping names a test that exists.** Eight of the
  original twenty-four did not, and nothing noticed, because the table is a
  plain record and a wrong value is still a string. A code resolving to a name
  nothing recognises is worse than a missing one: the result is treated as
  unmappable, and the site is asked to map a code we already shipped.

## [9.7.0] - 2026-09-03

### Added

- **Working out which of our tests a hospital's result is.** A haemoglobin
  arrives as LOINC `718-7`, as a local `HGB`, or as `ХГБ`, and which of those a
  given hospital sends is a property of their laboratory system rather than of
  any specification. Resolution runs site mapping, then a deliberately partial
  shipped LOINC table, then the hospital's own label — and a result nobody can
  place is still imported under that label, because dropping a result we cannot
  name loses clinical data silently, and silently is the part that matters.

  Every shipped LOINC code was checked against the Athena vocabulary. Eight of
  the first twenty-four pointed at field names that do not exist, and one
  labelled `5902-2` as "PT / INR" when it is prothrombin time alone.

- **Conversion into the unit our fields actually use**, wired into the import
  path. `convertLabValue` had no callers at all, so a haemoglobin of 8.9 g/dL
  was written into a g/L field as 8.9 — an emergency transfusion, on a normal
  patient, with nothing marking it wrong.

  The table went from ten tests to forty-odd, from the AMA Manual of Style's SI
  conversion factors, with unit spellings from UCUM because that is what FHIR
  puts in `Quantity.code`: `mm[Hg]`, `10*9/L`, `ug/L`. Three would change a
  decision — a PaCO₂ of 5.3 kPa is a normal 40 mmHg, troponin in ng/mL is a
  thousandfold from ng/L, albumin in g/dL a tenfold from g/L. And mEq/L is
  mmol/L only for a monovalent ion; for calcium and magnesium it is half.

  HbA1c and D-dimer are deliberately left unconvertible, with the reasons
  recorded: NGSP and IFCC are related by an affine expression a factor cannot
  state, and a D-dimer's fibrinogen-equivalent and D-dimer units differ about
  twofold in a way the unit string frequently does not record.

### Changed

- **A lab result is identified by its value as well as its test and draw time.**
  A hospital can call one test by several of its own codes, and both can be
  drawn at the same moment; keyed on test and time alone the two collided, and
  the staging table's uniqueness silently dropped one of them.

- **An import from a long admission is bounded.** A fortnight of six-hourly
  haemoglobins produced three hundred staged rows and three hundred rows on
  screen — "collapses behind a count" described the display and nothing enforced
  it. The current result and three priors are kept per test, and the number
  discarded is reported rather than dropped quietly.

- **Tests we do not record are shown but never written.** An intensive-care
  panel of eighty analytes was pre-ticked, because the case held nothing for
  them and each read as new information. They are now refused: there is nothing
  to read them against and no concept to export them as. That is deliberately
  not the same as an unmapped code, which is one of our tests under a name we
  have not been told about yet.

- **A unit we cannot convert is refused rather than merely unticked**, which is
  where it differs from an undated result: there the value is right and only its
  age is unknown, so a clinician who can vouch for it may take it.

- `EhrLabValue` carries `reportedTest`, `reportedValue` and `reportedUnit`, so a
  screen can show "89 g/L, reported 8.9 g/dL · from ХГБ". A clinician who sees
  both can catch a wrong mapping; one who sees only 89 has to trust it.

## [9.4.0] - 2026-08-29

### Added

- `readBlockedSaveIssue` recognises four age and mode refusals as save blockers:
  `PEDIATRIC_MODE_REQUIRED`, `ADULT_MODE_REQUIRED`, `PEDIATRIC_AGE_REQUIRED`
  and `INVALID_PEDIATRIC_AGE`. Each carries `blockedKeys` derived from its code,
  so the existing per-field quarantine handles them unchanged: a save that also
  altered the weight still saves the weight and blocks only the age/mode
  cluster. Their `reason` is the code itself, because callers switch on it to
  choose their wording and the PII reasons would tell a clinician that the
  patient's age contains identifying information.

  Previously only `PII_BLOCKED` was recognised, so these fell through as
  ordinary failures: the outbox re-stored the patch, a pending record then
  existed, and the autosave manager relabelled the result `queued`. A refusal
  the server would repeat every time was shown to the clinician as a network
  problem and replayed unchanged indefinitely.

  `PEDIATRIC_MODE_DISABLED` and `PEDIATRIC_CLIENT_UPDATE_REQUIRED` are
  deliberately not included. They stop being true without the clinician editing
  anything, so they remain retryable.

### Compatibility

- Additive. Nothing that previously classified as blocked changes behaviour, and
  the four codes were previously unrecognised rather than handled differently.
  A client on an older core continues to work; it simply keeps treating these
  refusals as ordinary failures.

## [9.3.1] - 2026-08-24

### Fixed

- An offline event save (thrown fetch while unreachable) was counted into the
  same failure tally as a genuine server rejection, so a client offline for a
  moment saw "save failed" for an event that was in fact still queued and
  would replay once reconnected. It is now reported as queued.

## [9.3.0] - 2026-08-23

### Added

- Exact identity, count, uniqueness and publication-readiness tests for the
  canonical adult-v2 and pediatric-v2 factories consumed by release
  provisioners. Persistence and release attribution remain API responsibilities.
- `AccountKind` (`CLINICAL | RESEARCH_ONLY`) and Bulgarian-default
  `PreferredLocale` (`bg | en`) contracts, including lossless helpers for the
  canonical `preferences.ui.locale` JSON path.
- Exact deployment-aware Terms and Privacy descriptors, acceptance records,
  bilingual manifest selection, and acceptance validation with deliberately no
  locale fallback.
- Login/registration/session contracts carrying account kind, explicit locale,
  and exact legal evidence.
- `CaseDetailDto.createdById` and explicit case capability flags, separating
  immutable creator from current assignee.
- Research grant flags for aggregate query, case inspection, CSV/JSON export,
  OMOP export, and cohort sharing, plus stable pseudonymous research-case IDs
  and the eight-hour self-authorization contract.
- Exact clinical-ruleset publication evidence containing canonical before and
  after JSON, a complete added/removed/changed diff, hashes, confirmer, reason,
  and timestamp.

### Breaking

- Registration requires an institution and exact Terms plus Privacy acceptance
  and no longer returns a pending-approval state.
- Session user and case-detail contracts gain required identity/authorship
  fields; consumers must upgrade with the API release.

## [9.2.0] - 2026-08-18

### Changed

- **The case contract can say a risk criterion was never asked.** The
  tri-state work in 1.0.0 made twelve clinical question columns nullable, so
  "not asked" stopped being indistinguishable from a recorded "no".
  `CaseDetailDto` did not follow: it still typed every one of them as
  `boolean`. A null therefore arrived through this contract typed as a
  boolean, and every consumer read an unasked criterion as answered.

  Nothing crashed — runtime nulls are still nulls — but the type system
  asserted the opposite of what the database had just been changed to record,
  in the one place both apps trust.

  `emergencySurgery` and `highRiskSurgery` stay binary, deliberately: not
  emergent means elective, and that is a property of the operation rather than
  a question put to anyone.

  **Breaking for consumers** that assumed non-null. That is the point.

- **`FORCE_UPDATE_HEADER` is now `OVERRIDE_CONFLICT_HEADER`**, naming
  `x-lospor-override-conflict` rather than `x-lospor-force-update`. The old
  name read like a retry hint, and the API treated it as one: it skipped the
  conflict response and left no record that a colleague's edits had been
  replaced. The API records every override that actually discards something
  and no longer answers to the old header.

  Nothing imported the constant, so no client changes with it.
## [9.1.1] - 2026-08-17

### Changed

- Version alignment only, no source change. Ships with the API fix for
  clinical questions answered "not asked" being rejected at the API boundary.

## [9.1.0] - 2026-08-16

### Changed

- Version alignment only. No source change: this release exists so core, api,
  web, mobile and docs carry one number again after the OMOP export and
  three-state clinical question work, rather than drifting a patch apart.

  `v9.0.1` could not be reused for that purpose — it was already tagged and
  pushed on web and mobile, and a tag that stops meaning one commit is worse
  than a version that skips a number.

  Consumers on 9.0.1 are unaffected and need not move.

## [9.0.1] - 2026-08-12

### Security

- nanoid moved from 3.3.16 to 3.3.18, clearing GHSA-2v37-7h3g-55p8: a custom
  generator asked for size zero loops forever.

  Test tooling only — it reaches here through postcss, through vitest. core has
  no production dependencies, so no consumer of this package ever installed it:
  npm does not install a dependency's devDependencies. The one place it mattered
  is the hospital appliance, which vendors this repository whole and installs
  the toolchain in order to build and test it.

  No behavioural change. Consumers on 9.0.0 are unaffected and need not move.

## [9.0.0] - 2026-08-11

### Breaking

- `ResearchMetadata` gains a required `supportedBenchmarkMetrics`. Every producer
  must now state which metrics benchmarking can actually plot, rather than
  leaving a client to infer it from `supportedMetrics`.

  Required rather than optional on purpose. The defect this fixes was a client
  building its benchmark picker from the only list it had — all fourteen — and
  offering nine options that return an empty chart. An empty chart is
  indistinguishable from "no patients matched" and from "suppressed for small
  cell size", so a researcher reads a missing feature as a finding about the
  data. An optional field would let a producer omit it and reintroduce exactly
  that, which is why it is not optional.

### Added

- `RESEARCH_BENCHMARK_METRIC_IDS` and `ResearchBenchmarkMetricId` — the five
  metrics benchmarking has evaluators for, constrained at compile time to be a
  subset of `RESEARCH_METRIC_IDS`. Aggregates genuinely support all fourteen;
  the two lists exist to be different, and the difference is now stated.
- `selectApplicablePediatricDrugProfile`, `selectApplicablePediatricFluidProfile`
  and `selectApplicablePediatricInfusionProfile` — "exactly one applicable
  profile, or none" as a rule with one home, returning the count and a conflict
  flag instead of silently taking the first match.
- `visiblePediatricInfusionRoutes` — decides once which routes an infusion may
  be offered by, so a withdrawn default route cannot remove a drug that still
  has a usable one.
- `@lospor/core/option-surface` — one reader for the option library's drug
  metadata, replacing three conventions that disagreed at the edges.
- `columnForWallClock` moved into the timetable module with its tests.
- A guard over the shipped paediatric ruleset: 181 drugs checked for overlapping
  age and weight bands.

### Fixed

- **The option overlays took the first of two overlapping paediatric bands.**
  When two approved bands both claimed a child, the overlays merged whichever
  sorted first and presented its dose as settled. They now report a conflict and
  merge nothing, so the ambiguity reaches the clinician instead of being
  resolved by sort order. Reverting this fails 5 tests, leaking 2,328 fields on
  the drug path and 2,724 on the infusion path.

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
