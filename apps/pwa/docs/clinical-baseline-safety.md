# Clinical baseline safety boundary

Mobile and the exported PWA treat `/v1/clinical/rules/runtime?mode=...` as
untrusted runtime data. Prospective medication values are enabled only for an
exact-mode, published (when status is present), positive-version selected
preset whose `productionReady` flag is exactly `true` and whose effective rules
all validate. The client discards transported profile arrays and re-derives
adult and pediatric profiles from those effective rules.

If the selected baseline is missing, malformed, draft/retired, wrong-mode,
wrong-version, or otherwise not production-ready, medication identity, codes,
routes, ruleset hidden-state, search-only documentation, and manual entry remain
available. Dose/rate/volume prefills, concentrations/default preparations,
quick values, profile ranges, formulation choices, agent quick percentages,
premedication defaults/route recalculation, and adult or pediatric fluid
calculations are suppressed. Selecting a fluid, changing its route, or changing
its concentration cannot invoke the hard-coded bag-volume fallback or pediatric
4-2-1 calculation in that state. Mode-tagged hook state also prevents an Adult
snapshot from being exposed during a transition to Pediatric, or vice versa.

A valid selected baseline may continue to provide an editable calculated
prefill. The UI does not render dose ranges, advisory prose, source text, or
calculation arithmetic. Existing recorded values are retained; the boundary
prevents new prospective values and does not erase clinician-entered data.

Normalized snapshots use cache namespace `clinical-rules:v4`. Older raw
transport caches are not mixed with the new contract. Unit/component tests pin
the evaluator and drug/infusion/fluid/agent/premedication manual boundaries,
while the PWA browser
contract intercepts a non-production-ready adult baseline and requires an empty
manual dose without concentration or quick-value guidance.
