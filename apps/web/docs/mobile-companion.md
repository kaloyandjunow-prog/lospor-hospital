# Mobile Companion App

The LOSPOR mobile companion (LOSPOR Mobile) is an Expo / React Native app that gives clinicians access to core LOSPOR functionality from an Android or iOS device.

---

## Architecture

The mobile app is a thin client — it has no local database. All data is read from and written to the same PostgreSQL database as the web app, via the LOSPOR web API.

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 56 (React Native) |
| Routing | expo-router (file-based, mirrors Next.js App Router) |
| Styling | NativeWind v4 (Tailwind class names on RN components) |
| Auth | Bearer JWT stored in `expo-secure-store` |
| Forms | react-hook-form + Zod v4 |

---

## Authentication

1. `POST /api/auth/token` with email + password → JWT (8-hour expiry, same secret as web)
2. Token stored in SecureStore under `lospor_access_token`
3. Every `apiFetch()` call sends `Authorization: Bearer <token>`
4. 401 responses trigger a sign-out / token-refresh prompt

No cookies are used. The app works entirely with Bearer token auth.

---

## API sync contract

Mobile payloads use the same canonical field names as the web app. Where legacy or abbreviated field names are sent, `src/app/api/cases/_mappers.ts` on the server side maps them to the canonical DB fields before persistence.

Conflict detection: section PATCH requests include the `x-lospor-preop-updated-at` / `x-lospor-postop-updated-at` / `x-lospor-intraop-updated-at` headers. A stale header gets a 409 with the server's current timestamp; the client **self-heals once** by adopting that timestamp and retrying (v5 shared engine), so a stale write never silently overwrites newer data and rarely needs user action. Since v5 the guard also applies to the *same* user on two devices/tabs. Saves are field-level: only changed fields are PATCHed, so edits to different fields merge cleanly.

---

## Offline support

Failed saves are queued locally through the shared sync engine in `@lospor/core/sync` (the historical entry point `src/lib/offline-case-patches.ts` remains as a thin adapter, with unchanged storage keys). The queue is flushed automatically when connectivity is restored — with backoff while the server stays unreachable and an immediate retry on reconnect/foreground. The UI shows a "queued" indicator while saves are pending.

---

## Live refresh

The app polls `GET /api/cases/[id]/version` for lightweight change detection and reloads `GET /api/cases/[id]` only when the version stamp changes. There is no push subscription in the current production live-refresh path.

---

## Case presence lock

When a case is open for editing in the mobile app, it acquires a server-side lock (30-second TTL, renewed every 15 seconds). If the same case is opened on another device simultaneously, that device enters **Watching** mode — all edit inputs are disabled and an amber banner is shown. The watching device can tap "Take over" to force-release the existing lock and acquire it.

The mobile lock uses `expo-secure-store` for the device ID (prefixed `mob-`) and React Native's `AppState` API to pause the heartbeat when the app goes to the background, reacquiring on foreground return.

---

## Screens

| Screen | Path | Notes |
|--------|------|-------|
| Login | `/(auth)/login` | |
| Dashboard | `/(app)/index` | Case list, FAB → new case |
| Case detail | `/(app)/cases/[id]` | Read-only summary, all three sections |
| New case (preop) | `/(app)/cases/new` | Full preop form with IBW/ABW badges and risk scores |
| Edit case (preop) | `/(app)/cases/edit/[id]` | Pre-filled preop form, presence lock |
| Intraop | `/(app)/cases/intraop/[id]` | Premedication, complications, presence lock |
| Postop | `/(app)/cases/postop/[id]` | Aldrete, grouped handover checklist, presence lock |
| Settings | `/(app)/settings` | Sign out, language, theme |
| Audit logs | `/(app)/audit-logs` | Paginated audit event list |
| Admin | `/(app)/admin` | Pending registrations, HOD requests, roles |

## Intraoperative mobile behaviour

- Swipe left or right across the intraoperative content to change sections.
- The active section automatically scrolls into the centre of the section rail, including the first and last sections.
- Automatic vitals creates real five-minute vital events through the shared events API.
- Assisted and controlled ventilation groups provide immediate selection feedback and use mutually exclusive mode families.
- Gas entry uses FGF 0-100 L/min, O2 plus either Air or N2O, and FiO2 0-100%.
- Ending a case with active agents, infusions, or fluids requires a Stop or Continue postop decision for every running item.

---

## Design principles

- **Dark clinical theme** on the intraop screen — optimised for a tired anaesthesiologist at 2 AM. Large touch targets, minimal reading burden, obvious state.
- **Shared palette** (`src/theme/colors.ts`) on all other screens for visual consistency with the web app.
- **No patient identifiers** — the mobile app applies the same GDPR design as the web app. Case codes are used throughout; name and ID fields are never collected digitally.

---

## Building for Android

First-time native build (installs APK on emulator or device):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "C:\Users\<username>\AppData\Local\Android\Sdk"
npx expo run:android
```

Gradle version pinned to **8.13** in `android/gradle/wrapper/gradle-wrapper.properties`.

Subsequent JS-only updates (no native code change):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\<username>\AppData\Local\Android\Sdk"
npx expo start --android
```

---

## Local development

1. Start the web API: `npm run dev` in `lospor-app` (port 3000)
2. Set `.env.local` in `lospor-mobile`: `EXPO_PUBLIC_API_BASE=http://<your-LAN-IP>:3000`
3. Start Metro: `npx expo start` in `lospor-mobile`
4. Open the app on device/emulator — it connects to the local API

TypeScript check: `npx tsc --noEmit --pretty false` in `lospor-mobile`.
