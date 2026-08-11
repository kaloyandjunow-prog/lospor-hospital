# Changelog - LOSPOR Web App

## [9.0.1] - 2026-08-11

### Fixed

- **Production builds no longer depend on Google serving font files.**
  `next/font/google` downloads the woff2 files during the build, and Google
  rotates the hash in those URLs when it reissues a font. A deploy whose build
  cache still held the older stylesheet requested files that returned 404, and
  the failure surfaced as 36 `Can't resolve
  @vercel/turbopack-next/internal/font/google/font` errors — which read as a code
  defect and are not one. This broke a production deploy and a CI run.

  Roboto and Geist Mono are now served from this repository (90 kB, subsets and
  unicode-ranges copied from Google's own stylesheet). The build output contains
  no reference to `fonts.gstatic.com` at all, and the appearance snapshots match
  unchanged, which is the evidence rendering is identical.

- **The dashboard visual test masked nothing it claimed to.** The locator was
  `main section` last, and the case list is a Card, not a section, so every case
  counter stayed in the comparison. That is why the Windows and Linux baselines
  disagreed about how many cases existed rather than about rendering.

- **The onboarding tour raced the dashboard screenshot.** It starts on a 900ms
  timer and the suppression flag was set after navigation, too late to stop it.
  Two CI runs of identical code produced one dashboard with the tour open and one
  without. Now set before any page script runs.

### Note

No behavioural change for clinicians. Everything here is about builds being
reproducible and tests being able to fail honestly.

## [9.0.0] - 2026-08-11

### Fixed

- **Reopening an unfinished case silently dropped what had been saved.**
  "Elective surgery" and the AI consent flag came back blank, along with score
  inputs, the unable-to-obtain flags, the physical exam report and the notes.
  Every persisted field is now restored, behind a field matrix that names any
  field it cannot account for — so a future field added to the form fails the
  suite by name rather than going missing in silence.
- **A patient not yet scored in recovery was shown as 0 out of 10** — the worst
  possible Aldrete, in alarm red — because an unrecorded score was treated as a
  real one. An unassessed recovery now renders neutrally. An age of 0 also
  survives, instead of being dropped by a truthiness check.
- **A blocked postoperative save still advanced to the summary** and started
  the countdown that finalises the case, so work the server had refused looked
  finished.
- An invalid `?step=` produced `NaN` and rendered an empty page over a real
  case. It now falls back to the step the saved data implies.
- Failed case loads and refused unfinalise attempts now say so instead of
  failing quietly.

### Changed

- `@lospor/core` moved to v9.0.0, and is installed from the published tag
  rather than `file:../lospor-core`. That path is a sibling directory which
  only exists on a developer machine: CI never checked lospor-core out, so
  `npm ci` could not install at all and a green local run proved nothing about
  whether the app builds anywhere else.
- Paediatric dose ambiguity, the infusion route filter, the option-metadata
  reader and the wall-clock-to-column conversion now come from core instead of
  being kept here as a second copy. Two of those copies had already drifted
  from the phone's.
- The end-to-end seeder and the suite now read one `E2E_DATABASE_URL`. They
  previously disagreed the moment anyone set it — the seeder used a hard-coded
  Docker container while Playwright tested whatever the variable named, so CI
  seeded one database and tested another.

### Internal

- `IntraopTimetable.tsx` reduced from 4,236 lines to 2,498 by extracting the
  rules it contained — dose precedence, ambiguity, flyout state, drag state —
  and the lane renderers, each with its own tests. The extractions that paid
  were the ones that pulled out a rule; the remaining overlay prop-passing was
  left alone rather than split for the line count.
- A component size budget that ratchets downward, so the big components cannot
  quietly grow back.
- End-to-end coverage for the intraop chart, including the four infusion drags.
  Every chart assertion is negative-controlled: the first drag test written
  here passed while the drag was landing on a handler-less element, so each one
  is now checked against a deliberate break.

## [8.5.0] - 2026-08-07

### Fixed

- **Live case updates could stop for the rest of a session.** `LiveCaseUpdater`
  polls through `createSingleFlightPoller`, which re-armed only inside the
  in-flight poll's `.finally()`. One request that never settled left the poller
  permanently asleep, so a case being edited elsewhere silently stopped
  refreshing. Fixed by repinning to core v8.5.0, which puts polls under a
  watchdog.

## [8.4.0] - 2026-08-06

### Changed

- Version aligned with the 8.4.0 release train. No behavioural change: the web
  app always has the search endpoints available.

### Added

- A lint rule forbidding `@lospor/core/vocabulary` here. It is ~2.6 MB of ICD-10
  and procedure data bundled for the mobile app, which has no network to fall
  back on; importing it on the web would ship the whole table to every browser
  for no benefit.

## [8.3.2] - 2026-08-06

### Fixed

- **Premedication for a child was dosed as an adult.** The picker took only a
  drug list and a dose table, with no clinical mode, weight or age, so a
  paediatric case was offered the adult library unchanged — a gram of
  paracetamol for a 12 kg two-year-old. It now rebuilds every entry from the
  child's own weight and age through the shared resolver in `@lospor/core`, so
  this and the mobile sheet cannot disagree about a dose.
- Drugs that should not be given to a child are shown disabled with the reason
  rather than at an adult dose — codeine, aspirin under 16, tramadol under 12.
  Drugs with no paediatric rule are dropped rather than shown at their adult
  amount, and a child with no recorded weight gets a prompt for one instead of
  a number.
- A calculated dose shows the arithmetic behind it — `15 mg/kg × 14 kg`, plus
  the cap when it bit — so it can be checked at a glance.
- Changing the route recalculates the dose. Oral midazolam is 0.5 mg/kg and
  intravenous is 0.05; the previous number used to stay on screen across the
  change, a tenfold error waiting to be confirmed.

## [8.3.1] - 2026-08-05

Requires `@lospor/core` v8.3.0 and LOSPOR API v8.3.1.

### Fixed

- **The institution dropdown pushed the registration form off the screen on a
  phone.** The panel carried a minimum width of 90% of the viewport, meant to
  give long hospital names room on a desktop. On a phone that is wider than the
  card the field sits in, so the panel — anchored to the left edge — spilled
  past the card and off the screen. The page gained horizontal scroll and the
  form appeared with its labels sliced off down the left side. It now widens
  only from the `sm` breakpoint up, where there is room to.
- Long hospital names now ellipse instead of forcing every row wider than the
  panel. `truncate` cannot shrink a flex item below its own text without
  `min-w-0`, and Bulgarian hospital names are long enough to hit that.
- **Registration and password reset no longer claim an email was sent when it
  was not.** The API has always reported `emailSent`; both screens ignored it
  and said "check your email" regardless, sending the clinician to look in a
  folder that would never contain anything. An address that does not exist
  still reports success — that is the anti-enumeration behaviour and it is
  unchanged, because the API only reports a failure when it genuinely tried to
  send and could not.

## [8.3.0] - 2026-08-05

Requires `@lospor/core` v8.3.0 and LOSPOR API v8.3.0.

### Added

- **Ask to join a department, and a queue for whoever decides.** The settings
  menu files a request instead of relabelling itself; the admin page gains the
  queue, shown to administrators and to the head of the department being joined.
- **Leave institution**, in the settings menu. Confirms first, then reports
  where you landed rather than a pending request — leaving needs nobody's
  approval. Hidden if you are already in "Без институция".

### Fixed

- **The recovery form showed a bare " / 10" with "keep monitoring" beside it
  when nothing had been scored**, which reads as an assessment that was never
  made. It now shows "—" and no verdict until all five components are recorded.
- **Registration said the institution was optional while the server required
  it**, so an empty box produced a generic "Invalid request" with nothing
  pointing at the field. It is now required, names "Без институция" as the
  answer when none of the hospitals fit, and falls back to it outside Bulgaria
  when the "Друго" row is missing.
- The admin page no longer sends a head of department away. It used to bounce
  anyone whose user list returned 403, which locked them out of the one queue
  that was theirs to act on.

### Testing

- The end-to-end suite goes from 5 tests to 48, across a cast of five identities
  in two institutions — because every rule this release adds is a rule about
  *who*, and the assertion that matters is always that somebody else is refused.
  New specs cover the institution flow, case visibility across a move,
  finalisation gates, the Aldrete defaults, admin-page scope, paediatric mode,
  the ruleset authoring scope guard, offline sync, print and PDF, and research
  access.
- The suite now runs on every pull request, not only in the release gate.

## [8.2.1] - 2026-08-05

Requires `@lospor/core` v8.2.1 and LOSPOR API v8.2.1.

### Fixed

- Weight, height and temperature steppers show a value to the precision it is
  entered in. Any range with a sub-unit step previously rendered through
  `Math.round`, so a 0.5 kg ladder read "5 5 6 6 7 7". See `@lospor/core`
  v8.2.1; the fix reaches every `ConvertedStepper` in the preop, postop and
  intraop forms.

## [8.2.0] - 2026-08-05

Stops the forms inventing clinical data, and closes a login loop.

Requires `@lospor/core` v8.2.0 and LOSPOR API v8.2.0.

### Fixed

- Preop and postop forms no longer pre-fill observations that were never taken.
  Vitals and demographics were seeded with generated values, so a form opened
  and saved recorded numbers nobody measured, indistinguishable from real ones.
  Autosave no longer writes a record on first mount, so opening a case and
  closing it again leaves nothing behind.
- Imported lab rows are shown as the report printed them, and rows whose unit
  was not recognised are no longer pre-ticked for acceptance.
- A stale session cookie no longer traps sign-in in a redirect loop.

### Changed

- The clinical rule editor no longer offers the retired `PEDIATRIC_DRUG_DOSE`
  format, which it also selected by default for every new rule. New rules start
  as a drug profile; an existing rule of the old kind still opens for editing.
- Data-handling wording describes cases as pseudonymised rather than anonymous,
  which is what they are: no name or identifier is stored, but a case remains
  linked to its author and institution.

## [8.0.0] - 2026-08-04

First stable release. Adds pediatric clinical mode and the clinical ruleset
editor.

Requires `@lospor/core` v8.0.0 and LOSPOR API v8.0.0.

### Added

- Pediatric preop sections and pediatric-aware intraop dosing.
- Clinical ruleset editor with a visual profile preview: you see the widget the
  clinician will actually get, and click a pill, slider or field to edit it,
  rather than filling in a form that describes it.
- Published rulesets now offer an editable copy instead of appearing locked.
- Pediatric rule rows are grouped by drug, so a profile reads as one thing.

### Fixed

- The now-marker is measured from the floored grid origin. A case started at
  22:37 belongs to the 22:35 column, so measuring from 22:37 drew the marker on
  the 22:35 gridline and left it up to 4:59 early for the whole case.
- Ruleset-hidden fluids are hidden from the picker but kept in the lookup maps,
  so a fluid recorded earlier in the case still resolves its volumes and routes.

### Changed

- The intraop clock and vitals autofill are extracted from `IntraopTimetable`,
  with tests covering overnight wrap and the rule that autofill never overwrites
  a recorded observation.
- An encoding guard test fails the build on cp1251 mojibake reaching the UI.

## [7.3.0] - 2026-07-28

- Identifies web sessions as v7.3.0 for the serialized clinical-write and
  revision-manifest API release.
- No clinical workflow or visible web behavior changed in this compatibility
  release.

## [7.2.1] - 2026-07-27

- Updated Next.js, PostCSS, Sharp, shadcn tooling, and transitive dependencies to patched releases.
- Cleared the web dependency audit and moved CI to Node.js 24 actions.
- Clinical behavior and persisted data contracts are unchanged.

## [7.2.0] - 2026-07-27

- Coordinated research-governance contract release. The clinical web workflow
  and persisted case data are unchanged.
- The standalone Database now receives aggregate and case-level data through
  separate permission-scoped API contracts and immutable export jobs.
- No production deployment is included in this local release preparation.

## [7.1.0] - 2026-07-27

- Clinical screens, summaries, print views, search surfaces, and intraoperative
  tools now resolve stable codes through the canonical Core English/Bulgarian
  display registry.
- Raw enum and database labels no longer leak into clinician-facing web views;
  persisted values and API identities remain unchanged.
- The product navigation links to the standalone LOSPOR Database research
  interface.

## [7.0.1] - 2026-07-25

- Settings now downloads the complete personal-data ZIP archive through a
  checked request and displays an error if archive generation fails.
- Export wording no longer describes the download as a capped JSON file.
- Coordinated API contract and release-gate verification for v7.0.1.

## [7.0.0] - 2026-07-25

### Changed

- Web is now an API-backed browser client. Database access, Prisma,
  authentication services, email, AI, PDF generation, audit persistence,
  OMOP, migrations, and maintenance jobs live in `lospor-api`.
- The temporary `/api/*` compatibility address forwards to the dedicated
  versioned API without duplicating backend behavior.
- Production uses `https://api.lospor.org`; the web deployment no longer needs
  database or API signing secrets.

### Release

- Deploy and verify API V7 before deploying this web release.
- No new V7 database migration is required.

## [6.0.0] - 2026-07-24

### Changed

- Clinical catalogs, offline fallback records, labs, ASA/risk decisions,
  readiness checks, Aldrete/handover rules, summaries, timing, units, account
  policy, and search contracts now come from Core.
- The database remains the runtime catalog mirror. Seeding imports Core and
  applies non-destructive upserts instead of maintaining a second authored
  option library.
- Option loading, lock leases/takeover, polling, and revision/conflict headers
  use shared Core controllers with web storage and HTTP adapters.
- Finalization blocks on hard requirements, presents one shared warning list,
  and reconciles relational rows before writing the immutable snapshot.
- CI rejects copied fallback catalogs, hardcoded clinical option arrays,
  duplicated threshold functions, aliases, and timetable interval arithmetic.

### Fixed

- A PII-rejected field now remains visible locally with its specific reason
  beside the field and in autosave status. Safe fields continue saving, and
  the rejected value is retried only after it is edited.
- Uppercase ICD-10 diagnoses and comorbidities selected from the coded
  catalogue no longer trigger the probable-name heuristic. EGN, long-number,
  date, and email checks still apply.
- The gas-settings bar now shows each FGF/carrier-gas/FiO2 change at its
  five-minute column, uses the same rounded edges as other timetable bars, and
  allows editing from any active cell.
- Gas start, change, and stop rows in the web event log now show clinical
  descriptions instead of raw `gas_start`/`gas_change` type names.
- Live timetable clocks and event columns use persisted `startedAt` instants,
  never a bare `HH:MM` reconstructed against the browser or server clock.
- Routine form autosave no longer sends a competing whole-timetable snapshot.
  Legacy snapshots without a trusted start remain readable and cannot create
  future synthetic events.
- Added a dry-run shifted-event report plus a separately guarded, audited
  tombstone repair command. No repair runs automatically.
- Legacy `GENERAL_COMBINED` cases are returned and persisted as canonical
  `GENERAL_BALANCED`, while existing translated display labels remain valid.

### Release

- No database migration is required.

## [5.6.1] - 2026-07-24

### Changed

- Case-detail and intraoperative timetable types now come from the shared Core
  package, removing parallel web/mobile definitions that could drift.
- Legacy number-or-text infusion rates are normalized explicitly before totals,
  dragging, or rate editing.

### Release

- No database migration is required.

## [5.6.0] - 2026-07-23

### Added

- The web/PWA case editor now uses the shared Autosave Manager for section
  saves, event appends, event edits, and event deletions. IndexedDB stores each
  operation before it is sent.
- Preop, intraop, and postop records now carry monotonic `syncRevision`
  counters. Event writes reserve the expected revision atomically before
  rebuilding the timetable projection.
- Targeted `PUT`/`DELETE /api/cases/:id/events/:eventId` operations replace the
  old whole-log edit/delete path.
- Reopening a case reapplies queued fields and event mutations over the server
  snapshot. Finalization waits for the case queue to drain and refuses to close
  a case with unsynced work.

### Fixed

- Simultaneous autosave, offline replay, and timetable event writes can no
  longer race through separate client queues.
- Idempotent projection rebuilds no longer advance a revision when the
  projected timetable and fluid totals are unchanged.
- Deleting a draft also removes every queued operation for that case.

### Database

- Added and applied the development migration
  `20260723000000_autosave_manager_revisions`. Production was not migrated or
  deployed during this local implementation pass.

## [5.5.1] - 2026-07-23

### Fixed

- Intraoperative vital auto-fill now uses the shared core planner instead of
  web-only copy logic. If the browser resumes after missing more than one
  5-minute tick, every skipped empty vital column is filled and persisted as a
  `vital` event.
- The Auto-fill vitals setting is now the master switch: turning it off also
  clears Auto-fill BP & HR and Backfill on reopen, preventing hidden stale
  options from reactivating later.

### Release

- Web, mobile, core, and docs are aligned on the common `5.5.1` release line.
  No database migration is required.

## [5.5.0] - 2026-07-23

### Fixed

- Web cookie sessions and server-rendered clinical pages now revalidate against
  the live account row before using role, institution, deletion state, or the
  password-reset epoch. A deleted user, stale reset-era session, or demoted
  administrator is refused on the next request path that can await the database.
- OMOP export now selects `startedAt`, `endedAt`, and `timezone` from
  `IntraoperativeRecord`, so visit and observation-period dates use the real
  operation instants when present. The export contract moves to
  `source_version` `3.5.1`.
- Current mobile sync docs now describe the production version-polling live
  refresh path instead of the removed `/api/cases/[id]/stream` SSE endpoint.

### Release

- Web, mobile, core, and docs are aligned on the common `5.5.0` release line.
  No database migration is required.

## [5.4.2] - 2026-07-22

### Fixed

- **Whole-number weights were rejected.** Raising the weight floor to 0.5 kg in
  5.4.1, while the step stayed at 1, put every accepted value on a half-kilo —
  so entering 105 kg was refused with "the two nearest are 104.5 and 105.5".
  The step is now 0.5 kg, so whole and half kilos are both valid. This was the
  only picker affected; it is the only one whose minimum is not a whole number.
- The picker/API agreement test now also checks that a whole number lands on
  each picker's grid, not only that the range ends are accepted — the gap that
  let the weight step through.

**Deployment:** re-seed the option library
(`npx tsx scripts/seed-option-library.ts`) so the corrected step reaches an
existing database.

## [5.4.1] - 2026-07-22

### Fixed

- **A single out-of-range value could destroy an entire preoperative
  assessment.** The height slider on the web could be dragged below the
  30 cm the record accepts. Creating a case validated all-or-nothing, so that
  one value made the whole request fail and **no case was written at all** —
  meaning there was no draft to come back to, and leaving the page lost
  everything typed. Creating a case is now lenient in exactly the way saving an
  existing one has been since 5.2.1: the offending value is refused and named,
  everything else is stored.
- **Four pickers offered values the record refuses.** Systolic pressure started
  at 1 where the minimum accepted is 40, diastolic at 1 against 20, heart rate
  at 1 against 10, and temperature at 0 against 25. Dragging any of those
  sliders to the bottom produced a save that could not be stored. Every picker
  is now bounded by the same figures the API enforces, and a test feeds each
  boundary through the real validator so the two cannot drift apart again —
  that test is what found these four.
- **A refused value is now visible where it was typed.** The server has reported
  rejected fields since 5.2.1 but the web app never read them, so a refused
  value was dropped in silence while the form looked saved. The field is now
  outlined and carries the accepted range — "Not saved — must be 30–250 cm"
  rather than "Invalid request" — and the message stays until the value is
  corrected, so it cannot be missed by leaving the screen.

### Notes

Reporting a refused value can never interrupt charting: a missing, malformed or
unrecognised response is ignored rather than surfaced, and nothing on this path
blocks a save or navigation.

**Deployment:** the option library must be re-seeded
(`npx tsx scripts/seed-option-library.ts`) for the corrected picker bounds to
reach an existing database. Without it the app falls back to the bundled
snapshot, which is already correct.

## [5.4.0] - 2026-07-21

Start and end times are now stored as real instants with the timezone they were
entered in. **This release alters the production database** (additive only).

### Fixed

- **The start time could lock itself to 00:00 with no way to correct it.** Reach
  the intraoperative screen, change anything at all — a monitoring checkbox is
  enough — leave, and come back, and the field showed a locked "00:00". The
  column could not represent "not started yet", so the first save wrote a
  fabricated midnight; because that is a real date as far as the code is
  concerned, every check that asked "has this case started?" answered yes. The
  same fabricated value could also be written by logging a single event.
  "Not started" is now genuinely empty, and the field stays editable until a
  time is actually entered.
- **The chart origin was an hour or three out, depending on where you were.**
  Start times were kept as a bare wall clock — "08:00" and nothing else — while
  everything charted against them is a real moment in time. Combining the two
  put the origin out by the local UTC offset, which in Bulgaria meant the
  correction shipped in 5.3.0 failed its own consistency check every time and
  quietly fell back to the previous behaviour. It only ever worked in a zone at
  UTC+0. Times are now stored with their zone, so the chart begins where the
  clinician said it began, anywhere.
- **Elapsed duration was computed from the clock face rather than elapsed time,**
  so a case spanning a daylight-saving change was an hour out.
- Finalising a case now genuinely blocks when no start time was recorded. That
  check existed but could never fire.
- The research export no longer emits a fabricated date as the day of surgery.

### Changed

- `IntraoperativeRecord` gains `startedAt`, `endedAt` and `timezone`. The
  previous `startTime`/`endTime` columns are kept and still readable, and
  records written before this release are unchanged — their timezone was never
  recorded, and inventing one would produce a timestamp indistinguishable from a
  real one. Nothing is rewritten or guessed.

### Added

- `npm run smoke:start-time` — the real HTTP path: a save that never mentions
  the start time must not invent one, a local time must resolve to the correct
  instant, and neither a later save nor a malformed value may disturb a stored
  time.
- Timezone and daylight-saving coverage across UTC−5, UTC±0, UTC+3 and UTC+9,
  including both clock changes and the hour that repeats in autumn.

### Migration

`20260721180000_intraop_real_instants` — additive: adds the three columns and
drops `NOT NULL` from `startTime`. No data is rewritten.

## [5.3.0] - 2026-07-21

Remediation of an external code review, plus a parity pass over the intraoperative
surface. **This release alters the production database** (see Migration below).

### Fixed

- **Transferring a case to a colleague could fail outright.** Case codes are per-user
  sequences that both begin at `0001`, so whenever the recipient already held the
  incoming code the insert violated a unique constraint and returned 500. The case
  is now renumbered into the recipient's sequence only on a genuine clash, the code
  it previously carried is recorded on the transfer, the institution travels with
  it, and the whole thing happens in one transaction.
- **Deleted accounts kept working until their token expired.** A session issued
  before deletion continued to authenticate. Deleted accounts are now rejected at
  the door, and role changes take effect on the next request instead of the next
  login.
- **The live chart could disagree with itself across devices.** Three different
  definitions of "column 0" were in play: the browser anchored the chart to the
  start time you typed, the server anchored the stored projection to the first
  event recorded, and the phone drew the server's columns under the browser's
  labels. Start a case at 08:25 having entered 08:00 and the chart began in a
  different place depending on where you opened it. The start time you enter is
  now the single origin everywhere — nobody charts at the moment of induction.
- **Live updates never worked in production.** The mechanism was a server-sent
  event emitter held in process memory, which cannot work on serverless
  infrastructure; the web app had no fallback at all, so changes made elsewhere
  never appeared. Replaced with a cheap version endpoint both clients poll.
- **A typo in a numeric field silently erased the stored value.** Entering
  `12abc` parsed to "not a number", which was written as an empty value with
  nothing reported back. Unparseable input is now refused and named, like any
  other rejected value.
- **The intraoperative chart displayed internal key names as row labels.** The
  entire `intraop.timetable.*` namespace was missing from both language files, so
  rows read `intraop.timetable.drugs` instead of "Drugs". A test now scans the
  source and fails if any translated string is missing from either language.
- **The welcome tour appeared on top of the settings dialog**, pointing at things
  the dialog covered. It now waits for a clear screen, and yields if a dialog
  opens while it is running.
- Host header no longer trusted when constructing internal URLs.
- The personal-information guard now also covers the diagnosis and planned
  procedure fields.
- Pagination parameters that are not numbers no longer reach the database.

### Changed

- **The drug, infusion, fluid, agent and gas menus now match the mobile app.**
  Web had grown a flat searchable list while mobile offered eight clinical
  categories with favourites; and where mobile always confirms a dose, web
  silently committed the first suggested value the moment you picked a fluid or
  agent — so adding a fluid never showed you the volume it recorded. Both apps
  now present the same eight categories, the same favourites, and always confirm
  the dose. The menu vocabulary itself moved into the shared core package so the
  two cannot diverge again.
- **Custom free-text drug entry has been removed** from the web chart. It was
  never intended, and it wrote names that no shared library could interpret.
- Favourite drugs and infusions can now be edited from the web settings as well
  as the phone; both write the same eight-slot list.
- Unrecorded sex is now stored as `UNKNOWN` rather than defaulting to a value.
  "Nobody asked" and "recorded as other" are different facts, and merging them
  corrupts any denominator computed from the data.
- Accounts are now anonymised 30 days after a deletion request via a scheduled
  job, rather than lingering indefinitely. Audit records deliberately outlive the
  account they describe.

### Added

- `GET /api/cases/[id]/version` — a cheap change marker for live refresh.
- `npm run smoke:transfer` — the transfer path against a real database.
- `npm run reproject:cases` — realigns stored charts to the corrected origin.
  Dry-run by default.

### Migration

`20260721120000_v530_review_remediation` — additive only: adds `Sex.UNKNOWN`,
`CaseTransfer.previousCaseCode`, two `AuditLog` indexes and a `CustomTerm`
uniqueness constraint. Written by hand because `prisma migrate dev` proposed
resetting the database over pre-existing drift.

## [5.2.1] - 2026-07-21

### Fixed
- **A field-level save no longer erases the fields it did not mention.** The case schema treated "field not sent" and "field cleared" as the same thing, so a patch carrying only a new weight silently wrote `null` over the stored height, age and every other numeric preoperative value. Since both clients save field-level diffs, this affected ordinary editing, not just edge cases. `undefined` now means "leave it alone" while an explicit `null`/`""` still clears the field.
- **One rejected value no longer discards the whole save.** `PATCH /api/cases/[id]` validated the entire body at once, so a single out-of-range number (a half-entered height, for instance) returned 400 and threw away every other edit in that autosave. Invalid fields are now dropped individually, the rest of the section is stored, and the response lists them under `rejectedFields` so the client can tell the user which value was refused.
- Height, weight and age pickers now offer only values the API accepts — previously the height wheel started at 0 while the API required at least 30 cm, which is what made autosave fail.
- Live case timetable: a start time later than the current clock is no longer read as "started yesterday". Entering a future start marched the now-marker toward 23 hours elapsed, grew the chart by an hour every ten seconds, and could backfill hours of fabricated vital signs into the record.

### Changed
- **OMOP export now emits `PERSON` and `OBSERVATION_PERIOD`.** These are the root tables the OMOP model and OHDSI tooling (ATLAS, ACHILLES) require; without them the bundle was OMOP-shaped but could not be loaded. `year_of_birth` is derived from age at operation, with month and day left genuinely unknown rather than defaulted; race and ethnicity are emitted as concept 0 since they are not collected.
- **Pseudonymous `person_id` is now derived from SHA-256**, as the export manifest had always claimed. The previous value was a 32-bit non-cryptographic string hash, where two unrelated cases would collide onto a single "person" somewhere around 70,000 cases. The identifier is now 52 bits, and the manifest also states plainly that one person is emitted per case, so the same patient across two operations appears as two persons.
- Chart labels on the record and summary are translated in Bulgarian (АН, СЧ, Темп, Инфузия, Газова смес, Флуиди, Позиция, mmHg/удм).

### Added
- `npm run smoke:autosave` — an end-to-end check of the real save path (auth → create → patch → read back) covering both failures above. `BASE_URL` selects the target server.

## [5.2.0] - 2026-07-20

Aligns the mobile summary, web summary, and printable protocol onto one shared case-summary model, and redesigns the A4 printable protocol around the intraoperative timetable.

### Added
- **Redesigned printable anaesthesia record** (browser print → A4, no PDF engine): light paper design with the LOSPOR wordmark header, hand-fill patient identity band, key-facts pill chips, and an intraoperative timetable where the vitals graph, a numeric vitals grid (BP/HR/SpO₂/EtCO₂/Temp), and all lanes (Agent, Infusion, Gas/FGF, Fluids, Position) share the same aligned time columns. Clinical events render as dashed flags labelled above the graph. Pre-&-post-operative sheet restyled to match.
- **Stacked half-case chart panels, paper-record style**: a case up to ~5 h is one full-height chart; longer cases continue onto a second half-height chart on the same page at the same visual rhythm ("CONTINUED") — nothing repeats, nothing gets squeezed. Each panel's numeric vitals table samples at a comfortable interval (q5→q30, ≤ ~24 columns, bucket-filled so cells stay populated at any recording cadence) while graph traces, drugs, events and positions keep every recorded point at its true time. The record stays exactly two A4 pages for cases up to ~24 h.
- **Numbered drug pins + administration log**: each dose is a numbered pin (① ② ③ …) on a dedicated strip at the exact administration time, resolved in a DRUG ADMINISTRATION LOG box (time · drug · dose per pin, plus totals per drug) — replacing both the old drug pill rows and the totals-only box.
- **"Print case" pipeline**: the case summary is now a clean review page with no print buttons; printing lives on a dedicated `/cases/[id]/print` page for **finished** cases — offered automatically when a case is closed ("Print case?"), and via a Print case button on finished cases in the dashboard list and summary. The print page has **Download PDF** and **Print** actions. (Mobile skips this page entirely — see the PDF route below.)
- **Server-generated A4 PDF** (`GET /api/cases/[id]/pdf`): headless Chrome renders the print page and returns the finished two-page A4-landscape PDF file — auth via session/bearer or the short-lived print token. This is what the mobile app downloads for "Print case" before handing it to the phone's native share sheet, replacing the phone print-dialog fight entirely (uses the machine's installed Chrome/Edge locally, `@sparticuz/chromium` on Vercel).
- **Phone-proof print page**: the record always renders as light paper (opts out of Chrome's auto-dark and LOSPOR's own dark theme) and narrow screens show the true desktop sheet scaled down instead of a reflowed, squashed chart.
- **Theme-aware summary**: the case summary (including the timetable chart) now follows the app theme — dark chart in dark mode, paper look in light mode. The printed record and PDF always stay white.
- **Bulgarian record**: the chart-internal labels (Час, Лекарства, Агент/Инфузия/Газ/Течности/Позиция), sampling footnote and CONTINUED captions are now localized, and the server PDF accepts `?lang=bg` — mobile Print case passes the app language so the PDF arrives in it; the web Download PDF button passes the current locale.
- **Time-anchored patient position** on the record: `position_change` events (loggable from the intraop event picker's new Position section) project into a Position lane; legacy cases with only the flat positions list keep their chip and simply have no lane.

### Fixed
- Print tokens now act as full authorization for the case they name: an admin or head-of-department printing a case they don't own no longer gets "Not found" from the print page / PDF route (the token carried the requester's id but the lookup demanded ownership).

