# Postoperative Record

The postoperative form captures recovery room data and the handover checklist.

---

## Modified Aldrete Score

Five domains, each scored 0–2 (total 0–10):

| Domain | 2 | 1 | 0 |
|--------|---|---|---|
| Activity | Moves all extremities | Moves 2 extremities | No movement |
| Respiration | Breathes deeply, coughs | Dyspnoea / limited | Apnoeic |
| Circulation | BP ± 20% of pre-op | BP ± 20–49% | BP ± ≥50% |
| Consciousness | Fully awake | Arousable | Not responding |
| SpO₂ | > 92% on room air | Needs O₂ to stay > 90% | < 90% on O₂ |

Total auto-computed from the five domain scores.

---

## Recovery data

| Field | Notes |
|-------|-------|
| Systolic BP | Random initial value 120-130 mmHg; shared vital control |
| Diastolic BP | Random initial value 70-85 mmHg; shared vital control |
| Heart rate | Random initial value 60-90 bpm; shared vital control |
| SpO2 | Random initial value 95-99%; shared vital control |
| Temperature | Random initial value 36.0-37.0 C; shared vital control |
| Pain NRS | 0–10 numeric rating scale |
| PONV | Yes / No flag |

The previous **Time in recovery / Time in PACU** field has been removed from web, mobile, summaries, and generated protocols.

---

## Disposition

| Option | Notes |
|--------|-------|
| Ward | Standard post-op ward |
| PACU | Post-anaesthesia care unit (extended monitoring) |
| ICU | Intensive care unit |

Disposition notes (free text) available for all options.

---

## Handover checklist

A structured handover ensures safe transfer of care. Items are grouped into 8 categories:

| Group | Items |
|-------|-------|
| Airway | Airway device removed, Airway protective reflexes present, Patient position optimised |
| Breathing | Adequate respiratory rate and effort, SpO₂ within target range, Oxygen therapy in progress if indicated, Ventilation mode confirmed if still intubated |
| Circulation | HR and BP documented and stable, IV access patent, Fluid balance documented, Vasopressor/inotrope infusions handed over |
| Neurology | Level of consciousness documented, Neuromuscular block reversed and confirmed, Pain score assessed and analgesia prescribed, PONV prophylaxis given |
| Pain | Analgesic regime prescribed, PCA/epidural/regional block status documented, Pain score at handover |
| Fluids | Fluid balance for the case documented, Ongoing IV fluid rate prescribed, Drain/catheter output noted |
| Safety & Environment | Allergies communicated, Temperature documented and warming in place if needed, Pressure areas checked, VTE prophylaxis prescribed |
| Handover Communication | Surgical team briefed, Anaesthetic chart completed, Any intraoperative concerns communicated |

Each group is a collapsible accordion (all open by default). A checked/total counter is shown per group header. When all items in a group are checked, the group border turns green.

---

## Complications

Free text, up to 2,000 characters.

---

## Validation

No mandatory fields in the postoperative form — partial saves are allowed so incomplete recovery data can be updated incrementally.

---

## Auto-save

The form auto-saves shortly after the last change (1–1.5 s for typed fields). Saves are field-level — only changed fields are sent — and network failures queue locally with automatic replay.
