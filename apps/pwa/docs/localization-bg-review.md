# Bulgarian localization and clinician review — 1.2.0

This document records the Mobile/PWA localization contract, the medication-
guidance safety boundary, and the locked terminology boundary for 1.2.0. It is
not evidence that the appliance, API, Browser, or hosted legal pages have
already been translated.

## Locale contract

- Supported locales are Bulgarian (`bg`) and English (`en`). Bulgarian is the
  safe fallback and the first-run default.
- Before sign-in, a deliberate choice on the login screen is stored only as a
  device login preference. If there is no stored choice, Mobile requests the
  appliance's public `GET /v1/locale` value. An unavailable, timed-out, or
  malformed response falls back to Bulgarian; the operating-system language is
  not used.
- The login screen always shows both `BG · Български` and `EN · English` as
  prominent choices. This remains visible even when every other screen follows
  the signed-in account.
- Each login request carries the explicitly visible `bg` or `en` locale so the
  authenticated session and account can adopt it atomically. After sign-in,
  `User.preferences.ui.locale` is authoritative and the selected locale is also
  synchronized through the existing account-preferences endpoint. An API
  rollout that temporarily lacks the field does not block sign-in: Mobile keeps
  a separate per-account device copy and retries on a later language change or
  sign-in.
- English strings are the runtime fallback for a missing key. CI compares the
  complete Bulgarian and English key sets, walks production JSX for literal
  English UI, and renders representative Bulgarian surfaces so a release cannot
  knowingly ship a missing, empty, or unclassified translation.
- HTML language metadata follows the active locale in the PWA. Native app name
  and permission metadata include Bulgarian variants.

## Covered Mobile/PWA surfaces

The 1.2.0 Mobile pass moves user-facing copy into the structured locale maps
across:

- boot, not-found, login, forgot-password, registration, validation, account
  activation outcomes, and legal navigation;
- dashboard, case list and case creation, case detail, handover, preoperative,
  intraoperative, postoperative, and audit screens;
- settings, account/institution management, notification state, units, theme,
  favourites, the HOD institution-membership queue, and administrative views
  exposed by Mobile;
- clinical sheets, tabs, warnings, confirmations, errors, offline/sync state,
  reminders, and the timetable/chart quick view.

The preoperative clinical-mode selector also localizes its deployment-policy
state. A new Pediatric selection is disabled unless the API returns the exact
enabled `features.pediatricMode` contract. Missing or malformed capability data
fails closed. An existing `PEDIATRIC` case keeps its Pediatric information
visible and receives explicit Bulgarian/English wording that Pediatric changes
cannot be sent while the mode is disabled or its availability cannot be
confirmed.

Registration remains the public-demo self-registration flow. Institution is a
required field in both languages; Mobile does not expose Hospital appliance
provisioning or administrator account-creation controls.

The rendered PWA walkthrough on 2026-08-23 confirmed that the retired
"optional institution" wording is absent. The institution section now also
shows the same required `*` marker before a country is selected, in both
Bulgarian and English, so its required state is visible before the picker can
open.

The same walkthrough opened `/register` as a direct link. Its return action now
replaces the route with `/login` instead of attempting an unavailable history
back action, preventing a framework warning from appearing in English on the
Bulgarian registration screen.

### Verification ledger

| Surface/state | Automated coverage | Result |
| --- | --- | --- |
| Login default and explicit BG/EN selection | Exported PWA | Bulgarian default and English reload persistence pass. |
| Registration institution copy | Exported PWA, schema, static inventory | Required in both languages; the former optional claim is absent. |
| Registration legal consent | Parser/unit and exported PWA | Wrong/missing manifests fail closed; acceptance and submit controls are disabled. |
| Authenticated account locale | Request and account-sync unit contracts | Login carries locale; `preferences.ui.locale` read/PATCH and per-account fallback pass. |
| All production `app/**` and `src/components/**` JSX | TypeScript-AST inventory | No unclassified literal English UI remains. Protected terms are explicit tokens. |
| Localization/auth contract inventory | Focused Vitest gate | 9 files and 58 tests pass. |
| Disclaimer, sync error, complication count, action sheet | Bulgarian render contracts | Representative runtime rendering passes. |
| Clinical AI policy | Hook/parser tests | Fail-closed parse, 15-second refresh, foreground refresh, and request deduplication pass. |
| Administrator MFA enrollment and recovery acknowledgement | Exported PWA, route-mocked Playwright | The complete sign-in continuation, TOTP enrollment, ten one-use recovery codes, copy/share fallback, mandatory acknowledgement, and authenticated navigation pass (1/1). |
| Profile, local help, support, and reminder wording | Exported PWA, route-mocked Playwright | The localized authenticated surfaces and honest local-only reminder behavior pass (1/1). |
| Full Mobile/PWA unit/component suite | Vitest | 106 files and 545 tests pass. |