### Removed
- The unused react-pdf protocol implementation (`@react-pdf/renderer`) — the record is pure HTML/CSS browser print.

## [5.1.0] - 2026-07-13

Hardening release addressing an external code review of v5.0.0.

### Fixed
- **No more false "Edit conflict" when adding an intraop entry.** Adding a drug/fluid/vital/event on a case you are the only editor of could pop the conflict-resolution modal (and make autosave appear to race itself). The event write advanced its conflict-base timestamp just outside the per-case write queue's critical section, so a section autosave queued behind it read a stale base and 409'd against the event's own write. The base is now advanced inside the queued operation, so serialized writes never conflict with themselves.
- **Web timetable vitals now use one stable identity per 5-minute column** (`web-vital-N`, the scheme mobile and the server bridge already used). Re-editing a cell supersedes the stored event instead of stacking a second event with a random id at the same timestamp — which could make the projected value (chart, protocol PDF, OMOP export) flip nondeterministically between rebuilds. The projection sort also gained deterministic tie-breaks (version, then id).
- **A queued offline save that hits a conflict now self-heals once on flush** (adopts the server's timestamp and retries, per-field last-writer-wins — the same policy live saves use) instead of replaying the same stale base forever and jamming the tray badge.
- **Queued intraop section patches and queued intraop events no longer share a storage key.** The historical key collision meant one could silently overwrite — or a flush could destroy — the other; patches moved to their own namespace with automatic migration on startup.
- Mojibake repaired in the pre-v3 changelog archive.

### Added
- **Offline intraop event capture on web**: drugs, fluids, vitals, and clinical events added while offline are journaled in IndexedDB and replayed idempotently on reconnect (counted in the header badge). Deleting/editing existing timeline items still requires connectivity — the change reverts with a clear message instead of risking a stale-log replay.
- **Password reset now terminates existing sessions**: web sessions and mobile bearer tokens issued before the reset are rejected within ≤5 minutes (`passwordChangedAt` epoch check, same cached pattern as sign-out revocation). Includes a DB migration.
- **Sign-out hygiene on shared workstations**: signing out warns when unsynced saves exist and clears the offline trays, so one clinician's queued clinical fragments can never flush under the next user's account.
- Multi-tab safety: only one tab flushes the offline trays at a time (Web Locks), and queue reconciliation now rebuilds its index from actual IndexedDB contents, rediscovering entries a tab race dropped.

### Changed
- Case creation sends an idempotency key, so a create retried after a network blip can't produce a duplicate case.
- Field-diffing compares values canonically (key order no longer causes false-positive saves).

## [5.0.0] - 2026-07-12

Unified save/sync engine.

### Added
- **Offline saving.** Saves that fail because the connection dropped are kept in the browser (IndexedDB) and replayed automatically on reconnect/focus — the save pill shows "Saved locally — waiting for connection". Privacy settings gain an offline-queue counter and a discard control.
- **A global "saves waiting" badge** in the header, visible on every page while offline saves are queued and gone the moment they sync.

### Fixed
- **Web-entered intraop vitals could silently disappear from the stored chart** once a case had any logged events: the projection rebuild reads only event rows, and the web vitals grid never produced events. Vitals typed on web (including auto-filled/backfilled columns) are now persisted as `vital` events — one per 5-minute column, the same contract mobile uses — and the server bridges grid vitals from older cached clients into events so nothing is lost either way.

### Changed
- **All save/conflict/queue logic moved to the shared engine** (`@lospor/core/sync`), the same implementation the mobile app uses. The 409 conflict dance, per-case write ordering, and outbox semantics are now defined and tested once.
- **Autosaves are never dropped.** A save arriving while another is in flight is queued and coalesced (latest values win) instead of being silently skipped.
- **Preop/intraop-fields/postop saves are field-level.** Only changed fields are PATCHed; unchanged autosaves skip the network; the intraop timetable blob stops being re-sent when only unrelated fields changed; two clients editing different fields merge cleanly.
- **Intraop event writes hardened**: idempotency key per event, `X-Lospor-Source: web`, per-case ordering, and one-shot 409 self-heal on full-log saves — full parity with the mobile contract.
- **The stale-write guard now protects you from yourself.** The same user in two tabs/devices can no longer silently overwrite their own newer edits — the second tab self-heals or opens the conflict dialog. (Behavior change; the force-update escape hatch is unchanged.)
- **Discrete taps save near-instantly.** Pills, toggles, and checkboxes in preop autosave ~150 ms after the tap; typing keeps the longer pause so half-typed values are never saved.
- **Smarter retry rhythm.** The offline flusher backs off while saves keep failing (5 s → 15 s → 60 s) and retries immediately with a fresh streak on reconnect or tab focus.

## [4.1.6] - 2026-07-11

### Changed
- Version alignment to 4.1.6 across all four LOSPOR repos for the mobile intraop autosave-race fix. The web app and API are unchanged this release.

## [4.1.5] - 2026-07-05

### Changed
- Version alignment to 4.1.5 across all four LOSPOR repos for the mobile/PWA hotfix release.

## [4.1.4] - 2026-07-05

Intraop bug fixes (regressions surfaced after the shared-core refactor). The web changes here are the airway re-edit fix; the infusion-rate and vitals-autosave fixes were mobile-only (web was already correct).

### Fixed
- **Airway devices with sub-panels (LMA / oral & nasal ETT / DLT / endobronchial) can be re-edited again.** After a device was confirmed, its sub-panel auto-collapsed — but reopening it to edit set a "was complete on open" flag that was never reset, so after re-editing, the panel could never auto-collapse again and the device was effectively impossible to edit. Reopening an already-added device now clears its sub-fields so it opens deselected and re-picks from scratch, identical to first-time entry.
- Version alignment to 4.1.4 across all four repos.

### Changed
- **Fluid totals (crystalloid / colloid / blood mL) are now derived server-side from the fluid events, in `rebuildProjection`, as the single source of truth.** Both apps previously computed and wrote these separately from the fluid events themselves — on mobile that was a second network request per fluid action that always lost a conflict race and retried (three round-trips per fluid change; the "multiple autosave rolls" a user noticed). The case-PATCH mapper no longer accepts these fields from clients; the read path is unchanged, so the protocol PDF, OMOP export, case summary, and case detail all still see the same values (computed with the same `@lospor/core` function, so numbers are identical — just authoritative and written once).

## [4.1.3] - 2026-07-05

Version alignment across all four LOSPOR repos (core, app, mobile, docs) — no functional changes beyond v4.1.2. Also re-syncs `package-lock.json` (npm 10, matching CI) after v4.1.2's post-tag CI fixes.

## [4.1.2] - 2026-07-05

Critical production fix: an exhausted Postgres connection pool was degrading or failing nearly every API call, plus a real structural bug in the event-log route that was fully independent of it.

### Fixed
- **Database connection pool exhaustion.** `@prisma/adapter-pg`'s default `pg.Pool` size (10 connections per instance) was too large for this architecture — the intraop live-refresh SSE route (`/api/cases/[id]/stream`) keeps a serverless container alive for its whole connection, and with enough concurrent long-lived streams, N containers × 10 connections each blew past Postgres's 200-connection ceiling, causing `EMAXCONN` errors across nearly every route (`GET /api/cases`, `PATCH /api/cases/[id]`, `PUT /api/cases/[id]/events`, `POST /api/cases/[id]/lock`, and more). Reduced to `max: 3` per instance.
- **Removing an event from the intraop log no longer 500s.** `PUT /api/cases/[id]/events` wrapped its reconcile-and-rebuild sequence in an interactive `prisma.$transaction(..., SERIALIZABLE)` — the same pattern already identified and fixed elsewhere in this codebase as unsafe on Supabase's Transaction-mode PgBouncer, which cannot sustain interactive transactions across multiple statements (P2028). Event *removal* takes the heaviest statement sequence of any action here (one round trip per changed/removed event), so it hit this failure disproportionately. Removed the transaction wrapper, matching the established pattern in `case/[id]/route.ts`.
- **CI (`npm ci`) fixed.** Package version bumps in v4.1.0/v4.1.1 were applied by hand-editing `package.json` without regenerating `package-lock.json`, leaving the lockfile's recorded version stale and — more importantly — missing a nested dependency entry (`next-intl`'s `@swc/helpers`) that a local npm 11 install had silently dropped relative to what npm 10 (used in CI) expects. Regenerated with npm 10 to match CI exactly; verified `npm ci` succeeds locally.

