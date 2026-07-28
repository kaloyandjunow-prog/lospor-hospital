export type LabTest = {
  name: string
  unit: string
  refLow?: number
  refHigh?: number
  refText?: string
}

export type LabCategory = {
  id: string
  label: string
  tests: LabTest[]
}

export const LAB_CATEGORIES: LabCategory[] = [
  {
    id: "haematology",
    label: "Haematology",
    tests: [
      { name: "Haemoglobin (Hb)", unit: "g/L", refLow: 120, refHigh: 175 },
      { name: "Haematocrit (Hct)", unit: "%", refLow: 36, refHigh: 52 },
      { name: "Erythrocytes (RBC)", unit: "×10¹²/L", refLow: 3.8, refHigh: 5.8 },
      { name: "Leucocytes (WBC)", unit: "×10⁹/L", refLow: 4, refHigh: 11 },
      { name: "Platelets", unit: "×10⁹/L", refLow: 150, refHigh: 400 },
      { name: "MCV", unit: "fL", refLow: 80, refHigh: 100 },
      { name: "MCH", unit: "pg", refLow: 27, refHigh: 33 },
      { name: "MCHC", unit: "g/L", refLow: 320, refHigh: 360 },
      { name: "Neutrophils", unit: "%", refLow: 40, refHigh: 75 },
      { name: "Lymphocytes", unit: "%", refLow: 20, refHigh: 45 },
      { name: "Monocytes", unit: "%", refLow: 2, refHigh: 10 },
      { name: "Eosinophils", unit: "%", refLow: 1, refHigh: 6 },
      { name: "Reticulocytes", unit: "%", refLow: 0.5, refHigh: 2.5 },
    ],
  },
  {
    id: "coagulation",
    label: "Coagulation",
    tests: [
      { name: "PT (Prothrombin time)", unit: "s", refLow: 11, refHigh: 15 },
      { name: "INR", unit: "", refLow: 0.8, refHigh: 1.2 },
      { name: "aPTT", unit: "s", refLow: 25, refHigh: 38 },
      { name: "Fibrinogen", unit: "g/L", refLow: 2, refHigh: 4 },
      { name: "D-dimer", unit: "mg/L FEU", refHigh: 0.5 },
      { name: "Thrombin time (TT)", unit: "s", refLow: 14, refHigh: 19 },
      { name: "Anti-Xa", unit: "IU/mL" },
    ],
  },
  {
    id: "electrolytes",
    label: "Electrolytes",
    tests: [
      { name: "Sodium (Na⁺)", unit: "mmol/L", refLow: 136, refHigh: 145 },
      { name: "Potassium (K⁺)", unit: "mmol/L", refLow: 3.5, refHigh: 5.1 },
      { name: "Chloride (Cl⁻)", unit: "mmol/L", refLow: 98, refHigh: 107 },
      { name: "Bicarbonate (HCO₃⁻)", unit: "mmol/L", refLow: 22, refHigh: 29 },
      { name: "Calcium (Ca²⁺)", unit: "mmol/L", refLow: 2.15, refHigh: 2.55 },
      { name: "Ionised Ca²⁺", unit: "mmol/L", refLow: 1.15, refHigh: 1.35 },
      { name: "Magnesium (Mg²⁺)", unit: "mmol/L", refLow: 0.7, refHigh: 1.0 },
      { name: "Phosphate", unit: "mmol/L", refLow: 0.8, refHigh: 1.5 },
    ],
  },
  {
    id: "biochemistry",
    label: "Biochemistry",
    tests: [
      { name: "Creatinine", unit: "μmol/L", refLow: 44, refHigh: 115 },
      { name: "eGFR", unit: "mL/min/1.73m²", refLow: 60 },
      { name: "Urea (BUN)", unit: "mmol/L", refLow: 2.5, refHigh: 7.8 },
      { name: "Glucose", unit: "mmol/L", refLow: 3.9, refHigh: 6.1 },
      { name: "HbA1c", unit: "%", refHigh: 6.5 },
      { name: "Lactate", unit: "mmol/L", refLow: 0.5, refHigh: 2.2 },
      { name: "Uric acid", unit: "μmol/L", refLow: 202, refHigh: 416 },
      { name: "Total protein", unit: "g/L", refLow: 64, refHigh: 83 },
      { name: "Albumin", unit: "g/L", refLow: 35, refHigh: 52 },
    ],
  },
  {
    id: "liver",
    label: "Liver",
    tests: [
      { name: "ALT (SGPT)", unit: "U/L", refHigh: 56 },
      { name: "AST (SGOT)", unit: "U/L", refHigh: 40 },
      { name: "ALP", unit: "U/L", refLow: 44, refHigh: 147 },
      { name: "GGT", unit: "U/L", refHigh: 55 },
      { name: "Total bilirubin", unit: "μmol/L", refHigh: 21 },
      { name: "Direct bilirubin", unit: "μmol/L", refHigh: 5 },
      { name: "Total bile acids", unit: "μmol/L", refHigh: 10 },
    ],
  },
  {
    id: "cardiac",
    label: "Cardiac",
    tests: [
      { name: "Troponin I (hs-cTnI)", unit: "ng/L", refHigh: 26 },
      { name: "Troponin T (hs-cTnT)", unit: "ng/L", refHigh: 14 },
      { name: "CK (Creatine kinase)", unit: "U/L", refHigh: 200 },
      { name: "CK-MB", unit: "U/L", refHigh: 25 },
      { name: "BNP", unit: "pg/mL", refHigh: 100 },
      { name: "NT-proBNP", unit: "pg/mL", refHigh: 125 },
      { name: "Myoglobin", unit: "μg/L", refHigh: 90 },
    ],
  },
  {
    id: "blood_gas",
    label: "Blood Gas",
    tests: [
      { name: "pH", unit: "", refLow: 7.35, refHigh: 7.45 },
      { name: "PaO₂", unit: "mmHg", refLow: 80, refHigh: 100 },
      { name: "PaCO₂", unit: "mmHg", refLow: 35, refHigh: 45 },
      { name: "HCO₃⁻ (ABG)", unit: "mmol/L", refLow: 22, refHigh: 26 },
      { name: "Base excess (BE)", unit: "mmol/L", refLow: -2, refHigh: 2 },
      { name: "SaO₂", unit: "%", refLow: 94, refHigh: 99 },
      { name: "Lactate (ABG)", unit: "mmol/L", refLow: 0.5, refHigh: 2.0 },
    ],
  },
  {
    id: "thyroid",
    label: "Thyroid",
    tests: [
      { name: "TSH", unit: "mIU/L", refLow: 0.4, refHigh: 4.0 },
      { name: "Free T4 (fT4)", unit: "pmol/L", refLow: 12, refHigh: 22 },
      { name: "Free T3 (fT3)", unit: "pmol/L", refLow: 3.5, refHigh: 6.5 },
    ],
  },
  {
    id: "inflammatory",
    label: "Inflammatory",
    tests: [
      { name: "CRP", unit: "mg/L", refHigh: 10 },
      { name: "ESR", unit: "mm/h", refHigh: 20 },
      { name: "Ferritin", unit: "μg/L", refLow: 12, refHigh: 300 },
      { name: "Procalcitonin (PCT)", unit: "μg/L", refHigh: 0.25 },
      { name: "IL-6", unit: "pg/mL", refHigh: 7 },
    ],
  },
]

