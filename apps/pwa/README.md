# LOSPOR Mobile

LOSPOR Mobile is the Expo and React Native client for the Large Open Source
Perioperative Register.

Copyright (C) 2026 Kaloyan Dzhunov.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the [GNU AGPL](LICENSE) for details.

Third-party packages and assets retain their respective copyright and license
terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Localization

Mobile and PWA support Bulgarian and English, with Bulgarian as the safe
first-run fallback. The login selector is always visible; its selection is sent
with authentication and stored in the account's `preferences.ui.locale` for
subsequent app sessions. The locale precedence, cross-repository dependencies,
medication-guidance boundary, and locked medical-terminology rules are tracked
in [docs/localization-bg-review.md](docs/localization-bg-review.md).

## Authentication boundary

The PWA calls `/v1` on its own origin and uses the API-issued HttpOnly,
SameSite session cookie. It never stores or reads a bearer token in
localStorage, IndexedDB, the Cache API, or the service worker. The public
deployment provides the same-origin proxy in `vercel.json`; the Hospital
appliance provides it through Caddy. Android and iOS instead use the native
token endpoint and keep the bearer token in `expo-secure-store`.

Before showing a credential or account-recovery form, native Mobile and the PWA
read the shared `authentication` capability contract. Public deployments use
`loginIdentifier: EMAIL`, self-registration, and email recovery. A Hospital
appliance can instead require `loginIdentifier: USERNAME`, disable
self-registration, and direct recovery to the local administrator. Username
requests contain `username` only—there is no email fallback—and a missing,
partial, contradictory, or unknown authentication contract disables the forms.
The only compatibility path is the exact older public email-recovery contract;
its explicit self-registration setting is preserved.

Hospital usernames are 3–64 ASCII characters, begin with a Latin letter, and
contain only Latin letters, digits, `.`, `_`, or `-`. Spaces, `@`, `/`, `\`, and
control characters are rejected. The client preserves the entered case while
the API matches and enforces uniqueness case-insensitively. This restriction
applies only to the sign-in identifier; account display names remain Unicode
and may use Cyrillic.

When a deployment requires administrator MFA, credential login returns a
five-minute one-use continuation instead of a session. Mobile/PWA supports
first-use TOTP enrollment through an authenticator link or manual key and later
sign-in with a six-digit authenticator code or one recovery code. Setup secrets
and continuations remain in memory. Enrollment cannot finish until exactly ten
API-issued recovery codes are displayed and the administrator confirms that
they were saved; the PWA receives only its HttpOnly cookie and native Mobile
stores only the validated bearer result in `expo-secure-store`.

Legal links in an exported PWA resolve against the current browser origin, so
an appliance opens its own `/terms` and `/privacy` pages and displays the same
exact `LOCAL_HOSPITAL` documents accepted by registration. Native builds may
set `EXPO_PUBLIC_WEB_BASE`; the public mobile distribution otherwise uses the
public Web origin.

If a PWA reload happens while fully offline, it cannot inspect the HttpOnly
cookie to prove the session is still valid, so it fails closed at sign-in while
retaining unsent local work. An already-open authenticated screen can continue
its offline workflow until the API later gives an authoritative 401. Sign-out
does not clear queued clinical data unless server-side cookie expiry succeeds
and the clinician has accepted the unsynchronised-work warning.

Heads of department receive a Settings link to the institution-membership
request queue they are authorized to decide. That route does not expose the
administrator-only registration, role, user, or audit controls; the API still
restricts each HOD to requests for their own institution.

The administrator-only audit screen consumes the action catalog returned by
`GET /v1/admin/audit-logs`. It uses the exact API-supplied Bulgarian or English
label for every row and searchable action filter. Malformed catalog entries
fail closed, while an unknown historical action remains visible under its raw
stable code so evidence is never silently dropped.

## Deployment capabilities

The clinical advisor, laboratory-image reader, and monitor-screen scanner are
shown only when `/v1/capabilities` explicitly enables the corresponding
external-AI capability. Missing, malformed, or unreachable capability data is
treated as disabled. A mounted client refreshes the Status-backed contract every
15 seconds and when the app returns to the foreground. Manual laboratory and
vital-sign entry remains available in every deployment.

New Pediatric case selection follows the same authoritative capability
response. Mobile/PWA accepts it only when `features.pediatricMode` is a complete,
production-ready, clinically reviewed contract and the declared minimum client
version is compatible; missing or malformed data fails closed. If an existing
case is already `PEDIATRIC`, its Pediatric fields remain visible after
disablement and the preoperative screen explains that Pediatric changes cannot
be sent until the installation enables the mode again.

## Local help and support

Settings opens version-matched help bundled into Mobile/PWA, so the essential
case, save, offline, reminder, account, and privacy instructions do not depend
on a public documentation site. The public site remains an optional secondary
link.

An installation may advertise one support destination through the public
`support` field of `/v1/capabilities`. The client accepts only HTTPS without
embedded credentials/fragments or a single bare `mailto:` mailbox and fails
closed for malformed responses. **Report a bug** builds a preview containing
only app/client version, platform, locale, connection mode, bounded request
status/timestamps, queued-save/event counts, and performance-sample count. It
never includes patients, cases, clinical values, account/institution identity,
tokens, or free text. The report is copied, shared, or inserted into a mail
draft only after the clinician presses the corresponding action; it is never
sent automatically.

PWA reminders are foreground-only. They stop when the PWA or active case
screen is closed. Native on-device reminder behavior remains separate.

## Hidden medications

An effective clinical ruleset may hide a canonical bolus drug or infusion from
routine use. Mobile and its PWA export remove that item from scenarios,
favourites, and ordinary browse lists. A clinician who explicitly types its
name can still document what was actually administered, but only through an
empty manual-entry surface. That surface intentionally contains no calculated
dose/rate, quick choices, range or source guidance, preparation choices, or
route-triggered recalculation. The event journal retains the rule and ruleset
audit fields, and previously recorded items continue to render.

The same runtime contract gates every prospective medication value. A missing,
malformed, unpublished, wrong-mode/wrong-version, or otherwise non-ready
selected baseline leaves identity, routes, hidden-state, search-only
documentation, and manual entry intact, but cannot provide dose/rate/volume,
concentration, formulation, quick-value, or fluid-calculation fallbacks. The
full contract is documented in
[English](docs/clinical-baseline-safety.md) and
[Bulgarian](docs/clinical-baseline-safety.bg.md).
