# Web localization clinician-review inventory

Status date: 2026-08-22

## Dose-guidance suppression in clinical entry

The 1.2.0 public wave also removes configured dose ranges, quick-dose pills,
calculation/source prose, and range sliders from patient-facing drug entry.
The calculated value may remain prefilled in the editable numeric field so a
later explicit guidance-policy control can govern that behavior; the current UI
does not label it as a recommendation.

Affected clinical surfaces are:

- evening and day-of-surgery premedication pickers in the intraoperative form;
- bolus and infusion start panels in the intraoperative timetable;
- the change-infusion-rate dialog in the intraoperative timetable.

Withheld/manual-entry and overlapping-profile warnings remain because they
explain why entry is blocked or must be checked; they do not recommend a dose.
The Clinical Rules authoring preview retains configured values and source
references because it is the policy-editing surface, not a patient
administration recommendation.

The 1.2.0 public Web/PWA wave has no unkeyed visible copy in the auth routes,
legal pages, offline/not-found/error surfaces, logout prompt, or first-use
notice. Bulgarian is the default and English remains available. A CI test
(`src/__tests__/public-i18n-surface.test.ts`) prevents raw copy from returning
to those surfaces, while `src/__tests__/i18n-keys.test.ts` requires exact,
non-empty BG/EN key parity and matching interpolation variables.

A rendered Chromium walkthrough on 2026-08-23 found that the registration
country menu correctly listed `България`, but the closed control exposed the
canonical payload value `Bulgaria` after selection. The control now renders
the active locale label while continuing to submit the unchanged canonical
value. The route-mocked localization E2E also proves that institution selection
appears as required and that the retired optional wording stays absent.

## Authenticated Web/PWA localization result

Run the line-level inventory with:

```bash
npm run i18n:inventory
```

This implementation pass began at **326 candidates in 54 files**. It now
reports **0 unresolved interface strings** and **61 intentional controlled
tokens across 19 files**. The result is enforced: the inventory command exits
non-zero if a newly detected candidate is not on the narrow reviewed allowlist.

The completed scope includes authenticated case/admin pages, case summary and
print controls, conflict handling, dashboard search, equipment suggestions,
preoperative and intraoperative form chrome, the full live timetable, end-case
and discontinue decisions, keyboard shortcuts, clinical-rule authoring,
airway/vascular/technique trees, laboratory import, offline/editing banners,
shared dialogs, and accessibility labels.

The 61 retained tokens follow the clinical-language decision for 1.2.0:

- product and licence names such as `LOSPOR` and `AGPL-3.0`;
- named scores and measures such as ASA, Mallampati, BMI, IBW, ABW and Rh;
- monitor, gas and calculation abbreviations such as BP, HR, SpO2, EtCO2,
  FGF, FiO2, TBW and BSA;
- units, unit fragments and time placeholders such as kg, mL, mL/h, L/min,
  HH and MM;
- the named `Pediatric 4/2/1` calculation and the controlled clinical term
  `inhalational`.

Drug names, canonical rule keys, route codes, dose bases, enum values and
other controlled clinical vocabulary remain unchanged. The surrounding
instructions, warnings, validation, navigation, accessible names and action
buttons are Bulgarian when Bulgarian is active.

The clinician approved the six remaining Bulgarian wording choices on
2026-08-23. They are now release-locked across the message catalog, printed
record, equipment output, timetable help and Clinical Rules chrome:

- difficult-airway history: `анамнеза за труден дихателен път`;
- ETT depth at the lip: `дълбочина на ETT при устната комисура` (the Web UI
  retains its established canonical `ETT` abbreviation);
- cuffed tube: `с маншет`;
- maintenance-fluid rate: `поддържаща скорост на инфузия на течности`;
- laboratory reference range: `референтен интервал`; and
- the generic, non-canonical medicine/drug noun: `медикамент`.

The last choice does not rewrite controlled names or formal medical compounds
such as `лекарствена форма` and `лекарствена алергия`. Drug names, canonical
codes and all other protected terminology remain unchanged. Regression tests
reject the retired synonyms on the surfaces where they meant these same six
concepts.

For future additions, general interface language belongs in the shared message
catalog or a tested bilingual component-copy contract. Controlled vocabulary
must come from the shared clinical display/option layer. Do not broaden the
allowlist to make a failing UI string disappear; classify it and localize it or
document why it is a stable controlled token.
