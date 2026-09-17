/**
 * Clinically reviewed NHIS CL024 laboratory mappings.
 *
 * Source: NHIS nomenclature workbook 1.5.27 (29 June 2026). The LOINC
 * concepts were checked against Athena LOINC 2.80. This is deliberately not
 * the whole of CL024: it contains only the keys reviewed for LOSPOR's 66-test
 * perioperative laboratory library.
 */

export const NHIS_CL024_VOCABULARY = "NHIS_CL024"

export type NhisCl024LabRelationship =
  | "exact"
  | "reviewed-crosswalk"
  | "accepted-alternative"
  | "source-only"

export type NhisCl024LabMapping = {
  code: string
  test: string
  labelBg: string
  labelEn: string
  ucumCode?: string
  /**
   * The LOINC represented by this imported result.
   *
   * It is the NHIS-provided alternative where one exists, the LOSPOR
   * canonical LOINC for a reviewed crosswalk, and absent for source-only
   * results whose assay or scale is not sufficiently specified.
   */
  loincCode?: string
  relationship: NhisCl024LabRelationship
}

export const NHIS_CL024_LAB_MAPPINGS: readonly NhisCl024LabMapping[] = Object.freeze([
  { code: "01-000-02", test: "Haemoglobin (Hb)", labelBg: "Изследвания на кръв - Хемоглобин (HGB)", labelEn: "Hemoglobin (HGB)", ucumCode: "g/dL", loincCode: "718-7", relationship: "exact" },
  { code: "01-000-03", test: "Haematocrit (Hct)", labelBg: "Изследвания на кръв - Хематокрит (HCT)", labelEn: "Hematocrit (HCT)", ucumCode: "%", loincCode: "20570-8", relationship: "accepted-alternative" },
  { code: "01-000-01", test: "Erythrocytes (RBC)", labelBg: "Изследвания на кръв - Еритроцити (RBC)", labelEn: "Erythrocytes (RBC)", ucumCode: "10*6/uL", loincCode: "26453-1", relationship: "accepted-alternative" },
  { code: "01-000-00", test: "Leucocytes (WBC)", labelBg: "Изследвания на кръв - Левкоцити (WBC)", labelEn: "Leukocytes (WBC)", ucumCode: "10*3/uL", loincCode: "26464-8", relationship: "accepted-alternative" },
  { code: "01-000-0D", test: "Platelets", labelBg: "Изследвания на кръв - Tромбоцити (PLT)", labelEn: "Platelets (PLT)", ucumCode: "10*3/uL", loincCode: "26515-7", relationship: "accepted-alternative" },
  { code: "01-000-04", test: "MCV", labelBg: "Изследвания на кръв - Среден обем на еритроцитите (MCV)", labelEn: "Mean corpuscular volume (MCV)", ucumCode: "fL", loincCode: "30428-7", relationship: "accepted-alternative" },
  { code: "01-000-05", test: "MCH", labelBg: "Изследвания на кръв - Средно съдържание на хемоглобин в еритроцита (MCH)", labelEn: "Mean corpuscular hemoglobin (MCH)", ucumCode: "pg", loincCode: "28539-5", relationship: "accepted-alternative" },
  { code: "01-000-06", test: "MCHC", labelBg: "Изследвания на кръв - Средна концентрация на хемоглобин в еритроцитите (MCHC)", labelEn: "Mean corpuscular hemoglobin concentration (MCHC)", ucumCode: "g/dL", loincCode: "28540-3", relationship: "accepted-alternative" },
  { code: "01-001-07", test: "Neutrophils", labelBg: "Изследвания на кръв - Неутрофили, %", labelEn: "Neutrophils / 100 Leukocytes", ucumCode: "%", loincCode: "26511-6", relationship: "accepted-alternative" },
  { code: "01-001-06", test: "Lymphocytes", labelBg: "Изследвания на кръв - Лимфоцити, %", labelEn: "Lymphocytes / 100 Leukocytes", ucumCode: "%", loincCode: "26478-8", relationship: "accepted-alternative" },
  { code: "01-001-02", test: "Monocytes", labelBg: "Изследвания на кръв - Моноцити, %", labelEn: "Monocytes / 100 Leukocytes", ucumCode: "%", loincCode: "26485-3", relationship: "accepted-alternative" },
  { code: "01-001-05", test: "Eosinophils", labelBg: "Изследвания на кръв - Еозинофили, %", labelEn: "Eosinophils / 100 Leukocytes", ucumCode: "%", loincCode: "26450-7", relationship: "accepted-alternative" },
  { code: "01-00F-01", test: "Reticulocytes", labelBg: "Изследване на ретикулоцити, % (RET)", labelEn: "Reticulocytes / 100 Erythrocytes", ucumCode: "%", loincCode: "4679-7", relationship: "accepted-alternative" },
  { code: "01-010-00", test: "PT (Prothrombin time)", labelBg: "Изследване на протромбиново време в секунди (PT)", labelEn: "Prothrombin time (PT), s", ucumCode: "s", loincCode: "5902-2", relationship: "exact" },
  { code: "01-010-01", test: "INR", labelBg: "Изследване на протромбиново време чрез INR (PT)", labelEn: "Prothrombin time (PT), INR", ucumCode: "{INR}", loincCode: "6301-6", relationship: "exact" },
  { code: "01-008-00", test: "aPTT", labelBg: "Изследване на активирано парциално тромбопластиново време (APTT)", labelEn: "Activated partial thromboplastin time (APTT)", ucumCode: "s", loincCode: "3173-2", relationship: "exact" },
  { code: "01-009-00", test: "Fibrinogen", labelBg: "Изследване на фибриноген", labelEn: "Fibrinogen", ucumCode: "mg/dL", loincCode: "97016-0", relationship: "accepted-alternative" },
  { code: "00-00E-00", test: "D-dimer", labelBg: "Изследване на D – димер тест", labelEn: "D-dimer test", relationship: "source-only" },
  { code: "01-007-00", test: "Thrombin time (TT)", labelBg: "Изследване на тромбиново време в секунди (TT)", labelEn: "Thrombin time (TT)", ucumCode: "s", loincCode: "3243-3", relationship: "exact" },
  { code: "03-019-00", test: "Sodium (Na⁺)", labelBg: "Клинично-химични изследвания за натрий", labelEn: "Clinical chemistry test for sodium", ucumCode: "mmol/L", loincCode: "2951-2", relationship: "reviewed-crosswalk" },
  { code: "03-019-01", test: "Potassium (K⁺)", labelBg: "Клинично-химични изследвания за калий", labelEn: "Clinical chemistry test for potassium", ucumCode: "mmol/L", loincCode: "2823-3", relationship: "reviewed-crosswalk" },
  { code: "03-01E-00", test: "Chloride (Cl⁻)", labelBg: "Клинично-химични изследвания за хлориди", labelEn: "Clinical chemistry test for chlorides", ucumCode: "mmol/L", loincCode: "2075-0", relationship: "exact" },
  { code: "03-01A-00", test: "Calcium (Ca²⁺)", labelBg: "Клинично-химични изследвания за калций", labelEn: "Clinical chemistry test for calcium", ucumCode: "mmol/L", loincCode: "2000-8", relationship: "reviewed-crosswalk" },
  { code: "03-01F-00", test: "Magnesium (Mg²⁺)", labelBg: "Клинично-химични изследвания за магнезий", labelEn: "Clinical chemistry test for magnesium", ucumCode: "mmol/L", loincCode: "2601-3", relationship: "reviewed-crosswalk" },
  { code: "03-01B-00", test: "Phosphate", labelBg: "Клинично-химични изследвания за фосфати", labelEn: "Clinical chemistry test for phosphates", ucumCode: "mmol/L", loincCode: "14879-1", relationship: "reviewed-crosswalk" },
  { code: "03-003-00", test: "Creatinine", labelBg: "Клинично-химични изследвания за креатинин", labelEn: "Clinical chemistry test for creatinine", ucumCode: "umol/L", loincCode: "14682-9", relationship: "reviewed-crosswalk" },
  { code: "03-029-00", test: "eGFR", labelBg: "Изчислена гломерулна филтрация (eGFR)", labelEn: "Results for Estimated Glomerular Filtration Rate - eGFR", ucumCode: "mL/min/1.73m²", loincCode: "98979-8", relationship: "accepted-alternative" },
  { code: "03-004-00", test: "Urea (BUN)", labelBg: "Клинично-химични изследвания за урея", labelEn: "Clinical chemistry test for urea", ucumCode: "mmol/L", loincCode: "22664-7", relationship: "reviewed-crosswalk" },
  { code: "03-002-00", test: "Glucose", labelBg: "Клинично-химични изследвания за глюкоза", labelEn: "Clinical chemistry test for glucose", ucumCode: "mmol/L", loincCode: "14749-6", relationship: "reviewed-crosswalk" },
  { code: "03-010-00", test: "HbA1c", labelBg: "Клинично-химични изследвания за гликиран хемоглобин", labelEn: "Clinical chemistry test for glycated hemoglobin (HbA1c)", ucumCode: "%", loincCode: "4548-4", relationship: "reviewed-crosswalk" },
  { code: "03-011-00", test: "Uric acid", labelBg: "Клинично-химични изследвания за пикочна киселина", labelEn: "Clinical chemistry test for uric acid", ucumCode: "umol/L", loincCode: "14933-6", relationship: "reviewed-crosswalk" },
  { code: "03-007-00", test: "Total protein", labelBg: "Клинично-химични изследвания за общ белтък", labelEn: "Clinical chemistry test for total protein", ucumCode: "g/L", loincCode: "2885-2", relationship: "reviewed-crosswalk" },
  { code: "03-008-00", test: "Albumin", labelBg: "Клинично-химични изследвания за албумин", labelEn: "Clinical chemistry test for albumin", ucumCode: "g/L", loincCode: "1751-7", relationship: "reviewed-crosswalk" },
  { code: "03-013-00", test: "ALT (SGPT)", labelBg: "Клинично-химични изследвания за АЛАТ", labelEn: "Clinical chemistry test for ALAT (ALT)", ucumCode: "U/L", loincCode: "1742-6", relationship: "reviewed-crosswalk" },
  { code: "03-012-00", test: "AST (SGOT)", labelBg: "Клинично-химични изследвания за AСАТ", labelEn: "Clinical chemistry test for ASAT (AST)", ucumCode: "U/L", loincCode: "1920-8", relationship: "reviewed-crosswalk" },
  { code: "03-016-00", test: "ALP", labelBg: "Клинично-химични изследвания за алкална фосфатаза (АФ)", labelEn: "Clinical chemistry test for alkaline phosphatase (ALP)", ucumCode: "U/L", loincCode: "6768-6", relationship: "reviewed-crosswalk" },
  { code: "03-015-00", test: "GGT", labelBg: "Клинично-химични изследвания за ГГТ", labelEn: "Clinical chemistry test for GGT", ucumCode: "U/L", loincCode: "2324-2", relationship: "reviewed-crosswalk" },
  { code: "03-005-00", test: "Total bilirubin", labelBg: "Клинично-химични изследвания за общ билирубин", labelEn: "Clinical chemistry test for total bilirubin", ucumCode: "umol/L", loincCode: "14631-6", relationship: "reviewed-crosswalk" },
  { code: "03-006-00", test: "Direct bilirubin", labelBg: "Клинично-химични изследвания за директен билирубин", labelEn: "Clinical chemistry test for direct bilirubin", ucumCode: "umol/L", loincCode: "14629-0", relationship: "reviewed-crosswalk" },
  { code: "00-00C-00", test: "Troponin I (hs-cTnI)", labelBg: "Изследване на тропонин I (cTnI)", labelEn: "Troponin I (cTnI)", ucumCode: "ng/L", relationship: "source-only" },
  { code: "00-02D-00", test: "Troponin T (hs-cTnT)", labelBg: "Изследване на сърдечен тропонин (cTnT)", labelEn: "Cardiac troponin T (cTnT)", ucumCode: "ng/L", relationship: "source-only" },
  { code: "03-014-00", test: "CK (Creatine kinase)", labelBg: "Клинично-химични изследвания за креатинкиназа (КК)", labelEn: "Clinical chemistry test for creatine kinase (CK)", ucumCode: "U/L", loincCode: "2157-6", relationship: "reviewed-crosswalk" },
  { code: "00-00B-00", test: "CK-MB", labelBg: "Изследване на МВ фракция на креатинкиназа", labelEn: "Examination of CK-MB (MB fraction of creatine kinase)", relationship: "source-only" },
  { code: "00-02B-00", test: "BNP", labelBg: "Изследване на натриуретричен пептид (BNP)", labelEn: "B-type Natriuretic Peptide (BNP)", ucumCode: "pg/mL", loincCode: "42637-9", relationship: "reviewed-crosswalk" },
  { code: "00-02C-00", test: "NT-proBNP", labelBg: "Изследване на фрагмент на прохормона на натриуретичен пептид (NT-pro BNP)", labelEn: "Aminoterminal pro B-type natriuretic peptide (NT-pro BNP)", ucumCode: "pg/mL", loincCode: "33762-6", relationship: "reviewed-crosswalk" },
  { code: "08-002-00", test: "TSH", labelBg: "Изследване на хормон TSH", labelEn: "Test for hormone TSH", ucumCode: "m[IU]/L", loincCode: "3016-3", relationship: "exact" },
  { code: "03-00A-00", test: "CRP", labelBg: "Клинично-химични изследвания за С-реактивен протеин", labelEn: "C-reactive protein (CRP)", ucumCode: "mg/L", loincCode: "1988-5", relationship: "reviewed-crosswalk" },
  { code: "01-003-00", test: "ESR", labelBg: "Определяне на скорост на утаяване на еритроцитите", labelEn: "Erythrocyte sedimentation rate (ESR)", ucumCode: "mm/h", loincCode: "30341-2", relationship: "accepted-alternative" },
  { code: "03-021-00", test: "Ferritin", labelBg: "Определяне на феритин", labelEn: "Ferritin", ucumCode: "ng/mL", loincCode: "2276-4", relationship: "exact" },
  { code: "08-012-00", test: "Procalcitonin (PCT)", labelBg: "Изследване на Прокалцитонин (PCT)", labelEn: "Test for Procalcitonin (PCT)", ucumCode: "ng/mL", loincCode: "33959-8", relationship: "accepted-alternative" },
])

export const NHIS_CL024_LAB_BY_CODE: ReadonlyMap<string, NhisCl024LabMapping> = new Map(
  NHIS_CL024_LAB_MAPPINGS.map(mapping => [mapping.code, mapping]),
)

/** True only for an explicitly CL024-namespaced code system. */
export function isNhisCl024System(system: string | null | undefined): boolean {
  const normalized = (system ?? "").trim().toLocaleLowerCase("en")
  return normalized === NHIS_CL024_VOCABULARY.toLocaleLowerCase("en")
    || /(?:^|[/:_.-])cl024(?:$|[/:_.-])/.test(normalized)
}

