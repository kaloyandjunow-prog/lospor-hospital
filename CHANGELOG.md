# Changelog - LOSPOR Hospital

## [1.0.0] - 2026-08-17

The first appliance release. It vendors lospor-api 9.1.1, lospor-app 9.1.1,
lospor-mobile 9.1.1, lospor-core 9.1.1 and lospor-browser 0.5.0, and speaks
exchange contract 2.1.0.

### Clinical recording

- **Yes/no clinical questions record three answers: yes, no, and not asked.**
  They were `Boolean @default(false)` columns, which cannot hold the
  distinction. An untouched field and a recorded "no" both reached the register
  as a documented negative, and a study counting them together is counting
  something it did not measure.

  29 columns are nullable. Both the web form and the phone app ask the question
  as a pair of answers rather than a checkbox or a switch, say so when it has
  not been asked, and let a mis-tap be cleared.

  `emergencySurgery` and `highRiskSurgery` stay binary — not emergent means
  elective. So do the "unobtainable" ticks and the monitoring and equipment
  flags, which are marks a clinician makes rather than questions put to a
  patient. Risk calculators still treat an unasked criterion as absent, so it
  cannot count toward an RCRI, Apfel, STOP-BANG or POVOC score.

- A read-only chart quickview reaches the web-shaped vitals chart from the
  phone mid-case, with its own close control.

### OMOP export

Contract `source_version` 3.8.0.

- Allergies are exported as observations, not as drug administrations. A
  substance a patient reacts to is not one they were given.
- CARE_SITE is its own table, referenced by `care_site_id`, instead of the
  institution being written onto every visit as free text no OHDSI tool reads.
- Continuous administrations carry `drug_exposure_end_date`, paired from their
  stop events. An infusion with no end was indistinguishable from one still
  running.
- Every planned procedure is exported, not only the first, and intraoperative
  drugs resolve their ATC through the same concept pipeline as preoperative
  medications.
- Airway management leaves the appliance for the first time: device list,
  Cormack-Lehane grade, tools, per-device sizes and cuff status, DLT and
  endobronchial detail, ventilation modes, IPPV, jet ventilation and PEEP.
  Placing an instrumented airway is a PROCEDURE_OCCURRENCE — a device is a
  state of the patient, putting it there is something done to them, and only
  the second belongs in a procedure count.
- The preop findings that were read and discarded now leave: smoking,
  substance use, latex allergy, family anaesthesia history, dental state, BMI,
  blood group and Rh, GUTA, and the airway examination.
- MEASUREMENT carries `value_source_value`, `range_low` and `range_high`. A lab
  result with no parsed number used to be skipped entirely, so a culture or a
  blood group left no trace of having been recorded.
- Vascular lines carry depth, lumen count and whether they were already in
  place — a pre-existing line was not placed during this case.
- Concept mappings distinguish `MANUALLY_CURATED` from an automatic match and
  `REJECTED` from "nobody has looked yet". A rejected mapping keeps its row so
  the rejection is remembered, but never applies its concept id.

### Local to the appliance

- `identityByCase` links a patient's repeat operations across cases. The
  serverless export has no such linkage and says so in its own provenance.
- No telemetry leaves the hospital network: the vendored web app carries no
  Sentry and no Vercel analytics.

### Database

Two migrations, applied on start:

- `20260816160000_tristate_clinical_questions`
- `20260816180000_concept_mapping_provenance`

Both are additive or relaxing. **Existing rows are deliberately left as they
are**: rewriting them to NULL would discard the genuine "no" answers among
them, and a hospital that has already collected cases cannot recover that
distinction afterwards.
