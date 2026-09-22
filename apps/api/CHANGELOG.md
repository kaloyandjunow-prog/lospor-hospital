# Changelog - LOSPOR API

## [9.10.6] - 2026-09-23

### Changed

- **Shared EHR import contract aligned with Core 9.10.3.** The API release
  carries the vital-sign and medication mapping fields used by Hospital 1.4.6
  while preserving source codes and clinician review semantics.

## [9.10.3] - 2026-09-20

### Changed

- **Version alignment only, no behaviour change.** The API, Web and Mobile clients are released as one set and share request contracts, and LOSPOR Hospital verifies that the three vendored versions match. Web moved to 9.10.3 for the refreshed PeriOp Laboratories mark, so API and Mobile move with it.

## [9.10.2] - 2026-09-16

### Fixed

- **Intraoperative vital writes now enforce the same safety contract everywhere.** Field-level event validation issues are returned from individual event endpoints and full-log reconciliation alike, applying core's hard device-scale checks (BIS, TOF ratio, SpO2) consistently rather than only on the path that happened to check them.

## [9.10.1] - 2026-09-15

### Fixed

- **The E2E admin test account had no case-inspection or export access.** `scripts/seed-e2e-user.ts` gave it aggregate query only, the same as any ADMIN gets implicitly; inspection, export and OMOP export still come only from an explicit `ResearchAccessGrant`, same as everyone else, and this account never received one. Test-tooling only — no production behavior changes.

## [9.10.0] - 2026-09-15

### Added

- **IV fluids and blood products export coded.** `fluid_start` events are stamped at save from core's hand-checked fluid table (`MANUALLY_CURATED`), so saline, Hartmann's, Plasma-Lyte, Ringer's acetate, the dextrose mixes and lipid emulsion stop exporting concept 0, and each strength of saline, HES and mannitol has its own clinical drug. Each blood unit now exports as a `device_exposure` product row and a `procedure_occurrence` transfusion row (`INTRAOP_BLOOD:`), with its volume as the device row's `quantity` in mL (`unit_concept_id` 8587; new `device_exposure` columns `quantity`, `unit_concept_id`, `unit_source_value`, matching exchange contract 2.5.0), instead of a drug row; packed red cells previously exported B05AX01's concept, a technetium tracer. Cell salvage exports as the autotransfusion procedure, its volume in observation `LOSPOR:BLOOD_PRODUCT_UNIT_ML`. The case-total transfusion row is written only when no units were charted.
- **Premedication exports as coded drugs.** Each premedication entry is mirrored as its catalogue drug with WHO ATC code, dose, unit and route instead of one uncodable line of text, so it maps through ATC to its RxNorm concept (added to `lab-drug-omop.json`: 224 of 231 catalogue ATC codes). Phases are DAY_BEFORE, dated D-1, and MORNING, dated D; records saved with "evening" read as DAY_BEFORE.
- **Research numbers for labs and drugs without a terminology import.** `src/data/lab-drug-omop.json` (Athena LOINC 2.82, ATC 2026-02-01, RxNorm 20260601; `scripts/generate-lab-drug-omop.mts` rebuilds it) gives all 92 LOINC codes LOSPOR records their concept and 198 of 205 catalogue ATC codes their standard RxNorm targets. `seed-concept-maps` falls back to it for lab, NHIS CL024 and catalogue drug rows, so labs and catalogue drugs export a standard concept on every site; Athena, when imported, still wins.
- **One condition row per concept.** An ICD-10 code OMOP decomposes into several standard concepts (E11.2: type 2 diabetes, and a kidney disorder due to it) used to export `condition_concept_id` 0. `ConceptMap`, `PreopDiagnosis` and `Comorbidity` gain `standardConceptIds` (migration `20260914130000_condition_concept_ids`), the concept map seed fills it from Athena or the bundled numbers, and the OMOP export writes one condition row per concept with the same source value.
- **Imported procedures in the research copy and the operation list.** A procedure imported with a declared `sourceVocabulary` (КСМП) is mirrored under that vocabulary with its crosswalked group, instead of `LOSPOR_PROCEDURE` with no group. `/v1/search/procedures/codes` takes `suggested=` and lists those operations first, marked.
- **Research numbers for diagnoses without a terminology import.** `src/data/icd10-omop.json` (from Athena ICD10 2021 Release; `scripts/generate-icd10-omop.mts` rebuilds it) holds, for 15,774 of LOSPOR's ICD-10 codes, the OMOP concept ids they map to, and nothing else: no SNOMED CT codes or descriptions. `seed-concept-maps` uses it where no Athena is imported, so 13,204 codes export `condition_concept_id` on every site. Codes mapping to several concepts (2,570) map to all of them, and the NHIS national extensions (23,438) stay source-only rather than borrowing their parent's concept.
- **Exact planned operations.** `GET /v1/search/procedures/codes?group=&q=` lists the ICD-10-PCS operations inside a procedure group (up to 200, with the total), narrowed by the clinician's words; "laparoscopic" reads as ICD-10-PCS's "percutaneous endoscopic". An operation chosen there is mirrored under `ICD10PCS` with its standard OMOP concept, a group chosen alone under `LOSPOR_PROCEDURE_GROUP` with none. The concept ids ship in `src/data/icd10pcs-omop.json` (81,902 standard and 195 RxNorm, from Athena ICD10PCS 2027; `scripts/generate-icd10pcs-omop.mts` rebuilds it), so `seed-concept-maps` gives every site research codes for exact operations without a terminology import.
- **`NOTICE.md`** names the owners of the reference data in this repository, including the LOINC copyright notice its licence requires, and states that OMOP vocabularies are imported by each site from Athena.
- **Procedure search in Bulgarian.** Each procedure group carries the words of the Bulgarian procedure names (КСМП 2020, NCPHA) that crosswalk to it, so "холецистектомия" finds Cholecystectomy online and in the offline copy. `generate-vocabulary.mts --procedures-only` rebuilds the offline procedures without a database.
- Added a reviewable NHIS CL011 merge utility that updates the shared Core ICD-10 bundle from a normalized official snapshot without committing the source workbook.

### Changed

- The ICD-10 bootstrap seed now synchronizes the complete shared Core bundle into the API database, keeping server search and offline clients on the same codes and authoritative labels.

### Fixed

- **Home medications and allergies picked from the drug list had no usable ATC code.** `src/data/drugs.json`, scraped from the BDA register, stored every substance code as the register prints it ("L01BC 2", not L01BC02), so no concept map row could ever match and each one exported concept 0, with or without a terminology import. The list is repaired (3,431 codes), `normalizeAtcCode` (`src/lib/atc.ts`) repairs the spelling wherever a code arrives (drug search, the preop medication mirror, the Drug seed, the scraper), and `lab-drug-omop.json` now also carries the drug list's codes: 961 of its 1,107 codes resolve in Athena, 883 to a single RxNorm ingredient. `seed-concept-maps` seeds those codes, so 2,938 of 3,525 coded drug-list entries export a standard concept on every site. Combination codes with several ingredients stay source-only, as before. Already saved cases keep what they stored.
- **Drug search without a Drug table returned no ATC code to the web form.** The drugs.json fallback returned `atc` only, while the web and mobile forms read `atcCode`; both are now returned.
- **Diagnosis search matched English synonyms only after a terminology import.** `src/data/icd10-synonyms.json` (142,221 ICD-10-CM descriptions for 9,667 ICD-10 codes, Athena ICD10CM FY2027; `scripts/generate-icd10-synonyms.mts` rebuilds it) is loaded by `seed-icd10-from-bundle.ts` into `Icd10Synonym` under `bundle-` ids. Once a terminology import has written its own synonyms, the bundled rows are removed and the imported ones left untouched.
- **The laboratory seed now treats Anti-Xa as explicitly uncoded.** It seeds 65 coded tests, reports one intentional exception, and lets Anti-Xa export as `LAB:Anti-Xa` with no fabricated LOINC or OMOP concept.
- **Every AI feature failed as soon as a Mistral key was configured.** The advisor, lab-photo reading and vitals-scan reading defaulted to `open-mistral-7b` and `pixtral-12b-2409`, both retired by Mistral (30 March 2025, 31 December 2025) before this repository ever shipped a key. `src/lib/mistral-models.ts` gives the four routes dated, current defaults, matching the values the Hospital appliance already carries in its own `external-ai-models.ts`.

- **ICD-10 concept seeding no longer chooses an arbitrary first OMOP target.**
  Exact active Athena source codes map only when they resolve to one distinct
  active standard concept. Intentional one-to-many `Maps to` decompositions,
  source concepts without a target, and NHIS extensions absent from Athena stay
  explicit `SOURCE_ONLY` rows with the Athena version and reason recorded.
  Reseeding clears stale automatic mappings while preserving `MANUALLY_CURATED`
  and `REJECTED` review decisions.

