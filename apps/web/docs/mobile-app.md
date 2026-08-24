# LOSPOR Mobile App

The LOSPOR mobile app (lospor-mobile) gives clinicians access to core LOSPOR functionality from an Android or iOS device. It is a thin client — it has no local database. All data is read from and written to the same PostgreSQL database as the web app, via the LOSPOR web API.

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 56 (React Native) |
| Routing | expo-router (file-based, mirrors Next.js App Router) |
| Styling | NativeWind v4 (Tailwind class names on RN components) |
| Auth | Bearer JWT stored in `expo-secure-store` |
| Forms | react-hook-form + Zod v4 |
| Animations | react-native-reanimated v4 + react-native-worklets |

The app uses `expo-dev-client` instead of Expo Go — SDK 56 is not supported by the Play Store version of Expo Go.

**Key config:**
- Android package: `org.lospor.mobile`
- API base URL: `EXPO_PUBLIC_API_BASE` env var (defaults to `https://app.lospor.org`)
- `.npmrc` requires `legacy-peer-deps=true` (expo-router pulls react-dom@19.2.6 while the project pins react@19.2.3)
- `nativewind-env.d.ts` must exist in the project root to add className types to React Native components

---

## Authentication Flow

1. `POST /api/auth/token` with email + password receives a JWT (8-hour expiry, same secret as the web app).
2. Token is stored in SecureStore under `lospor_access_token`.
3. Every `apiFetch()` call in `src/lib/api.ts` sends `Authorization: Bearer <token>`.
4. 401 responses trigger a sign-out and prompt the user to re-authenticate.

No cookies are used. The app works entirely with Bearer token auth.

**Relevant files:**
- `src/lib/api.ts` — API client with Bearer token injection and 401 handling
- `src/lib/auth-context.tsx` — AuthProvider and `useAuth` hook

---

## Screens

| Screen | File | Notes |
|--------|------|-------|
| Login | `app/(auth)/login.tsx` | Email + password, issues Bearer JWT |
| Dashboard | `app/(app)/index.tsx` | Case list, clickable stats, scope rail, FAB → new case |
| Case detail | `app/(app)/cases/[id].tsx` | Read-only summary, all three sections, action buttons |
| New case (preop) | `app/(app)/cases/new.tsx` | Full preop form, presence lock, IBW/ABW badges, risk scores |
| Edit case (preop) | `app/(app)/cases/edit/[id].tsx` | Pre-filled preop form, presence lock |
| Intraop | `app/(app)/cases/intraop/[id].tsx` | Timetable, gas, airway, monitoring, swipe tabs, end-case flow |
| Postop | `app/(app)/cases/postop/[id].tsx` | Aldrete, recovery vitals, grouped handover checklist, presence lock |
| Settings | `app/(app)/settings.tsx` | Sign out, language, theme |
| Audit logs | `app/(app)/audit-logs.tsx` | Paginated audit event list |
| Admin | `app/(app)/admin.tsx` | Pending registrations, HOD requests, roles |

---

## Preop Form

### Layout

The preop form is a single scrollable view. A universal `AppHeader` sits at the top; it collapses on vertical scroll. A sticky secondary section rail below the header shows section pills: Patient, Case details, Medical History, Current Meds, Anamnesis, Physical Exam, Airway, Labs, Risk. The active pill auto-centres in the rail. A section-aware side scroll rail appears on the right edge while the user is scrolling.

On submit failure, the form scrolls to the first invalid section and highlights it with a red ring.

### Numeric Entry — Wheel Pickers

Non-vital clinical numbers (age, height, weight, airway distances) use `ClinicalNumberInput` — an iOS-alarm-style inline wheel picker that appears anchored to the tapped field and saves on outside tap. A `123` custom keypad option is available instead of the OS numpad (comma/dot decimals accepted, no NaN).

**Weight wheel** — non-uniform increments: 0.5 kg steps up to 20 kg, then 1 kg steps above 20 kg.

