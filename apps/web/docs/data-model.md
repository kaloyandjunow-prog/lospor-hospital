# Stored Data Model - LOSPOR

`lospor-app` is the canonical API and PostgreSQL schema for web, mobile, and PWA clients. Mobile payloads must be mapped into the canonical web/API field names before persistence. Patient names, national identifiers, and hospital file numbers are intentionally not stored.

## Account and access data

- **User:** email, names/title, password hash, role, primary institution, approval state, accepted terms/privacy versions and timestamps, last login, soft-deletion timestamp, creation timestamp.
- **Institution:** name, city, country.
- **RoleRequest:** requesting user, status, request and resolution timestamps.
- **RevokedToken:** JWT identifier, revocation time, expiry.
- **AuditLog:** user, action, affected entity, optional JSON detail, timestamp.
- **RateLimit:** rate-limit key, request count, window start.

## Case lifecycle and collaboration

- **Case:** pseudonymised case code, private notes, owner, case-level institution ID, status, finalisation timestamp, creation/update timestamps.
- **CaseLock:** active editor user/device/expiry.
- **CaseTransfer:** sender, recipient, initiator, status, creation/resolution timestamps.
- **CaseFieldChange:** per-field preop/postop change log.
- **CaseSnapshot:** immutable finalisation snapshot. New snapshots default to schema version `3.0.0` (a data-contract value, independent of the app release version).

## Intraoperative event source

- **CaseEvent:** append-only intraoperative timeline event table. Every row carries case/user, logical event ID, version, status (`active`, `superseded`, `deleted`), event type, timestamp, typed values, source/provenance, schema/source version, idempotency key, and raw JSON metadata.
- Typed columns include BP, HR, SpO2, EtCO2, temperature, serum/peripheral glucose, LOINC glucose code/unit, FGF, carrier gas, FiO2, FiAir, FiN2O, ATC, drugId, INN, route, infusion/fluid IDs, rate, concentration, volume, fluid category, agent percent, and clinical event code.
- `IntraoperativeRecord.keyEvents` is a projection/cache rebuilt from active `CaseEvent` rows for legacy chart/PDF readers.

## Clinical terminology and canonical libraries

- **Icd10Code / Icd10Synonym:** ICD-10 codes with English and Bulgarian labels plus ICD-10CM synonyms for search.
- **Atc:** ATC drug classification tree.
- **Drug:** Bulgarian drug registry with name, INN, ATC code, form, and strength.
- **LabLoinc:** canonical lab name, LOINC code, canonical unit, reference range.
- **OptionLibrary:** shared picker catalogue for techniques, positions, airway, ventilation, monitoring, premedication drugs, bolus drugs, infusions, inhalational agents, fluids, clinical events, sex, blood group, airway grades, disposition, handover, and numeric range specs.
- **OmopVocabulary / OmopConcept / OmopConceptRelationship / OmopConceptAncestor / OmopConceptSynonym:** local Athena vocabulary import tables used for concept resolution and research export mapping.
- **OmopVocabularyImport:** import manifest for local Athena CSV loads, including source folder, vocabulary version, imported table counts, status, and errors.
- **ConceptMap:** local bilingual/source concept map. Stores domain, source vocabulary/code, English/Bulgarian labels, optional standard vocabulary/concept ID, mapping status, mapping method/confidence, review status, Athena version, source version, and active flag.
- **CustomTerm:** generated local code, term, type, optional institution scope.

## Preoperative assessment

- Demographics: age, sex, height, weight, BMI, blood type, Rh factor.
- Case details: diagnosis text, structured diagnoses JSON, planned procedure text, structured procedures JSON, ICD code, team notes, physical exam report, notes.
- History: comorbidities JSON, allergy flag/details, latex allergy, current medications, family anaesthesia problems/details, dental prosthetics, loose teeth, smoking, substance abuse.
- Vitals: BP, heart rate, arrhythmia flag, SpO2, temperature, respiratory rate, and unable-to-obtain flags.
- Airway: Mallampati, mouth opening, thyromental distance, neck mobility, ULBT, retrognathia, prominent incisors, facial hair, difficult-airway history/notes, Cormack-Lehane, airway-unobtainable flag.
- Risk: ASA, elective/emergency/high-risk surgery, individual RCRI/Apfel/STOP-BANG inputs, computed RCRI/Apfel/STOP-BANG scores.
- Labs: canonical lab-result JSON used by the app plus normalized `LabResult` rows.
- AI: opt-in flag for AI support.

