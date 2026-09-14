# Third-party content

LOSPOR Hospital's own code is licensed under the GNU AGPL v3. The reference
data below is not LOSPOR's work. It keeps its owners' rights and terms, and is
included only so that clinicians can code what they record and import what
the hospital's systems send. The vendored LOSPOR Core and API carry the same
content; their `NOTICE.md` files name the files it is in.

## LOINC

Laboratory tests, the NHIS laboratory mapping, the EHR import and the research
export carry LOINC codes.

This material contains content from LOINC (http://loinc.org). LOINC is
copyright © 1995-2026, Regenstrief Institute, Inc. and the Logical Observation
Identifiers Names and Codes (LOINC) Committee and is available at no cost under
the license at http://loinc.org/license. LOINC® is a registered United States
trademark of Regenstrief Institute, Inc.

## ICD-10

Codes and titles of the International Statistical Classification of Diseases
and Related Health Problems, 10th Revision (ICD-10), © World Health
Organization. Bulgarian titles and national sub-codes come from nomenclature
CL011 "МКБ-10" of the Bulgarian National Health Information System (НЗИС),
Ministry of Health of the Republic of Bulgaria, version 1.5.27
(https://www.his.bg).

## NHIS nomenclatures

The EHR import reads codes of NHIS lists CL011, CL013, CL024, CL046 and CL076
(НЗИС, Ministry of Health of the Republic of Bulgaria, nomenclatures version
1.5.27). `apps/api/src/lib/hospital/nhis-routes.ts` lists CL013 keys, which
identify route terms of the EDQM Standard Terms database (European Directorate
for the Quality of Medicines & HealthCare, Council of Europe), and CL046 HL7
route codes; it holds keys only, not EDQM term text.

## Procedures

Procedure groups are the categories of the Clinical Classifications Software
Refined for ICD-10-PCS procedures (PRCCSR) v2025.1, Healthcare Cost and
Utilization Project (HCUP), Agency for Healthcare Research and Quality
(https://hcup-us.ahrq.gov), over ICD-10-PCS codes (U.S. Centers for Medicare &
Medicaid Services, public domain).

Bulgarian procedure codes and words come from the Bulgarian Classification of
Medical Procedures (КСМП, 2020, updated 17.02.2026), National Centre of Public
Health and Analyses (НЦОЗА, https://ncpha.government.bg), which is based on the
Australian Classification of Health Interventions (ACHI), © Independent Health
and Aged Care Pricing Authority (IHACPA). `apps/api/src/lib/hospital/ksmp-procedure-groups.ts`
links them to the groups through NCPHA's КСМП to ICD-9-CM correspondence table
and the CMS ICD-9-CM to ICD-10-PCS General Equivalence Mappings (FY2013, public
domain).

## ATC

Drug data carries codes of the Anatomical Therapeutic Chemical (ATC)
classification, WHO Collaborating Centre for Drug Statistics Methodology
(https://atcddd.fhi.no).

## OMOP vocabularies and SNOMED CT

The OMOP standardized vocabularies are not shipped with the appliance. Each
hospital downloads them from OHDSI Athena (https://athena.ohdsi.org) under the
licences Athena presents for each vocabulary, and imports them in Status.

A small number of curated research links name SNOMED CT concept identifiers.
SNOMED CT® is a registered trademark of SNOMED International, which licenses
its use; in countries that are not SNOMED International members an Affiliate
Licence is required (https://www.snomed.org).
