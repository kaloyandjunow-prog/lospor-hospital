# Third-party content

LOSPOR's own code is licensed under the GNU AGPL v3 (see `LICENSE`). The
reference data below is not LOSPOR's work. It keeps its owners' rights and
terms, and is included only so that clinicians can code what they record.

## LOINC

The laboratory library (`src/labs.ts`, `src/ehr-lab-codes.ts`) and the NHIS
laboratory mapping (`src/nhis-cl024-labs.ts`) carry LOINC codes.

This material contains content from LOINC (http://loinc.org). LOINC is
copyright © 1995-2026, Regenstrief Institute, Inc. and the Logical Observation
Identifiers Names and Codes (LOINC) Committee and is available at no cost under
the license at http://loinc.org/license. LOINC® is a registered United States
trademark of Regenstrief Institute, Inc.

## ICD-10

`src/vocabulary/icd10.ts` holds codes and titles of the International
Statistical Classification of Diseases and Related Health Problems, 10th
Revision (ICD-10), © World Health Organization.

Its Bulgarian titles and the Bulgarian national sub-codes come from the
National Health Information System (НЗИС) nomenclature CL011 "МКБ-10",
version 1.5.27, published by the Ministry of Health of the Republic of Bulgaria
(https://www.his.bg).

## NHIS nomenclatures

The laboratory codes of NHIS list CL024 are those of the Bulgarian National
Health Information System (НЗИС), Ministry of Health of the Republic of
Bulgaria, nomenclatures version 1.5.27.

## Procedures

`src/vocabulary/procedures.ts` groups ICD-10-PCS codes (U.S. Centers for
Medicare & Medicaid Services, public domain) into the categories of the
Clinical Classifications Software Refined for ICD-10-PCS procedures (PRCCSR)
v2025.1, Healthcare Cost and Utilization Project (HCUP), Agency for Healthcare
Research and Quality (https://hcup-us.ahrq.gov).

The Bulgarian search words attached to those groups are taken from the
Bulgarian Classification of Medical Procedures (КСМП, 2020, updated
17.02.2026), National Centre of Public Health and Analyses (НЦОЗА,
https://ncpha.government.bg), which is based on the Australian Classification
of Health Interventions (ACHI), © Independent Health and Aged Care Pricing
Authority (IHACPA). They are matched to the groups through NCPHA's КСМП to
ICD-9-CM correspondence table and the CMS ICD-9-CM to ICD-10-PCS General
Equivalence Mappings (FY2013, public domain).

## ATC

Drug catalogs carry codes of the Anatomical Therapeutic Chemical (ATC)
classification, WHO Collaborating Centre for Drug Statistics Methodology
(https://atcddd.fhi.no).