### Numeric Entry — VitalStepper

Preop vitals (SBP, DBP, HR, SpO₂, temperature, respiratory rate) use `VitalStepper` (defined in `app/(app)/cases/new.tsx`): web-like `−  value  +` layout, hold-to-repeat buttons, a thin slider, and a custom keypad when the number is tapped. This mirrors the web `NumberStepper` pattern.

### Search Fields

Diagnosis, procedure, medication, and allergen fields use `SearchTagInput` (`src/components/SearchTagInput.tsx`) — an inline dropdown autocomplete. Full-screen modal/sheet search has been removed.

**Procedure display mapping:** the `/api/search/procedures` endpoint returns PCS entries. The mobile autocomplete displays `group` as the primary label and `code · domain` as supporting text, matching the web app. The raw `description` field is not used as the primary label.

Medication/search chips use stable keys to avoid duplicate-label warnings from drug search results.

### Lab Scan

`LabScanPanel` (`src/components/LabScanPanel.tsx`) adds camera/gallery lab report scanning. Images are sent to the configured Mistral vision API. Extracted values are shown for review before being imported into the labs section. A GDPR warning instructs the user to crop patient identifiers before uploading.

`expo-image-picker` is a native module and must be included in the APK build. The panel uses a lazy `require()` wrapped in try-catch so that an older APK (built before the panel was added) degrades gracefully with a "not available" alert rather than crashing.

---

## Intraop Screen

### Overview

The intraop screen is the most important mobile UX surface. It is designed for a tired anesthesiologist at 2 AM: fast, thumb-friendly, minimal reading burden, obvious state, no hunting. It intentionally uses a specialized dark clinical colour palette rather than the shared app palette — do not blindly convert intraop colours to the global palette without a focused redesign pass.

### Navigation

The intraop content is divided into tabs navigated by horizontal swipe or by tapping the section rail. The active tab auto-centres in the rail. Tabs include: Timing, Technique, Gas & Airway, Monitoring, Vascular Access, Fluids, Drugs, Timetable, Complications.

### Timetable

The timetable is a 5-minute-per-column timeline covering the full case duration.

- **Now-line** — an orange marker advances every 10 seconds, always visible.
- **Vitals lane** — rows for BP (systolic/diastolic), HR, SpO₂, EtCO₂, temperature. Rows appear based on which monitors are selected. Tapping a filled vitals cell opens a "Change vitals" modal that replaces the existing event (no duplicates).
- **Drugs lane** — bolus pills per column; tap to add, drag to move, Del to remove, → to copy, 0–9 to enter dose. IBW-pre-filled doses for 28 common drugs.
- **Infusions lane** — continuous colour bars; add drug, rate, and unit; stop at any column; rate-change markers.
- **Fluids lane** — 12 fluid types as continuous colour bars; total volume summarised.
- **Agent bar** — inhalational agent (Sevo/Des/Iso) as a continuous bar; switching agents auto-stops the previous.
- **Events lane** — clinical events recorded against a column timestamp.

Automatic vitals (auto-fill) are persisted as `vital` events through `/api/cases/[id]/events` — they are never stored only as local timetable state.

### Gas Settings

Gas entry uses `VitalStepper` controls:
- FGF: 0–100 L/min
- Carrier gas: O₂ always present; Air and N₂O are mutually exclusive
- FiO₂: 0–100%

These map to the canonical fields `fgfLitersPerMin`, `carrierGas`, and `fio2Percent`.

### Airway

Airway section: device picker, tube size, cuff toggle, PEEP stepper, ventilation mode toggles (Assisted and Controlled groups are mutually exclusive). Ventilation mode toggles use the functional state updater to prevent rapid-tap stale-state bugs.

### Monitoring

18 monitor cards in 4 groups, matching the web app. Selecting a monitor adds the corresponding vital row to the timetable.

### End-Case Flow

