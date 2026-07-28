# LOSPOR Web App - Historical changelog before v3.0

**Release date:** 2026-06-10
**License:** AGPL-3.0
**Copyright:** Copyright (C) 2026 Kaloyan Dzhunov

---

## New Features

### Case Management

- **Three-section perioperative record** — each case consists of a Preoperative Assessment, an Intraoperative Record, and a Postoperative Record, linked to an anonymous case code (format `DDMMYYYY-NN`).
- **Case lifecycle status** — cases advance through `DRAFT в†’ IN_PROGRESS в†’ AWAITING_POSTOP в†’ COMPLETE`. Status is computed from record state and explicit user actions; it is never promoted automatically by background saves.
- **Case detail page** — read-only summary of all three sections with actions: edit preop, open intraop, open postop, share summary, printable protocol, AI advisor, finalise, delete.
- **Case transfer** — cases can be transferred between users. Transfer responses include `procedureName` for context in the transfer list.
- **GDPR design** — no patient name or national identifier is ever stored. The printable protocol renders blank lines for these fields so clinicians fill them in by hand after printing.
- **Private case notes** — a floating notes popup on each case auto-saves a private `notes` field visible only to the owner.

### Dashboard

- **Full case history by default** — the dashboard shows all accessible cases rather than only today's, matching the research-database use case.
- **Stats cards** — clickable counts for Today, This month, Active, Drafts, Awaiting postop, Complete, Handovers, and ICU filter the case list in place.
- **Scope chips** — a horizontal rail of scope filters (All, Today, Month, Active, Drafts, Awaiting postop, Complete, Handovers, ICU) sits below the stats row.
- **Search and sort** — full-text search by case code and procedure name; sortable columns.

### Preoperative Assessment Form

- **Demographics section** — age, sex, height, weight, blood type, Rh factor, with live-computed BMI, IBW (Devine formula), and ABW badges.
- **Case details** — ICD-10/ICD-11 diagnosis tags, CPT/specialty procedure tags, team notes, high-risk surgery flag, emergency surgery toggle (appends `E` to ASA class).
- **Medical history** — ICD-10/ICD-11-coded comorbidity tags grouped by body system; feeds the AI ASA suggestion.
- **Current medications** — free-text tag search backed by the Bulgarian Drug Agency (BDA) drug database (3,661 entries).
- **Clinical anamnesis** — allergy flag with allergen search, latex allergy flag, family anaesthesia problems, dental notes, smoking (feeds APFEL), substance abuse.
- **Risk scores** — live-updating RCRI (0–6), APFEL (0–4), and STOP-BANG (0–8) cards with colour-coded risk bands (green/amber/red). Inputs auto-derived where possible from other sections.
- **Vitals** — SBP, DBP, HR, SpOв‚‚, temperature, respiratory rate; each field has an "Unable to Obtain" toggle that suppresses required-field validation.
- **Airway assessment** — Mallampati, mouth opening, thyromental distance, neck mobility, ULBT, Cormack-Lehane, feature flags (retrognathia, prominent incisors, facial hair, difficult airway history). Full block can be marked Unable to Obtain.
- **Lab results** — searchable panel (в‰Ґ 2-char query) covering haematology, biochemistry, ABG, and microbiology; values highlighted outside reference intervals.
- **ASA class selector** — with AI-powered advisory suggestion based on comorbidity tags and BMI (Mistral, EU-hosted; informational only, not a medical device).
- **Auto-save** — form auto-saves 1.5 seconds after the last change.
- **Validation** — scroll-to-error on submit; required fields highlighted with a red ring.

### Intraoperative Form and Timetable

- **Timing** — month/year, start time (floored to nearest 5 min), end time (with next-day toggle), auto-computed duration.
- **Anaesthesia technique tree** — hierarchical multi-select covering General (GA ETT, GA LMA, TIVA), Neuraxial (Spinal, Epidural, CSE, DPE with level selectors), Peripheral blocks (Upper/Lower limb, Trunk, Head & Neck, Ophthalmic), Sedation, Local, Other.
- **Volatile agent and fresh gas** — volatile agent selector (Sevoflurane, Desflurane, Isoflurane); FGF 0–100 L/min; carrier gas (Oв‚‚ always present; Air and Nв‚‚O mutually exclusive); FiOв‚‚ 0–100%. Legacy separate Oв‚‚/Nв‚‚O columns retained for backward compatibility.
- **Patient position** — 15 preset positions across 5 groups; multiple selections allowed.
- **Monitoring cards** — 18 monitors in 4 groups (Standard, Haemodynamic, Depth/Neuro, Other). Selecting a monitor adds its vital row to the timetable.
- **Airway management** — device, tube size, cuff state, PEEP, ventilation mode, airway tools, Cormack-Lehane, double-lumen tube details, endobronchial blocker size.
- **Vascular access tree** — Arterial (6 sites), Peripheral IV (size, site), PICC (3 sites, Fr, depth), Central line (5 sites, Fr, depth from skin).
- **Fluid balance** — crystalloids, colloids, blood, blood product notes, urine output.
- **Preop summary card** — compact amber card above the timetable: ASA, BMI, IBW, ABW, vitals, Mallampati, difficult airway flag, allergy summary, comorbidities, abnormal labs.
- **Equipment suggestions card** — recommended ETT size/depth, LMA size, tidal volume, maintenance fluid rate, catheter sizes, monitoring sizes — all derived from preop demographics.

