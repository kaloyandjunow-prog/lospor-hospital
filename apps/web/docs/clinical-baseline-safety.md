# Clinical baseline safety boundary

Web treats `/api/clinical/rules/runtime?mode=...` as untrusted runtime data. A
selected baseline may provide editable calculated prefills only when all of the
following are true:

- its mode exactly matches the case;
- it identifies a `PLATFORM`, `INSTITUTION`, or `USER` preset with a positive
  integer version;
- an optional status is `PUBLISHED`, `productionReady` is exactly `true`, and
  at least one mode-appropriate profile can be derived;
- every effective rule has a valid payload, stable identity/version,
  provenance, matching preset, and a unique rule key.

The client ignores transported profile arrays and re-derives them from the
validated effective rules. Missing, draft/retired, wrong-mode, wrong-version,
malformed, or otherwise non-production-ready responses keep medication names,
codes, routes, hidden-state enforcement, and manual recording available, but
disable every prospective OptionLibrary fallback: calculated dose, rate,
volume, concentration/default preparation, quick value, and fluid maintenance
calculation. Premedication defaults/route recalculation, inhalational-agent
percentages, and the N2O percentage default pass through the same boundary.
Route and concentration changes cannot reintroduce a value after a safe empty
flyout has opened.

A valid selected baseline may still put an editable calculated value in the
field. Dose ranges, advisory prose, weight arithmetic, and quick-value
recommendations remain outside the rendered clinical-entry UI. Existing
recorded values remain editable as historical/manual data.

Runtime snapshots use cache namespace `lospor:clinical-rules:v5`; older raw
profile caches are not restored. A normalized valid cached snapshot remains
usable during a network failure and is evaluated again before prospective
values are enabled.

The pure evaluator, dose surfaces, flyout state, premedication and agent
boundaries, fluid route-change boundary, and a browser contract are covered by
focused tests. The browser contract
intercepts a non-production-ready baseline and requires an empty manual entry
with no preparation or dose guidance.