## [4.1.1] - 2026-07-05

Bug-fix follow-up to v4.1.0, found via a Vercel production-log investigation of a mobile intraop UI report.

### Fixed
- **Case-lock heartbeat no longer spuriously 409s.** The `PATCH /api/cases/[id]/lock` heartbeat only called `updateMany` and failed on a 0-row match; `POST` already had an `upsert` self-heal for the same case. A momentary timing mismatch (clock skew, a cold serverless start near the 30s lock TTL) could 409 the heartbeat even though the same device still owned the lock, disabling the entire case-creation form until the next successful heartbeat.
- **`ClinicalFieldStatus` research-mirror rows no longer throw on concurrent saves.** Two overlapping `PATCH /api/cases/[id]` requests could both delete-then-recreate this case's field-status rows, and the second `createMany` threw a unique-constraint error (silently caught, but dropping mirror rows and spamming error logs). Added `skipDuplicates` — this table is a rebuildable mirror, not source-of-truth data, so a dropped duplicate is safe.
- **Account deletion wording no longer overpromises (Bulgarian).** The Bulgarian settings text claimed cases are kept "30 days, then permanently deleted (GDPR Article 17)" — no such scheduled deletion job exists yet. Replaced with accurate wording matching the English text: access is disabled immediately, further deletion/anonymisation follows the retention policy.
- Residual encoding corruption (mojibake) cleaned up across the mobile app — bullets, arrows, middle dots, ellipses, and a garbled "SpO₂"/"EtCO₂" in a test file.