## Normalized preop rows

- **PreopDiagnosis:** case/preop, code, labels, system, source vocabulary/code, standard concept ID if mapped, mapping status, provenance, ordinal.
- **PreopProcedure:** case/preop, code, group, domain, description, source mapping, provenance, ordinal.
- **Comorbidity:** case/preop, label, English/Bulgarian labels, code, ICD-10 code, source mapping, provenance, ordinal.
- **LabResult:** test, string value, numeric value, unit, canonical unit, LOINC code, reference range, abnormal flag, takenAt, source, source mapping, source version, ordinal.
- **Medication:** `CURRENT` or `ALLERGY`, drugId, raw name, INN, ATC code, dose, route, frequency, source mapping, provenance, ordinal.

## Intraoperative record

- Timing: month/year, duration, start time, end time.
- Position/technique: positions JSON, techniques JSON.
- Airway/ventilation: airway device, legacy tube/cuff fields for old rows, PEEP, IPPV, jet, FOB, airway tools, airway notes, Cormack-Lehane, airway devices JSON, ventilation modes JSON, LMA/ETT/DLT/endobronchial details.
- Monitoring: ECG, SpO2, NBP, invasive BP, CVP, EtCO2, temperature, glucose, blood gas, neuro, PA catheter, TEE, BIS, entropy, NIRS, evoked potentials, TOF, urinary catheter, stomach tube.
- Gas settings are stored over time in `CaseEvent`, not the active scalar UI. Legacy gas scalar columns remain for old rows/compatibility only.
- Medication/balance: premedication text fields, drug JSON compatibility fields, crystalloids, colloids, blood, blood-product notes, urine.
- Timeline: key-events projection/cache, complications.

## Normalized intraop/postop rows

- **VascularAccess:** intraop/case, site, site label, size/unit, depth, lumens, pre-existing flag, source mapping, provenance, ordinal.
- **PremedicationAdministration:** phase, drugId, raw name, INN, ATC code, dose, route, source mapping, provenance, ordinal.
- **CaseSelection:** case, section, category, value, source mapping, provenance, ordinal.
- **CaseComplication:** case, section, label, note, timestamp, source/event ID, source mapping, source version, ordinal.

## Postoperative record

- Aldrete subscores and total.
- Recovery vitals: BP, HR, SpO2, temperature, unable-to-obtain flags.
- Pain NRS, PONV, disposition, disposition notes, handover items, complications.
- Metadata: update timestamp.

## Missingness and provenance

- **ClinicalFieldStatus:** case, section, fieldKey, presence, source, sourceVersion, timestamps.
- Presence values: `PRESENT`, `ABSENT`, `UNKNOWN`, `NOT_APPLICABLE`, `NOT_DOCUMENTED`.
- This prevents blank research fields from being misread as negative findings.
- Field status is recorded broadly across preop, intraop, timetable-adjacent event sources, and postop so normalized rows can be treated as the research/export authority.

## OMOP/export model

- OMOP export `source_version` is a data-contract value reflecting the release that last changed the export shape (currently `3.8.0` — see `lospor-api/src/lib/omop-mapper.ts`, which owns the mapper), independent of the app version.
- Export reads normalized rows and active `CaseEvent` rows.
- Known OMOP concept IDs are exported where `ConceptMap`/row mappings are confident.
- Source-only values keep source vocabulary, source code, and labels; fake concept IDs are not used.
- Free-text fields are redacted before export/AI-advisor paths.
- Export bundles include a manifest with table counts, mapping summary, de-identification notes, and quality warnings. App exports warn rather than block when source-only mappings, missing field-status rows, exact timestamps, or institution linkage are present.

## Release and seed order

For a fresh/live deployment:

1. `npx prisma migrate deploy`
2. `npx tsx scripts/seed-athena-vocabularies.ts --vocab-dir /path/to/athena-csvs --filtered-lospor`
3. `npx tsx scripts/seed-vocabularies.ts --vocab-dir /path/to/athena-csvs`
4. `npx tsx scripts/seed-lab-loinc.ts`
5. `npx tsx scripts/seed-option-library.ts`
6. `npx tsx scripts/seed-concept-maps.ts`
7. `npx tsx scripts/backfill-relational.ts`
8. `npx tsx scripts/data-quality-report.ts`
9. Generate/fetch option-library fallback snapshots before web/mobile build.

Do not edit old applied Prisma migration files. Additive follow-up migrations are required for any live schema correction.
