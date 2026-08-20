# Changelog - LOSPOR Mobile

## [9.3.0] - 2026-08-20

### Added

- **Handing a case to a colleague, from the phone.** End of a shift, or a
  pre-assessment done days before by someone who will not be in that theatre —
  both happen with a phone in hand. A head of department assigns and the case
  moves at once; anyone else sends a request, and the case stays theirs until it
  is accepted. The confirmation says which of the two just happened, so nobody
  walks away believing they have handed over when they have only offered to.

- **Withdrawing an offer nobody answered**, from the case menu. While a request
  stands the case cannot be offered to anyone else, so without this a case
  handed to a colleague on annual leave was stuck.

### Fixed

- **The assign control never appeared for a head of department.** It was gated on
  a role value of `"HOD"`, which the API has never returned — the role is
  `HEAD_OF_DEPT`, and `"HOD"` is only a display label. The condition was never
  true, so the control was in practice administrator-only. The gate is gone
  entirely now that the server decides what a handover means.

## [9.2.0] - 2026-08-18

### Changed

- **A risk score says how much of it was actually asked.** The preoperative
  summary showed each score as a number, a maximum and a colour band. The
  calculators count an unasked criterion as absent — deliberately, and
  documented — so "RCRI 1/6, low" read identically whether five criteria had
  been answered "no" or never put to the patient at all.

  Each card now says how many of its criteria were answered, and only when some
  were not. The score and the band are unchanged: a partial score is still the
  best available estimate as long as it says what it rests on.

  Only criteria that can be "not asked" are counted. BMI, age and sex are
  derived, and `highRiskSurgery` is binary by design.

- Pins `@lospor/core` 9.2.0, whose case contract can now express that a risk
  criterion was never asked. Twelve fields that were typed `boolean` are
  `boolean | null`, matching what the database has recorded since 9.1.0.

## [9.1.1] - 2026-08-17

### Changed

- Version alignment with the API fix for clinical questions answered "not
  asked" being rejected at the API boundary and dropped. No mobile change was
  needed: the app was sending the right thing, and the API was refusing it.

## [9.1.0] - 2026-08-16

### Added

- A Chart action in the intraop timetable footer opens the web-shaped vitals
  chart and table as a read-only quickview. Mobile renders the timetable in
  columns and web renders it in rows, and there was no way to see the row view
  from a phone during a case without leaving the cockpit. Nothing in the viewer
  can write to the case.

  It carries its own close control. The first version relied on the system back
  gesture, which is neither discoverable nor where a thumb already is.

  The button sits first and compact, so End case stays rightmost where muscle
  memory expects it.

### Changed

- Clinical yes/no questions are asked with three answers instead of a switch:
  yes, no, and not asked.

  A switch cannot say "nobody asked". Off meant either a recorded "no" or an
  untouched field, and both were saved as a documented negative. Fifteen call
  sites across the preop form and the paediatric sections were converted; six
  correctly stay switches.

  Tapping the chosen side again clears it, so a mis-tap is undoable. Only a
  positive finding is coloured, so a recorded "no allergy" does not paint the
  row like an alarm.

- `preop-form-schema` and `valuesFromServerPreop` stop coercing null to false.
  Without that, reopening a saved case and letting it autosave converted every
  unasked question into a documented no.

## [9.0.1] - 2026-08-11

### Fixed

- **The Android build was stamped with the wrong version.** `package.json` moved
  to 9.0.0 in the release but `app.json` did not, and `eas.json` sets
  `appVersionSource` to `local` — so EAS reads `app.json`, and an APK built from
  the 9.0.0 tag would have installed as 8.5.0.

  This is released as 9.0.1 rather than by moving the 9.0.0 tag. The tag was
  already published, and a tag that changes what it points at is worse than one
  that is merely superseded. 9.0.0 remains what it always was; 9.0.1 is the
  first Android build whose stated version matches its contents.

  An APK carries no provenance beyond what is stamped into it. "Which version
  are you running?" has to be answerable from the phone, by a clinician, without
  reference to anything else.

## [9.0.0] - 2026-08-11

### Fixed

- **A child matched by two overlapping paediatric dose bands was given the
  first band's dose.** The phone sorted the applicable profiles and took one,
  while the web app refused — so the same child, on the same ruleset, could be
  suggested a different dose depending on the device. The phone now states the
  conflict and suggests nothing.
- **A stated conflict was then a dead end.** Having correctly refused to invent
  a dose, the sheet also refused the one the clinician typed: the confirm
  button was permanently disabled with no message. A conflict is now stated,
  not enforced — the hand-entered dose is accepted and recorded with no
  clinical rule credited to it, because no rule was used.
- **The infusion sheet offered routes a ruleset had withdrawn**, and selecting
  one produced an empty box with no reason given. It also dropped a drug
  entirely when only its *default* route had been withdrawn, even though the
  drug still had a usable one. Offered routes are now decided before a default
  is chosen.

### Removed

- The second, phone-side timetable editor, about 820 lines that nothing could
  reach. The tab bar can only select a key from `INTRAOP_TAB_KEYS`, that list
  never contained "chart", and its single caller rendered it with
  `showActions={false}`, which disabled seven of its branches anyway. Every
  test written against it was testing code that never shipped. The timetable
  clinicians actually use, `IntraopTimetableTab`, is untouched. The module's
  types stay: eleven files import them, and they re-export
  `@lospor/core/intraop-types` so the phone and the web cannot disagree about
  what a chart is.

### Changed

- `@lospor/core` moved to v9.0.0 and is installed from the published tag rather
  than `file:../lospor-core`, a sibling directory CI never checked out — so
  `npm ci` could not install at all.
- Paediatric ambiguity, the infusion route filter and the option-metadata
  reader now come from core rather than being kept here as a second copy.

### Internal

- `DrugSheet.tsx` reduced 728 -> 658 lines by extraction, with the size budget
  ratcheted down to match rather than raised.
- Tests for `drugBaseProfilesMap` and `drugRouteProfilesMap`, the wrappers the
  dosing sheets read. A wrong shape there does not throw; it shows up as a
  wrong suggested dose, or a route the clinician cannot find.

## [8.5.0] - 2026-08-07

### Fixed

- **Switching intraop tabs took over a second; it now takes tens of
  milliseconds.** Every switch re-rendered all fourteen bottom sheets — drugs,
  infusions, fluids, agents, vitals and the rest — even though every one of them
  was closed. `Modal` draws nothing while hidden, so nothing appeared on screen
  and nothing looked wrong, but each component body still ran: filtering the drug
  catalogue, building scenario lists, computing doses. On-device measurement put
  the closed sheets at **1335–1652 ms per switch** against **5–41 ms** for the
  tab actually being opened. Only the open sheet renders now.

- **The preoperative form got slower the more of it you filled in.** Every
  keystroke re-rendered the form and then `JSON.stringify`-compared all 106
  fields against their previous values — over 200 serialisations per character,
  across an object graph that grew with each diagnosis, medication and lab added.
  All of it existed to choose between two debounce delays, a question that only
  concerns boolean fields. It now compares those with `!==` and serialises
  nothing. A second render per keystroke, from marking the draft "saving" two
  seconds before any save began, is also gone.

- **Autosave no longer announces "Offline" while online.** The network timeout
  had been shortened to 3 s, which a healthy save over mobile data can exceed;
  the abort was read as a network failure and the app reported itself offline
  while saving perfectly well. Back to 8 s, with the circuit breaker below
  ensuring that wait is paid once rather than per save.

- Autosave gives up on an unreachable server quickly instead of retrying at full
  cost: after a failure, saves go straight to the durable queue until a short
  cooldown passes. Nothing is lost — a save is queued before any network attempt.

- Nothing waits on the network indefinitely: `apiFetch` now carries a 20 s
  default timeout. One request without a bound, inside the sync poll, was enough
  to stop background syncing for the rest of a session.

- **Three Android Keystore operations per API call, removed.** Every request read
  the bearer token back out of SecureStore and wrote two diagnostic timestamps
  into it. Those are encrypted operations, on the path of every poll, every
  autosave and every event recorded during a case. The token is cached in memory
  and the timestamps no longer persist. On web these were free `localStorage`
  calls, which is why the PWA never showed the cost.