## [4.1.0] - 2026-07-05

Full Bulgarian localization pass and shared clinical-data consolidation.

### Added
- **Deep Bulgarian translation coverage**: dashboard, admin, and settings gaps closed; `PostopForm`, `AirwaySection`, `PreopForm`, `VascularAccessTree`, and the entire `IntraopTimetable` are now fully locale-aware.
- **The printed anaesthesia protocol (PDF) now follows the active app language** — Bulgarian users get a Bulgarian protocol document instead of English-only.
- **Bulgarian Privacy Policy and Terms of Service** pages, switching by locale.
- **Complications picker gains Bulgarian category titles** for the first time (previously English-only on web), and now shares its full 8-category list with the mobile app via `@lospor/core/complications` — mobile's slightly larger list (a few extra clinically relevant items per category) is now available on web too.
- Ventilation-mode lists (`AirwaySection`) and case-status label text (`CaseSummary`) now come from `@lospor/core` instead of hand-duplicated local copies, so web and mobile can no longer drift out of sync on this data. Web's case-status wording is also now consistent with mobile's (e.g. "Case finished" instead of "Finalised").

### Fixed
- **Email addresses are now normalized** (`trim` + lowercase) in registration, web login, mobile token login, password-reset request, and verification resend — both for database lookups/creates and rate-limit keys. Previously `Doctor@example.com` and `doctor@example.com` were treated as different accounts (case-sensitive unique column), which could cause duplicate registrations, login/reset confusion, and per-email rate-limit bypass by casing changes. Migration `20260704120000_normalize_user_emails` backfills existing rows (guarded: fails loudly if two accounts differ only by case instead of corrupting either).
- **CORS now honors the full `CORS_ALLOW_ORIGINS` allowlist.** The request's `Origin` is reflected back when it matches any allowlisted entry (with `Vary: Origin`); previously only the first configured origin was ever sent, silently breaking any second origin. All API routes now compute CORS headers per request.
- Added the missing Bulgarian translations for the intraop "Backfill on reopen" setting (`settings.autoFillBackground(+Desc)`); EN/BG message files are back at full key parity.
- Removed an unused legacy `_PageHeader` function from the protocol PDF component.

## [4.0.0] - 2026-07-03

Quality/stability milestone: account email flows, research-grade test coverage, CI, and a shared clinical-logic package.

### Added
- **Email verification.** Registration now sends a verification email (link valid 24 h, tokens stored hashed, single-use). Login requires a verified email; **admin approval no longer gates login**. New pages: `/verify-email`, `/forgot-password`, `/reset-password`; new API routes for verification (+resend) and password reset (request/confirm, enumeration-safe). Transactional email via **Brevo (EU)**; migration `20260703000000_account_email_tokens` backfills existing users as verified so nobody is locked out.
- **Password reset** end-to-end (reset link valid 1 h).
- **Playwright E2E** suites (smoke, account lifecycle in desktop + PWA viewports, authed dashboard/case-flow) with a prod-guarded seed user, plus **GitHub Actions CI** (typecheck, lint, unit tests, prisma validate, option-library fallback freshness).
- **OMOP / relational export test coverage**: direct tests for `syncCaseRelational` (ICD-10/LOINC/procedure/medication mapping, delete-before-create ordering, audit logging) and `mapCasesToOmop` (deidentification metadata, table exports, quality-gate FAIL states).
- **Shared `@lospor/core` package** (dosing, scores, unit conversion, ranges, timetable math, option-library mappers) consumed by both web and mobile from its own repository.

### Fixed
- **Finalize is now strict about research consistency**: relational sync runs before the immutable snapshot and a sync failure blocks finalization (500) instead of silently completing the case.
- **Case create race** on the same `X-Idempotency-Key`/`clientDraftId` returns the already-created case instead of a 500.
- **ICD-10 search**: terms like `append` or `benign` are no longer mistaken for ICD codes (code detection now requires letter+digit), and short/code-like queries use fast prefix lookups.
- **Tokenless API requests** return 401 instead of falling through to cookie auth and erroring with 500.
- **AI lab scan** requests time out (default 45 s) with a clear message instead of leaving the client waiting indefinitely.
- Intraop in-transaction conflict responses now include `serverVersion.updatedAt`, enabling the mobile one-shot 409 retry on undo/delete.
- Preop `ageYears` accepts 0–149, matching the mobile picker.

### Changed
- Privacy Policy and Terms updated to **v4.0**: Brevo listed as sub-processor, account-email processing disclosed, "administrator approval" wording replaced by email verification. `termsVersion` recorded at registration/acceptance is now `4.0`.
- Large components split by responsibility: `CaseSummary` print timetable → `case-summary/PrintTimetable`, `IntraopTimetable` vitals chart → `intraop/TimetableVitalsChart`, preop zod schema → `forms/preopSchema`, fluid lane shaping → `lib/timetable-fluid-rows`.

## [3.5.0] - 2026-06-29

Pre-Play-Store release: intraop bug fixes + a PWA-wide dialog fix.

### Fixed
- **PWA dialogs now work everywhere.** `react-native-web`'s `Alert.alert` is a no-op, so confirmations, error messages, and action menus silently did nothing on `pwa.lospor.org`. Added cross-platform `notify`/`confirmAction`/`actionSheet` helpers (web-native `window.alert`/`window.confirm` + an in-app action-sheet host; OS `Alert` on native) and routed all ~64 mobile dialog sites through them. This restores, among others, the intraop **event-log delete** (the X button was unresponsive on the PWA).
- **Intraop "add / change / stop" menus collapse immediately.** Drug/fluid/infusion/agent sheets previously stayed open until the network autosave resolved, which allowed accidental duplicate entries. They now close optimistically and persist in the background.
- **Drug & infusion pickers reopen on the home menu.** After adding e.g. an Induction drug, the next "Add drug" wrongly reopened on that subcategory; the picker now resets to the home menu (Favourites / scenarios / Browse) each time it opens.
- **Drug picker "Back" returns to where you came from.** Choosing a drug from a scenario/favourites/browse and pressing Back dropped you into the drug's library category ("Local/regional anesthetics") instead of the menu you started in; Back now returns to that menu.
- **Local-anaesthetic dosing autofill.** Per-route dose rules (`routeModes`) are now consumed for **infusions** in both apps and for **boluses** in the web timetable (mobile already read them) — so e.g. Lidocaine bolus IV autofills 1 mg/kg (IBW, round 10) and regional routes show concentration pills. Previously these fell back to defaults (Lidocaine infusion showed `mcg/kg/min`, LA bolus autofill was dead).

