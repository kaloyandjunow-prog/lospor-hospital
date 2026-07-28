# Intraoperative Record

The intraoperative form captures the real-time anaesthetic management of a case. It is divided into a structured form section and a live timetable.

---

## Form sections

### Timing

| Field | Notes |
|-------|-------|
| Month / Year | Operative date (month precision) |
| Start time | HH:MM, floored to nearest 5 min for timetable alignment |
| End time | HH:MM; tick "next day" if the case crosses midnight |
| Duration | Auto-computed from start/end times |

---

### Anaesthesia technique

Hierarchical multi-select tree:

- **General** — GA ETT, GA LMA, TIVA (with agent variants)
- **Neuraxial** — Spinal (single-shot / continuous, level selector), Epidural (level selector), CSE, DPE
- **Peripheral blocks** — Upper limb, Lower limb, Trunk, Head & Neck, Ophthalmic
- **Sedation**
- **Local**
- **Other** (free text)

Multiple techniques can be selected simultaneously.
Selected technique pills include their clinical category, for example **General Inhalational**, **Regional Neuraxial Epidural Lumbar**, or **Regional Femoral nerve**.

---

### Volatile agent and fresh gas

| Field | Behaviour |
|-------|-----------|
| Volatile agent | Sevoflurane, desflurane, or isoflurane |
| FGF | Fresh gas flow, 0-100 L/min; slider, stepper, or direct numeric entry |
| Gas mixture | O2 is always present; Air and N2O are mutually exclusive carrier-gas choices |
| FiO2 | 0-100%; slider, stepper, or direct numeric entry |

The legacy separate O2/N2O percentage and flow columns remain in the database for backward compatibility, but the current forms use FGF, carrier gas, and FiO2.

---

### Patient position

15 preset positions across 5 groups (Supine, Lateral, Prone, Lithotomy, Seated/Other). Multiple positions can be selected for cases that change position intraoperatively.

---

### Monitoring

18 monitors across 4 groups:

| Group | Monitors |
|-------|---------|
| Standard | ECG, SpO₂, NBP, EtCO₂, Temperature |
| Haemodynamic | IBP, CVP, PA catheter, TEE |
| Depth / Neuro | BIS, Entropy, NIRS, SSEP/MEP, TOF/NMT |
| Other | Blood glucose, ABG, Urinary catheter, NGT |

Selecting a monitor automatically adds its vital row to the timetable.

---

### Airway management

| Field | Options |
|-------|---------|
| Airway device | Face mask, LMA, Oral ETT, Nasal ETT, Surgical airway |
| Tube size | 2.0–12.0 mm |
| Cuffed | Yes / No |
| PEEP | 0–40 cmH₂O |
| Ventilation mode | Spontaneous, IPPV, PCV, PSV, SIMV, CPAP, APRV, HFOV, VG, Jet |
| Airway tools | Direct laryngoscopy, Video laryngoscopy, FOB, Bougie, Stylet, Others |
| Cormack-Lehane | I, IIa, IIb, III, IV |
| Airway notes | Free text, 2,000 chars |
| Double-lumen tube | Type (left/right Robertshaw, etc.), side, size (Fr) |
| Endobronchial blocker | Size (mm) |

---

### Vascular access

Tree-based selector:

- **Arterial** — Radial, Ulnar, Femoral, Brachial, Dorsalis pedis, Axillary
- **Venous → Peripheral** — size (G), site
- **Venous → Central → PICC** — 3 sites; size (Fr), depth (cm)
- **Venous → Central → Central line** — 5 sites (IJ, EJ, Subclavian, Femoral, Axillary); size (Fr), depth from skin

---

### Fluid balance

| Field | Range |
|-------|-------|
| Crystalloids | mL, 0–50,000 |
| Colloids | mL, 0–20,000 |
| Blood | mL, 0–20,000 |
| Blood products note | Free text |
| Urine output | mL, 0–20,000 |

---

### Complications

Free text, up to 2,000 characters.

---

## IntraopTimetable

The timetable is a live 5-minute grid that records drugs, vitals, fluids, infusions, and volatile agents over the course of the case.

### Layout

- Each column = 5 minutes
- Default: 1 row (12 columns = 60 min), auto-expands as the clock advances
- **Expand mode**: jumps to the next full-row boundary when the last column is reached
- **Scroll mode**: adds one column at a time
- Column width auto-scales to fill the available container width in expand mode

### Live clock

An orange marker advances every 10 seconds. The selected column follows the clock automatically. Active infusions, fluids, and volatile agents extend to the current column each tick.

