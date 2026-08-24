# Web localization contract

## Locale authority

LOSPOR Web ships `bg` and `en`. The installer may set the unauthenticated
server-rendered and PWA-manifest default with `LOSPOR_DEFAULT_LOCALE=bg|en`.
The value is read at runtime, validated through `src/i18n/locales.ts`, and
falls back to `bg` when absent or invalid. Unknown values are never passed to a
message-bundle lookup.

Before authentication, `lospor_device_locale` is the device preference. The
login language selector is intentionally prominent and records whether the
choice was explicit. After successful authentication:

1. An explicit login choice wins and is PATCHed to
   `User.preferences.ui.locale`.
2. Otherwise the canonical account preference wins.
3. If the API response is from an older deployment with no preference, the
   device preference wins, then the validated installer default.

For unauthenticated server rendering, the precedence is signed-in account
mirror (only when a session exists), device preference, short-lived explicit
login marker, legacy migration cookie, then the validated installer default.
The manifest is explicitly request-time generated so a container receives the
installer value at runtime rather than baking it into the build.

`lospor_account_locale` mirrors the selected account value for server
rendering. It is session-scoped and deleted after logout; the device preference
remains. Settings persists an account language before changing the cookie, so
the UI does not claim that an unsaved account choice succeeded.

Locale cookies are written by same-origin Server Actions with `HttpOnly`,
`SameSite=Lax`, `path=/`, and production `Secure` attributes. The legacy
`locale` cookie is read only as a migration fallback and removed on the next
locale action.

## Messages and fallback

`messages/en.json` is the runtime fallback for non-legal UI. Bulgarian messages
are recursively merged over it, which protects a partially deployed bundle.
This is not permission to omit translations: `i18n-keys.test.ts` requires the
complete leaf-key set, non-empty values, and interpolation variables to match
in both shipped files.

Public auth, legal, offline, not-found, error, onboarding, and logout surfaces
also have an AST-based no-raw-copy test. Add visible copy to both locale files
before using it in those components.

## Legal documents

Terms and Privacy use separate exact descriptors with the canonical shape:

```ts
{ kind, version, effectiveDate, locale, contentSha256, deployment }
```

The current descriptors are `CLOUD_DEMO`. Each SHA-256 binds the exact localized
message object, and tests recompute every hash. A missing locale descriptor or
legal message throws; legal copy never silently falls back to another language
or deployment.

A Hospital import must deliberately replace these descriptors and the content
with `LOCAL_HOSPITAL` documents. The public Web app must not guess, relabel, or
reuse cloud-demo legal content for a local hospital appliance.

Registration submits separate Terms and Privacy acceptance references using
that exact shape. Before the form can be submitted, it fetches the active API
manifest for the selected locale and verifies both references byte-for-byte
against the descriptors for the pages being shown. It never sends document
content and never accepts an API-only version that the person did not see.

## Clinical-copy review

Run `npm run i18n:inventory` for a line-level candidate report. See
`docs/i18n-clinician-review.md` for the reviewed boundary. The command is a
gate: ordinary raw interface copy fails, while the narrow 1.2.0 allowlist keeps
product/licence names, named scores and calculations, units, abbreviations and
controlled clinical terms unchanged. Drug names, canonical codes and clinical
enum values must come from the shared display/option vocabulary rather than
Web-only translations.

The live intraoperative and clinical-rule editor copy uses tested bilingual
component contracts because those surfaces combine interface labels with
caller-supplied canonical clinical values. The contracts translate actions,
warnings, validation and accessible names without modifying the stored value.