### Changed
- **Fluid/infusion library autofill.** Infusion selection now prefills the library's `suggestedRate` (e.g. Propofol 6 mg/kg/hr) instead of the first quick value, and fluids apply the library `defaultConcentration` (e.g. HES 10%). Applied on mobile/PWA and the web timetable.
- **Local-anaesthetic infusions.** Lidocaine infusion is now route-specific (IV `mg/kg/hr` autofill 1; PD/IT/Perineural `mL/hr` autofill 6 with 0.25–4% concentration pills, default 1%), and Bupivacaine/Levobupivacaine/Ropivacaine infusions were added (PD/IT/Perineural, 0.1–0.5% pills default 0.2%, 6 mL/hr). New **Perineural** infusion route.

## [3.4.12] - 2026-06-29

### Fixed
- **"Continue to Intraoperative" failed silently on the PWA** — the real root cause across previous attempts. `react-native-web`'s `Alert.alert` is a no-op (`class Alert { static alert() {} }`), so every preop validation/error message was invisible on `pwa.lospor.org`. When a required field was missing, clicking Continue ran the check, called the dead `Alert.alert`, and returned — no popup, no inline error, no navigation. Added a cross-platform `notify()` helper (`window.alert` on web, `Alert.alert` on native) and routed all preop messages through it.
- **Required preop fields now enforced with visible inline errors + jump-to-section.** Diagnosis, Procedure, and Mallampati (unless airway-unobtainable) are validated in the zod schema with `*` markers, inline red errors, and an `onInvalid` handler that scrolls to the first offending section and lists what's missing.

### Changed
- **Mobile/PWA preop required-field parity with web.** Respiratory rate, heart rate, and blood pressure are now required (unless marked unobtainable), matching `forms/PreopForm.tsx`. Respiratory rate was previously not enforced on mobile.

## [3.4.11] - 2026-06-29

### Fixed
- **Conflict detection no longer fires for same-account cross-device edits**: When the same user edits a case on both the web app and the PWA (e.g., autosave on PWA updates the server timestamp, then user clicks Continue on web), the server was returning 409 and the web app showed "this case was edited by another person." The conflict check now skips for same-account writes (last-write-wins). Conflict detection is preserved for cases where a genuinely different user has made changes.
- **Mobile/PWA Continue button now correctly retries after 409**: The v3.4.9 409-retry logic read `serverVersion.preopUpdatedAt` from the conflict response, but the server actually returns `serverVersion.updatedAt` (the Prisma field name). Because of this field name mismatch, the retry baseline was always `undefined`, the retry never fired, and the user saw an "Error: conflict" alert instead of being navigated to the intraop screen. Field name corrected in both the `onSubmit` handler and the autosave catch block.

## [3.4.10] - 2026-06-29

### Fixed
- **"Continue to Intraoperative" — session expiry during preop now handled gracefully**: When the bearer token expires or is cleared while the user is filling the preop form, the Continue button's final PATCH returns 401. Previously this showed a confusing "Save failed" alert and left the user stuck without their draft being preserved. Now the app shows "Session expired — your work has been saved locally", persists the draft, and lets the auth guard navigate to login. The same guard is applied to the 409-retry PATCH path added in v3.4.9. On re-login, the user can return to the case and the draft will be pre-populated.

## [3.4.9] - 2026-06-28

### Fixed
- **"Continue to Intraoperative" blocked by stale 409 baseline on mobile/PWA**: When a preop autosave returned 409 (server has a newer preop timestamp), the mobile app saved locally and cleared the error — but kept the stale `basePreopUpdatedAtRef` baseline. Clicking Continue then sent a final PATCH with the same stale timestamp, got another 409 from the server, and showed an "Error: conflict" alert instead of navigating to the intraop screen. Fix: the autosave catch block now adopts `serverVersion.preopUpdatedAt` from the 409 response, and `onSubmit`'s final PATCH now handles 409 with a one-shot retry using the server's timestamp before giving up.

## [3.4.8] - 2026-06-28

### Fixed
- `PATCH /api/cases/:id` no longer returns 500 when a concurrent case deletion races with an in-flight auto-save. The handler now calls `prisma.case.update` (intraop section) before `reconcileFullLog`; if the case is deleted between those two calls, `caseEvent.create` fails with Prisma P2003 (FK constraint). The error is now caught specifically for P2003/P2025, logged as a warning, and the PATCH proceeds — the auto-save was already written and will be cascade-deleted with the case. Previously this surfaced as a "Save failed" (Internal server error 500) toast for users who deleted a case while its auto-save was in flight.

## [3.4.7] - 2026-06-28

### Fixed
- **Drug dose autofill and roundTo rounding** were silently missing from the main intraop drug-entry sheet (`DrugSheet` + `useDrugEntry`). The v3.4.5 fix had targeted only the old inline timetable-column picker. `DrugSheet` now pre-fills doses using IBW (Devine formula, capped at TBW) for `perKg` drugs and flat values for fixed-dose entries; `useDrugEntry` now rounds the saved dose to the library `roundTo` increment.
- **Runtime 409 "Sync failed" badge**: `POST /api/cases/:id/events` bumps `intraop.updatedAt` via `rebuildProjection`, causing a concurrent fluid-totals `PATCH` (carrying the old baseline) to be rejected with 409. The mobile `patchIntraopSection` now catches 409, reads `serverVersion.updatedAt` from the response body, updates its baseline, and retries the patch once silently. `ApiError` was extended with a `serverVersion` field; `patchCase` propagates the parsed server body through it.
- **Intraop timetable viewport**: reopening a case with past-timestamped events (e.g. backdated intraop entries) auto-scrolled to the current time, leaving all events off-screen. The scroll target now biases toward the last event column when events are more than 30 minutes before the current time marker.

## [3.3.1] - 2026-06-28

### Fixed
- `GET /sw.js` was returning 404 in production because `@ducanh2912/next-pwa` silently fails to generate a service worker under Next.js 16. Browsers that had the old service worker installed continued to serve a stale cached 307 redirect (`/admin → /login?callbackUrl=/manifest.webmanifest`) which caused login to land on `/manifest.webmanifest` → 404, not on `/admin`. Fix: a minimal `public/sw.js` is now committed that immediately clears all caches from the broken old SW and passes every fetch through to the network unchanged, restoring correct post-login navigation.

## [3.3.0] - 2026-06-27

### Security / Integrity
- `POST /api/cases` can no longer create a case with `COMPLETE` status directly. Cases with postop data now enter `AWAITING_REVIEW`; `COMPLETE` is reserved exclusively for `POST /api/cases/:id/finalize` which runs full validation and generates an immutable snapshot.
- Finalization undo window standardized to 30 minutes everywhere. `constants.ts` `FINALIZE_UNDO_WINDOW_MS` corrected from 5 min to 30 min; `unfinalize/route.ts` now imports the constant instead of a hardcoded local value; web new-case undo banner now counts down 30 minutes, matching what the backend actually allows.
- CORS centralized in `unfinalize/route.ts` and `lock/route.ts` — both now use `corsHeaders()` from `src/lib/cors` instead of inline CORS objects.

### Fixed
- Case summary page (`/cases/[id]`) now redirects unauthenticated users to `/login?callbackUrl=/cases/:id` instead of silently returning an empty render. The previous `return null` left the Next.js layout hydrating with no session, causing 20+ parallel API calls returning 401 and a blank or broken page.
- Opening a case summary URL while not logged in (e.g., shared link from PWA) now correctly returns to the case after login.
- URLs with the legacy `/cases/new-continue=${id}` pattern (created by a previous router.replace bug) now redirect to `/cases/${id}` instead of 404-ing.
- New case page (`/cases/new`) URL now uses `?continue=${id}` query params instead of the `/cases/new-continue=${id}` path pattern. Shared/bookmarked URLs during case creation now reload the correct case instead of 404-ing.
- Allergy details field now parses JSON-encoded drug catalogue entries (e.g. `[{"label":"Analgin",...}]`) and displays the drug names as a comma-separated list, matching the behaviour already in place for current medications.

### UX
- Case summary page (`/cases/[id]`) now shows a review bar above the protocol for all case states. Non-COMPLETE cases show a status chip, edit links (Preop / Intraop / Postop), and a Close Now button that calls the finalize endpoint. COMPLETE cases within the undo window show an Unfinalize button. Print PDF is always accessible from the bar.
- Nav buttons (Dashboard, New Case, Admin, Sign Out) now show press/tap feedback on touch screens via `active:` Tailwind classes, matching the existing hover effects on desktop.
- AI provider wording in changelog corrected to clarify that EU-region inference is preferred but Mistral's global endpoint may be used as a fallback.

### Fixed (late additions)
- `/manifest.webmanifest` and `/sw.js` are now exempted from NextAuth auth middleware. Previously, when a session expired the browser's auto-request for the manifest was intercepted, redirected to `/login?callbackUrl=/manifest.webmanifest`, and the PWA shell navigated the entire tab away — causing the admin panel (and any other deep page) to show a 404. Both the middleware matcher regex and the `authorized` callback's `isPublicPage` guard were updated.

## [3.2.1] - 2026-06-27

### Fixed
- Relational-sync background mirror (diagnoses, procedures, comorbidities, labs, medications, vascular accesses, complications, selections, field-status) returned Prisma P2028 on every case save because `syncCaseRelational` wrapped all writes in `db.$transaction([...])`, which is incompatible with Supabase's Transaction-mode PgBouncer (port 6543). All four transaction blocks are now sequential `await` calls; the JSON columns remain the source of truth so atomicity is not required.
- Preop autosave returned a spurious 409 conflict when the conflict-base timestamp was not yet initialised (race condition where the case ID was available from the URL before the case data fetch completed). The client now silently recovers on `reason: "missing_conflict_timestamp"` by adopting the server's current timestamp and retrying once without user intervention.

## [3.2.0] - 2026-06-27

### Added
- **Dedicated finalize endpoint** — `POST /api/cases/:id/finalize` validates that preop, intraop (with startTime and at least one technique), and postop (with ≥1 Aldrete subscore and a disposition) are present before setting the case to COMPLETE. The immutable snapshot is written first; status is only committed after the snapshot succeeds.
- **Case creation idempotency** — `POST /api/cases` now accepts an `X-Idempotency-Key` header. If a case already exists for this user with that draft key, the existing case is returned rather than creating a duplicate. Useful when the mobile app creates a case while offline and the network drops before the response arrives.
- **`clientDraftId` on Case** — new nullable column + `@@unique([userId, clientDraftId])` constraint. Migration: `20260627000000_case_client_draft_id`.

### Changed
- **CORS production guard** — `next.config.ts` now throws at startup on Vercel production if `CORS_ALLOW_ORIGIN`/`CORS_ALLOW_ORIGINS` is unset, matching the behaviour of `lib/cors.ts`. Previously it silently fell back to `*`.
- **Case PATCH no longer accepts `status: "COMPLETE"`** — use `POST /api/cases/:id/finalize` instead. PATCH returns 400 with guidance if "COMPLETE" is sent.
- **Zod coercion** — `parseInt` replaced with `Number()` in all schema coerce helpers so `"12abc"` is rejected rather than silently parsed as `12`. Range validation added: `ageYears (0–130)`, `heightCm (30–280)`, `weightKg (0.1–700)`, `bpSystolic (40–300)`, `bpDiastolic (20–200)`, `heartRate (10–350)`, `spO2 (0–100)`, `temperature (25–45 °C)`, `respiratoryRate (0–100)`, `painScoreNRS (0–10)`, `aldreteTotal (0–10)`, and matching recovery vitals.

