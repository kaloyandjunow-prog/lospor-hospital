# LOSPOR Hospital 1.4.7 preoperative assessment

The 1.4.7 assessment is an appliance-wide contract. It is not site-specific.
The bundled immutable question catalog is the source of truth for baseline and
approved adult/pediatric additions. The web and PWA may keep specialized
controls, but those controls round-trip the shared stable keys and relational
answers rather than maintaining another definition list.

Administrators can enable or disable catalog questions, reorder them, mark them
required or optional, preview a profile, and publish it. Published profiles are
immutable and versioned. A case is pinned to the profile used for its answers;
adopting a newer active profile is an explicit clinician action and is audited.
Disabled questions create no new answer rows, while historical answers remain.
Optional unanswered questions are stored as `NOT_ASKED`; clients cannot submit
that state. Required unanswered questions fail validation. `UNKNOWN` and
`NOT_APPLICABLE` are accepted only for catalog questions that explicitly allow
them. `NOT_ASSESSED` is not part of the contract.

Answers, suggestions, profile questions, profile pins, catalog options, and
audit events are relational. The answer tables are authoritative; no canonical
JSON answer blob is introduced. Switching adult/pediatric mode clears the
other population's current relational answer rows. Elective/emergency and
high-risk/low-risk groups remain mutually exclusive, and airway, ASA, risk
scores, and clinical assignments remain clinician-controlled.

Suggestions are deterministic and reviewable. They persist the proposed value,
evidence, rule ID/version, timestamps, and pending/accepted/rejected status.
They use only currently stored/imported coded diagnoses and comorbidities,
typed coded diagnoses, imported medications/allergies, and supported labs. A
clinician answer wins; rejection never becomes a NO answer; suggestions do not
backfill frozen cases or infer unavailable data. Accepted add-diagnosis
suggestions retain the linked diagnosis record to prevent duplicate export rows.

OMOP behavior is explicit:

- YES is concept `4188539`; NO is concept `4188540`.
- Normal coded answers export as observation rows.
- Unanswered optional questions export no row.
- Unmapped questions use observation concept `0` with a stable `LOSPOR:` source
  key, source response, and provenance.
- A2 uses `LOSPOR:PREOP_A2_REDUCED_EXERCISE_TOLERANCE`; Athena concept `4086848`
  is not used.
- Positive A3 exports `condition_occurrence` concept `40491502`, unless the
  accepted linked diagnosis already accounts for that diagnosis record.
- Imported diagnoses, medications, labs, and procedures retain their existing
  domains.

## Source-first vendoring

The serverless/upstream repositories are the source and demo layer. Changes are
implemented and locally committed there first, then carried into this Hospital
repository through upstream vendoring. Serverless demo deployments do not
receive Hospital-only appliance behavior. This 1.4.7 implementation is local
source work: it is committed locally and is not pushed, tagged, merged, or
published by this task.