The route-mocked exported-PWA journeys above verify their complete browser UI
contracts without a database. A full dependency-backed authenticated
localization walkthrough still cannot run in the current environment: no
disposable migrated PostgreSQL service is listening on the expected test port
`55433`, and Docker is unavailable. Re-run that broader walkthrough in the
appliance topology once the disposable database is available; do not treat an
environment failure as a translation result.

Registration fetches the active Terms and Privacy manifest for the selected
locale, accepts only one exact `TERMS` and one exact `PRIVACY` descriptor from a
known deployment, and submits those version/hash references. A missing,
malformed, mixed-deployment, or wrong-locale manifest disables acceptance and
account creation. Terms and privacy links carry the selected locale. The linked
document presentation is hosted outside this repository and must be supplied
and defaulted by the Browser/appliance legal-content rollout. Operating-system
permission dialogs are rendered by Android/iOS and follow the device language.

## Medication-guidance safety boundary

Clinician-facing recommendations have been removed from every Mobile entry
surface inspected in this pass:

- bolus drug sheet;
- volatile-agent sheet;
- infusion start sheet and running-infusion action sheet;
- premedication library and selected premedication editor;
- paediatric dose availability notice; and
- the shared dose selector used by these surfaces.

The UI must not render configured ranges, rule sources, provenance, explanatory
advice, or rule-derived quick-value pills. Examples deliberately excluded are
`1–2 mg/kg`, source/ruleset labels, caps, weight-basis arithmetic, and a row of
suggested doses or rates.

One calculated value may still initialise the editable amount/rate when
appliance guidance is enabled. It is a prefill, not a displayed recommendation:
the clinician can replace it by direct entry or the ordinary increment/decrement
controls. Paediatric provenance required for audit remains in the recorded
event payload but is not presented as prescribing advice. Unavailable or
conflicting paediatric calculation data is described only as a safety/availability
state and never as an alternative dose recommendation.

Regression tests mount each surface with deliberately tempting advisory text,
multiple quick values, and provenance, then assert that none of that copy or
those pills can render while the single editable prefill remains available.
Any later appliance-wide guidance-policy switch should control only whether the
prefill is applied; it must not reopen any advisory-copy or quick-value path.

A ruleset-hidden medication is a stricter manual path. It is omitted from
routine scenarios, favourites, and browse lists, but a clinician can find it by
typing its name in search so actual administration is never impossible to
document. The result is labelled `Manual entry only` / `Само ръчно въвеждане`
and opens empty. It must not show or derive a dose/rate, range, source,
concentration, formulation, or route-dependent replacement value. Rule key,
rule version, sources, and available preset identity/version/scope are written
to the event for audit without being displayed as clinical advice. Existing
historical entries are not filtered by the current picker policy.

## Locked terminology boundary

The 1.2.0 translation pass does not translate or ask for wording decisions about
standardized medical terminology. Named scores/calculations (`ASA`, `BMI`,
`IBW`, `ABW`, `RCRI`, `Apfel`, `STOP-BANG`, `ULBT`, `NRS`, `POVOC`, `COLDS`,
`Aldrete`, `BSA (Mosteller)`), drug/agent names, routes, units, abbreviations
(`PONV`, `BP`, `HR`, `SpO₂`, `PACU`, `ICU`, and similar), and canonical codes
remain unchanged. Surrounding labels, help, warnings, states, validation, and
legal UI are translated.

User/server-provided institution names, clinician names, procedure/free text,
and canonical option values are never machine-translated. Built-in display
labels use the shared Bulgarian/English clinical registry; custom server data
needs localized fields in its data contract if a translated display value is
required.

Generic Bulgarian references to artificial intelligence use `ИИ`; the provider
brand `Mistral AI` remains unchanged. The static inventory test records these
intentional tokens so they cannot conceal new literal English UI.

### Clinician-approved Bulgarian surrounding copy

The clinician approved and release-locked these six choices on 2026-08-23:

- `анамнеза за труден дихателен път`;
- `дълбочина на ЕТТ при устната комисура` (Mobile retains its established
  `ЕТТ` rendering of the canonical abbreviation);
- `с маншет`;
- `поддържаща скорост на инфузия на течности`;
- `референтен интервал` for a laboratory reference range; and
- `медикамент` as the generic, non-canonical medicine/drug noun.

Mobile does not currently render a laboratory reference-range column, but the
approved wording applies if that surface is introduced. Formal medical
compounds such as `лекарствена форма` and `лекарствена алергия`, drug names,
codes, scores and units remain protected and are not rewritten by the generic
noun rule. Catalog and equipment regression tests reject the retired synonyms
where they represented the same concepts.

Human copy review should walk the actual phone and PWA screens in both languages,
including empty, loading, offline, validation, permission-denied, expired-session,
paediatric, and handover states. Review surrounding Bulgarian wording and layout;
do not treat the locked medical terms above as untranslated defects. Record each
accepted wording change as a locale key change and keep the localization suite
green.