### Fixed
- Drug allergy and current medications autosave was rejected by the server PII filter because multi-word drug names (e.g. "Morphine Sulfate", "Sodium Chloride") matched the two-capitalised-words name heuristic. Those structured drug-catalogue fields now skip the name check; EGN, long digit sequences, dates, and email detection still apply to them.
- Intraoperative event autosave returned 500 (Prisma P2028 transaction timeout) because Supabase's Transaction-mode PgBouncer (port 6543) cannot sustain interactive multi-statement transactions. The case PATCH handler now runs all writes sequentially without an interactive transaction; the existing pre-read conflict detection is unchanged.

## [3.1.0-hotfix] - 2026-06-27

### Fixed
- PWA and mobile login was blocked with 403 because the new CSRF origin check applied to `/api/auth/token`, which is called cross-origin by the PWA. Auth token-issuance endpoints (`/api/auth/token`, `/api/auth/register`, `/api/auth/logout`) are now exempt from the origin check — they are protected by rate limiting and bcrypt instead.

## [3.1.0] - 2026-06-25

### Security and privacy hardening
- Cookie-authenticated state-changing API requests now require a same-origin `Origin` or `Referer`; bearer-token mobile/PWA requests remain supported.
- Clinical PII validation is now field-aware for intraoperative events: controlled labels such as `Face Mask`, `To PACU`, and `General Anaesthesia` are allowed, while free-text event notes remain checked.
- AI lab-reading uploads now enforce the actual parsed base64 payload size instead of relying only on `Content-Length`.
- Login no longer probes pending-registration state after failed credentials, and the legacy pending-check endpoint now returns a generic response, reducing account-state enumeration.
- Account deletion/privacy copy now matches the implemented soft-delete behavior: access is disabled immediately and tokens are revoked; further deletion/anonymisation follows retention policy.
- CORS deployment examples are aligned to `pwa.lospor.org`, with `CORS_ALLOW_ORIGINS` documented as a future multi-origin comma-list.
- Mistral API calls now retry against the global Mistral API base if a configured regional endpoint returns `regional_inference_not_allowed` (`code: 1914`), covering lab scan, vitals scan, and the pre-operative AI advisor.
- AI privacy copy now describes the configured AI provider without overclaiming a fixed inference region.
- Added synced `User.preferences` storage for mobile/PWA intraoperative favourite bolus drugs and infusions.

## [3.0.0] - 2026-06-25

### Summary
- Promotes the accumulated June 2026 work from the planned 2.x line to **v3.0.0** because the release changes the database shape, canonical clinical libraries, mobile/web parity contract, intraoperative event model, research export surface, and verification baseline.
- `package.json` / lock metadata now use `3.0.0`. Mobile release metadata is aligned separately in `lospor-mobile`.

### Added - Canonical option and clinical libraries
- Added the shared `OptionLibrary` table and `GET /api/library/[category]` endpoint as the single catalogue for web, mobile, and PWA pickers.
- Library categories now cover positions, techniques, airway management, ventilation, monitoring, premedication drugs, bolus drugs, infusions, inhalational agents, fluids, clinical events, sex, blood group, airway grades, disposition, handover items, and numeric range specs.
- Web and mobile now share canonical codes for clinical techniques, monitoring groups, drug/infusion/fluid/agent choices, and fresh-gas settings.
- Added bundled option-library fallback snapshots, a protected internal snapshot endpoint, snapshot freshness checks, and visible cached/offline-library banners.

### Added - Canonical labs, units, and AI scanning
- Web and mobile now use the same canonical lab catalogue, units, LOINC mappings, and reference ranges.
- AI lab extraction scans for the full canonical lab catalogue and imports only recognised results; unknown/free-form lab names are discarded.
- Lab rows store parsed numeric value, canonical unit, LOINC code, reference low/high, abnormal flag, source, and mapping metadata.
- Serum/peripheral glucose is stored as a timed intraoperative measurement with LOINC `2345-7` and canonical `mmol/L`.

### Added - Research-grade database rows
- Added normalized/queryable rows for diagnoses, procedures, comorbidities, lab results, medications, vascular access, premedication, complications, selections, and event timeline data.
- Added local bilingual `ConceptMap` for ICD-10 English/Bulgarian labels, LOINC, ATC, INN, and LOSPOR option values.
- Known OMOP concept IDs are stored where confidently mapped; source-only and unmapped values remain explicit rather than faking concept IDs.
- Added `ClinicalFieldStatus` for key-field missingness and provenance metadata on normalized rows.
- Added `scripts/seed-concept-maps.ts`, `scripts/data-quality-report.ts`, expanded `scripts/backfill-relational.ts`, and guarded `scripts/wipe-dev-clinical-data.ts`.

### Changed - Intraoperative timetable and event sourcing
- Web intraop timetable now writes bolus drugs, infusion start/rate-change/stop, agent start/stop, fluid start/stop, gas changes, clinical events, and vitals through the same append-only `CaseEvent` API used by mobile.
- The legacy `keyEvents` JSON is rebuilt as a projection/cache from active event rows.
- Infusion, agent, fluid, and fresh-gas-flow bars extend correctly when a case is reopened while still running.
- Fresh gas flow is represented as a timeline lane/bar with FGF, FiO2, carrier gas, calculated FiAir/FiN2O, and FiO2 clamped to the valid clinical range.
- Legacy scalar gas entry rows were removed from the active UI and the legacy scalar gas DB columns are no longer written.

### Changed - Mobile/web parity and sync
- Mobile maps payloads to canonical web/API field names before persistence.
- Case updates use timestamp/header conflict detection so stale mobile edits do not silently overwrite newer web edits.
- Mobile autosave queues offline patches, flushes queued saves, and exposes conflict/queued/saved states.
- Live case refresh uses polling/SSE fallback so mobile can see web-side changes and web can see mobile-side changes.
- Mobile now exposes web-parity actions/surfaces for case details, printable protocol, share summary, audit logs, admin console, handover, postop, AI advisor, and intraop timetable.

### Changed - Preop, postop, and form quality
- Mobile preop was redesigned into section-based, scrollable, thumb-friendly entry with inline autocomplete and context-specific number controls.
- Diagnosis and comorbidity fields use the local Bulgarian/English ICD-10 database.
- Medication allergy is stored using `Medication.kind = ALLERGY`; deselecting the allergy boolean clears associated allergy text/rows.
- Difficult-airway notes, team notes, physical exam report, and event complication notes are limited to 500 characters and cleared when their controlling boolean is false.
- General inhalational anaesthesia auto-selects expected monitoring defaults: SpO2, NBP, ECG, temperature, and EtCO2.

### Changed - OMOP/export and research reproducibility
- Added local Athena/OMOP vocabulary import tables and `scripts/seed-athena-vocabularies.ts` for full vocabulary-backed concept resolution.
- `ConceptMap` now stores mapping method, confidence, review state, mapping notes, and Athena vocabulary version.
- OMOP export now reads from normalized rows and active `CaseEvent` rows instead of parsing legacy blobs.
- Export includes labs, vitals, intraop glucose, gas settings, bolus drugs, infusions, inhalational agents, vascular access, selections, complications, postop recovery vitals, Aldrete subscores, and provenance/version metadata.
- Export bundles now include table counts, mapping summary, de-identification metadata, and quality warnings; app exports warn rather than block.
- Export `source_version` and snapshot schema version are now `3.0.0`.
- Free-text fields are redacted before AI advisor/export use; coded ICD/LOINC/ATC/option values are preserved.

### Security, tooling, and migration notes
- Centralized role authorization with `requireRole`; case-scoped vitals scan now enforces case access before sending images to AI.
- Production CORS is fail-closed without explicit allowed origins; login, registration, token revocation, audit logging, HOD scoping, transfer checks, and admin routes were hardened.
- Mobile now has baseline ESLint, typecheck, and Vitest coverage; web and mobile deployment checks cover typecheck, lint, tests, Expo doctor, and build prerequisites.
- Do not edit old applied Prisma migrations. Fresh/live deploys must run migrations, seed vocabularies, seed labs, seed option library, seed concept maps, generate/fetch option-library fallback snapshots, and run relational/data-quality backfills.

---
All notable changes to the web application are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.3.0] — 2026-06-20

### Added — Shared Option Library
- New `OptionLibrary` table: one shared, modular catalog for every intraop/preop pill-button option (position, technique, vascular access, airway management, monitoring, premedication drugs, intraop drugs, intraop infusions, inhalational agents, intraop fluids, clinical events) — replaces hardcoded lists that had drifted between web, mobile, and even within mobile itself.
- New master endpoint `GET /api/library/[category]`, consumed by both apps via a `useOptionLibrary(category)` hook.
- Seed content lives in one small file per category under `lospor-app/src/data/option-library/`; `scripts/seed-option-library.ts` is a thin orchestrator — adding or editing an option no longer touches application code. Also exposed as a protected production maintenance action, `POST /api/admin/maintenance/seed-option-library` (ADMIN + `ALLOW_MAINTENANCE_SEED=true` required, audit-logged, idempotent).
- Fixed a real mobile/web data mismatch surfaced by the migration: mobile stored different technique codes than web for the same clinical techniques (e.g. `GENERAL_COMBINED` vs `GENERAL_BALANCED`). Both apps now share one code per technique.
- Monitoring gained a genuine `respiratory` group (capnography, temperature) shared by both apps, replacing a display-label workaround that only relabelled "Standard" as "Respiratory" in the UI.

### Added — Offline-safe option library
- Web and mobile now fall back to a snapshot of the option library bundled into the app itself if a device has never successfully synced and has no prior cache either (first load/install + no connectivity) — previously this showed silently empty pickers with no fallback at all.
- A visible banner appears whenever any picker is running on cached or bundled (non-live) data, so a clinician never silently trusts a list without knowing it might be stale; a background retry every 30s swaps in live data the moment connectivity returns, no reload needed.
- A successful-but-empty `200 []` from `/api/library/[category]` is now treated the same as a fetch failure (never trusted as "live") — an unseeded live DB can no longer silently blank out a picker with no banner.
- `npm run build` now regenerates the bundled snapshot fresh from the database before every Vercel deploy (`scripts/generate-option-library-fallback.ts`), and **fails the build** if the DB is unreachable or any category comes back empty. Mobile/EAS fetches the snapshot from a shared-secret-protected web endpoint (`GET /api/internal/option-library-snapshot`) via an `eas-build-pre-install` hook, since EAS can't reach the database directly. A separate content-hash staleness check (`npm run check:option-library-fallback-fresh`) is available for PR/CI use. See `docs/post-migration-seeds.md` for the env vars that need configuring on Vercel/EAS for this to be active.

### Changed — Web Intraop Timetable
- New dedicated **Infusions** row, separate from the Drugs row — starting an infusion no longer requires picking a drug and then choosing "Bolus" vs "Infusion"; Drugs is bolus-only, Infusions has its own entry point, matching the mobile app's separated Drug/Infusion/Fluid/Agent layout.
- Web's intraop timetable now writes real `CaseEvent` rows (bolus, infusion start/rate-change/stop, agent start/stop, fluid start/stop, clinical events) via the same `/api/cases/[id]/events` endpoint mobile already used, instead of only the legacy `keyEvents` JSON blob. Deleting an infusion or fluid now reconciles the full event log server-side.
- IntraopForm.tsx and IntraopTimetable.tsx shrank substantially as a result of the option-library extraction (hundreds of lines of hardcoded option data removed from each).

### Changed — Code quality
- `TechniqueTree.tsx`, `VascularAccessTree.tsx`, and `IntraopTimetable.tsx` no longer populate the option-library data by mutating module-level arrays inside `useMemo`. Every category is now a plain `useMemo`-derived value scoped to the component itself — removes a real (if previously low-impact) risk of two instances of the same component clobbering each other's data, and removes the only place in this codebase doing side effects inside `useMemo`. `calcInfusionTotal`'s weight-basis lookup, the one piece genuinely shared across components/files, now takes it as an explicit parameter instead of reading shared state.