Ending a case when agents, infusions, or fluids are still running requires the user to explicitly Stop or Continue-postop each running item before the case can be finalised.

### Autosave Guards

Two patterns prevent premature DB record creation and live-refresh clobbering edits:

1. **`if (!silent)` guard** — all editable form-field setters in `loadCase` are wrapped with `if (!silent) { ... }`. Silent 15-second live-refresh reloads only update read-only state (log, timetable, case info, active infusions/fluids/agent) and never overwrite the user's in-progress edits.
2. **`*InitializedRef` skip** — `gasInitializedRef` and `awInitializedRef` each cause their autosave effect to skip the first fire after `caseLoaded` becomes true, preventing a premature intraop DB record on initial load.

Any new form field with an autosave effect must follow both patterns: guard its setter in `loadCase` with `if (!silent)`, and add a `*InitializedRef` skip in the autosave effect.

---

## Postop Screen

- **Modified Aldrete score** — five domains, each 0–2, auto-totalled.
- **Recovery vitals** — SBP, DBP, HR, SpO₂, temperature using shared `VitalStepper` controls. The time-in-PACU field has been removed.
- **Handover checklist** — 8 collapsible groups matching the web app. Each group shows a checked/total counter; border turns green when complete.
- **Pain NRS and PONV** — NRS 0–10 and PONV yes/no flag.
- **Disposition** — Ward, PACU, ICU with notes.

---

## Sync Architecture

### API Contract

Mobile payloads use the same canonical field names as the web API. Where abbreviated aliases are sent, `src/app/api/cases/_mappers.ts` (in lospor-app) maps them to canonical DB fields before persistence. The single source of truth is the web API and PostgreSQL database.

### Conflict Detection

Section PATCH requests include `x-lospor-preop-updated-at` / `x-lospor-postop-updated-at` / `x-lospor-intraop-updated-at` headers. If the server record was updated after the header timestamp, the server returns 409 with its current timestamp and the client **self-heals once** — it adopts the server timestamp and retries (shared conflict-retry engine, v5). Since v5 the guard also protects the same user editing on two devices/tabs. Saves are field-level (only changed fields are sent), so concurrent edits to different fields merge instead of conflicting. This prevents stale edits from silently overwriting newer data.

### Offline Queue

Failed saves are queued locally through the shared sync engine (`@lospor/core/sync`: outbox with merge-on-queue, crash-recovery reconcile, and retry backoff). The queue is flushed automatically and in order when connectivity is restored. The UI shows a "queued" indicator when saves are pending.

**Relevant files:**
- `@lospor/core/src/sync/` — shared engine (outbox, per-case write queue, conflict retry, batcher)
- `src/lib/offline-case-patches.ts` — thin adapter over the engine (historical entry point; storage keys unchanged)
- `src/lib/use-queued-save-flusher.ts` — flusher hook

### Live Refresh

The app polls `GET /api/cases/[id]/version` for lightweight change detection and reloads `GET /api/cases/[id]` only when the version stamp changes. There is no push subscription in the current production live-refresh path.

**Relevant files:**
- `src/lib/use-live-refresh.ts`
- `src/lib/use-case-live-updates.ts`

---

## Case Presence Lock

When a case is open for editing, the app acquires a server-side `CaseLock` (30-second TTL, renewed every 15 seconds via `src/lib/use-case-lock.ts`). If the same case is opened on another device, that device enters Watching mode — all edit inputs are disabled and an amber banner (`src/components/WatchingOverlay.tsx`) is shown. The user can tap "Take over" to force-release the existing lock.

The device ID is stored in SecureStore with a `mob-` prefix. React Native's `AppState` API pauses the heartbeat when the app goes to the background and reacquires the lock on foreground return.

---

## Bulgarian Translation

### System

The app uses a two-function translation system:
- `t(key)` — looks up a key in the active locale's translation file
- `tc(key)` — capitalises the first character of the returned string