### Vitals rows

Rows appear dynamically based on which monitors are selected in the form:

| Row | Display |
|-----|---------|
| BP (Systolic / Diastolic) | Stacked bar with numeric label |
| Heart rate | Numeric |
| SpO₂ | Numeric |
| EtCO₂ | Numeric |
| Temperature | Numeric |

### Drug boluses

- Add via the side panel (QUICK_DRUGS list) or by clicking an in-cell picker
- Rendered as small pills in the column
- **Drag** to move to a different column
- **Del** to delete the selected pill
- **→** to copy to the next column
- **0–9** to enter a dose directly
- IBW-pre-filled bolus slider for 28 common drugs (e.g. Propofol 2.0 mg/kg IBW)
- Dose unit toggle (mg / mcg / ml / other)

### Infusions

- Add via the floating prompt: drug, rate, unit (mg/hr, mcg/kg/min, etc.)
- Rendered as a continuous colour bar spanning their active columns
- Rate can be changed mid-infusion (rate-change marker on the bar)
- **Stop** at any column to end the infusion
- Total cumulative dose shown in the infusion panel

### Fluids

- 12 fluid types (Normal saline, Ringer's, Hartmann's, Gelofusine, Voluven, FFP, Platelets, PRBC, Albumin, etc.)
- Rendered as a continuous colour bar
- Ended with a partial or full volume entry
- Total volume summarised in the fluid panel

### Volatile agents

- Sevoflurane, Desflurane, Isoflurane
- Rendered as a continuous agent bar
- Switching agents auto-stops the previous one
### Auto-fill

Three automation settings (Settings -> Automation) share one canonical rule set
with the mobile app:

| Setting | Behaviour |
|---------|-----------|
| Auto-fill vitals | Master switch. When the clock advances, creates saved events containing the previous EtCO2, SpO2, and temperature for each missed empty 5-minute column |
| Auto-fill BP & HR | Child toggle (requires Auto-fill vitals): also carries forward systolic BP, diastolic BP, and heart rate |
| Backfill on reopen | Child toggle (requires Auto-fill vitals): when an in-progress case is reopened, fills empty columns between the last recorded vitals and the current time |

Turning off **Auto-fill vitals** also turns off the child options on both web
and mobile, so stale background settings cannot generate observations later.

Automatically carried-forward values are saved as real events through the shared API, so they are visible on the other client and survive timetable reconstruction. Since v5 this applies to the **web** timetable too: every vitals column typed, auto-filled, or backfilled on web is persisted as a `vital` event (one stable id per 5-minute column - `web-vital-N`, the same scheme mobile and the server bridge use - emitted ~1.2 s after the last edit; re-editing a column supersedes the event instead of stacking a duplicate). Previously web vitals lived only inside the projected timetable blob and could be lost when the projection was rebuilt. The server additionally bridges grid vitals from older cached web clients into events.

Offline behavior (v5.1): **adding** events (drugs, fluids, vitals, clinical events) works offline on web — they are journaled in IndexedDB and replayed idempotently on reconnect, counted in the header badge. **Deleting or editing existing timeline items** requires connectivity: those go through a full-log reconcile, and replaying a stale log after reconnecting could resurrect deleted events, so the change reverts with a message instead of queueing.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Del / Backspace | Delete selected item |
| → | Extend / duplicate selected item to next column |
| ← | Retract selected item |
| Tab | Cycle through items in column order |
| 0–9 | Enter dose for selected drug |
| Esc | Deselect |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |

### Chart view

A toggle switches between the **Grid** (default) and **SVG** chart views. The SVG view renders vitals as line/bar charts with Y-axis from 40–220 mmHg.

---

## Equipment suggestions

An amber card above the timeline computes recommended equipment based on preop demographics:

| Category | Suggestions |
|----------|------------|
| Airway | ETT size (age/weight formula), ETT depth, LMA size, laryngoscope blade, Guedel size, suction catheter |
| Ventilation | Tidal volume (6–8 mL/kg IBW), RR, PEEP, I:E ratio |
| Fluids | 4-2-1 maintenance rate (mL/hr) |
| Catheters | Foley size, NGT size and depth |
| Monitoring | BP cuff size, defibrillator pad size |

---

## Preop summary card

A compact card above the timetable showing the key preop highlights:
ASA class, BMI, IBW, ABW, vitals, Mallampati class, difficult airway flag, allergy summary, comorbidity list, and abnormal lab values.