- The intraop screen no longer re-renders every 10 seconds regardless of change.

### Added

- **Settings → Diagnostics** now breaks a tab switch into named phases — time
  blocked before the render, the render itself, props construction, and each
  subtree measured by React's own profiler — alongside queued edits, server
  reachability and the offline vocabulary version. This is what located the sheet
  rendering after a day of wrong theories, and it stays so the next question
  starts with a measurement.

## [8.4.0] - 2026-08-06

### Added

- **Diagnosis and procedure search work with no connection.** Both pickers were
  network-only and, on failure, returned an empty list — which reads as "there is
  no such diagnosis" rather than "there is no network". Since a case cannot be
  finalised without a diagnosis, a case could be documented in full offline and
  only then found to be unfinishable. The whole ICD-10 vocabulary and procedure
  list now ship with the app (~390 KB compressed) and are loaded lazily on the
  first search that needs them.
- Results that came from the device are labelled as such, and fields with no
  offline copy say so, so an empty list is never mistaken for an answer. Applies
  to diagnoses, procedures and medications, which share one component and all
  failed the same silent way.
- Diagnoses and procedures chosen offline record which vocabulary version
  produced them, so a case coded from a stale copy can be found later.
- **Settings → Diagnostics**: queued edits, whether the server is reachable, the
  vocabulary version on the device, and how long recent intraop tab switches
  took. A performance problem on a phone in another building cannot be profiled
  remotely; this turns an impression into a number.

### Fixed

- Autosave no longer spends the full network timeout discovering it is offline.
  The timeout drops from 8 s to 3 s, and after a failure saves go straight to the
  durable queue until a short cooldown passes — intraop writes are serialised per
  case, so one unreachable save used to hold up everything behind it, and the
  next save paid the cost again. Nothing is lost: a save is queued before any
  network attempt.
- The clinical storage adapter no longer consults SecureStore on every cache miss
  and delete a key on every write, long after the one-time migration drained it.
  Each was an Android Keystore round trip that could only return nothing: 25
  native calls on the first save of a case, 12 of them Keystore.
- The intraop screen no longer re-renders every 10 seconds regardless of change.
  It rebuilt the whole timetable and redrew the screen to display an elapsed time
  that reads in whole minutes — five ticks in six changed nothing visible.

## [8.3.3] - 2026-08-06

### Fixed

- **Dragging a vital slider no longer changes tab.** The intraop tab swipe claims
  any horizontal movement, and React Native grants a termination request by
  default, so a slider handed the gesture over mid-drag — the tab changed while a
  clinician was still setting a value. Both steppers now refuse to hand it over
  once the finger is down.
- **A three-digit blood pressure no longer truncates to `13…`.** Between the two
  44 px buttons a half-width field is about 61 px, and `130 mmHg` needed 88 px.
  Measured at smaller sizes it still did not fit — 69 px at 17 pt, 62 px at 15 pt,
  by which point the number is too small to read at arm's length. The unit is what
  did not fit, so it now sits below the field and the value has room at 19 pt.
  Applies to every vital field, in preoperative assessment and in recovery, so the
  form keeps one rhythm rather than making blood pressure a special case.
- The label row no longer collides with its neighbour at half width: the label
  yields and truncates, and the *unable to obtain* control keeps its size instead
  of being pushed out of its column.

### Changed

- The intraoperative screen builds props for the tab it is showing, not for all
  eleven. Housekeeping rather than a measured speed-up — see below.

### Note on the reported intraoperative lag

Tab switching was profiled against the real API through the PWA. Wall-clock
timing showed 65–341 ms per switch, but a control that re-clicked the *already
active* tab measured 52–96 ms of pure harness overhead, and a V8 CPU profile over
twenty switches found 2,466 ms of 3,434 ms idle with no application function
above 18 ms of self time. The lag is not reproducible in the PWA, and those
numbers described the test harness rather than the app.

The PWA and the native app share JavaScript but not the renderer, so a cost in
native layout or view mounting cannot appear there. This release therefore makes
no claim to have fixed it; that needs measuring on a device.

## [8.3.2] - 2026-08-06

### Added

- Premedication in paediatric mode. The library used to be handed over empty, so
  the screen offered nothing and explained itself with a banner. Every entry is
  now rebuilt from the child's weight and age, drugs without a paediatric rule
  are dropped rather than shown at their adult dose, and withheld drugs appear
  disabled with the reason. The dose carries its own arithmetic —
  `0.5 mg/kg × 14 kg` — and changing route recalculates it.
- Equipment suggestions are translated into Bulgarian. A coverage test walks the
  full input space and fails if `@lospor/core` rewords anything without a
  matching translation, so the two cannot drift apart silently.

### Fixed

- **Preferences no longer follow one clinician into another's account.** The
  device copy lived under a single key that survived sign-out, and any field the
  server did not have fell back to it and was then pushed up — so on a shared
  phone, the previous user's favourite drugs and infusions became the next
  user's, permanently. Snapshots are stamped with the account that wrote them
  and discarded on mismatch, which holds even when the app is killed without a
  clean sign-out. They are also cleared on sign-out and on session expiry;
  unsynced drafts and queued patches are deliberately left alone, because a
  session timing out is not a reason to destroy clinical work.
- Equipment suggestions no longer run off the edge of the card. The value column
  had no flex bound, so it sized to its content and squeezed the label until it
  wrapped into it.
- Preoperative and recovery vitals no longer print their own name twice. The
  field label was being passed as the stepper's placeholder, which renders at
  the same size and weight as a real value and overflowed into the +/− buttons.
- Paediatric drug and infusion menus have their scenario categories back —
  induction, relaxants and the rest. They were being emptied in paediatric mode,
  leaving favourites and browse-all with nothing between them. The adult dose
  presets stay suppressed; the categories are navigation only.

## [8.3.1] - 2026-08-05

Android `versionCode` is 35. Requires `@lospor/core` v8.3.0 and LOSPOR API
v8.3.1.

### Fixed

- Registration no longer tells you to check your email when no email was sent.
  The account exists either way, but without a verification link there is no way
  to sign in — so the screen says so and points at the administrator, instead of
  leaving somebody waiting on a message that is never coming.

## [8.3.0] - 2026-08-05

Android `versionCode` is 34. Requires `@lospor/core` v8.3.0 and LOSPOR API
v8.3.0.

### Added

- **Ask to join a department, and decide one.** Settings files a request rather
  than relabelling itself as though the move had already happened; the admin
  screen gains the departmental queue, which a head of department gets on its
  own.
- **Leave**, beside the institution row. Confirms first — this still changes who
  can see the cases you record from here on — and reports where you landed,
  because the server applies a leave immediately. Hidden when there is nothing
  to leave.

### Fixed

- **A postoperative assessment is never pre-filled.** The form defaulted all
  five Aldrete components to 0 and PONV to false, so opening the recovery screen
  and saving anything else recorded a complete 0/10 for a patient nobody had
  looked at. Zero is not "not yet scored" — it is the worst score on the scale.

### Testing

- A PWA end-to-end suite covering the institution loop end to end, including the
  head of department approving from their queue, and the administration screen's
  scope. Plus the login screen, a wrong password leaving no token behind on a
  shared device, and the sign-in rate limiter — which had never been tested.
- The suite now runs on every pull request, not only in the release gate.

## [8.2.1] - 2026-08-05

Android `versionCode` is 33.

### Fixed

- The paediatric weight wheel opens without lag. It renders every value eagerly
  into a scroll view, and paediatric weight asked for 0.1 kg steps across a
  range that ran to 700 kg — about seven thousand rows built before the field
  could paint. The weight ladder is deliberately non-uniform, because the
  granularity a clinician needs tracks the size of the patient; that rule now
  follows the caller's step rather than one hard-coded value, so a paediatric
  wheel gets tenths below 10 kg where a neonate needs them, half-kilos to 20,
  and whole kilograms above. Roughly 7000 rows become 350. The adult ladder is
  unchanged.