### IntraopTimetable

- **5-minute grid** — each column represents 5 minutes; default 60-minute view (12 columns); auto-expands as the clock advances.
- **Live now-line** — orange marker advances every 10 seconds; selected column follows automatically.
- **Drug boluses** — side panel quick-pick or in-cell picker; IBW-pre-filled bolus slider for 28 common drugs; dose entry (mg/mcg/ml/other); drag to move, Del to delete, в†’ to copy, keyboard shortcuts.
- **Infusions** — continuous colour bar with rate-change markers; total cumulative dose shown; Stop at any column.
- **Fluids** — 12 fluid types as continuous colour bars; total volume summarised.
- **Volatile agent bar** — continuous bar per agent; switching agents auto-stops the previous.
- **Vitals rows** — BP (stacked bar), HR, SpOв‚‚, EtCOв‚‚, temperature; rows appear based on selected monitors.
- **Auto-fill vitals** — when the clock advances, carries forward EtCOв‚‚, SpOв‚‚, and temperature if the new column is empty. Secondary toggle also carries forward SBP, DBP, and HR.
- **SVG chart view** — toggle between grid and SVG line/bar chart views (Y-axis 40–220 mmHg).
- **Undo / Redo** — Ctrl+Z / Ctrl+Shift+Z.
- **Full keyboard navigation** — Del, в†’, в†ђ, Tab, 0–9, Esc.

### Postoperative Form

- **Modified Aldrete score** — five domains (Activity, Respiration, Circulation, Consciousness, SpOв‚‚), each 0–2, auto-totalled.
- **Recovery vitals** — SBP, DBP, HR, SpOв‚‚, temperature (each with shared vital stepper/slider control).
- **Pain and PONV** — NRS 0–10 and PONV yes/no flag.
- **Disposition** — Ward, PACU, ICU with free-text notes.
- **Handover checklist** — 8 collapsible groups (Airway, Breathing, Circulation, Neurology, Pain, Fluids, Safety & Environment, Handover Communication), 28 items total. Group border turns green when all items are checked. Auto-saves 1 second after last change.
- **Complications** — free text up to 2,000 characters.

### Admin Panel and Audit Logs

- **Admin approval flow** — new user registrations require admin approval (`approvedAt` on User). Admin panel shows pending registrations, HOD requests, and role assignments.
- **Audit log** — all significant actions are recorded in the `AuditLog` table (user, action, affected entity, optional JSON detail, timestamp). Admin panel shows a paginated, filterable audit event list.
- **Role management** — admin can assign and revoke roles from the admin panel.

### AI Advisor

- **ASA suggestion** — advisory ASA class suggestion based on comorbidity tags and BMI; shown as a prompt, never overrides the clinician's choice.
- **Lab scan** — mobile camera/gallery upload of lab reports; Mistral vision API extracts values for review before import.
- **Data protection (GDPR-oriented design)** — all AI features use Mistral AI (EU-hosted) exclusively. US providers (Groq, OpenAI, Anthropic API) are not used. A data-handling disclosure is shown in the UI whenever data is sent to AI. Lab scan includes an explicit instruction to crop patient identifiers before upload.

### ICD-11 Bulgarian Translation

- **ICD-11 search** — diagnosis search serves ICD-11 codes with English labels via the WHO ICD API.
- **Bulgarian translation** — `Icd11Code` table caches translated Bulgarian labels. `Icd11Alias` table stores Bulgarian search terms mapped to translated English terms, enabling Bulgarian-language ICD-11 search without round-tripping to the WHO API.

### OMOP CDM Export

- Database schema includes OMOP CDM–compatible fields to support future export of de-identified perioperative data for research.

### Printable Protocol

- **Print layout** — all three form sections rendered as a clean A4 printable document. Patient name and ID fields rendered as blank lines for handwritten completion (GDPR design).

### Security and Compliance

- **Rate limiting** — per-endpoint: register (5/hr/IP), login (10/15 min/email), AI (20/hr/user), ICD (120/min/user), custom terms (30/hr/user).
- **Session invalidation** — JTI blocklist in `src/lib/token-blocklist.ts`; 8-hour token max-age.
- **Security headers** — X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP.
- **Block edits on COMPLETE cases** — PATCH on a finalised case returns 403.
- **Institution-scoped custom terms** — CustomTerm entries can be scoped to an institution.

### Mobile Sync and Presence Lock