## [9.9.5] - 2026-09-07

### Fixed

- **The hosted API had not been published since 9.8.0.** 9.9.0 added a cron
  running the case-closure sweep every fifteen minutes. Vercel charges for
  sub-daily cron schedules and this deployment is on a plan without them, so
  the entry did not make the sweep run slowly — it made every deployment be
  *rejected*. 9.9.0, 9.9.1, 9.9.2 and 9.9.4 all merged and tagged with every
  required check green while the live API stayed at 9.8.0, because the Vercel
  check is not a required one.

  The cron is removed. `vercel-crons.test.ts` now pins the rule — nothing
  sub-daily, and this route specifically excluded — so re-adding it fails a
  test that explains why instead of silently freezing publication again.

### Changed

- **Automatic case closure is an appliance feature.** The appliance schedules
  this route every five minutes from the delivery worker, which is where the
  thirty-minute review window can actually be honoured, and a new
  `delivery.case-close-sweep-scheduled` overlay rule there stops a vendor pass
  from dropping it. On the hosted deployment nothing schedules it: a case
  closes if a clinician still has it open when the countdown expires, and
  otherwise stays in `AWAITING_REVIEW` until someone acts on it. That is stated
  in the route's own comment rather than left to be discovered.

## [9.9.4] - 2026-09-07

### Fixed

- **The review countdown could start on a case that could never be closed.**
  `POST /v1/cases/:id/submit-for-review` and case creation both gated on
  `evaluatePostopReadiness`, which asks only for a complete Aldrete score and a
  disposition, while finalization asks for the five preoperative sections, an
  intraoperative record with both times and a technique, and the postop. So a
  case with a four-field preop and no intraoperative record at all could enter
  `AWAITING_REVIEW` and promise a closure that could not happen. The comment on
  the route claimed the two checks were the same; they were not, and the only
  way to keep that claim honest is for there to be one. Both entry points now
  call `evaluateCaseReadiness`, the same evaluation finalization performs, and a
  refusal returns 422 with the blocking issues named.

- **Cases that could not be closed wedged automatic closure for everyone.** The
  sweep takes the twenty-five oldest `AWAITING_REVIEW` cases, oldest first, and
  a refused case kept its `awaitingReviewAt` — so it was re-selected on every
  run for ever. Twenty-five such cases at the head of the queue meant the
  twenty-sixth was never examined: one ward's unfinished paperwork could stop
  automatic closure for the whole hospital, silently. A refusal now defers the
  case with an exponential backoff (15 minutes, doubling, capped at a day), and
  resubmitting it clears the backoff.

### Added

- `Case.closeAttemptCount` and `Case.closeNextAttemptAt`, with an index on
  `(status, awaitingReviewAt, closeNextAttemptAt)` for the sweep's query.
  Migration `20260907190000_case_close_attempt_backoff`.

## [9.9.3] - 2026-09-07

### Changed

- Version only, to keep the api/web/pwa set on one number. The PWA needed
  9.9.2 to serve correctly where it is mounted under a path prefix, and 9.9.3
  to stop the intraoperative screen redrawing itself on every autosave; the
  three are released together and share request contracts, so they move
  together. No API change.

## [9.9.1] - 2026-09-07

### Fixed

- **Depends on Core 9.9.1** (unused-import cleanup, no behavioral change).
- Removed 33 unused imports found by running `eslint --max-warnings 0` for
  the first time against this repo, almost all of them concept-table
  imports left in `omop-mapper.ts` by the 9.9.0 OMOP mapper split. No
  behavioral change.

## [9.9.0] - 2026-09-07

### Changed

- **Depends on Core 9.9.0.**

- **AWAITING_REVIEW is reached only through the clinician's own action, never
  by autosave.** `POST /v1/cases/:id/submit-for-review` is new: it runs the
  same postop-completeness check `finalize()` applies and, only if it
  passes, promotes the case and stamps `awaitingReviewAt`. It is idempotent —
  revisiting the summary does not restart the countdown. Both `POST
  /v1/cases` and `PATCH /v1/cases/:id` used to promote a case to
  AWAITING_REVIEW the moment a merged postop record happened to become
  complete — on the create path that meant a single-field postop object sent
  at creation, and on the patch path it meant whichever autosave completed
  the last Aldrete field, starting the 30-minute closure countdown before
  the clinician had said they were finished. `AWAITING_REVIEW` is also now
  rejected from the generic `PATCH` body schema, the same way `COMPLETE`
  already was, so a client cannot request the transition directly and skip
  the check.

- **An automatic closure is attributed to the system, not the assignee.**
  `finalizeCaseWithinTransaction`'s audit row and finalization snapshot now
  record `"System (automatic closure)"` as the actor when the pending-close
  sweep closes a case, with the assignee kept alongside as `assignedUserId`
  in the audit detail. Previously the assignee's own id was recorded as the
  actor, distinguished only by the audit action name — legally and
  audit-wise ambiguous, since the record read the same whether that
  clinician had pressed Finalize themselves or had gone home an hour
  earlier.

- **`/v1/cases` orders by clinical urgency, not creation date or the status
  enum's declared order.** A dashboard capped at `take` rows now sees
  AWAITING_REVIEW cases first, then IN_PROGRESS, then DRAFT, then COMPLETE
  last — computed tier-by-tier (`priority-case-list.ts`) rather than a
  single `orderBy`, since Postgres only sorts an enum column forward or
  backward by its declared ordinal and no such ordinal matches this
  priority. `skip`/`take` are honoured across the whole sequence, not reset
  per tier.