- The paediatric weight ceiling was 700 kg, which no child approaches and which
  the web form does not use — it takes the API's maximum. Mobile now matches.
- Weight values no longer collapse to repeated whole numbers on the wheel; see
  `@lospor/core` v8.2.1.

## [8.2.0] - 2026-08-05

Keeps clinical data off Android backups and out of forms that never measured it.
Android `versionCode` is 32.

Requires `@lospor/core` v8.2.0 and LOSPOR API v8.2.0.

### Fixed

- Clinical data is excluded from Android backups (`allowBackup: false`), so a
  case cannot be carried off the device into a cloud backup. This is a native
  manifest change and takes effect only in a newly built binary.
- Storage failures surface instead of being swallowed, so a save that did not
  persist is not reported as saved.
- New-case and postop screens no longer assume demographics or fabricate
  observations that were not taken.
- Lab rows whose unit was not recognised are no longer pre-ticked.

## [8.0.0] - 2026-08-04

First stable release. Adds pediatric clinical mode and clinical rulesets.
Android `versionCode` is 31.

Requires `@lospor/core` v8.0.0 and LOSPOR API v8.0.0.

### Added

- Pediatric preop sections and pediatric-aware intraop dosing.
- Clinical rules are cached on the device, so dosing still resolves offline.
- Component tests for the dose selector, drug sheet and end-case sheet, plus an
  encoding guard covering `app/` and `src/`.

### Changed

- Fluid entry now runs through the shared core logic rather than its own copy.
- Drug profile editing stays web-only by design: mobile consumes rulesets and
  does not author them.

### Fixed

- Ruleset-hidden fluids are hidden from the picker but kept in the lookup maps,
  so a fluid recorded earlier in the case still resolves.

## [7.3.0] - 2026-07-28

Clinical serialization compatibility release. Android `versionCode` is 30.

- Identifies native and PWA requests as v7.3.0 for the API release that
  serializes clinical writes with finalization and tracks parent revisions.
- Aligns Expo SDK 56 packages with Expo's supported patch versions; Expo Doctor
  now passes all checks.
- No clinical form or offline workflow behavior changed in this client release.

## [7.2.1] - 2026-07-27

Security and CI maintenance release. Android `versionCode` is 29.

- Patched transitive Expo, Metro, React Native, and CSS build dependencies
  reported by `npm audit`.
- Moved GitHub Actions and CI verification to the Node.js 24 toolchain.

## [7.2.0] - 2026-07-27

Research-governance coordination release. Android `versionCode` is 28.
No APK, AAB, deployment, or production configuration change was made locally.

- Mobile and PWA remain compatible with the action-scoped research contracts
  and immutable export metadata introduced in Core and the dedicated API.
- Clinical application behavior is unchanged; this version coordinates the
  ecosystem contract and release metadata for the research hardening release.
## [7.1.0] - 2026-07-27

Clinical display and research-platform release. Android `versionCode` is 27.
No APK or AAB was started for this web-ecosystem release.

- Mobile and PWA clinical forms, timetable sheets, summaries, handover,
  scenarios, complications, laboratories, fluids, drugs, and gas settings now
  use the canonical Core English/Bulgarian display registry.
- Stable clinical codes remain unchanged for persistence, synchronization,
  offline recovery, and compatibility with existing v7 clients.
- Timetable summary segments and gas descriptions use shared semantic metadata
  instead of client-specific raw labels.

## [7.0.1] - 2026-07-25

Reliability release. Android `versionCode` is 26.

- PWA new-case drafts now use IndexedDB and survive offline navigation and
  reloads; native Android/iOS drafts remain in private filesystem storage.
- Browser tests cover offline draft creation, persistence, reconnection, and
  synchronization.
- The coordinated release gate verifies PWA, web, API, PostgreSQL, Core, and
  Android export compatibility before tagging.

## [7.0.0] - 2026-07-25

Dedicated API and offline durability release. Android `versionCode` is 25.

### Changed

- Mobile and PWA call the dedicated versioned API at
  `https://api.lospor.org` instead of depending on the web deployment.
- The V6 web `/api/*` compatibility address remains available for already
  installed older clients during the transition period.

### Fixed

- Clinical autosave queues now use durable app-private files on native and
  local storage on PWA instead of Android's size-limited secret store.
- Existing queued patches, event appends, edits, and deletions migrate from
  the old storage on first access.
- Every intraoperative tap is stored before network debouncing, so leaving the
  form or losing connectivity cannot erase a technique or position change.
- Starting intraoperative documentation writes a durable transition marker.
  Queued intraoperative work routes back to intraoperative even while the
  server still has an older case snapshot.
- Dashboard requests time out instead of remaining on "Loading cases"
  indefinitely and retry automatically after connectivity returns.
- Server-backed preoperative recovery drafts update their original case rather
  than creating a duplicate after reconnecting.

## [6.0.0] - 2026-07-24

### Changed

- Mobile and PWA now read the complete clinical option catalog and offline
  fallback directly from Core; copied JSON and hardcoded drug, infusion,
  fluid, agent, technique-favourite, and handover lists were removed.
- Labs, ASA/risk bands, ICD body systems, preop completion, intraop end-case
  blockers/warnings, postoperative/Aldrete rules, event labels, summaries,
  timing, units, account policy, and search result mapping use Core.
- Option caching, case-lock leases, live polling, and revision/conflict
  decisions use shared Core controllers with native storage and AppState
  adapters.
- Existing cases normalize legacy technique codes while translations,
  styling, animations, haptics, and native controls remain mobile-owned.
- CI rejects reintroduced clinical copies and hardcoded timetable intervals.

### Fixed

- PII-rejected values remain on the device and are shown with a specific reason
  in preop, postop, and intraop save status instead of becoming a generic
  queued/offline failure.
- Reopening a form restores a blocked value over the server copy. The same
  unchanged value is not sent in a loop; editing that field retries it.
- Coded ICD-10 catalogue labels may contain legitimate uppercase Bulgarian
  clinical wording without disabling stronger identifier checks.
- Mobile and web now resolve the gas settings active at each timetable column
  through the same Core helper.
- Starting or ending a case persists the exact instant and case timezone before
  timetable events are sent.
- Reopening uses `startedAt` as the chart anchor in every timezone. Legacy
  wall-clock-only snapshots stay readable without being converted into guessed
  or future event timestamps.
- The shared readiness check now handles database Date/ISO times, overnight
  wall clocks, and the projected `keyEvents.log` shape consistently.

## [5.6.1] - 2026-07-24

Strict lint and shared type hardening. Android `versionCode` is 23.

### Fixed

- Mobile now rejects malformed server timetable rows and queued event edits
  before they enter the intraoperative screen.
- Hook dependencies were corrected so callbacks use the current case,
  language, save function, and translated messages.

### Changed

- Case-detail and intraoperative wire types now come from the shared Core
  package instead of mobile-only copies.
- The intraoperative render surface keeps unchanged tab and sheet props stable,
  reducing avoidable rerenders while callbacks still invoke current logic.
- CI now runs lint with zero warnings and ignores inline suppression comments.
  The existing suppression directives and explicit `any` render-builder types
  were removed.
- App/package version set to `5.6.1`; shared Core dependency targets `v5.6.1`.

## [5.6.0] - 2026-07-23

Autosave Manager implementation. Android `versionCode` is 22.

### Added

- Preop, intraop, and postop now share one durable save manager backed by
  SecureStore. It owns ordering, revision tracking, offline replay, and status.
- Intraoperative event edits and deletions are stored as targeted operations,
  so offline removal cannot resurrect an older full timeline.
- Reopening a case reapplies pending event edits/deletes before rendering.
- Final submission and case finalization wait for queued work and refuse to
  advance while changes remain unsynced.

### Changed

- Removed the obsolete direct preop PATCH, private section snapshot, and
  whole-intraop-log save engines. Live clinical writes can no longer bypass the
  shared manager.
- App/package version set to `5.6.0`; shared Core dependency targets `v5.6.0`.

## [5.5.1] - 2026-07-23

Auto-fill vitals correctness release. No new native modules; Android
`versionCode` stays 21.

