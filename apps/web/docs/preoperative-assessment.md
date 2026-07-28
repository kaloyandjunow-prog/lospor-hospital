# Preoperative Assessment

The preoperative assessment form is the primary data-entry interface for LOSPOR. It collects structured clinical data before a case begins and feeds the risk scoring, AI advisory, and intraoperative record.

**Patient identifiers (name, ID number) are intentionally not collected digitally.** The printable protocol renders blank lines for these fields so the clinician fills them in by hand after printing. This is a deliberate GDPR design choice — no patient-identifiable information is ever stored in the database.

---

## Form sections

### Demographics

| Field | Notes |
|-------|-------|
| Age | Required. 0–120 years, stepper with slider |
| Sex | Required. Male / Female / Other |
| Height | cm, used for BMI and IBW calculations |
| Weight | kg, used for BMI and ABW calculations |
| Blood type | A / B / AB / O |
| Rh factor | Positive / Negative |

**Derived values** (shown as badges when height and weight are present):
- **BMI** — `weight / height²`
- **IBW** — Devine formula: `50 + 2.3 × (height_inches − 60)` for males, `45.5 + 2.3 × (height_inches − 60)` for females
- **ABW** — `IBW + 0.4 × (actual − IBW)`, shown only when actual weight exceeds IBW

---

### Case details

- **Diagnosis** — ICD-10 coded tag(s), required. Searched from a local ICD-10 database.
- **Planned procedure** — CPT/specialty code tag(s), required.
- **Team notes** — free text, up to 500 characters, not used by the AI advisor.
- **High-risk surgery** — checkbox; also feeds the RCRI score automatically.
- **Emergency surgery** — toggle; appends an `E` suffix to the ASA class on output.

---

### Medical history (comorbidities)

ICD-10 coded tags, grouped by body system (Cardiovascular, Respiratory, Endocrine, etc.) once entered. The tag list feeds the AI-powered ASA suggestion.

---

### Current medications

Free-text tag search backed by a drug name / INN database.

---

### Clinical Anamnesis & History

**Allergies**
- General drug/substance allergy flag (expands allergen search when checked)
- Latex allergy flag

**Family history**
- Family anaesthesia problems (MH, pseudocholinesterase deficiency, etc.) — expands a notes field

**Dental**
- Dental prosthetics
- Loose teeth

**Harmful habits**
- Smoking (feeds APFEL non-smoker factor automatically)
- Substance abuse

**RCRI — Revised Cardiac Risk Index**

Checks five risk factors (high-risk surgery is taken from the Case section):

| Factor | RCRI criterion |
|--------|---------------|
| Ischaemic heart disease | History of MI, positive stress test, nitrate use, ECG Q waves |
| Congestive heart failure | Pulmonary oedema, PND, S3, bilateral crackles, CXR redistribution |
| Cerebrovascular disease | History of TIA or stroke |
| Insulin-dependent DM | — |
| Elevated creatinine | > 177 µmol/L (> 2.0 mg/dL) |

**APFEL — PONV risk score**

Two checkboxes collected here; two more derived automatically:

| Factor | Source |
|--------|--------|
| Female sex | Demographics |
| Non-smoker | Habits section |
| History of PONV or motion sickness | Checkbox |
| Postoperative opioids planned | Checkbox |

**STOP-BANG — OSA screening**

Five checkboxes collected here; three derived automatically:

| Factor | Source |
|--------|--------|
| Snoring | Checkbox |
| Tired (daytime sleepiness) | Checkbox |
| Observed apneas | Checkbox |
| Blood pressure (treated hypertension) | Checkbox |
| Neck circumference > 40 cm | Checkbox |
| BMI > 35 | Derived from demographics |
| Age > 50 | Derived from demographics |
| Male sex | Derived from demographics |

---

### Vitals

| Field | Unit | Required |
|-------|------|---------|
| Blood pressure (systolic / diastolic) | mmHg | Yes* |
| Heart rate | bpm | Yes* |
| SpO₂ | % | No |
| Temperature | °C | No |
| Respiratory rate | /min | Yes* |

\* Each field has an **Unable to Obtain** toggle that suppresses the required-field validation.

Arrhythmia flag is shown alongside heart rate.

A free-text **Physical Exam Report** field is provided for narrative findings.

---

### Airway assessment

| Assessment | Options / Range |
|-----------|----------------|
| Mallampati | I, II, III, IV |
| Mouth opening | 0.5–8 cm |
| Thyromental distance | 3–12 cm |
| Neck mobility | Full / Limited / Fixed |
| Upper Lip Bite Test | Class I / II / III |
| Cormack-Lehane grade | I, IIa, IIb, III, IV |
| Feature flags | Retrognathia, Prominent incisors, Facial hair, Difficult airway history |

The entire airway block can be marked **Unable to Obtain** (e.g. paediatric, pre-anaesthetic telemedicine).

---

### Lab results

Searchable panel (≥ 2-character query) covering:
- Haematology (FBC, coagulation)
- Biochemistry (renal, liver, electrolytes, glucose)
- Arterial blood gas
- Microbiology / other

Values are highlighted when outside the reference interval for the test.

---

### Risk Scores

#### ASA Physical Status

| Class | Description |
|-------|-------------|
| I | Normal healthy patient |
| II | Mild systemic disease |
| III | Severe systemic disease |
| IV | Constant threat to life |
| V | Moribund |
| VI | Brain-dead organ donor |

An `E` suffix is added automatically when emergency surgery is flagged.

An **AI suggestion** (based on tagged comorbidities and BMI) is shown as an advisory prompt — the clinician always makes the final choice.

#### Calculated risk score cards

Three live-updating cards appear below the ASA selector:

| Score | Scale | Risk thresholds |
|-------|-------|----------------|
| **RCRI** | 0–6 | 0: Very low (0.4%) · 1: Low (1.0%) · 2: Moderate (2.4%) · ≥3: High (≥5.4%) |
| **APFEL** | 0–4 | 0–1: Low (<10%) · 2: Moderate (~40%) · ≥3: High (≥60%) |
| **STOP-BANG** | 0–8 | ≤2: Low OSA risk · 3–4: Intermediate · ≥5: High |

Cards are colour-coded green / amber / red and update in real time as checkboxes are ticked.

---

## Validation

Required before submission:
- Age and sex
- At least one diagnosis
- At least one planned procedure
- Blood pressure, heart rate, and respiratory rate (unless marked Unable to Obtain)
- Mallampati class (unless the airway block is marked Unable to Obtain)
- ASA class

On failure, the form scrolls to the first offending section and highlights it with a red ring.

---

## Auto-save

Discrete taps (pills, toggles, checkboxes) auto-save ~150 ms after the tap; typed fields save 1.5 seconds after the last keystroke, provided at least one meaningful field has been filled in. Saves are field-level — only the fields that changed since the last confirmed save are PATCHed. Saves that fail on network are queued locally (IndexedDB on web, SecureStore on mobile) and replayed automatically. The saved draft is restored when the case is reopened.