Translation files live in `src/lib/i18n/` (or equivalent locale directory). The active locale is stored via the preferences context in `src/lib/preferences-context.tsx`.

### Adding New Strings

1. Add the key-value pair to the English locale file.
2. Add the matching key-value pair to the Bulgarian locale file.
3. Use `t("your.key")` in the component; wrap in `tc()` if the string appears at the start of a sentence or label.

### Coverage

General app screens (dashboard, settings, admin, audit logs, case detail) have translation coverage. Deep clinical form labels are mostly English; full localisation of form fields is a separate future pass.

---

## Design System

- **Dark clinical theme** — used on the intraop screen. Optimised for low-light clinical environments. Large touch targets, high contrast, minimal reading burden.
- **Shared palette** — `src/theme/colors.ts` provides semantic colour tokens used on all other screens (dashboard, settings, admin, audit logs, case detail, postop). Do not use hardcoded `#111111`, slate, or blue values on general screens.
- **App header** — `AppHeader` is the universal header across all app screens. On preop/intraop/postop/summary screens the New Case button is hidden but Home and Settings links remain.
- **No patient identifiers** — the mobile app applies the same GDPR design as the web app. Case codes are used throughout; name and ID fields are never collected digitally.

---

## Building and Running

### Android Emulator — First Native Build

Set the following environment variables, then run:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "C:\Users\<username>\AppData\Local\Android\Sdk"
npx expo run:android
```

The first build takes approximately 50 minutes. The Gradle wrapper is pinned to **8.13** in `android/gradle/wrapper/gradle-wrapper.properties`. `android/local.properties` must contain `sdk.dir=C\:\\Users\\<username>\\AppData\\Local\\Android\\Sdk`.

### Android Emulator — JS-Only Updates

After a native APK is already installed on the emulator, JS-only changes do not require a full rebuild:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\<username>\AppData\Local\Android\Sdk"
npx expo start --android
```

### Local Development Setup

1. Start the web API: `npm run dev` in `lospor-app` (port 3000).
2. Set the API base URL in `lospor-mobile/.env.local`: `EXPO_PUBLIC_API_BASE=http://<LAN-IP>:3000`.
3. Start Metro: `npx expo start` in `lospor-mobile`.
4. Open the app on device or emulator — it connects to the local API.

**When the machine IP changes**, update all three locations together:
- `lospor-app/.env` — `NEXTAUTH_URL`
- `lospor-app/next.config.ts` — `allowedDevOrigins` array and `connect-src` in the CSP header
- `lospor-mobile/.env.local` — `EXPO_PUBLIC_API_BASE`

Missing any one of these breaks local connectivity and can cause credentials to appear in the login URL.

### TypeScript Check

```powershell
npx tsc --noEmit --pretty false
```

Run this in `lospor-mobile` after any code change. Run it in `lospor-app` as well after any API or sync-contract change.

### EAS Build

EAS project ID: `4b87b715-f0c9-4c6f-b40c-4ade6693b77d`
EAS project name: `kaloyandzhunov/lospor-mobile`

---

## Known Architectural Notes

- **`crypto.randomUUID()` is not available on plain HTTP** — always use a `getRandomValues`-based fallback for generating IDs. `randomUUID()` is only available in secure contexts (HTTPS or localhost).
- **`expo-image-picker` requires a native build** — `LabScanPanel` uses lazy `require()` so an older APK degrades gracefully. After adding any new native module, a full `npx expo run:android` rebuild is required.
- **Intraop dark clinical palette** — the intraop screen intentionally keeps hardcoded dark clinical colours. Do not convert them to the global palette without a dedicated redesign pass.
- **`if (!silent)` guard pattern** — any new autosave effect on the intraop screen must guard its corresponding `loadCase` setter with `if (!silent)` and include a `*InitializedRef` skip on the first load. See the gas and airway autosave effects for the reference implementation.