- **`/v1/cases` returns true dashboard counts (`counts`), not counts derived
  from the returned page.** `dashboardCaseCounts` computes "today", "this
  month", "active", "drafts", "awaiting postop", "complete" and "ICU" over
  the whole accessible set by querying the database directly, and
  "handovers" as pending transfers addressed to the requesting user
  specifically (matching `/v1/cases/transfers/pending`'s own default),
  independent of the case-access `where` clause. Both dashboards previously
  computed every one of these by filtering whatever page happened to be
  loaded, so a clinic with more cases than that page's `take` saw
  understated numbers, and "handovers" mixed together outgoing transfers,
  incoming ones, and — for an admin/HOD — transfers between two other people
  entirely.

- **`skip`/`take` are truncated to integers** before reaching Prisma, which
  rejects a non-integer value with a 500; a fractional query string (`"1.5"`)
  is finite and previously passed the existing range check unrounded.

### Added

- **`GET /v1/cases` selects `preop.ageValue`/`ageUnit`** alongside
  `ageYears`, and **`transfers.toUserId`** alongside `transfers.id`, so
  clients can tell a precisely-recorded infant age from an absent one, and a
  handover addressed to the current user from any other pending transfer on
  a visible case.

### Fixed

- **The EHR outbound quantity parser** (`ehr-fhir-body.ts`) now rejects a
  `valueQuantity.value` that is not purely numeric (`"70kg"`) instead of
  truncating it to a plausible-looking number, via a local copy of core's
  `strictFiniteNumber` — duplicated rather than imported because the
  appliance's vendored core tree predates this export; replace it with the
  real import at the next re-vendor.
- **The EHR control-plane network policy** now refuses a literal link-local
  or cloud-metadata address (`169.254.0.0/16`, `fe80::/10`) over HTTPS
  unconditionally, closing a gap `isPrivateHost` deliberately did not cover
  (link-local is a different, always-forbidden category from "private",
  which remains a legitimate destination).
- **Two intraop-log merge bugs**: a web clinical event could be logged twice
  under the same label at two different columns and collapse into one, and
  a grid-vitals bridge could re-log a field a vital event had already
  recorded at that column instead of merging only what was missing.
- **Conflict-detection guard 1** no longer fires when the client sent a
  usable revision instead of (or in addition to) a base timestamp, and every
  guard now reports its own real reason (`missing_conflict_timestamp` /
  `stale_revision` / `stale_timestamp`) instead of one guard's result
  silently falling back to another's label.
- **`unfinalize`** now clears `awaitingReviewAt`, so an unfinalized case does
  not carry a stale countdown into whatever happens next.
- A migration backfills `awaitingReviewAt` for any case that reached
  AWAITING_REVIEW before the column existed — otherwise the pending-close
  sweep, which requires the column to be non-null, would never have found
  it.

### Changed (OMOP export)

- **`omop-mapper.ts` split from one 3,717-line file into `src/lib/omop-mapper/`**:
  concept tables, row types, id/date helpers, quality-warning checks, and
  seven per-domain mapping functions (person/visit, preop clinical, planned
  procedure and medications, intraop, selections, complications, postop)
  threaded through a shared `CaseMapperCtx`. `mapCasesToOmop` itself is now
  521 lines of orchestration. No behavioural change — the full mapper test
  suite (228 tests) passes unchanged before and after.

## [9.8.0] - 2026-09-06

### Changed

- **Depends on Core 9.8.0**, which resolves an age from a date of birth by
  calendar arithmetic rather than by dividing days by an average year — so a
  patient is eighteen on their eighteenth birthday, which is the boundary the
  paediatric mode check sits on.

- **`@lospor/core` moved off the local `file:../lospor-core` path** and onto
  the released tag. That path had been committed rather than only present in a
  working tree, so HEAD could not be built by anyone but the machine it was
  written on.

### Fixed

- **Two dependency advisories that had fixes npm did not offer.** `fast-uri`
  and `mysql2` both had patched releases available; for mysql2 npm proposed
  downgrading Prisma three major versions instead, because `npm audit fix`
  reasons about the direct dependency rather than the transitive one. Both are
  `overrides` applied with `--package-lock-only`, with the platform-specific
  lockfile entries counted before and after and held at 95 — a regenerated
  lock on Windows strips the binaries other platforms need, and Linux CI then
  dies on bindings that are present locally.

## [9.7.2] - 2026-09-03

### Fixed

- **Every production deploy failed.** 9.7.1 added bundled-baseline provisioning
  to the production build, chained so that a baseline which could not be
  established stopped the release. It stopped every release instead, on
  `BUNDLED_BASELINE_PARTIAL_STATE`, and left `main` unable to reach production
  at all — including any fix for the condition causing it.

  The mistake was about what the provisioner is for. It installs onto a pristine
  deployment and verifies its own work by its release principal; a deployment an
  administrator configured through the application is, to it, an unfamiliar
  state it must refuse to touch. That refusal is right — it cannot tell a
  half-finished install from a deliberate choice — but it is a poor gate for a
  build, because legitimate history then blocks shipping forever.

  The public deployment is that case: both baselines are published and selected
  there, arranged by hand. Nothing was wrong with it.

### Added

- **`clinical-rules:inspect-bundled-baselines`**, which reports what a
  deployment holds — the counts the provisioner requires, the platform presets
  and selections, and the audit rows — and writes nothing. The provisioner names
  the rule that was broken but not the state that broke it, because it is inside
  a transaction it is about to abandon; this is how to look without guessing.

## [9.7.1] - 2026-09-03

### Fixed

- **The public deployment had no platform ruleset at all.** An appliance runs an
  installer that puts the bundled adult and paediatric rulesets in place and
  selects them for the whole deployment. This deployment has no installer, and
  the provisioner was reachable only from `prisma/seed.ts` and by hand — so
  `lospor-adults-v2` (251 rules) and `lospor-pediatrics-v2` (335 rules) were
  never installed and never selected, quietly, for as long as it had been
  deployed.

  A production deploy *is* this deployment's installation, so it now does what
  an installer does: `prisma migrate deploy`, then provision and select both
  baselines. Chained with `&&`, so a baseline that cannot be established stops
  the release exactly as a failed migration does — skipping quietly is precisely
  how its absence went unnoticed.

  Safe to repeat on every deploy: the provisioner reports `installed` or
  `verified` from inside one serializable transaction, and refuses a partial or
  conflicting state rather than writing over it.

## [9.7.0] - 2026-09-02

### Added

- Per-item provenance on imported clinical data, an optional blood loss field,
  and OMOP concept mappings for the airway examination.

## [9.6.0] - 2026-08-31

### Fixed

- **Lab report scanning returned 403 for every caller.** 9.5.0 added a per-case
  consent gate to `POST /v1/ai/read-labs`, requiring `aiOptIn: true` in the
  request body, and no client sent it. The web app was updated in the same
  release; the phone app was not, and its 9.5.0 contained no source change at
  all, so lab scanning was broken in production from the moment 9.5.0 shipped.

### Changed

- **Lab scanning is now case-scoped, and consent is read from the record.**
  `POST /v1/ai/read-labs` is replaced by `POST /v1/cases/{id}/ai/read-labs`,
  which loads the case, checks access, and reads `preop.aiOptIn` from the
  database — a client-supplied `aiOptIn` is ignored entirely.

  The old route took the caller's word for consent, so any authenticated caller
  could assert consent the clinical record did not contain. That matters more
  here than anywhere else in the system: this route sends a photograph of a lab
  printout, which carries the patient's name and EGN in its header, and no
  redaction is possible on an image. An attestation the server never checks is
  not a consent control. The monitor scanner has always done this correctly and
  is now the pattern both image routes follow.

  The cost is that a report cannot be scanned into a case that does not exist
  yet — the client saves first, then scans. That is the same order the monitor
  scanner already required, and the only honest one: an unsaved draft has no
  recorded consent to read. The text-only advice routes are unchanged, because
  what they send is redacted and a draft has somewhere to send it from.

## [9.5.0] - 2026-08-31

### Fixed

- **`redactText` destroyed Bulgarian and Title-Case clinical text on every path
  that leaves the system.** The "two capitalised words is probably a name"
  pattern put the whole Cyrillic block (`Ѐ-ӿ`, U+0400–U+04FF, lowercase а–я
  included) in its *uppercase-first-letter* position, so any two adjacent
  Cyrillic words matched whatever their case. Reproduced against the shipped
  regex: `остър апендицит` → `[REDACTED]`, `Захарен диабет тип 2` →
  `[REDACTED] тип 2`, `хронична обструктивна белодробна болест` →
  `[REDACTED] [REDACTED]`, while the equivalent lowercase Latin text was
  untouched — locale-asymmetric data destruction, worse in Bulgarian than in
  English. Both AI advise routes build their prompt with
  `redactText(buildPatientSummary(...))`, so in a Bulgarian hospital the model
  was asked for ASA class, airway strategy and drug cautions about a patient
  whose diagnosis, planned procedure, comorbidities and previous
  Cormack-Lehane grade had been blanked — without being told anything was
  removed, and with a prompt that tells it not to refuse. OMOP research exports
  were corrupted the same way. `\p{Lu}` already covers Cyrillic capitals; the
  explicit range was the entire defect.
- **The name heuristic no longer runs over coded clinical vocabulary.** Even
  once the range was fixed, `Acute Cholecystitis`, `Laparoscopic
  Cholecystectomy` and `Sodium Chloride` are all genuinely two capitalised
  words. `redactText` now takes `nameHeuristic: false`, which keeps every
  structural check — validated EGN, 7+ digit numbers, dates, email — and drops
  only the guess. It is passed for diagnosis, planned procedure, allergy and
  medication names, event labels, and the AI patient summary, whose fields are
  entirely an allowlist of numbers, enums, catalogue labels and literals this
  codebase writes itself. `findPII` already carried exactly this exemption via
  `skipNameCheck` for the same drug fields at data entry; the read-time path
  now agrees with it, and `omop-export-source.ts` applies to its scalar columns
  the reasoning its own comment already applied to the JSON ones.
- **Neither AI image route required consent, and neither recorded a
  successful transfer.** `/v1/ai/read-labs` and `/v1/cases/[id]/vitals-scan`
  each send a photograph — of a laboratory report, or of a monitor screen — to
  the configured provider. No text redaction is possible on an image and none
  is attempted, and a lab printout carries the patient's name and EGN in its
  header, so these are the most identifying payloads the system can transmit.
  Both were reachable with the AI opt-in unticked, while the consent text next
  to that tickbox promises that only structured clinical fields are sent.
  `vitals-scan` now reads `aiOptIn` from the database like the case advise
  route; `read-labs` is unscoped by design (it serves draft cases with no row
  yet) and now requires the client to assert consent explicitly. Both write an
  audit row on success — previously only *failures* left any trace, which is
  the inverse of the right priority.
- **A rejected AI request extended its own cooldown.** `checkBurst` recorded
  the request timestamp before comparing it, so every retry refreshed the
  timestamp it was being measured against. A client retrying faster than the
  cooldown locked itself out permanently rather than for one interval. Only a
  request that is actually served now starts a new window.
- **`vitals-scan` passed non-numeric model output straight through.** Its
  plausibility filter only nulled values that were numerically out of range,
  and a string fails every comparison silently, so `{"systolic": "not visible"}`
  reached the client as a string in a vitals field. Values are now discarded
  unless they are finite numbers within range. The route also had no timeout,
  unlike the other two AI routes, so a hung provider connection held the
  request open indefinitely; it now shares their `AbortController` pattern.
- **`vitals-scan` used a floating model tag.** It defaulted to
  `mistral-small-latest` while `read-labs` defaulted to `pixtral-12b-2409` from
  the *same* environment variable. In a system where every image, archive and
  dependency is pinned to a digest or checksum, one clinical behaviour could
  change without a release. Both now default to the pinned vision model.

### Changed

- **Clinical inference defaults to the EU endpoint.** `MISTRAL_API_BASE` fell
  back to `https://api.mistral.ai/v1`, so a deployment that configured nothing
  was on global inference by omission. It now defaults to
  `https://api.eu.mistral.ai/v1`. This value, not the fallback flag, is what
  decides residency — the fallback cannot even engage while the configured base
  already is the global one.
- **A regional refusal no longer silently relocates a clinical payload.** On a
  403 `regional_inference_not_allowed` this service re-sent the same payload to
  the global endpoint unconditionally. It now requires
  `MISTRAL_ALLOW_GLOBAL_FALLBACK=true`, defaulting to off. The guard already
  existed in the Hospital appliance's vendored copy of this file but had never
  been ported upstream, so the appliance failed closed while this codebase
  failed open.

### Tests

- `redactText` had **no tests at all** — the only suite touching `pii-check`
  covered `checkPII`, and the AI route's own suite mocks `redactText` to the
  identity function, so nothing ever exercised redaction against realistic
  clinical text. Added coverage for the Bulgarian and Latin regressions, for
  real names still being caught in both scripts, and for `nameHeuristic: false`
  preserving catalogue labels while still stripping every structural
  identifier.
- Added the EU-default and absent-flag cases to the Mistral suite, and ported
  the appliance's "does not silently move a clinical payload out of region"
  test upstream.

## [9.4.0] - 2026-08-29

### Changed

- Repinned to `@lospor/core` v9.4.0. No API behaviour changes: the service
  already returned a top-level `code` on a refused write and already merged a
  partial preop patch over the stored record, which is what the corrected
  clients now rely on.

### Tests

- The pediatric-to-adult correction is now pinned from the server's side, in
  both directions. A patch that merely *omits* the pediatric age leaves the
  stored `ageValue`/`ageUnit` in place, where the precise age keeps outranking
  any submitted `ageYears`, and the write is refused again on every retry — a
  test now asserts that, so the behaviour cannot be mistaken for a bug and
  "fixed" by making the merge non-partial. A patch that clears them explicitly
  with `null` is accepted, with or without a real adult age alongside it.
- Two negative tests keep the safety boundary itself unchanged: a stored or
  freshly supplied age below eighteen still refuses adult mode.
- `README-postgres-tests.md` listed four gated suites while ten exist, two of
  them behind a second flag that `npm run test:pg` does not set — so a whole
  tier of concurrency and confidentiality coverage was easy to believe was
  running. The inventory is corrected and the machine-specific clock-incident
  instructions are reduced to the general caution.

## [9.3.1] - 2026-08-24

- Added Hospital-only usernames with preserved spelling, case-insensitive
  canonical uniqueness, exact 3–64 ASCII validation, and append-only
  reservation history. A username stays reserved through soft deletion and is
  released only by the final anonymization transaction.
- Separated activation from optional contact-email verification. Hospital
  contact email is never a login or recovery fallback; Status-issued one-use
  links are the local activation/recovery path.
- Changed browser-cookie and native-bearer login to one deployment-selected
  identity parser. Hospital accepts only case-insensitive canonical usernames;
  email remains public/serverless-only and partial Hospital configuration
  fails closed with `503`. Rate-limit keys contain only an opaque SHA-256.
- Added Bulgarian-default installation locale discovery and strict BG/EN
  pre-auth selection. Explicit login choice is persisted without replacing
  unrelated preferences and returned by browser and native sessions.
- Added Status-only username rename with permanent old-name reservation,
  session/link revocation, privacy-safe audit, and a fresh one-use recovery
  link. The designated initial clinical authority remains protected.
- Added Bulgarian-default installation locale discovery and strict BG/EN
  pre-auth selection. An explicit login choice is persisted without replacing
  unrelated account preferences and is returned authoritatively by browser and
  native sessions; Hospital username authentication remains unchanged.
- Added Status-only username rename with permanent old-name reservation,
  session/link revocation, a reasoned privacy-safe audit record, and a newly
  issued one-use recovery link. The designated initial authority is protected.
- Changed both browser-cookie and native-bearer login entrypoints to use the
  same deployment-selected identity parser. A fully configured Hospital
  appliance accepts only case-insensitive `usernameCanonical`; email remains
  public/serverless-only, and partial Hospital configuration fails closed with
  `503`. Login rate-limit keys contain only a domain-separated SHA-256 digest.
- Required an explicit first clinical-administrator username during guided
  installation and bootstrap. Retired the legacy clinical-admin route that
  accepted a chosen password or could mint another ADMIN account.
- Moved clinical Member/HOD/Admin promotion and demotion exclusively behind the
  private Status account-control bearer. The reasoned transaction serializes
  Admin changes, protects the designated appliance operator and last active
  clinical Admin, revokes sessions and stale links, and never reassigns or
  deletes an HOD's cases. The clinical-session role mutation now returns `404`;
  account creation remains Member/HOD-only and Admin promotion requires an
  already activated clinical account.

- Added the owner bundled-baseline provisioner command to the Hospital package
  contract. The appliance installer invokes it exactly once with explicit
  `--apply` after database/Admin bootstrap, then requires the shared exact
  adult-and-pediatric readiness report before starting services or doctor.
  The deliberate owner API/Core source and schema import remains a prerequisite
  until the pinned upstream version is advanced.

- Added one Hospital-only, read-only clinical-baseline readiness assessment for
  adult and pediatric v2. It verifies the exact selected published PLATFORM
  preset identity/version, canonical rule keys, publication validation, exact
  rule/profile counts, and a stable SHA-256 over persistence-normalized payloads
  and ordered source references. Runtime now reports `policyEnabled` and
  `baselineReady` separately, enables prospective guidance only when both are
  true, and exposes only a sanitized assessment. The same function feeds
  Hospital capabilities, the schema-v2 private Status control plane, and a
  bilingual installer/site-acceptance reporter. Unit, route, privacy-contract,
  Status-contract, clean-install, and transaction-rollback PostgreSQL tests
  cover missing, draft, wrong identity/version/count, invalid, drifted, and exact
  ready states. The assessment never mutates or attributes a ruleset.

- The disposable E2E seed now classifies its synthetic researcher as
  `RESEARCH_ONLY` and creates an explicitly aggregate-only, bounded-expiry
  grant, satisfying the same database guards enforced on a fresh Hospital
  installation.
- Research-grant issuance now records only `purposeRecorded` in transactional
  audit detail. Protocol prose remains outside the audit trail, and the privacy
  guard no longer rolls back an otherwise-valid Status grant.
- Added one append-only typed audit action registry with exact Bulgarian and
  English labels. The administrator endpoint validates action filters against
  that registry and returns its catalog while withholding raw detail, internal
  target IDs, and internal actor IDs from browser/PWA responses.
- Made the already-present Hospital account, approval, role/HOD, institution,
  deletion/anonymisation, legal acceptance, password recovery/email
  verification, clinical-rules, Central, external-AI, guidance, saved-cohort,
  research-export creation, research-grant, and OMOP decisions
  commit their durable audit evidence in the mutation transaction. Audit detail
  now fails closed on credentials, links/tokens, patient/case numbers, clinical
  payloads, direct PII, and free-text fields; routine case/event telemetry stays
  explicitly best effort.
- Added an executable Hospital governance inventory and rollback gate. Fresh
  installation institution/admin creation and appliance-operator initialize,
  rotate, transfer, and reconcile now use the same transactional privacy writer.
  Six actorless operator scripts remain explicitly decision-blocked instead of
  receiving false attribution, and missing generic owner lifecycles are pinned
  as provenance imports.
- Added a fail-closed optional clinician support destination to the public
  capabilities response. The Hospital API independently accepts only HTTPS
  without embedded credentials/fragments or one valid bare `mailto:` mailbox,
  strips mail query content, and never handles the client's reviewed diagnostic
  report.
- Added private Status-only account creation for clinical Member/HOD and
  research-only accounts, plus 72-hour activation and 8-hour recovery links.
  One-time secrets are digest-only at rest, reissue invalidates predecessors,
  consumption is atomic, and lifecycle audit rows share the mutation
  transaction without containing link material.
- Serialized concurrent link issuance and excluded `ADMIN`, mismatched legacy
  authority, and the designated appliance operator from Status credential
  actions. Completing either Hospital local recovery or ordinary email reset
  invalidates outstanding links from the other path.
- Hospital self-registration remains closed. The private service bearer grants
  no general API authority, and Caddy does not publish `/v1/internal/*`.
- Added an interim Hospital boundary that keeps pinned-API legacy `RESEARCHER`
  accounts out of clinical routes while persisting the durable
  `AccountKind=RESEARCH_ONLY` classification for the staged upstream import.
- Added immutable granular research grants issued, superseded, and revoked only
  through Status. Active clinical Member/HOD/Admin and research-only principals
  may receive explicit query, case-inspection, CSV, JSON, OMOP, or cohort-share
  authority for one institution or all institutions; validity defaults to 90
  days and cannot exceed 365. Appliance authority alone grants no detailed or
  export access. A clinical Admin retains only the existing disclosure-
  controlled aggregate query until an explicit grant widens that account.
- Bound each Hospital OMOP approval to one pending frozen export, requester,
  immutable grant, declared purpose, format, definition hash, snapshot hash,
  and exact case count. Creation, worker claim, and download all recheck the
  bound grant and its format-specific export plus OMOP permissions.
- Moved Central transport setup and clinical-export approval into separate
  Status password-reauthenticated, transactionally audited locks. The Status
  view exposes only endpoint origin, site/key identifiers, certificate and CA
  fingerprints/validity, compatibility, policy, queue counts, batch hashes,
  receipts, failures, and retries. The former clinical-session enrollment,
  export-policy mutation, and manual delivery trigger now return no-store 404.
  The worker cannot reserve or claim even an older queued batch unless both the
  complete transport evidence and dated clinical-export approval are active.
- Replaced the Hospital-only per-case include/exclude decision with automatic
  delivery of every finalized eligible case. The strict version-2 read model
  exposes only bounded delivery state, confirmed withdraw/resend availability,
  and a safe latest outcome. The clinician who finalized the case, the
  department HOD, and Admin have their approved narrow scopes; research-only
  accounts are refused. A Member is scoped by the finalization that still
  stands, so a correction moves the authority, a finalization with no recorded
  author gives it to nobody, and a clinician who created a case and handed it
  on holds none of it. The paginated discovery route exposes only an internal
  route key, finalization time, and bounded state so that clinician can find
  the case without regaining ordinary clinical access.
  reservation lock, case lock, action, and audit row share one transaction, and
  patient identifiers, pseudonyms, batch IDs, notes, and raw errors never enter
  the response.
- Added persistent, independently selectable adult and pediatric calculation-
  guidance policy. Fresh-install defaults are seeded once; later bootstrap or
  updates preserve the stored choice. Runtime responses mark the policy as
  prospective-only and never rewrite recorded or historical clinical data.
- Added optional Hospital external AI with a fresh-install policy default of
  Yes, later controlled through password-reauthenticated Status actions.
  Mistral is enabled only when both persisted policy and a usable provider
  credential are present. The credential is AES-256-GCM sealed under a
  dedicated API-only key; Status, capabilities, audits, and logs expose only
  safe configured-state metadata. Every direct AI route checks this state
  before reading clinical input or constructing/provider egress, and Hospital
  mode never falls back to a plaintext environment credential.

## [9.3.0] - 2026-08-20

### Fixed

- **A handover could make a clinician reuse a case number.** Case codes were
  derived from the highest code a clinician currently owned, and a handover
  changes what they own — so handing away your highest case lowered the ceiling
  and the next case you created took the number you had just handed over.
  Reproduced end to end: a clinician holding 2026-0001 to 0003 who hands 0003 to
  a colleague was issued 2026-0003 again. Nothing rejected it, because the
  unique constraint is `(userId, caseCode)` and the handed-over case now belongs
  to somebody else, so two different operations carried the same number on
  paper.

  Numbers now come from `CaseCodeSequence`, a counter per clinician per year
  that only ever moves forward, backfilled from what each clinician has already
  been issued. Gaps were always possible and still are — a deleted draft leaves
  one — but the code is the only link between a printed chart and its record, so
  it must never be handed out twice. A case arriving by handover also pushes the
  recipient's counter past it, since it usually keeps its number and would
  otherwise be issued again a few cases later.

- **A renumbered case could be moved into the wrong year.** Renumbering used the
  current year rather than the case's, so a pre-assessment done in December and
  accepted in January was renumbered into the recipient's *next* year — a year
  printed on the chart, and the one anyone totalling a year's work would count
  it under. Renumbering now stays inside the year the case already belongs to.

- **Three defects in the accept/decline path**, which had never run: accepting a
  case finalised while the handover sat pending was allowed, reassigning it
  underneath its own attestation; a cross-institution recipient surfaced as a
  bare 500; and nothing prevented two pending handovers on one case beyond the
  route remembering to check. All three now covered, the last by a partial
  unique index.

- **A member could not see anyone to hand a case to.** `colleagueWhereForUser`
  returned `null` for a member, and restricted a head of department to members —
  so the direction that matters most, a registrar passing a case to the
  consultant who will anaesthetise it, was not offered to either of them.

### Added

- **A member can hand a case to any colleague in their institution.** Until now
  only a head of department or an administrator could move a case, and only
  downwards. Handing a case on is an ordinary clinical act — a shift ends, or a
  pre-assessment is done days earlier by someone who will not be in that theatre
  — and refusing it did not stop it happening, it stopped the register seeing it.

  A member *asks*: the case, its number and every access rule stay exactly where
  they are until the recipient accepts, because the sender is usually still
  documenting it. A head of department *assigns*, unchanged, and it moves at
  once. The sender may withdraw an offer nobody has answered; `CANCELLED` is a
  distinct outcome from `DECLINED`, because "my colleague refused this" and "I
  thought better of it" are the two things anyone asks of a handover trail.

- `GET /v1/cases/{id}/transfers` — who has held a case and who moved it,
  readable by anyone who may open the case. The audit log has recorded this all
  along but only an administrator can read it, which answers a compliance
  question rather than a clinical one.

- `?direction=outgoing` on the pending-transfer list, so a sender can see an
  offer nobody has answered and reach the withdrawal at all.

- Audit actions `CASE_TRANSFER_REQUEST` and `CASE_TRANSFER_CANCEL`; every
  transfer action now records `fromUserId`, without which the losing owner was
  recoverable only from the transfer row.

## [9.2.2] - 2026-08-19

- **A diagnosis can be coded on a database with no imported vocabulary.**
  `scripts/seed-icd10-from-bundle.ts` fills `Icd10Code` from the offline
  vocabulary Core already ships — 16,175 codes with English and Bulgarian
  labels, the same rows the phone searches when it has no network.

  `/v1/search/icd10` reads that table and nothing else. Its two neighbours do
  not: `search/procedures` serves a bundled `pcs.json` and never touches the
  database, and `search/drugs` queries the database and falls back to a bundled
  `drugs.json` "for development databases before the Drug seed has run". ICD-10
  was the one route with no floor beneath it, so wherever the table was empty
  the diagnosis field returned nothing — and an empty dropdown reads as *no such
  code*, not *nothing is loaded*.

  Seeding rather than teaching the route a fallback keeps one code path: a
  fallback would run only where the database is empty, which is the deployment
  exercised least.

  Insert-only. An institution that has imported its approved package holds
  labels this bundle does not, and a reseed must never replace curated
  terminology with generic terminology in a table nothing validates against.
  Existing codes are left exactly as they are; `seed-vocabularies.ts` still
  upserts, so a licensed import always wins over the bundle.

## [9.2.1] - 2026-08-19

- **deepmerge-ts is held at 8.0.1.** CVE-2026-40345 is stack exhaustion from
  uncontrolled recursion: the merge functions have no cycle detection, so two
  objects that reference each other through the same property path recurse until
  the stack gives out and the process dies. Only 8.0.0 and later are patched —
  7.1.6 is not — and `@prisma/config` pins 7.1.5 exactly, so the version has to
  be forced from here.

  It arrives through `prisma.config.ts` being loaded rather than through any
  request, so nothing a clinician or an API caller can reach merges untrusted
  objects with it. The upgrade is not a judgement about that: a vulnerability
  with a fix available gets the fix, and reasoning about reachability instead is
  precisely what the appliance release policy refuses to accept.

## [9.2.0] - 2026-08-18

Five clinical-integrity fixes from an audit of the 1.0.0 appliance. They apply
to this deployment too, which is why they are here rather than in the appliance.

### Clinical record

- **Finalization records are append-only.** `CaseSnapshot` described itself as
  immutable, held `caseId @unique`, and was written with an upsert whose update
  branch replaced both the document and its timestamp. A
  finalize → unfinalize → edit → finalize cycle therefore destroyed the original
  attestation with no trace, and the surviving row kept the schemaVersion it was
  first created with over a document of a different shape.

  `CaseFinalization` appends instead: each finalization takes the next sequence,
  records who performed it, and for a correction why and which record it
  supersedes. A database trigger rejects UPDATE and DELETE, so the guarantee no
  longer depends on every future caller remembering it. Deleting the parent case
  still cascades, because that is the erasure path.

  The document is stored as text rather than JSONB. JSONB does not preserve key
  order, so a hash taken before storage could never be recomputed from what came
  back out — and an integrity check that cannot be run is worse than none.

  Existing snapshots migrate to sequence 1. `finalizedById` and `snapshotHash`
  stay null on them: those rows never recorded an actor and were never hashed,
  and a hash computed during the migration would attest to nothing while looking
  exactly like one taken at the time.

- **A case stays at the hospital that recorded it.** An administrator could
  transfer a case to a clinician at another institution, and the transfer
  rewrote the case's `institutionId` to the recipient's — so the record, the
  printed protocol and the OMOP `care_site` all said the operation had happened
  somewhere it had not.

  Cross-institution transfer is refused outright now, administrators included,
  comparing against the case's institution rather than the actor's. The
  institution is never rewritten, and the transfer helper asserts that rather
  than trusting its caller.

  Transferring a finalised case is refused as well: it is an attested record, so
  reassigning it means unfinalising it first.

### Audit

- **Audit entries commit with the acts they record.** Transfer, finalization,
  unfinalization and research access grants wrote theirs through
  `after(() => logAudit(...))` — which runs once the response has been sent,
  using a helper that swallows its own failures. An interruption between the
  commit and that callback left the change in place with nothing recording it.

  `logAuditInTransaction` writes through the caller's transaction and throws
  rather than swallowing: if the evidence cannot be written, the act it describes
  should not stand. `logAudit` remains for routine, high-volume records where
  losing an entry is survivable.

- **Every conflict override is recorded.** `forceUpdate` guarded nine conflict
  responses, and setting it erased any evidence that there had been a conflict at
  all — a colleague's edits were replaced with no error and nothing afterwards to
  show it. Any authenticated caller could set it, from the body or a header.

  The capability stays, because a queued offline save is stale by definition. It
  is named `overrideConflict` now and writes down which sections were
  overwritten, which revision the client believed it held, and which it
  discarded. Setting the flag when there was no conflict records nothing.

### Accounts

- **Deleting an account as an administrator soft-deletes it.** It was
  `prisma.user.delete()`. `Case.user` declares no `onDelete`, so Prisma defaults
  to Restrict and deleting any clinician holding a case raised a foreign-key
  error with no try/catch — an unhandled 500. The endpoint worked only for
  accounts with no clinical record.

  Where it did succeed it cascaded through nine relations, including
  `ResearchAccessGrant`, `ResearchCohort` and `ResearchExport`, destroying the
  record of what the account had been permitted to see.

  It now does what self-deletion already did: sets `deletedAt`, bumps
  `passwordChangedAt` so every existing token dies, and hands the account to the
  retention job. Until then the deletion is reversible, and the clinical records
  the account authored keep their author.

  Self-deletion was previously the only thing that set `deletedAt`, so the
  retention job had no input at all on a deployment where clinicians do not
  delete their own accounts.

- **`/v1/internal/purge-deleted` compares its bearer in constant time.** It used
  `===` while the research-export worker beside it used `timingSafeEqual` — on
  the endpoint that anonymises accounts.

### Database

Two migrations, applied on deploy:

- `20260818120000_append_only_finalization`
- `20260818160000_drop_include_exact_times`

## [9.1.1] - 2026-08-17

### Fixed

- **A clinical question answered "not asked" was rejected at the API boundary
  and dropped.**

  The request schema declared these fields as `z.boolean().optional()`, which
  accepts `undefined` and refuses `null`. 9.1.0 made the clients send an
  explicit null for an unasked question, so the lenient parser discarded every
  one of them and reported them as rejected fields.

  Nothing failed loudly. The case was created, the response was 201, and the
  answers were simply not there. The web form refused to advance past preop
  with "correct the rejected fields", and a client that ignored the rejection
  list lost the answer silently instead — which is the worse half.

  Seventeen declared fields now accept null. The RCRI, Apfel and STOP-BANG
  criteria were never declared and pass through untouched, so they were not
  affected.

  `emergencySurgery`, the "unobtainable" ticks and the other genuinely binary
  fields still refuse null, and a test pins that: a null there is a client bug
  and the API should keep saying so.

## [9.1.0] - 2026-08-16

### Changed

- Clinical yes/no questions can now record three answers: yes, no, and not
  asked. 29 columns become nullable.

  They were `Boolean @default(false)`, which cannot hold the distinction. An
  untouched field and a recorded "no" both reached the register as a documented
  negative, and on export the difference matters: a negative difficult-airway
  history is a finding, an unasked one is not, and a study that counts them
  together is counting something it did not measure.

  Existing rows are deliberately left as they are. Rewriting them to NULL would
  discard the genuine "no" answers among them, and nothing can tell those apart
  after the fact.

  `emergencySurgery` and `highRiskSurgery` stay boolean — not emergent means
  elective. So do the vitals "unobtainable" ticks and the monitoring and
  equipment flags, which are marks a clinician makes rather than questions put
  to a patient. The risk calculators still treat an unasked criterion as absent,
  since it must not count toward an RCRI, Apfel, STOP-BANG or POVOC score.

- OMOP export contract `source_version` 3.7.0 → 3.8.0.

### Fixed

- Allergies are no longer exported as drug administrations. `Medication.kind` is
  `CURRENT | ALLERGY` and the export iterated both, so a substance a patient
  reacts to was recorded as one they were given. Allergies now become
  observations.
- CARE_SITE is emitted as its own table and referenced by `care_site_id`,
  instead of the site being written onto every VISIT_OCCURRENCE as free text no
  OHDSI tool reads.
- Continuous administrations gain `drug_exposure_end_date`, paired from their
  stop events. An infusion with no end was indistinguishable from one still
  running.
- Every planned procedure is exported, not only the first.
- Intraoperative drugs resolve their ATC through the same concept pipeline as
  preoperative medications, instead of carrying the code unused beside a
  hardcoded concept id of 0.
- `drug_source_concept_id` holds a concept id or null, not the string
  `ATC:<code>`.
- Curated mappings on `CaseSelection`, `CaseComplication` and `VascularAccess`
  are read. The database held the mapping while the export said the row mapped
  to nothing.

### Added

- Airway management leaves the appliance: the device list, Cormack-Lehane grade,
  tools, per-device sizes and cuff status, DLT type/side/size, endobronchial
  size, ventilation modes, IPPV, jet ventilation and PEEP. None of it was
  exported before, so a case could say a tube was placed but not which, what
  size, or how difficult the view was.
- Placing an instrumented airway is emitted as a PROCEDURE_OCCURRENCE. A device
  is a state of the patient; putting it there is something done to them, and
  only the second belongs in a procedure count. A face mask produces no
  procedure, because nothing was placed.
- The preop findings that were read out of the database and written to no table:
  smoking, substance use, latex allergy, family anaesthesia history, dental
  state, cardiac arrhythmia, BMI, blood group and Rh, GUTA, and the airway
  examination — mouth opening, thyromental distance, neck mobility, upper lip
  bite test, retrognathia, prominent incisors and facial hair.
- MEASUREMENT gains `value_source_value`, `range_low` and `range_high`. A lab
  result with no parsed number was skipped entirely, so a culture, a dipstick or
  a blood group left no trace of having been recorded. Reference ranges now
  travel with the result: they differ by laboratory, assay and patient age, and
  "high" is not a claim an export can support without the range behind it.
- Vascular lines carry depth, lumen count and whether they were already in
  place. A pre-existing line was not placed during this case, so its procedure
  row overstated the work without that flag.
- `ConceptMappingStatus` gains `MANUALLY_CURATED` and `REJECTED`. MAPPED covered
  both an automatic match and one a human signed off; UNMAPPED covered both
  "nobody has looked" and "a candidate was rejected". A rejected mapping keeps
  its row so the rejection is remembered, but never applies its concept id.
- `mapping_summary` gains `manually_curated_rows` and `rejected_rows`.
- The procedure catalogue is seeded into the concept map. It was the one
  vocabulary the seed script never covered, so every planned procedure fell
  through to an implicit SOURCE_ONLY with no row behind it — a mapping that
  existed only as an absence.

### Migrations

- `20260816160000_tristate_clinical_questions`
- `20260816180000_concept_mapping_provenance`

Both are additive or relaxing and rewrite no data.

## [9.0.0] - 2026-08-11

### Breaking

- `/research/benchmarks` now rejects a metric it cannot plot instead of
  answering `null`. Nine of the fourteen metric ids had no evaluator; the
  endpoint accepted them, returned an empty series, and reported a real
  `caseCount` with `suppressed: false` alongside it. A client could not tell
  "nobody implemented this" from "no patients matched" or "withheld for a small
  cell size". Requests naming those nine now fail loudly.
- Requires `@lospor/core` v9.0.0, which makes
  `ResearchMetadata.supportedBenchmarkMetrics` mandatory.

### Added

- The capability response states `supportedBenchmarkMetrics`, the five metrics
  benchmarking can actually plot. `supportedMetrics` still lists all fourteen,
  which is correct — the aggregate path implements every one of them.
- OMOP observations carry `value_as_number`. Twenty-two scored variables — RCRI,
  Apfel, STOP-BANG, the Aldrete subscores and total, POVOC, COLDS, PAED, the
  paediatric pain scales, age, body surface area, duration, the fluid totals —
  were documented as numbers and written into the free-text column. The CSV
  writer now emits the column too; without that the numbers were dropped again
  at export time.
- Height and weight are exported, and every emitted variable now has a data
  dictionary entry under the name the export actually uses.

### Fixed

- The NRS pain score was emitted under OHDSI concept `3020891`, the standard
  concept for body temperature, copied from the vital map. Pooled, a pain score
  of 2 answered a temperature query as 2 °C. It now emits `0` and carries
  `LOINC:72514-3` as its source value.
- Seventeen documented ranges were narrower than the validator enforces — age
  0–120 against 149, SpO2 50–100 against 0–100, temperature 30–43 against
  25–45. A researcher filtering on the published range would have silently
  excluded real records.
- `DICTIONARY_VERSION` is 4.1.0, `source_version` 3.7.0, `schema_version` 3.6.0.

## [8.4.0] - 2026-08-06

### Changed

- `/v1/search/icd10` and `/v1/search/procedures` now rank through
  `@lospor/core/search` instead of keeping their own copies, so the offline
  vocabulary bundled into the mobile app returns identical results rather than
  similar ones.
- ICD-10 queries order by code explicitly. Without an `ORDER BY`, Postgres could
  return any rows it liked for a `take`, which made the result set
  unreproducible — and left no way to show that the offline copy agreed with it.

### Added

- `scripts/generate-vocabulary.mts` generates the offline vocabulary into
  `@lospor/core/vocabulary`, and `scripts/verify-vocabulary-parity.mts` checks a
  corpus of queries against the live database. Current result: 60/60 identical
  for ICD-10 across both languages, 20/20 identical procedure group lists.

## [8.3.2] - 2026-08-06

### Fixed

- A laboratory value the extractor could not convert is no longer labelled with
  the canonical unit. The value is still in whatever unit the report printed, so
  pairing it with the canonical one put a haematocrit of `0.41` on screen as
  `0.41 %` — a number and a unit that do not belong together, in an editable
  field a clinician would reasonably read as already reconciled. Unconverted
  rows now carry the source unit, or none when the report printed none.

## [8.3.1] - 2026-08-05

Requires `@lospor/core` v8.3.0.

### Added

- `/health/ready` reports whether this installation can send email:
  `"email": "configured" | "not-configured"`. Without a mail provider nobody can
  verify an address, and a verified address is a condition of signing in — so an
  installation with no `BREVO_API_KEY` accepts registrations and then strands
  every one of them. That failure was invisible: a warning in the logs nobody
  reads, and a 201 to the client as though all was well. Reported rather than
  enforced, because verifying accounts by hand is a legitimate deployment; only
  whether a key is present is disclosed, never the key.

## [8.3.0] - 2026-08-05

Requires `@lospor/core` v8.3.0.

### Added

- **Changing institution is a request that somebody decides.**
  `POST /v1/user/institution-request` files one; `GET /v1/admin/institution-requests`
  is the queue; `POST /v1/admin/institution-requests/{id}` approves or rejects.
  The queue is scoped to the institution being *joined*, not the one being left —
  approving is what lets a head of department see the newcomer's cases, so it is
  the receiving department that decides. A head of a different institution gets
  404 rather than 403, so they learn nothing about requests that are not theirs.
- **Leaving applies at once.** A move to `no-institution` needs nobody's
  approval: it grants no one anything, and requiring the hospital's permission to
  stop working there would trap people in a department they have left. Recorded
  as a self-resolved request and audited as `INSTITUTION_CHANGE_SELF_LEAVE`.
- `scripts/bootstrap-admin.ts` (`npm run bootstrap:admin`) — sets role,
  approval and email verification together, and refuses if an administrator
  already exists.

### Fixed

- **A departmental drug-profile edit could not be saved at all.** The authoring
  scope guard compared canonical units with `!==` and route units as raw JSON
  text. Units are objects, so the first compared references and the second
  compared key *order* — which zod rewrites on every save. An untouched unit
  therefore always looked changed, and an institution or personal ruleset was
  refused with "canonical units are fixed by the platform ruleset" whether it
  was widening a dose or narrowing one. Both now compare by a key-sorted
  canonical form.
- **A partial Aldrete score was summed with the missing components counted as
  zero.** One component recorded as 2 was stored as a total of 2/10 — a patient
  documented as apnoeic and unresponsive. `mapPostop` now uses core's rule: no
  total until all five are assessed.
- **A fresh installation could not sign anyone in.** Sign-in required
  `approvedAt`, which only an administrator could set, and there was no
  administrator. Approval is no longer a sign-in gate; email verification is.
- **Finalisation checked that a preoperative record existed, and nothing more.**
  A draft with only an id could be finalised through the API while every client
  refused to. It now validates the record and returns every blocker in
  `blockers[]` rather than only the first.
- **A case no longer follows its author between hospitals.** The
  head-of-department scope carried an owner fallback, so moving a clinician
  handed their entire history to the new department's head. A head now matches
  on institution alone, in the query and in both in-memory access checks.

### Changed

- **Registration requires `institutionId`.** Every account belongs to an
  institution; "Без институция" (`no-institution`) is the answer when none of the
  listed hospitals fit. Breaking for any client that omits the field.
- Granting head of department is refused with 422 for an institution that cannot
  have one.

### Database

Three migrations, applied automatically by the production build:

- `20260805120000_institution_change_request` — the request table.
- `20260805140000_no_institution_backfill` — creates "Без институция" and moves
  users with no institution into it.
- `20260805160000_no_institution_case_backfill` — the same for cases, so the
  column stops carrying two ways of saying the same thing. Visibility is
  unchanged: that institution has no head of department, so those cases stay
  with their author and with administrators exactly as they did.

## [8.2.1] - 2026-08-05

Requires `@lospor/core` v8.2.1.

### Changed

- Repinned to `@lospor/core` v8.2.1. No API behaviour changes: the fix is in
  measurement display, which the API does not use.

## [8.2.0] - 2026-08-05

Security and access-control fixes, and the dose calculation is brought under the
authoring scope guard.

Requires `@lospor/core` v8.2.0.

**Includes 8.1.0, which was never deployed** — its pull request was not merged,
so production remained on 8.0.0 with `@lospor/core` v8.0.0. Pediatric mode
therefore becomes active with this release, given `PEDIATRIC_MODE_ENABLED=true`.

### Fixed

- CORS and CSRF no longer fail open. `allowedCorsOrigin` returns `null` rather
  than falling back to the first configured origin, and the header is omitted
  entirely when no origin matches. With no trusted origins configured, CSRF
  checking now fails closed in production instead of being skipped. Preview
  deployments are correctly treated as non-production: they set
  `NODE_ENV=production`, which the old check read as live.
- Research and OMOP CSV exports neutralise formula cells. A value beginning
  `=`, `+`, `-`, `@`, tab or carriage return is prefixed with an apostrophe, so
  a spreadsheet renders it as text instead of executing it.
- AI request logs no longer carry clinical free text.
- A case is scoped to the institution it was performed at, not to wherever its
  author currently works. A head of department moving hospitals previously took
  visibility of their old cases with them.
- An unapproved account cannot sign in. Approval was checked nowhere, so it
  governed only whether someone appeared in colleague lists; and verifying an
  email address also set `approvedAt`, meaning clicking the link in your own
  inbox approved your own account. Institution is no longer self-editable
  through the self-service patch endpoint.
- The authoring scope guard now covers the dose calculation. It protected drug
  identity, display names, units, routes, slider bounds and concentrations, but
  not the arithmetic that turns a weight into milligrams: an institution or a
  member could multiply a per-kilogram dose tenfold, switch ideal to total body
  weight, delete a dose ceiling, invent quick doses, stretch an age band to
  birth or eighteen years, or give an automatic dose to a drug the platform
  ruleset withheld. All follow the rule the sliders already did — narrow, never
  widen. A department may still prescribe less, cap harder, remove quick doses,
  narrow a band and withdraw a drug; and a withheld drug may still be shown for
  manual entry, because a register has to record a drug that was given.

### Changed

- `PEDIATRIC_DRUG_DOSE` is rejected for authoring; see core v8.2.0. Stored rules
  of that kind still read, and none exist.
- Destructive maintenance scripts require `LOSPOR_ALLOW_PROTECTED_DB` to name
  the target Supabase project before they will touch a protected database.

## [8.1.0] - 2026-08-04

Pediatric dosing cleared for production.

Requires `@lospor/core` v8.1.0, in which `PEDIATRIC_PRODUCTION_READY` is `true`.

### Changed

- Pediatric case mutations are no longer rejected with
  `503 PEDIATRIC_MODE_DISABLED` once `PEDIATRIC_MODE_ENABLED=true` is set in the
  production environment. Both are required: the reviewed clinical manifest in
  core, and the deployment flag. Setting either alone leaves pediatric mode off.
- `clinicalRulesVersion` stamped on pediatric doses is now
  `2026.08.04-release.1`, from core — previously it read `…-draft.1`.

### Tests

- The pediatric gate test now passes `productionReady` explicitly for each case,
  so it pins the gate's logic rather than the current value of the shipped
  constant, and does not need rewriting whenever the clinical sign-off changes.
  A separate case records the current sign-off, so reversing it is deliberate
  and visible.

## [8.0.0] - 2026-08-04

First stable release. Adds pediatric clinical mode, the clinical-ruleset API,
and dose provenance.

Requires `@lospor/core` v8.0.0.

### Added

- Pediatric clinical mode on `Case`, with research-grade age capture.
- `ClinicalPreset` and `ClinicalPresetRule`, plus the selection tables backing
  the PLATFORM / INSTITUTION / USER ruleset hierarchy.
- Authoring scope guard. Below PLATFORM a ruleset may adjust presentation --
  ranges, quick values, display names -- but not schema: no new drugs, units,
  routes or concentrations, and a slider may narrow but never widen. Keeping
  authored rules inside the canonical vocabulary is what keeps the recorded data
  research-capable.
- `CaseEvent` records which rule and preset produced a dose and on what weight
  basis, so an administration stays reproducible after the ruleset moves on.
- Guarded scripts to create, publish, verify and prune platform rulesets, each
  refusing to run against a production-like database.

### Fixed

- Removed the `lospor-standard-v1` placeholder preset that the ruleset
  migrations seeded. It was created `PUBLISHED` with no rules to satisfy the
  NOT NULL foreign keys being added, then selected for every institution. Since
  preset resolution takes the first `PUBLISHED` preset from
  `[user, institution, platform]` and does not check whether it has rules, that
  left every institution resolving pediatric dosing to an empty ruleset — and a
  real ruleset published at platform scope could not have overridden it, because
  institution selections win. Found by restoring the production backup and
  running the migrations against it.

### Migrations

Ten migrations, all additive relative to v7.3.2: every `DROP COLUMN` in this
batch removes a column added earlier in the same batch, and no new `NOT NULL`
column lacks a default. A rollback to v7.3.2 therefore needs no schema
downgrade -- though cases recorded in pediatric mode will not be understood by
a v7.3.2 client.

## [7.3.2] - 2026-07-28

### Fixed

- Web timetable reconciliation and projection now use the same locked database
  transaction as the section save, preventing self-deadlock and outliving writes.
- Added a real-PostgreSQL route regression that verifies section data, event
  rows, projection, and revisions commit together within a bounded time.
## [7.3.1] - 2026-07-28

### Fixed

- API health, capabilities, research metadata, personal archives, research
  export records, and OpenAPI now derive the release version from one canonical
  package value.
- Added regression coverage that prevents public and persisted API metadata
  from drifting behind future releases.
## [7.3.0] - 2026-07-28

### Fixed

- Database row locks now serialize case finalization with all section and event
  writes, preventing completed cases from diverging from their snapshots.
- Research export manifests track parent, event, relational, and section
  revisions so child-row changes cannot pass snapshot validation.

### Changed

- Research exports accept finalized-only cohorts, map each OMOP page once, and
  remove private working files after artifact generation.
- Generated artifacts expire after the configured retention period while their
  immutable checksum, row count, source version, and audit history remain.
- Prisma runtime, PostgreSQL adapter, and generator are pinned to 7.9.1.

## [7.2.1] - 2026-07-27

### Security

- Updated Next.js and its PostCSS/Sharp runtime chain to patched versions.
- Refreshed transitive dependencies so the API reports zero npm audit findings.
- Moved CI and the cross-repository release gate to Node.js 24 actions.

## [7.2.0] - 2026-07-27

### Fixed

- Research permissions retain action-specific institution scopes, preventing
  inspection or export rights from escaping through a broader query grant.
- Aggregate-only requests never query or return pseudonymous case rows.
- Query, comparison, benchmark, distribution, and quality responses apply one
  small-cell policy using valid denominators and complementary binary counts.

### Added

- Immutable background research exports with transactionally captured and
  hashed case revisions, visible source-drift failure, checksummed artifacts,
  filesystem and S3-compatible storage adapters, lease recovery, failure-
  isolated bounded workers, and separate-table OMOP CSV ZIP files.
- Typed research OpenAPI request/response contracts and real PostgreSQL tests
  for lock concurrency, mixed institutional grants, revocation, and immutable
  artifact downloads.

### Changed

- Reusable OMOP selection/redaction logic now lives in the API service layer.

## [7.1.0] - 2026-07-27

### Added

- Governed `/v1/research/*` endpoints for cohorts, comparison, quality,
  benchmarks, pseudonymous case review, exports, saved cohorts, and access
  grants, with complete OpenAPI coverage and audit logging.
- Additive persistence for research grants, saved cohort definitions, and
  export history.

### Changed

- Research and clinical DTOs carry stable codes with canonical bilingual
  display metadata from Core.
- CSRF and CORS policy supports the explicitly configured standalone Database
  origin without weakening production origin checks.
- The cross-repository release gate now verifies the standalone Browser.

## [7.0.1] - 2026-07-25

- Case editing leases now use one atomic PostgreSQL compare-and-set operation,
  so simultaneous devices cannot both be told they own the same lock.
- OMOP exports refuse batches above 5000 cases with an explicit incomplete
  response instead of silently truncating valid-looking research data.
- Personal account exports are complete streamed ZIP archives with manifests,
  cursor-paged cases, audit history, role requests, and transfer history.
- OpenAPI now explicitly contracts every supported route, admin operation,
  health endpoint, and internal job; route/contract drift fails generation.
- Email-verification links now return users to the configured web application
  after the dedicated API verifies the token, instead of redirecting to a
  nonexistent page on the API host.
- Vercel preview builds no longer require production database credentials or
  run database migrations; production deployments still run `migrate deploy`.
- CI now runs migrations and lock concurrency tests against PostgreSQL, with a
  selectable cross-repository release gate for Core, API, web, PWA/mobile, and
  docs.

## [7.0.0] - 2026-07-25

### Added

- First release of the dedicated LOSPOR database and HTTP service.
- Versioned `/v1` routes for cases, authentication, account management,
  clinical libraries, search, AI, PDF generation, audit, OMOP, and
  administration.
- Process and database health checks, capability discovery, request IDs,
  generated OpenAPI, CORS/CSRF handling, and first-party bearer/cookie
  authentication.
- Standalone Node output for future institution-hosted deployment.

### Changed

- Prisma, PostgreSQL access, migrations, email, AI providers, audit
  persistence, OMOP export, and maintenance jobs move out of the web
  repository and into this service.
- English procedure search remains available when the interface language is
  Bulgarian; Bulgarian ICD-10 search continues to use its localized catalog.

### Release

- Deploy this service before web and PWA.
- The intended production origin is `https://api.lospor.org`.
- No new V7 database migration is required. The deployment still runs
  `prisma migrate deploy` to verify tracked migration state.