### Security
- Centralized role-authorization (`requireRole`) — replaces 14+ separate `role !== "ADMIN"` checks and two bespoke case-ownership reimplementations with one audited helper.
- OMOP export and the AI advisor's data path now redact free-text fields that could carry identifying information, instead of relying solely on write-time blocking.
- `admin/validate-relational` renamed to `admin/repair-relational` to reflect what it actually does (rewrites the relational mirror, not a read-only check); relational-sync failures are now written to the audit log instead of only a server console line.

### Fixed
- Stale ICD-11 references in live UI text (guided tour, i18n strings, AI translation prompt) corrected to ICD-10; removed the unused, dead `groq-translate.ts`. "Anonymised" language in live UI text and legal copy (GDPR protocol notice, Terms of Use, OMOP export metadata) corrected to "de-identified/pseudonymised," matching the project's own established wording.
- Corrupted comment-divider text (mis-encoded box-drawing characters) cleaned up across the codebase.
- A case closed mid-infusion (or mid-fluid, mid-agent) and reopened later now shows the running bar correctly extended to the current time on load, instead of frozen wherever it was at the last save. The client-side timetable extends non-stopped segments using the user's local wall clock; server-side read-time extension was intentionally removed because stored HH:MM values are not UTC instants. Rate-change boundaries are untouched, so per-segment infusion totals stay correct across the extension.
- `package-lock.json` in both `lospor-app` and `lospor-mobile` was still pinned at `2.1.1` despite `package.json` reading `2.3.0`.

### Migration notes
- `LibraryCategory` was expanded after the original option-library migration. Existing environments must receive the additive `ALTER TYPE ... ADD VALUE` migration before `scripts/seed-option-library.ts` runs, otherwise categories such as `SEX`, `AGE_RANGE`, and `HANDOVER_ITEM` cannot be inserted.
- Confirm the live Supabase `_prisma_migrations` state before deployment if the enum was previously repaired manually or drifted outside Prisma; an edited historical migration file will not repair an already-applied environment.

### Backfill note
- A case whose intraop data predates this release's web event-wiring still gets a one-time backfill of `CaseEvent` rows the first time it is touched through the events API. Current code reconstructs timestamps from the intraop record day plus the stored start-time/5-minute column offset where possible, and writes `source: "backfill"` because those rows were not submitted by either app. Legacy intraop `startTime` values may still use the schema's `2000-01-01` time-only convention; that dummy date is not the event backfill source label.

## [2.1.1] — 2026-06-19

### Changed — Release Hardening
- Centralized role-access logic so `HEAD_OF_DEPT` users without an institution fall back to their own cases instead of matching null-institution records.
- Expanded the server-side PII gate across the major clinical free-text fields, including airway notes, blood product notes, medication/allergy text, premedication text, physical exam report, intraoperative complications, and postoperative disposition notes.
- Production CORS now fails closed on Vercel when `CORS_ALLOW_ORIGIN` is not configured.
- Bulgarian ICD-10 diagnosis/comorbidity search now stores code-first tags with English/Bulgarian label snapshots and uses `labelBg` for Bulgarian UI display.
- Documentation language now consistently describes LOSPOR data as de-identified/pseudonymised with no direct patient identifiers, not absolutely anonymised.
- OMOP wording clarified as a partial/OMOP-inspired research export until full concept mapping is complete.

## [2.0.0] — 2026-06-19

### Added — Database Optimization (research-grade)

**ICD-10 migration (replaces ICD-11)**
- Removed live WHO ICD-11 API dependency (`who-icd.ts`, `/api/search/icd11`), all ICD-11 cache tables (`Icd10BgCode`, `Icd11Code`, `Icd11Alias`), and Mistral diagnosis-translation.
- New `Icd10Code` table (WHO ICD-10 + official BG MZ labels) and `Icd10Synonym` table (ICD-10CM search synonyms from Athena).
- `/api/search/icd10` now performs local DB full-text search — fast, offline, no external dependency.
- Diagnosis and comorbidity search in web PreopForm and mobile updated to ICD-10.
- Body-system classification updated to ICD-10 only (`icd-categories.ts`).
- Comorbidities gain `icd10Code` column (Gap 2) — comorbidities are now coded identically to diagnoses.

**LOINC-coded labs (Theme B)**
- `LabResult` gains `valueNum Float`, `unitCanon`, `loincCode`, `referenceLow`, `referenceHigh`, `abnormalFlag`, `takenAt`, `source`.
- New `LabLoinc` table: 67 entries mapping canonical lab names to LOINC codes and reference ranges.
- `relational-sync.ts` populates LOINC fields and computes `abnormalFlag` automatically on each case save.
- MCHC canonical unit corrected from g/dL to g/L (SI); Mistral prompt and server normaliser updated.

**ATC drug coding (Theme C)**
- New `Atc` table: full ATC classification tree seeded from Athena (~6,300 codes, 5 levels).
- New `Drug` table: Bulgarian drug registry seeded from `drugs.json`.
- `CaseEvent` (drug events) gains `atcCode`, `drugId`, `drugRoute` columns.
- New `Medication` table: preop medications as coded rows alongside legacy `currentMedications` JSON.

**Per-field audit log (Theme D)**
- New `CaseFieldChange` table: records field-level diffs on every preop/postop save (section, field, oldValue, newValue, userId, timestamp).
- Written best-effort after each PATCH — never blocks a clinical save.

**Finalisation snapshot (Theme E)**
- New `CaseSnapshot` table: full-case snapshot written on COMPLETE transition (one row per case, updated on re-finalization).
- Includes schema version (`2.0.0`) so published datasets can cite the exact structure.

**Relational validator (Theme A2)**
- New `POST /api/admin/validate-relational` endpoint (ADMIN only): re-derives all relational rows from authoritative JSON, detects and repairs drift. Accepts `?caseId=` for single-case repair.

**Vocabulary seed scripts**
- `scripts/seed-vocabularies.ts`: streams Athena CSVs from local `athena/` folder to seed `Icd10Code`, `Icd10Synonym`, `Atc`, and `Drug` tables. Idempotent.
- `scripts/seed-lab-loinc.ts`: seeds `LabLoinc` table with all 67 LOINC codes.

### Migration
- `20260619100000_v2_database_optimization` — drops 3 ICD-11 tables, adds 8 new tables, extends `LabResult`/`Comorbidity`/`CaseEvent` with nullable research columns.

---

## [1.2.0] — 2026-06-18

### Added — relational clinical data (JSON normalisation)
- Clinical data previously stored only as JSON blobs is now also mirrored into
  queryable SQL tables: **pre-op diagnoses, procedures, comorbidities, lab results**
  (`PreopDiagnosis`, `PreopProcedure`, `Comorbidity`, `LabResult`), **intra-op
  vascular accesses** (`VascularAccess`), and the controlled-vocabulary multi-selects
  — positions, techniques, airway devices/tools, ventilation modes, handover items —
  in a generic `CaseSelection` table. Intra-op **vitals** gained typed columns on
  `CaseEvent` (`systolic/diastolic/heartRate/spO2/etco2/temp`).
- The JSON columns remain authoritative and are still the apps' read path, so there
  is **no user-visible change and no slowdown** — the rows are an indexed query
  surface for research and exports.
- Rows are written **best-effort** on each case save (a sync failure can never block
  a clinical save) and are reconciled (delete + re-insert) so they can't drift.
  Backfill script (`scripts/backfill-relational.ts`) populates existing data.

### Migration
- `20260618000000_relational_clinical_rows` — additive: 6 new tables + 6 nullable
  `CaseEvent` columns. No existing column changed or dropped.

---

## [1.1.1] — 2026-06-17

### Fixed
- **CORS preflight** now allows `PUT` and the newer mobile/event headers (`x-lospor-intraop-updated-at`, `x-lospor-force-update`, `x-lospor-source`, `x-idempotency-key`). Browser/PWA intraoperative edits, conflict-detected saves, and idempotent offline replay previously failed preflight even though the routes would have accepted them (native was unaffected).
- **Finalised cases are now protected on the event `PUT` path** (edit/delete reconciliation), matching `POST`/`PATCH` — a finalised intraoperative record can no longer be modified.
- **Case codes use the current calendar year** (yearly numbering per user) instead of the user's registration year.
- **HOD dashboard scoped to its own institution** — the dashboard queried the database directly and showed a Head of Department *every* case across all institutions; it now restricts to the HOD's own institution (a HOD with no institution sees only their own cases). Cross-institution data exposure fixed.
- **Constant-time login** — login no longer returns early for unknown emails and uses a valid bcrypt dummy hash on both web and mobile paths, so response time can't reveal whether an email exists.
- **Desktop "Ongoing cases" button** now reads the paginated `/api/cases` response (`{ cases, … }`) instead of expecting a raw array.
- **Transfer route** now applies the explicit HOD null-institution guard used elsewhere (a HOD with no institution falls back to owner-only).
- **Unfinalize undo window** extended from 5 to 30 minutes to match the window shown in the apps.
- README quick start uses `prisma migrate deploy` instead of `prisma db push`.

### Removed
- Stale developer scripts (`prisma/scrape-institutions.ts`, `scripts/process-data.ts`).

---

## [1.1.0] — 2026-06-15

### Intraoperative event store (event-sourcing)
- New immutable `CaseEvent` table is the source of truth for the intraoperative chart. The legacy `keyEvents` projection is now a cache rebuilt from these rows, so every reader (web/mobile chart, printable protocol, OMOP export) is unchanged.
- Concurrent intraoperative writes are serializable and idempotent (keyed by event id) — two clinicians documenting the same live case can no longer drop each other's entries, and offline retries never create duplicates.
- Edits and deletes are append-only: an edit supersedes, a delete tombstones, and the full history is preserved for audit/medico-legal purposes.
- Infusion rate changes are now projected as rate segments, so the chart shows the correct rate before and after each change.
- Intraoperative stale-write conflict detection (matching pre-op/post-op); malformed conflict-timestamp headers are rejected instead of silently skipped.
- Every event write is Zod-validated, PII-checked, and audit-logged.

### Security & reliability
- Rate limiting moved to a shared, serverless-safe database store (the previous in-memory limiter reset per instance in production).
- Added per-IP login throttling alongside per-email.
- Token revocation is now checked against the database on every request (closes a cold-start window); new `POST /api/auth/logout` revokes a mobile token server-side.
- Fixed an authorization edge case for Heads of Department with no assigned institution; added consistent CORS preflight handling to all mobile-called routes.
- An admin or Head of Department can now clear a stale case lock instead of being blocked by it.

### Wording
- Softened "GDPR compliant" to "designed with GDPR principles" pending formal legal review.

### Database
- New migrations: `CaseEvent` table and versioning columns, shared `RateLimit` table, `IntraoperativeRecord.updatedAt`.

---

## [1.0.0] — 2026-06-11 "First public release"

This is the first stable, publicly tagged release of LOSPOR. It consolidates all development from v0.1.0 through the v0.4.x series into a production-ready perioperative case register with a full web app, mobile-companion API, and PWA.

### Authentication & user management
- User registration with admin approval flow — new accounts are pending until an administrator approves them
- Login with bcrypt password hashing (cost 12) and per-email rate limiting (10 attempts / 15 min)
- Registration rate limiting (5 attempts / hr / IP)
- NextAuth v5 JWT sessions with 8-hour expiry and DB-backed JTI blocklist for instant revocation on sign-out
- Bearer token endpoint (`POST /api/auth/token`) for mobile companion login — same security guarantees as web session
- User profile API (`GET /api/user`) returning name, title, role, and institution for mobile settings
- Admin panel: pending registration approvals, Head of Department role requests, role management, paginated/filterable audit log