- **Bearer token auth** — `POST /api/auth/token` issues a JWT for mobile clients; `getAuthUser(req)` checks Bearer token first, falls back to NextAuth cookie session. All 23+ protected API routes support both.
- **Mobile alias mapping** — `src/app/api/cases/_mappers.ts` maps mobile field aliases to canonical DB field names before persistence.
- **Conflict detection** — preop/postop PATCH requests from mobile include `x-lospor-preop-updated-at` / `x-lospor-postop-updated-at` headers. If the server record is newer, the server returns 409 and the client must reload before saving.
- **Case presence lock** — `CaseLock` model (30-second TTL, renewed every 15 seconds). If a case is open on another device, that device enters Watching mode (inputs disabled, amber banner). "Take over" force-releases the lock.
- **Live refresh** — `GET /api/cases/[id]/stream` (SSE) and `GET /api/cases/[id]` (polling fallback) allow mobile and web to see each other's changes in near-real time.

---

## Improvements

- **Procedure search** (`/api/search/procedures`) — returns PCS entries; web displays `group` as the primary label and `code · domain` as supporting text.
- **Transfer list context** — transfer pending responses include `procedureName` so the mobile transfer list shows useful case context.
- **Dark mode** — full dark mode with toggled localStorage persistence. Card selectors (sex, blood type, Rh, ASA) use solid colour when selected in dark mode.
- **ICD-10 Bulgarian** — `Icd10BgCode` table provides Bulgarian labels for legacy ICD-10 diagnoses.
- **Custom terms** — clinicians can create institution-scoped custom procedure/diagnosis terms when standard codes do not cover their workflow.

---

## Bug Fixes

- **Awaiting allocation status fix** — `computeNextStatus` no longer promotes `DRAFT в†’ IN_PROGRESS` unless `intraop.startTime` is a valid HH:MM value. Previously, mobile intraop load caused a background autosave that created a DB record, which in turn made the dashboard show the case as "In Theatre" before the clinician had started it. `computeStatus` in the dashboard now checks `status === "IN_PROGRESS"` rather than `c.intraop != null`.
- **Sentinel startTime fix** — `mapIntraopUpdate` in `_mappers.ts` only writes `startTime` to the database when the payload contains a valid HH:MM string, preventing a zero-length or placeholder value from being persisted on first save.
- **Duplicate vitals fix** — clicking a filled timetable cell no longer adds a duplicate vital event. The vitals modal now detects an existing vital at the same 5-minute column, pre-fills its values, and replaces the old event on confirm (remove + insert at same timestamp). Modal title changes to "Change vitals" when replacing.

---

## Technical

### Database Schema Additions

Migration `20260609000000_intraop_gas_and_recovery_vitals`:

**Added columns — IntraoperativeRecord:**
- `fgfLitersPerMin Float?` — fresh gas flow in L/min (0–100)
- `carrierGas String?` — `"air"` or `"n2o"` (Oв‚‚ always implicit)
- `fio2Percent Float?` — inspired oxygen fraction (0–100)

**Removed column — IntraoperativeRecord:**
- `timeInRecoveryMin` — removed from IntraoperativeRecord (was previously a legacy field; PACU time is no longer collected)

**Added columns — PostoperativeRecord (recovery vitals):**
- `recoveryBpSystolic Int?` — systolic BP in recovery
- `recoveryBpDiastolic Int?` — diastolic BP in recovery
- `recoveryHeartRate Int?` — heart rate in recovery
- `recoverySpO2 Float?` — SpOв‚‚ in recovery
- `temperatureCelsius Float?` — temperature in recovery

**New model — Icd11Alias:**
- `id` — auto-increment primary key
- `bgTerm String` — Bulgarian search term
- `enTerm String` — mapped English term
- `createdAt DateTime`

**startTime non-nullable guarantee** — `startTime DateTime` on `IntraoperativeRecord` remains non-nullable in the schema but is only set to a meaningful value when the user explicitly starts the case via "Start now" or "Start at". Background saves and mobile initial loads do not write this field.

### API Contract

- Gas fields use canonical names `fgfLitersPerMin`, `carrierGas`, `fio2Percent`. Legacy `n2oPercent`, `o2Percent`, `n2oLitersPerMin`, `o2LitersPerMin` columns remain readable for backward compatibility with older records.
- Recovery vitals use `recoveryBpSystolic`, `recoveryBpDiastolic`, `recoveryHeartRate`, `recoverySpO2`, `temperatureCelsius`. `timeInRecoveryMin` is dropped from all payloads, summaries, and generated protocols.

### Mobile Architecture Notes

- `if (!silent)` guard pattern — all editable-form-field setters in `loadCase` are wrapped with `if (!silent) { ... }` so that silent 15-second live-refresh reloads do not clobber in-progress user edits.
- `gasInitializedRef` / `awInitializedRef` — each autosave effect in the intraop screen skips its first fire after `caseLoaded` becomes true, preventing a premature DB record being created on initial load.
- Any new form field with an autosave effect must follow the same two-part pattern: (1) guard the setter in `loadCase` with `if (!silent)`, (2) add a `*InitializedRef` skip in the autosave effect.