### Fixed
- Auto-fill settings now use the same shared semantics as the web app. Turning
  off Auto-fill vitals also clears BP/HR carry-forward and background backfill,
  so hidden stale options cannot create observations later.
- Background backfill can no longer run while the master Auto-fill vitals switch
  is off.
- Intraop screens refresh auto-fill preferences while the app is open, so
  changing settings no longer requires remounting the case screen.
- Multi-column gaps are planned by the shared core helper, matching the web app.

### Changed
- App/package version set to `5.5.1` so the four LOSPOR repos share one release
  line.

## [5.5.0] - 2026-07-23

Version alignment with web, core, and docs. No mobile runtime or native module
changes; Android `versionCode` stays 21.

### Changed
- App/package version set to `5.5.0` so the four LOSPOR repos share one release
  line again.

## [5.4.5] - 2026-07-22

Internal cleanup release — **nothing a user can see changes**. `versionCode`
stays 21.

### Changed
- Dead imports now fail the lint gate instead of passing as a hidden warning.
  This closes the gap that let a feature ship disabled (a hook imported but
  never called). Cleared the resulting backlog of unused imports.
- Removed two features that were fully built but had no way to be triggered, so
  they were never reachable: the emergency crisis shortcuts (one-tap presets for
  hypotension, bradycardia, desaturation and difficult airway) and the
  airway-event detail sheet. Both are slated to return in a later feature update
  with proper triggers; the dead code is removed for now. The airway equipment
  section (the Airway tab) is a separate, working feature and is untouched.

## [5.4.4] - 2026-07-22

Mobile-only patch. `versionCode` stays 21.

### Fixed
- **Automatic vitals carry-forward now actually runs.** The setting to carry
  EtCO₂, temperature and SpO₂ (and optionally BP/HR) forward as the timetable
  advances had no effect — the hook that does the work was imported but never
  called, so toggling the setting did nothing. It is now wired in and respects
  the Settings toggle as before. (It slipped through because an unused import is
  only a lint warning, which the quiet lint run hides.)
- **Carry-forward now copies the *previous* cell, not the first reading of the
  case.** The source vital was taken by array position, which is only the most
  recent reading while the log stays newest-first — after a reload or sync it
  could be the oldest, so the first vitals of the case were carried forward
  instead. It now picks the most recent reading before the column, by time,
  regardless of order. The same fix applies to the values pre-filled when you
  open a vitals cell by hand.

## [5.4.3] - 2026-07-22

Mobile-only patch (web, core and docs stay at 5.4.2). `versionCode` stays 21.

### Fixed
- **The intraoperative input sheets no longer bounce up and down when a field is
  focused.** The shared sheet wrapped its content in a keyboard-avoiding view set
  to adjust by the keyboard's height on Android — but Android already resizes the
  window under the keyboard, so inside a modal the two adjustments fought and the
  sheet oscillated. Android now leaves the native resize to do the work; iOS is
  unchanged. Affects every input sheet — vitals, drug dose, infusion rate, gas.

## [5.4.2] - 2026-07-22

Version alignment. `versionCode` stays 21.

### Fixed
- Whole-number weights are accepted again. The shared weight step is now 0.5 kg,
  so both whole and half kilos are valid — the phone wheel already stepped in
  half-kilos under 20 kg, so this only affected the web app in practice, but the
  definition is shared and now correct for both.

## [5.4.1] - 2026-07-22

Version alignment. No new native modules, so Android `versionCode` stays at 21.

### Fixed

- **Four pickers offered values the record refuses**, shared with the web app:
  systolic pressure started at 1 where the minimum accepted is 40, diastolic at
  1 against 20, heart rate at 1 against 10, and temperature at 0 against 25.
  Reaching the bottom of any of those wheels produced a save the server would
  not store. All picker bounds now match what the record accepts.
- Creating a case no longer risks losing the whole assessment to one
  out-of-range value — the server keeps everything else and names what it
  refused.

## [5.4.0] - 2026-07-21

Version alignment with the web app's start/end time fix. No new native modules,
so Android `versionCode` stays at 21 and existing builds continue to work.

### Fixed

- **The intraoperative chart now starts where the case actually started,
  wherever you are.** Start times were stored as a bare clock reading with no
  record of the timezone, while everything charted against them is a real moment
  in time. Comparing the two put the chart origin out by the local UTC offset —
  three hours here in summer — which is why a case opened on the phone could
  still begin at the wrong time even after the previous release's fix. Times now
  carry their zone, and the correction applies on both devices.
- A case spanning a daylight-saving change now reports its true elapsed
  duration rather than the difference on the clock face.

## [5.3.0] - 2026-07-21

No new native modules, so Android `versionCode` stays at 21 — existing builds
continue to work.

### Fixed

- **The timetable could start at the wrong time when a case was reopened.**
  Starting a case on the web at 08:25 having entered a start time of 08:00, then
  reopening it here, drew the chart from the moment charting began rather than
  the induction time entered. Nobody charts at the moment of induction, so the
  time you enter is now the chart's origin on both devices.
- **Offline cases could be lost once enough of them accumulated.** They were held
  in secure storage, which is meant for small secrets and silently refuses values
  past a size limit. They are now kept as files, which is what they always should
  have been.
- **Sex was pre-selected as male when the record did not specify one.** Reopening
  a case that never had a sex recorded showed "Male" already chosen, and saving
  wrote that guess into the record — where it would count as data. Unrecorded now
  stays visibly unrecorded.
- Live refresh no longer relies on the server-sent event stream, which never
  functioned in production.

### Changed

- The drug and infusion menus now read their eight clinical categories from the
  shared core package instead of a local copy. The menus are unchanged here — the
  web app had drifted to a different one, and this is what stops that recurring.

## [5.2.1] - 2026-07-21

### Fixed
- **Autosave works again.** Entering a height sent the value while it was still being typed; the server rejected anything under 30 cm and refused the *entire* save, so every other field edited at that moment was lost too. The height, weight and age pickers now offer only values the server accepts, and a rejected value no longer takes the rest of the save down with it.
- **Saving no longer erases fields you did not touch.** The app saves only what changed, and the server was treating every unmentioned field as "cleared" — so editing one value could blank others in the same section.
- If a value is still refused, the form now says **"Not saved — value out of range"** and names the field, in preop and postop. Previously the value stayed on screen looking saved.

### Changed
- Login, register and password-reset screens now show the real LOSPOR mark — the anaesthesia machine on its trolley with bellows, matching the app icon — instead of a simplified lamp-and-box drawing, and it is centred on the machine's axis.
- Chart labels in the case summary and timetable viewer are translated in Bulgarian (АН, СЧ, Темп, Инф, Газова смес, Флуиди, Позиция, Лекарства, mmHg/удм).
- Settings → About reads its version from the app configuration, so it can no longer drift out of date.

## [5.2.0] - 2026-07-20

The case summary is aligned with the web summary and the printed protocol (one shared model), and gains an at-a-glance intraoperative timetable visualization plus a zoomable read-only viewer for finished cases. Android `versionCode` 21 — this release adds a native module (`react-native-gesture-handler`), so a new binary is required.