### Security & GDPR compliance
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, Content Security Policy
- Server-side PII detector on all free-text fields: Bulgarian EGN (with checksum), 7+ digit sequences, date patterns, email addresses, two consecutive capitalised words (name heuristic). PII blocks are logged to the audit trail and returned as a 400 with a plain-language explanation
- GDPR design: no patient identifiers ever stored. Case codes are auto-generated (`YYYY-NNNN`). The printable protocol renders blank fields for patient name and ID — the clinician fills them in by hand after printing
- All AI inference uses **Mistral AI (La Plateforme)**. EU-region inference is preferred; requests may fall back to Mistral's global endpoint if the regional API is unavailable. US-hosted providers (Groq, OpenAI, etc.) are not used anywhere in the codebase
- Privacy Policy v1.1 — sub-processors section now explicitly covers Mistral AI image processing for lab scan and monitor scan
- Terms of Service v1.1 — new clause 3a documents user obligations when using AI image scanning features
- AGPL-3.0 `LICENSE` file with `Copyright (C) 2026 Kaloyan Dzhunov`

### PWA and mobile redirect
- Progressive Web App support: `src/app/manifest.ts`, offline fallback page, `PwaInit` component for service-worker registration
- `proxy.ts` overhauled: mobile browser user agents redirected to `MOBILE_PWA_URL`; applies on all non-API, non-auth routes; configurable via environment variable so the PWA can be served from a separate static deployment without changing application code

### Dashboard
- Defaults to all accessible cases (full history, reverse chronological)
- Clickable stat cards: Today, This month, Active, Drafts, Awaiting postop, Complete, Handovers, ICU
- Horizontal scope chip rail always visible on load
- Full-text dashboard search (`DashboardSearch` component): searches by case code and procedure name
- Pagination via `?skip` / `?take` on `GET /api/cases` (capped at 200 per request)

### Case lifecycle
- Status chain: `DRAFT → IN_CONSULTATION → AWAITING_ALLOCATION → IN_PROGRESS → AWAITING_POSTOP → AWAITING_REVIEW → COMPLETE`
- `AWAITING_REVIEW` status: automatically entered when postop is saved on an in-progress case; 30-minute review window before finalisation
- Case presence lock: one active editor per case at a time (`CaseLock` DB model, 30 s TTL, 15 s heartbeat). Other devices enter **Watching** mode with a takeover option
- Conflict detection: stale mobile writes rejected (409) if the server record was updated since the client last loaded it
- Live case refresh: SSE event stream (`GET /api/cases/[id]/stream`) with polling fallback
- Case deletion (non-finalised only), unfinalize API for the review window, print-token API for PDF generation

### Preoperative assessment form
- Demographics: age, sex, height, weight with live BMI, IBW (Devine formula), and ABW badges
- ICD-10/ICD-11 diagnosis and procedure tagging with autocomplete
- Medical history: ICD-coded comorbidity tags grouped by body system
- Current medications: drug name / INN search backed by Bulgarian Drug Agency register (3,661 entries)
- Clinical anamnesis: allergies (allergen search + latex flag), family anaesthesia problems, dental flags, smoking and substance abuse habits
- Airway assessment: Mallampati, mouth opening, thyromental distance, neck mobility, ULBT, Cormack-Lehane, feature flags; entire block can be marked Unable to Obtain
- Vitals: BP, HR, SpO₂, temperature, RR — each with individual Unable to Obtain toggles
- Lab results: searchable panel with reference-range highlighting for 100+ tests across 9 categories
- **AI lab scan**: camera/gallery upload of printed lab reports; Mistral vision model extracts results against a fixed catalogue of recognised tests with canonical units (Hb g/L, Hct ratio, glucose mmol/L, etc.); unknown test names are discarded server-side before the preview reaches the user
- Risk scores: RCRI (0–6), APFEL (0–4), STOP-BANG (0–8) — computed live; inputs auto-derived from demographics where possible
- AI pre-operative advisor: sends only structured clinical fields (no free text) to Mistral; opt-in per case; consent recorded in audit log; advisory disclaimer displayed in UI
- Auto-save 1.5 s after last change; validation scrolls to the first failing section on submit

### Intraoperative form and timetable
- Timing: operative month/year (no exact calendar date stored), start/end time, next-day flag for midnight-crossing cases, auto-computed duration
- Anaesthesia technique tree: General (ETT, LMA, TIVA variants), Neuraxial (Spinal, Epidural, CSE, DPE with level selectors), Peripheral blocks (Upper / Lower / Trunk / Head & Neck / Ophthalmic), Sedation, Local, Other
- Volatile agent and fresh gas: agent selector (Sevoflurane, Desflurane, Isoflurane); FGF 0–100 L/min; carrier gas (O₂ always present, Air and N₂O mutually exclusive); FiO₂ 0–100%
- Position: 15 positions across 5 groups; multiple selections allowed
- Monitoring: 18 modalities across 4 groups; selecting a monitor adds its vitals row to the timetable automatically
- Airway: device, tube size, cuff state, PEEP, ventilation mode tree, tools, Cormack-Lehane, DLT/endobronchial details
- Vascular access: Arterial (6 sites), Peripheral IV, PICC (3 sites), Central line (5 sites); size, French/gauge presets, depth
- Preop summary card above the timetable: ASA, BMI, IBW, ABW, vitals, Mallampati, airway flags, allergies, comorbidities, abnormal labs
- Equipment suggestions card: ETT/LMA size, TV/RR/PEEP/I:E, fluid rate, Foley/NGT depth — derived from demographics
- **AI monitor scan**: camera/gallery upload of the anaesthesia monitor screen; Mistral vision model extracts visible vital signs into the entry fields; user reviews before saving
- Fluid balance: crystalloids, colloids, blood products with notes, urine output
- Complications free text (max 2,000 chars)

### IntraopTimetable
- 5-minute grid, starts at 1 hour (12 columns), auto-expands as the live clock advances
- Live orange "now" marker, advances every 10 s; selected column follows clock automatically
- Vitals rows (BP stacked bar, HR, SpO₂, EtCO₂, temperature) rendered dynamically from active monitors
- Drug boluses: side-panel quick-pick or in-cell picker; drag to move; Del to delete; → to copy; keyboard 0–9 for dose; IBW-pre-filled dose slider for 28 common drugs
- Infusions: continuous colour bar; mid-infusion rate change; stop at any column; total dose computed from rate × time segments
- IV fluids: 12 types; end with partial or full volume; total volume shown
- Inhalational agents: continuous bar; switching agents auto-stops the previous
- Auto-fill vitals: carries forward EtCO₂, SpO₂, temperature from the previous column as the clock advances (toggle in Settings)
- Auto-fill BP & HR: secondary toggle also carries forward systolic BP, diastolic BP, and heart rate
- Backfill on reopen: fills any gap to the current clock time using the last recorded values when an in-progress case is reopened
- SVG chart / grid toggle; Undo/Redo (Ctrl+Z / Ctrl+Shift+Z); keyboard legend

### Postoperative form
- Modified Aldrete score (Activity, Respiration, Circulation, Consciousness, SpO₂) with auto-summed total
- Recovery vitals: SBP, DBP, HR, SpO₂, temperature (each with stepper/slider entry)
- Pain NRS (0–10), PONV flag
- Disposition: Ward / PACU / ICU with clinical notes
- Handover checklist: 8 groups, 28 items; group header turns green when all items checked
- Complications free text
- Auto-save 1 s after last change

### Printable protocol
- Two-page A4 landscape PDF: intraoperative timetable (page 1), pre- and postoperative summary (page 2)
- Patient identity fields rendered blank — filled in by hand after printing
- Timetable scales automatically to case duration

### Data export
- `GET /api/export` — authenticated users can download a JSON export of their account, all cases, and audit log entries (GDPR Article 15)

### ICD-11 search and translation
- `GET /api/search/icd11` — live WHO API lookup with Bulgarian label cache (`Icd11Alias` table)
- `src/lib/mistral-translate.ts` replaces the misnamed `groq-translate.ts`; uses `open-mistral-7b` on Mistral EU

### OMOP mapping
- `src/lib/omop-mapper.ts` — maps internal case fields to OMOP CDM concepts for future de-identified research export

### Error monitoring
- Sentry SDK integrated (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) for runtime error tracking in production

### Testing
- `src/__tests__/` — Vitest unit-test suite; `vitest.config.ts` configured for the Next.js app-router environment

### Database migrations
- Formal Prisma migration system: `prisma migrate deploy` runs automatically on Vercel build before `next build`
- `20260530000000_init` — baseline migration for all tables at v0.4.3
- `20260609000000_intraop_gas_and_recovery_vitals` — adds FGF/carrierGas/FiO₂ to IntraoperativeRecord; adds recovery SBP/DBP/HR/SpO₂ to PostoperativeRecord; adds `Icd11Alias` table; adds performance indexes; **removes** `timeInRecoveryMin` from PostoperativeRecord

---

## [0.4.4] — 2026-06-09 "Intraop and recovery parity"

### Added
- Persisted FGF, carrier gas, and FiO2 fields with a production migration and mobile/web API support.
- Recovery SBP, DBP, heart rate, SpO2, and temperature on web and mobile with shared clinical controls and initial values matching preop ranges.
- Comprehensive stored-data reference in `docs/data-model.md`.

### Changed
- Gas entry now uses FGF 0-100 L/min, O2 with mutually exclusive Air/N2O, and FiO2 0-100%.
- Selected anaesthesia techniques include their category in compact labels.
- Case summaries and generated protocols display the current gas model and postoperative recovery vitals.

### Removed
- Time in recovery / Time in PACU from the schema, forms, summaries, protocols, translations, and documentation.

### Fixed
- New gas values are no longer discarded by API validation or the Prisma mapper.

---

## [0.4.3] — 2026-05-30 "Data layer"

### Added
- `AWAITING_REVIEW` case status between `IN_PROGRESS` and `COMPLETE`
- Case presence lock (`CaseLock` model, 30 s TTL, 15 s heartbeat); Watching mode with takeover
- Conflict detection on case updates (stale writes rejected with 409)
- Live case refresh via SSE (`GET /api/cases/[id]/stream`) with polling fallback
- New routes: events, lock, stream, unfinalize
- Intraop vitals backfill on reopen
- Prisma formal migration system; Vercel build updated to `prisma migrate deploy && next build`

### Changed
- Dashboard scope rail and stat-card filters
- AI advisor expanded patient context
- Mobile sync mappers (`_mappers.ts`) covering preop, intraop, postop aliases
- Token blocklist pruning; PII pattern expansion; rate limiter pruning
- Pending transfers include `procedureName`

### Removed
- `ShareCaseButton` component

### Fixed
- Production login failure on `AWAITING_REVIEW` enum value

---

## [0.4.2] — 2026-05-24

- Full Bulgarian UI translation for all user-visible strings
- Vercel Analytics (anonymous page-view tracking)
- AI disclaimer corrected (informational summary, not clinical advice)
- Lab scan GDPR notice strengthened
- Privacy Policy PII best-effort notice added

---

## [0.4.1] — 2026-05-24

- Fixed Terms and Privacy links not opening when logged in

---

## [0.4.0] — 2026-05-24

- 30-minute postop review window with countdown banner
- Expanded lab catalogue (100+ tests, 9 categories, reference ranges, search)
- AI lab scan (Mistral vision, GDPR notice, preview-before-import)
- HOD access restricted to own institution

---

## [0.3.0] — 2026-05-21

- GDPR data minimisation: removed staff names, exact surgery date, patient identity fields
- Consent screen, Terms checkbox on registration, `/privacy` and `/terms` pages
- Data export (Article 15) and account deletion (Article 17) under Settings
- Migrated AI to Mistral La Plateforme (EU); removed Groq
- DB-backed JWT revocation, constant-time login, soft-delete

---

## [0.2.0] — 2026-05-20

- Admin approval for registrations; rate limiting; security headers; audit log; Zod validation

---

## [0.1.0] — 2026-04-01

Initial release. Preoperative, intraoperative, and postoperative data entry. PDF export. ICD-11 search. AI advisor. Guided tour. Dark mode. Bilingual (English / Bulgarian).