export const LAB_LIBRARY = LAB_CATEGORIES.flatMap(category => category.tests)

export function getLabByName(name: string): LabTest | undefined {
  return LAB_LIBRARY.find(test => test.name === name)
}

export function getLabOutOfRange(test: LabTest, value: number): "low" | "high" | null {
  if (test.refLow !== undefined && value < test.refLow) return "low"
  if (test.refHigh !== undefined && value > test.refHigh) return "high"
  return null
}

export function getLabFlag(test: LabTest, value: number): "low" | "high" | "normal" | null {
  if (!Number.isFinite(value)) return null
  return getLabOutOfRange(test, value) ?? "normal"
}

export function formatLabReferenceRange(test: LabTest): string | null {
  if (test.refText) return test.refText
  if (test.refLow === undefined && test.refHigh === undefined) return null
  if (test.refLow !== undefined && test.refHigh !== undefined) return `${test.refLow}-${test.refHigh}`
  if (test.refLow !== undefined) return `>=${test.refLow}`
  return `<=${test.refHigh}`
}

export function searchLabs(query: string): { category: LabCategory; test: LabTest }[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: { category: LabCategory; test: LabTest }[] = []
  for (const category of LAB_CATEGORIES) {
    for (const test of category.tests) {
      if (test.name.toLowerCase().includes(q)) {
        results.push({ category, test })
      }
    }
  }
  return results
}