### Added
- **Case summary timetable card**: the case summary now shows a read-only, paper-style intraoperative timetable (SBP/DBP/HR trend, event flags, Agent/Infusion/Gas/Fluid/Position lanes, numbered drug pins matching the printed record's administration log) rendered from the same projected data as the printed record. The live intraop cockpit itself is unchanged.
- **Fully native printing — the phone never opens the web app**: long-press a **finished** case in the list → Print case, or use the print action on the case screen; finishing a case offers printing immediately. The app downloads the server-generated A4 PDF using your login (with a "Generating PDF…" state) and opens Android's native share sheet — view it in your PDF app, save, send, or print. No browser, no print token.
- **Encoding repair**: fixed garbled symbols ("вњ“", "в–ј", "kg/mВІ" …) across the case-detail, preop and postop widgets — checkmarks, chevrons and units (✓ ▾ kg/m²) render correctly again.
- **Read-only timetable viewer for finished cases**: tapping the summary timetable on a finished case now opens a dedicated in-app viewer — the printed record's stacked chart panels (traces, event flags, numbered drug pins, vitals table, lanes) with the numbered drug administration log below, theme-aware and horizontally scrollable. Ongoing cases still open the live intraop cockpit; the card's hint switches to "View timetable ›" when the case is closed.
- **Pinch-to-zoom timetable (semantic zoom)**: pinch or use − / + in the viewer — zoomed in shows the full 5-minute detail, zoomed out re-samples the vitals table to the coarse printed look (q10/q15/q30, badge shows the current interval). Traces, drugs, events and lanes always keep every recorded point; the printed record itself is unchanged.

## [5.1.0] - 2026-07-13

Hardening release addressing an external code review of v5.0.0. Android `versionCode` 20 — the first binary built from the v5.x sync-engine line (JS-only changes since v5.0.0; no native changes).

### Fixed
- **Queued intraop section patches and queued intraop events no longer share a storage key.** Since v4 both wrote to `lospor_pending_intraop_<case>` in SecureStore, so one could silently overwrite — or a flush could destroy — the other when a case had both queued offline. Patches moved to their own namespace; existing queued data is migrated automatically at startup.
- **A queued offline save that hits a conflict now self-heals once on flush** (adopts the server timestamp and retries) instead of replaying the same stale base forever.
- Field-diffing compares values canonically, so nested key order can no longer trigger pointless saves.
- Mojibake repaired in RELEASE_PLAN.md.

### Changed
- Password reset now terminates existing mobile sessions: bearer tokens issued before the reset are rejected by the server within ≤5 minutes (you'll be asked to log in again after resetting your password).

## [5.0.0] - 2026-07-12

Unified save/sync engine. Android `versionCode` 19 (JS-only, no native changes).

### Added
- **Settings → "Unsaved events"**: a recovery screen listing intraop events the server permanently rejected (they were always kept on-device so no clinical data is silently lost — now you can actually see and clear them).

### Changed
- **All save/offline/conflict logic now runs on one shared engine** (`@lospor/core/sync`), used identically by mobile and web. The offline patch queue, pending intraop-event journal, per-case write queue, and 409 self-heal are one tested implementation instead of parallel copies — a fix in one place now reaches both apps. Storage keys and screen behavior are unchanged; queued data on devices survives the upgrade.
- **Preop and postop saves are now field-level.** Autosaves send only the fields that changed since the last confirmed save, so two clinicians editing *different* fields of the same case no longer overwrite each other, and unchanged autosaves skip the network entirely. Manual submit still sends the complete record as the convergence point.
- **Toggle and pill taps in preop save near-instantly** (~300 ms after the tap); typing keeps the 2-second pause so half-typed values are never saved.
- **Smarter retry rhythm.** The background flusher backs off while saves keep failing (5 s → 15 s → 60 s windows) and resets the moment the app returns to the foreground.

### Fixed
- A latent race in the offline queue's index bookkeeping (two flushes running at once could silently lose a queue entry) — index updates are now serialized in the shared engine.
- **Rapid multi-select taps in intraop (positions, monitoring, techniques, complications) no longer fail to sync.** Each tap used to fire its own save carrying the timestamp from tap time; later taps then collided with their own predecessor. Taps now coalesce into one save shortly after the last tap, and every queued save reads the freshest timestamp at the moment it actually executes.
- **Fluid/agent quick-value autofill can no longer be knocked out by a stale offline cache.** Option-library caches from older app builds (before quick values existed for fluids and agents) could shadow the correct data while offline; caches are now version-stamped and stale ones ignored. Selecting a fluid/agent prefilling the first library preset is now covered by component tests.

## [4.1.6] - 2026-07-11

Intraop autosave race fix. Android `versionCode` 18 (JS-only, no native changes).

### Fixed
- **Overlapping intraop autosaves no longer race or clobber each other.** Every event write for a case now goes through a per-case single-flight queue, so saves that previously fired concurrently — rapid vitals/drug/event entry, or a live refresh landing mid-save — run one at a time instead of colliding and overwriting each other.
- **A stale-timestamp conflict on the full-log save now self-heals.** The full intraop-log save (`PUT /api/cases/[id]/events`) retries once on a `409` using the server's returned `updatedAt`, instead of leaving the save stuck in a failed state that needed a manual "Sync retry".

## [4.1.5] - 2026-07-05

Android `versionCode` 17.

### Fixed
- Replaced the corrupted preop section-overview floating button text with a real app icon, fixing the mojibake shown in mobile and Expo PWA builds.
- Normalized the Expo web manifest description so PWA install metadata avoids fragile glyph encoding.

## [4.1.4] - 2026-07-05

Intraop bug fixes (regressions surfaced after the shared-core refactor). Android `versionCode` 16 (JS-only, no native changes).

### Fixed
- **Airway devices with sub-panels (LMA / oral & nasal ETT / DLT / endobronchial) can be re-edited again.** Reopening a confirmed device to edit it left the panel unable to auto-collapse (a "was complete on open" flag that was never reset). Reopening an already-added device now clears its sub-fields so it opens deselected and re-picks from scratch, identical to first-time entry — and collapses again on completion.
- **Changing an infusion's rate now splits the bar at the column you're editing, not the whole case.** The manage/rate sheet had lost the tapped-column context in the shared-core refactor, so the rate change was stamped at wall-clock "now" instead of the column being edited. The rate change now anchors to the tapped column (v3.5.0 behavior restored); e.g. starting Propofol 4 mg/kg/hr at 12:00 and changing to 6 at 13:00 now correctly shows 4 from 12:00–13:00 and 6 from 13:00 on.
- **Adding vitals no longer fails and requires a manual "Sync retry".** On a case that had been touched on the web app, the first event save does a full-log migration PUT with a conflict header; if the client's base timestamp was stale it 409'd and stuck in "failed". The single-event save path now self-heals a 409 once with the server's timestamp (mirroring the whole-log sync path), so the first vitals of such a case save automatically.

### Changed
- **Adding or ending a fluid no longer fires a second, redundant save.** Every fluid change used to also recompute the fluid totals and PATCH them separately — an extra request that always lost a conflict race and retried (three round-trips per fluid change, and the "multiple autosave rolls" in the sync badge). The server now derives fluid totals from the fluid events themselves, so the app just records the fluid event and the totals follow — one save per fluid action.

## [4.1.3] - 2026-07-05

Version alignment across all four LOSPOR repos (core, app, mobile, docs) — no functional changes beyond v4.1.2. Android `versionCode` 16 (no native changes).

## [4.1.2] - 2026-07-05

Sync-race and correctness fixes in the intraop timetable, following a live incident where the backend's database connection pool was exhausted (see lospor-app v4.1.2) and made these worse. Android `versionCode` 16 (no native changes this round, JS-only fixes).

### Fixed
- **Stopping an infusion/agent/fluid, and changing rate, no longer feel stuck behind unrelated network activity.** v4.1.1 fixed a lost-update race in the local offline pending-events cache by routing it through the same single-flight queue used for network saves — but that queue is a strict FIFO, so every local bookkeeping step then had to wait behind whatever network call was currently in flight (worse under the connection-pool exhaustion above). Local storage now has its own dedicated queue, decoupled from network latency.
- **Ending a case with multiple active infusions/agents/fluids is faster.** The end-case confirmation stopped each active item one full round-trip at a time; they now stop concurrently.
- **Changing a volatile agent's percentage no longer truncates its timeline bar.** There's no dedicated "agent rate change" event (unlike infusions, which have one) — adjusting percent on an already-running agent re-fires a plain start event, and the timetable projection was treating that as a full restart, cutting the bar's visible history back to the adjustment point. It now recognizes a same-agent restart and keeps the original start column.
- **Adding vitals now closes the entry sheet immediately**, matching how adding a drug, infusion, or fluid already worked — previously it waited for the full network save to finish before dismissing, making vitals entry feel uniquely slow.
- CI (`npm ci`) lockfile version drift fixed (see lospor-app v4.1.2 for the root cause — regenerated to prevent the same class of issue here, even though this repo's own CI hadn't hit it yet).

## [4.1.1] - 2026-07-05

Bug-fix follow-up to v4.1.0. Android `versionCode` 16 (no native changes this round, JS-only fixes).

### Fixed
- **Airway device / vascular access / premedication selections no longer flicker and revert.** The initial case-load GET could clobber a just-made selection with the pre-edit server snapshot before an in-flight autosave committed; the existing in-flight-save guard (already protecting techniques/positions/monitoring) was never extended to these fields.
- **Rapid drug/event entry in the intraop timetable no longer silently drops items.** The local offline pending-events cache did an unguarded read-modify-write on every add/remove; tapping 2-3 items within ~1-2 seconds could race and lose one from the offline safety net. Now serialized through the same single-flight queue already used for network saves.
- **Preop data (age, height, weight, diagnosis, comorbidities, etc.) no longer silently lost on close/reopen.** Two causes: the debounced autosave was cancelled (not flushed) on navigating away within its 2s window, and reopening a case could race a still-unflushed queued offline patch, showing stale server data in the meantime. Autosave now flushes on unmount, and reopening a case first attempts to flush any queued patch before fetching.
- **Account deletion wording no longer overpromises (Bulgarian).** The Bulgarian confirmation text claimed the action "permanently deletes your profile and all related data" — stronger than what actually happens (disable + token revoke, deletion/anonymisation per retention policy). Wording now matches the accurate English text.
- Residual encoding corruption (mojibake) cleaned up in 10 files — bullets, arrows, middle dots, ellipses, and a garbled "SpO₂"/"EtCO₂" in a test file; earlier fixes this release cycle were incomplete, not a full sweep.

## [4.1.0] - 2026-07-05

Full Bulgarian localization pass and shared clinical-data consolidation. Android `versionCode` 16.

### Added
- **Deep Bulgarian translation coverage** across the intraop screen (vitals, airway, vascular access, timing, drug/infusion pickers, timetable row/footer/undo bar, monitor header), preop, case-detail cards, dashboard, settings, and admin/audit-logs.
- Base and clinical UI strings extracted into `src/i18n/strings.ts` and `src/i18n/clinical-strings.ts`, with an automated English/Bulgarian key-parity test so the two languages can no longer silently drift apart.
- Ventilation-mode lists, the complications picker's category list, and case-status label text now come from `@lospor/core` instead of hand-duplicated local copies, shared with the web app.

### Fixed
- Repaired broken characters (UTF-8/cp1251 mojibake) found in postop handover items and several case-detail card files while translating them.
- **Registration now sends a normalized email** (trimmed + lowercased), matching the login and forgot-password screens; the API helpers normalize defensively as well. The server (lospor-app 4.1.0) normalizes all auth emails authoritatively.
- Repaired broken characters (UTF-8/cp1251 mojibake) in `docs/play-store-data-safety.md` and `RELEASE_PLAN.md`.

## [4.0.0] - 2026-07-03

Quality/stability milestone. The intraop screen was rebuilt internally (same UX, far more maintainable and faster), account email flows arrived, and the mobile test suite grew from 95 to 228 tests.

### Added
- **Forgot password** screen; register/login now use shared auth API helpers (`registerAccount`, `requestPasswordReset`, `confirmPasswordReset`).
- **Single-flight event save queue**: event POSTs, whole-log syncs, retries, and live-refresh reloads are serialized so fast sequences like "start infusion → immediately Undo" no longer produce transient "Sync error" badges. Full-log sync also retries once with the server timestamp after a 409 (e.g. when a fluid-total autosave races an undo/delete).
- **Timetable performance pass**: per-column row data memoized, `React.memo` rows (the moving now-marker only invalidates the current row), batched running-item projection, tuned FlatList batching, press feedback restored via `FeedbackPressable`.
- **In-app medical disclaimer** and crypto-backed event IDs.
- **Shared `@lospor/core` package** for dosing, scores, unit conversion, ranges, equipment suggestions, option-library mappers, and timetable math — one source of truth with the web app.
- Offline hardening: cached empty option-library categories fall back to the bundled library instead of blanking clinical menus.

### Changed
- **Registration success screen** now says to verify your email — admin approval no longer gates login (see web 4.0.0 notes).
- **Intraop route refactor**: `cases/intraop/[id].tsx` went from 4,073 to ~650 lines. Logic moved to ~40 unit-tested `src/lib` modules (projection, running items, event edit/actions, lifecycle, monitoring defaults, premedication, airway, timing, pending-event queue…) and the UI to ~25 focused components (tab hosts, sheet hosts, timetable rows, monitor header…). Behaviour-preserving; verified on device.
- **Preop route refactor**: `cases/new.tsx` from 2,220 to ~1,180 lines (schema, section overview, server value/create/patch mappers, ASA suggestion, validation navigation, form widgets extracted). Preop autosave now serializes with in-flight saves; age accepts up to 149; airway wheel values (mouth opening ≤10 cm, thyromental ≤15 cm) no longer fail validation.
- Case detail and postop screens split into card/section components.

> Note: versions 3.4.x–3.5.0 shipped as combined web+mobile releases; their detailed notes live in the web app changelog.

## [3.3.0] - 2026-06-27

### Fixed
- Allergy details on the case summary now displays drug names (e.g. "Analgin") instead of raw JSON (`[{"label":"Analgin",...}]`). Parsing matches the existing behaviour for current medications.

### UX
- Case detail action area redesigned from a scrollable horizontal pill row into a structured review bar. The bar shows the case status, inline edit shortcuts (Preop / Intraop / Postop), a prominent Finalise Now button for non-COMPLETE cases, Print PDF, Unfinalize (when COMPLETE), and Delete. All previous actions are preserved.
- Print PDF now uses a dedicated `handlePrint` function (print token + browser open) extracted from the old inline handler, making it callable independently of finalization state.

## [3.2.2] - 2026-06-27

### Fixed
- Drug dose stepper now shows decimal digits for drugs with fractional step sizes (e.g. Atropine 0.5 mg steps now display "0.5", "1", "1.5" instead of "1", "2"). `DoseSelector` now auto-derives display precision from the step value when the caller doesn't supply one explicitly.
- Selecting a drug from the drug sheet no longer auto-fills the first quick-dose pill. Dose field starts empty so the anesthesiologist can deliberately choose from the quick pills or use the stepper before confirming.
- End case modal now shows the finalise button even when there are no active running items (no agent, fluid, infusion, or gas). The previous `&&` guard kept the button hidden whenever the item list was empty, making it impossible to end the case in a clean session.

## [3.2.1] - 2026-06-27

### Fixed
- Server-side relational-sync now uses sequential writes instead of `$transaction([...])`, eliminating P2028 errors that appeared in Vercel logs after every case save (background mirror only; case data was always saved correctly). No client change.

## [3.2.0] - 2026-06-27

### Changed
- Finalise action now calls `POST /api/cases/:id/finalize` instead of `PATCH` with `{ status: "COMPLETE" }`. The new endpoint validates preop/intraop/postop completeness before committing.
- Case creation now sends `X-Idempotency-Key: <localDraftId>` on the POST request so offline drafts that lose their response are not duplicated on retry.

### Fixed
- Drug allergy autosave from PWA was rejected by the server PII filter when a drug name contained two capitalised words (e.g. "Morphine Sulfate"). Fixed server-side; no client change required.
- Intraoperative event and case autosave returned 500 errors under load due to a Prisma transaction timeout (P2028). Fixed server-side by replacing the interactive transaction with sequential writes.

## [3.1.0-hotfix] - 2026-06-27

### Fixed
- PWA login was blocked with 403 after the v3.1.0 CSRF hardening incorrectly applied the origin check to `/api/auth/token`. Fixed server-side; no client change required.

## [3.1.0] - 2026-06-25

### Security and privacy hardening
- Version metadata aligned to `3.1.0`.
- Failed login now uses a generic message instead of probing the server for pending-account state.
- Logout clears local clinical drafts, queued case patches, and queued intraoperative events before removing the token.
- PWA storage notes now state that browser `localStorage` is weaker than native secure storage.
- Account deletion copy now matches the implemented soft-delete/access-disable behavior instead of promising automatic hard deletion.

### Intraoperative cockpit polish
- Bolus drug and infusion pickers now open through scenario-based 2-column cockpit menus instead of exposing raw catalogue groups first.
- Synced user favourites for bolus drugs and infusions can be managed from Settings and appear as the first picker action.
- Browse-all remains available with search and canonical library grouping/listing.
- Route-specific dose profiles are respected on mobile/PWA: IV lidocaine stays a dose entry, while local/PD/IT/peripheral block routes show concentration/volume controls.
- Starting a bolus drug as an infusion now preloads the same canonical quick-rate default as selecting that infusion directly.

## [3.0.0] - 2026-06-25

### Summary
- Promotes the accumulated mobile work to **v3.0.0** and aligns with the web/API v3.0 canonical data contract.
- App metadata now uses Expo `version: 3.0.0`; Android `versionCode` is `10`; package metadata is `3.0.0`.

### Added - Mobile/web parity
- Mobile now maps payloads to canonical web/API field names before saving, instead of behaving like an independent schema.
- Case detail actions now cover the web-parity surfaces: printable protocol, share summary, audit logs, admin console, handover, postop, AI advisor, and intraop timetable.
- Dashboard scopes and statistics now match the web defaults and filter behavior.
- Live refresh and queued-save states make web-side changes visible on mobile and mobile-side changes visible on web.

### Added - Offline-safe shared libraries
- Intraop option lists now come from the shared web `OptionLibrary` endpoint: positions, techniques, airway management, ventilation, monitoring, premedication, bolus drugs, infusions, inhalational agents, fluids, clinical events, handover items, numeric ranges, and postop/preop pickers.
- First-install/offline fallback uses a bundled option-library snapshot; cached/bundled data is visible through an offline-library banner and refreshes automatically when the live API is reachable.
- EAS and PWA export can fetch the fallback snapshot from the protected web endpoint before build.

### Changed - Preop UX and canonical data
- Preop entry was rebuilt into a section-based mobile form with universal app header, sticky section rail, side scroll rail, inline autocomplete, and context-specific clinical number entry.
- Diagnosis and comorbidity search use the shared Bulgarian/English ICD-10 API and store code-first tags with both labels.
- Procedure search uses the shared API and displays the web/API `group` as the primary label.
- AI lab scan uses the same canonical lab catalogue, canonical units, LOINC mappings, and normal ranges as web.
- Medication allergy saves as `Medication.kind = ALLERGY`; deselecting the allergy boolean clears the associated text/row state.
- Difficult-airway notes, team notes, physical exam report, and event complication notes are limited to 500 characters and cleared when disabled.

### Changed - Intraop timetable
- Drug, infusion, fluid, agent, event, vitals, glucose, and gas entries use the shared canonical library metadata and event API.
- Fresh gas flow has its own entry path and timeline lane; FiO2 is clamped to 21-100%, O2-only is represented as FiO2 100%, and Air/N2O fractions are calculated and persisted.
- Running infusion, fluid, agent, and gas lanes extend after reopening a live case instead of freezing at last save.
- General inhalational anaesthesia auto-selects SpO2, NBP, ECG, temperature, and EtCO2 monitoring.
- Serum/peripheral glucose is available as a timed intraop vital with canonical `mmol/L` and LOINC `2345-7` on the backend.

### Reliability and tooling
- Offline case-section saves queue and flush safely; intraop events retain idempotent queued replay behavior.
- Added baseline ESLint, TypeScript typecheck, and Vitest test suites for mobile logic/components.
- Cleared current lint errors/warnings targeted during the v3.0 pass.

---
All notable changes to the Expo mobile companion app are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.3.0] — 2026-06-20

### Changed
- Version aligned to **2.3.0** (Android `versionCode` 9).
- Intraop option lists (positions, technique tree, airway management/instruments, monitoring, premedication drugs, intraop drugs, infusions, inhalational agents, fluids, clinical events) now come from the shared `OptionLibrary` API instead of being hardcoded separately in `IntraopTimetable.tsx` and the intraop case screen — this fixes a real drift where those two mobile surfaces had different drug/infusion/fluid lists from each other, and where mobile's technique codes didn't match web's for the same techniques.
- Monitoring now uses a genuine `respiratory` group (capnography, temperature) shared with web, instead of a mobile-only distinction the web app didn't have.
- Mobile's airway instrument list grew from 6 to 8 options (now matches web's full set automatically, since both read the same library).
- `offline-case-patches.ts`: 401 handling during a flush is now explicit and documented (patches were already correctly preserved on auth expiry, just not clearly so); idempotency keys were evaluated but intentionally not added here — unlike the events queue, a case-section PATCH naturally converges to the same result on retry, so a dedup key isn't needed the same way.

