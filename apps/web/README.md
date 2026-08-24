# LOSPOR Web

[![Licence: AGPL-3.0](https://img.shields.io/badge/Licence-AGPL--3.0-blue.svg)](LICENSE)
[![Live app](https://img.shields.io/badge/Live-app.lospor.org-green)](https://app.lospor.org)
[![Docs](https://img.shields.io/badge/Docs-docs.lospor.org-blue)](https://docs.lospor.org)

Copyright (C) 2026 Kaloyan Dzhunov. Licensed under AGPL-3.0.

This repository contains the LOSPOR Next.js browser interface. LOSPOR is a
free, open-source personal anaesthetic case log for learning, portfolio, and
reflection. Bulgarian is the public default and English remains available. An
installer can set the unauthenticated appliance default to English with the
validated runtime variable `LOSPOR_DEFAULT_LOCALE=en`; absent or invalid values
remain Bulgarian.
Pre-auth device language and authenticated account language are deliberately
separate; the account authority is `User.preferences.ui.locale`.

Terms and Privacy are exact versioned evidence, not ordinary fallback
translations. `npm run legal:manifest` emits the one-line `CLOUD_DEMO` manifest
that the API must receive as `LOSPOR_LEGAL_DOCUMENTS_JSON`. Registration stays
disabled if the API descriptors do not match the document bytes displayed by
this app. Regenerate and release Web and API together whenever legal copy,
version, or effective date changes.

Database access, authentication, email, AI, PDF generation, audit, OMOP, and
HTTP behavior live in the separate `lospor-api` repository. Framework-free
clinical rules and synchronization contracts live in `@lospor/core`.

The advisor and image-extraction controls are deployment capabilities, not
assumptions made by the client. Web loads `/api/capabilities`, treats any
missing or malformed response as disabled, and leaves manual clinical entry
available. The Hospital appliance reports the live installer/Status policy and
provider state; disabled or unconfigured external AI remains fail-closed.

Pediatric case creation follows the same API authority. Web requires the
complete reviewed `features.pediatricMode` capability, including production
readiness and a compatible minimum client version, before enabling a new
Pediatric selection. A missing, malformed, disabled, or unreachable capability
fails closed. An existing Pediatric record remains visible after disablement,
but its preoperative form is explicitly read-only and sends no autosave or
submit request.

Intraoperative prefills have a separate governed-baseline boundary. Web
re-validates the selected preset and its effective rules, re-derives profile
arrays locally, and enables prospective values only for an exact-mode,
positive-version, production-ready baseline. Invalid baselines retain
identity, routes, hidden-state, and manual documentation without dose, rate,
fluid, concentration, preparation, or quick-value fallbacks. See the
[English](docs/clinical-baseline-safety.md) and
[Bulgarian](docs/clinical-baseline-safety.bg.md) contracts.

The signed-in Account page provides profile correction, password change, and
active-session review without making email or institutional membership
self-editable. Hospital administrator lifecycle controls use a separate exact
`features.accountAdministration` capability. Missing or malformed capability
data fails closed, so the online Cloud Demo does not expose suspend, restore,
delete, administrator-authority, or administrator-driven account-creation UI.
The Hospital overlay must enable the capability deliberately, and the API
independently enforces the same deployment boundary.

Authentication identity is deployment-owned too. The online Cloud Demo keeps
email login, public registration, and email recovery. An exact Hospital
`authentication.loginIdentifier = "USERNAME"` capability changes Web to a
required administrator-issued username, removes both public self-service
paths, and never sends an email fallback. Username spelling is retained while
matching and uniqueness are case-insensitive; display names remain separate
and Cyrillic-capable. The complete Web/API contract is documented in
[docs/authentication-deployment-contract.md](docs/authentication-deployment-contract.md).

Administrator two-step verification is also API-driven. A `202` login
continuation opens the localized authenticator/recovery-code flow; otherwise
the public Cloud Demo keeps its existing one-step login. Enrollment uses a
standards-based authenticator link or manual key without adding a QR dependency,
and the ten one-time recovery codes must be saved or printed before navigation.

The administrator audit screen treats the API as the action-vocabulary owner.
Each audit page includes the append-only action catalog with exact Bulgarian
and English labels; Web uses it for both row labels and the exact action filter.
Malformed catalog entries are ignored, and an unknown historical action stays
visible under its raw stable code instead of being mislabeled or hidden.

## What LOSPOR is

LOSPOR records de-identified perioperative cases, provides preoperative,
intraoperative, and postoperative workflows, and generates printable case
summaries. It is not a patient management system or certified medical device,
and it does not replace clinical judgment.

## Local development

Start `lospor-api` first on port 3002. Then:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The web interface listens on `http://localhost:3000`.

```env
LOSPOR_API_INTERNAL_URL="http://localhost:3002"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
LOSPOR_DEFAULT_LOCALE="bg"
```

The temporary `/api/*` compatibility address forwards V6 client requests to
API `/v1/*`. No API route implementation or Prisma code belongs in this repo.

The cross-application suite exports `lospor-mobile` as a phone-sized PWA and
drives it beside Web against one freshly seeded API/database. It includes
offline replay and an hour-long synthetic intraoperative sequence:

```bash
npm run e2e:db:up
npm run e2e:crossapp
npm run e2e:db:down
```

This is an integration gate: it requires the disposable PostgreSQL service and
must run again against the final Hospital topology before release assurance is
claimed.

The existing `CI / e2e` job runs the ordinary Web suite and then the exact
`intraop-across-apps.crossapp.spec.ts` scenario. It checks out the current
`main` API and Mobile repositories, so a coordinated change cannot pass by
silently using an older companion. `npm run check:crossapp-ci` protects that
workflow contract from losing the database, Mobile checkout, or exact scenario
invocation.

## Checks

```bash
npm run verify:boundaries
npm run check:crossapp-ci
npm run test
npm run i18n:inventory
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

`npm run i18n:inventory` is a green/red localization gate. It permits only the
reviewed product/licence names, named scores/calculations, units,
abbreviations, and controlled clinical terms; newly detected ordinary
interface copy fails. The test suite also enforces complete BG/EN message keys
and prevents raw copy on the public auth, legal, and PWA failure surfaces. See
[`docs/localization.md`](docs/localization.md) and
[`docs/i18n-clinician-review.md`](docs/i18n-clinician-review.md).

## Deployment

Deploy this repository as the web project, normally at `app.lospor.org`.
Deploy `lospor-api` separately, normally at `api.lospor.org`. Web must not
receive database credentials or the API signing secret.

See the [self-hosting guide](https://docs.lospor.org/self-hosting) for database,
API, migration, seed, cron, and deployment instructions.

## Tech stack

Next.js 16, React 19, Tailwind CSS, next-intl, LOSPOR Core, and Vercel
Analytics.

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).