### Added — Offline-safe option library
- The app now falls back to a snapshot of the option library bundled into the app itself if a device has never successfully synced and has no SecureStore cache either (first install + no connectivity) — previously this showed silently empty pickers with no fallback at all.
- A visible banner appears in the app header whenever any picker is running on cached or bundled (non-live) data, so a clinician never silently trusts a list without knowing it might be stale; a background retry every 30s swaps in live data the moment connectivity returns, no restart needed.
- The bundled snapshot (`src/data/option-library-fallback.json`) is now fetched automatically from `lospor-app`'s shared-secret-protected snapshot endpoint via the `eas-build-pre-install` lifecycle hook (`scripts/fetch-fallback-snapshot.mjs`) before every EAS build and before `npm run export:web` — requires `EXPO_PUBLIC_API_BASE` and `OPTION_LIBRARY_SNAPSHOT_SECRET` set as EAS secrets (see `lospor-app/docs/post-migration-seeds.md`); without them, the hook logs a warning and keeps whatever snapshot is already committed, rather than failing the build.

### Changed — Code quality
- `IntraopTimetable.tsx` and the intraop case screen no longer populate option-library data by mutating module-level arrays inside `useMemo`. Every category (drugs, infusions, fluids, agents, clinical events, positions, monitoring, technique tree, airway, premedication) is now a plain `useMemo`-derived value scoped to the component itself, removing the only place in this codebase doing side effects inside `useMemo`. Two dead helper functions (`findTechNode`, and web's equivalent `labelFor`) were found and removed along the way.

### Fixed
- A case closed mid-infusion (or mid-fluid, mid-agent) and reopened later now shows the running bar correctly extended to the current time, instead of frozen wherever it was at the last save — the same backend fix web got, since both apps load a case through the same endpoint.
- `package-lock.json` was still pinned at `2.1.1` despite `package.json` reading `2.3.0`.

## [2.1.1] — 2026-06-19

### Changed
- Version aligned to **2.1.1** (Android `versionCode` 8).
- Bulgarian ICD-10 diagnosis and comorbidity search now uses the shared language-aware API path and stores code-first tags with English/Bulgarian label snapshots.
- Added a Settings control to clear local clinical cache: offline drafts, queued preop/postop saves, pending intraoperative event queues, and dropped-event recovery logs.
- Settings/About now reports the current 2.1.1 release line.
- Privacy posture aligned with the web app: local offline data is explicit and user-clearable.

## [1.2.0] - 2026-06-18

### Changed
- Version aligned to **1.2.0** (Android `versionCode` 5). The v1.2 work — storing
  clinical data as queryable database rows — is entirely server-side; the app sends
  the same data and behaves identically, so there is no functional change here.

---

## [1.1.1] - 2026-06-17

### Fixed
- **Offline intraoperative events are no longer lost on a transient sign-in expiry.** A `401` while replaying queued events now keeps them for retry after you sign in again, instead of discarding them. Events the server permanently rejects (invalid, finalised, or deleted case) are recorded for visibility rather than silently dropped.
- **Unfinalize ("undo finalise") now works** — the button called the wrong HTTP method (`PATCH`) for the server, which only accepts `POST`. It now uses `POST`.

### Changed
- Android `versionCode` bumped to 4.

---

## [1.1.0] - 2026-06-15

### Added
- **Case reminders (notifications)** — opt-in reminders during an active case. When enabled, you get a "vitals due" reminder every few minutes that resets whenever you chart a set of vitals. Settings → Notifications has a toggle, an interval picker (3/5/10/15 min), a live permission-status line, and a "Send test notification" button. Native uses on-device scheduled notifications (fire even when backgrounded); the PWA uses browser notifications over HTTPS.

### Changed
- **Offline intraoperative events** now replay automatically when the connection returns (idempotency-keyed, so nothing is duplicated or lost), not only while the case screen is open.
- **Sign out** now revokes the session on the server, so a token can't be reused after logout.
- Offline "saved/discarded" sync counts are reported accurately.

### Fixed
- Infusion rate changes now show the correct rate for each time slot on the running-infusion pill (previously it kept showing the starting rate).

---

## [1.0.0-hotfix2] - 2026-06-12

### Changed
- Aligned the PWA/native registration flow with the web app by adding country selection, country-aware institution handling, password confirmation, and the full production password policy.
- Standardized registration consent on the backend-compatible `acceptedTerms` field.

### Fixed
- PWA/native account creation no longer fails with `Invalid input: expected boolean, received undefined` after accepting the Terms of Use and Privacy Policy.
- Anchored development screenshot ignore patterns to the repository root so EAS Build includes the adaptive Android icon assets during prebuild.

---

## [1.0.1] — 2026-06-09

### Added
- Swipe navigation across intraoperative sections with automatic active-tab centring.
- Persisted five-minute automatic vital events, including optional BP/HR carry-forward and background gap filling.
- FGF 0-100 L/min and FiO2 0-100% controls using the shared slider/stepper/custom-keypad input.
- O2 plus mutually exclusive Air/N2O carrier-gas selection.
- Stop or Continue postop decisions for every running volatile agent, infusion, and fluid at case end.
- Recovery SBP, DBP, HR, SpO2, and temperature controls with preop-style random initial values.

### Changed
- Technique pills now include category context.
- Ventilation mode families provide immediate feedback and switch cleanly between assisted and controlled modes.
- Mobile case summaries display current gas settings and recovery vitals.

### Removed
- Time in PACU from the postoperative workflow.

### Fixed
- Automatic vitals now reach the shared event log and web app instead of disappearing during timetable reconstruction.
- Rapid VCV/PCV and Assisted/Controlled selection no longer relies on stale rendered state.

---

## [1.0.0] — 2026-05-26

### Added

#### Authentication
- Login screen with email + password; JWT stored in `expo-secure-store`
- Automatic Bearer token injection on all API requests via `apiFetch()`
- Auth expiry detection: token refresh or sign-out prompt on 401 responses
- Secure device ID generation (stored in SecureStore with `mob-` prefix) for case presence locking

#### Dashboard
- Dashboard now defaults to **All cases**, newest first, matching the web app and showing the full accessible history
- Clinical toolbar with dashboard, new case, and settings actions
- Clickable stat cards and visible horizontal scope rail for All, Today, Month, Active, Drafts, Awaiting Postop, Complete, and Handovers
- Floating **New case** action is labelled so it is no longer an ambiguous plus-only button
- Case list with status badges (Draft / In Progress / Complete) and last-updated timestamp
- Floating action button → New case
- Pull-to-refresh

#### New Case — Preoperative Form
- Preop section dashboard summary for Patient, Case, Meds & Safety, Airway, Vitals, Risk, and Labs completion; tapping a section opens a focused editor instead of the old endless scroll
- Shared clinical number input for age, height, weight, mouth opening, thyromental distance, and other numeric clinical fields
- Decimal parsing accepts comma and dot input without saving `NaN`
- Camera/gallery AI lab scan using the web Mistral extraction endpoint, with review-before-import
- Drug/medication search results use stable keys even when duplicate labels are returned
- Form validation now reports missing fields instead of jumping back to the top on submit
- Demographics: age, sex, height, weight, blood type, Rh factor
- Live BMI, IBW (Devine formula), and ABW badges displayed alongside the weight field
- ICD-10 diagnosis and procedure tagging with search
- Comorbidities search and tag
- Allergies (allergen search + latex flag)
- Current medications search and tag
- Family anaesthesia problems flag with free-text notes
- Dental flags: prosthetics, loose teeth
- Airway feature flags: retrognathia, prominent incisors, facial hair
- Habits: smoking, substance abuse
- RCRI checkbox panel (5 factors + high-risk surgery) with live score and risk label (Very low / Low / Moderate / High)
- APFEL checkbox panel with live score and risk label (Low / Moderate / High)
- STOP-BANG checkbox panel with live score and risk label (Low / Intermediate / High)
- Airway assessment: Mallampati (I–IV with description hints), mouth opening, thyromental distance, neck mobility, Upper Lip Bite Test (with ULBT hints), Cormack-Lehane grade (with description hints), difficult airway history and notes
- **Unable to Obtain** toggle for the entire airway block — collapses all airway fields
- Vitals: BP systolic/diastolic, heart rate, SpO₂, temperature, respiratory rate
- **Unable to Obtain** toggle for the entire vitals block — collapses all vitals fields
- Lab results with searchable panel and value entry
- ASA classification (I–VI) with emergency flag
- Form validation scrolls to the top and highlights the first failing field on submit

#### Case Detail (Summary)
- Full clinical detail for all three sections (preop, intraop, postop)
- Creation date and case code in header
- Airway risk flags computed from boolean fields (difficult airway history, Mallampati III–IV, CL grade III–IV, retrognathia, prominent incisors, facial hair, ULBT Class III)
- Dedicated intraop complications section
- Action buttons: Edit preop, Edit intraop, Edit postop, Share summary, Printable protocol, AI advisor, Handover, Finalise, Delete case
- Audit log navigation shortcut

#### Edit Case (Preop)
- Pre-fills all fields from the API response
- PATCH on save with conflict detection (updatedAt header)
- Presence lock: entering the form acquires the lock; watching mode disables the save button

#### Intraop Screen
- Premedication entry: evening and morning fields with quick-select chip rows (10 common premeds each)
- Complications picker: 6 complication categories (Airway, Cardiovascular, Respiratory, Neurological, Metabolic/Other, Regional) with multi-select items per group and free-text addition; saved via PATCH
- Presence lock: form acquires lock on mount; watching mode shows amber overlay with "Take over" button; all action bar buttons exit early when watching

#### Postop Screen
- Grouped handover checklist: 8 groups (Airway, Breathing, Circulation, Neurology, Pain, Fluids, Safety & Environment, Handover Communication) with 31 checklist items total
- Collapsible accordion per group; all groups start expanded
- Checked/total counter per group header; green border when all items in group are checked
- Presence lock: watching mode disables the save button

#### Case Presence Lock (all edit screens)
- Device ID stored in SecureStore (`mob-<uuid>` prefix)
- Lock acquired on screen mount, refreshed by 15-second heartbeat, released on screen unmount
- `AppState` listener: heartbeat paused when app moves to background, lock reacquired when app returns to foreground
- `WatchingOverlay` component: amber banner with "Take over" button, rendered above all content
- Fail-open: network errors never block editing

#### Admin Screen
- Pending registration approvals (approve / reject)
- Head of Department requests
- User role management

#### Audit Log Screen
- Paginated audit event list
- Action-type filter

#### Settings
- Sign out
- Language preference (English / Bulgarian)
- Theme preference (Light / Dark / System)

#### Infrastructure
- Offline patch queue: failed saves are queued locally and flushed when connectivity is restored (`src/lib/offline-case-patches.ts`)
- Queued-save flusher on app resume (`src/lib/use-queued-save-flusher.ts`)
- Live case refresh: polling / SSE fallback so the mobile app reflects web-side changes in near-real time (`src/lib/use-live-refresh.ts`, `src/lib/use-case-live-updates.ts`)
- Shared colour palette in `src/theme/colors.ts` — all general screens use this; intraop retains a specialised dark clinical palette
- Language and theme preference context provider (`src/lib/preferences-context.tsx`)

### Fixed
- `Haptics.notificationAsync` crash on Android (dev builds without full native linking) — error silently ignored, save completes normally
- Scroll-to-top on validation failure in the preop form
