export type ASASuggestion = {
  cls: "I" | "II" | "III" | "IV"
  reasons: string[]
  reasonCodes: string[]
}

type ASARule = [prefix: string, minLength: number, cls: 2 | 3 | 4, reasonCode: string, label: string]

const ASA_RULES: ASARule[] = [
  ["N18.6", 5, 4, "esrd", "End-stage renal disease (not on dialysis)"],
  ["N18.5", 5, 4, "ckd_stage_5", "Chronic kidney disease stage 5"],
  ["I50.2", 5, 4, "systolic_heart_failure", "Systolic heart failure"],
  ["I50.3", 5, 4, "diastolic_heart_failure", "Diastolic heart failure"],
  ["I50", 3, 3, "heart_failure", "Heart failure"],
  ["I21", 3, 3, "acute_mi", "Acute MI"],
  ["I25", 3, 3, "ischemic_heart_disease", "Chronic ischaemic heart disease"],
  ["I63", 3, 3, "cerebral_infarction", "Cerebral infarction (stroke)"],
  ["I64", 3, 3, "stroke", "Stroke / CVA"],
  ["G45", 3, 3, "tia", "TIA"],
  ["Z95.0", 5, 3, "pacemaker_icd", "Pacemaker / ICD"],
  ["Z95.1", 5, 3, "implanted_cardiac_device", "Implanted cardiac device"],
  ["J44", 3, 3, "copd", "COPD"],
  ["J45.5", 5, 3, "severe_asthma", "Severe persistent asthma"],
  ["E10", 3, 3, "type_1_diabetes", "Type 1 diabetes mellitus"],
  ["K70.3", 5, 3, "alcoholic_cirrhosis", "Alcoholic liver cirrhosis"],
  ["K74", 3, 3, "cirrhosis", "Cirrhosis of liver"],
  ["N18", 3, 3, "ckd", "Chronic kidney disease"],
  ["Z99.2", 5, 3, "dialysis", "Dialysis"],
  ["E66.9", 5, 3, "morbid_obesity_code", "Morbid obesity"],
  ["G20", 3, 3, "parkinson", "Parkinson's disease"],
  ["F10.2", 5, 3, "alcohol_dependence", "Alcohol dependence"],
  ["F19.2", 5, 3, "substance_dependence", "Substance dependence"],
  ["Z86.7", 5, 3, "cardiovascular_history", "History of MI/stroke > 3 months"],
  ["I10", 3, 2, "hypertension", "Hypertension"],
  ["I11", 3, 2, "hypertensive_heart_disease", "Hypertensive heart disease"],
  ["I48", 3, 2, "atrial_fibrillation", "Atrial fibrillation"],
  ["I49", 3, 2, "arrhythmia", "Arrhythmia"],
  ["I73", 3, 2, "peripheral_vascular_disease", "Peripheral vascular disease"],
  ["I83", 3, 2, "varicose_veins", "Varicose veins / CVI"],
  ["I82", 3, 2, "dvt_history", "DVT history"],
  ["J45", 3, 2, "asthma", "Asthma"],
  ["E11", 3, 2, "type_2_diabetes", "Type 2 diabetes mellitus"],
  ["E03", 3, 2, "hypothyroidism", "Hypothyroidism"],
  ["E05", 3, 2, "hyperthyroidism", "Hyperthyroidism"],
  ["E04", 3, 2, "thyroid_disease", "Thyroid disease"],
  ["G40", 3, 2, "epilepsy", "Epilepsy"],
  ["G43", 3, 2, "migraine", "Migraine"],
  ["F32", 3, 2, "depression", "Depressive episode"],
  ["F33", 3, 2, "recurrent_depression", "Recurrent depression"],
  ["F41", 3, 2, "anxiety", "Anxiety disorder"],
  ["K29", 3, 2, "gastritis_ulcer", "Gastritis / peptic ulcer"],
  ["K57", 3, 2, "diverticular_disease", "Diverticular disease"],
  ["K21", 3, 2, "gerd", "GERD"],
  ["K73", 3, 2, "chronic_hepatitis", "Chronic hepatitis"],
  ["D50", 3, 2, "iron_deficiency_anaemia", "Anaemia (iron deficiency)"],
  ["D51", 3, 2, "b12_anaemia", "Vitamin B12 deficiency anaemia"],
  ["D64", 3, 2, "anaemia", "Anaemia"],
  ["M05", 3, 2, "rheumatoid_arthritis", "Rheumatoid arthritis"],
  ["M06", 3, 2, "rheumatoid_arthritis", "Rheumatoid arthritis"],
  ["M81", 3, 2, "osteoporosis", "Osteoporosis"],
  ["Z87.3", 5, 2, "musculoskeletal_history", "History of musculoskeletal disease"],
  ["F17.2", 5, 2, "nicotine_dependence", "Nicotine dependence (smoker)"],
]

export function suggestASAFromTags(
  tags: { label: string; code?: string; sub?: string }[],
  bmi: number | null,
): ASASuggestion | null {
  if (tags.length === 0 && !bmi) return null
  const groups = {
    4: new Map<string, string>(),
    3: new Map<string, string>(),
    2: new Map<string, string>(),
  }
  for (const tag of tags) {
    const code = (tag.code ?? tag.sub ?? "").toUpperCase()
    for (const [prefix, minLen, cls, reasonCode, label] of ASA_RULES) {
      if (code.startsWith(prefix.toUpperCase()) && code.length >= minLen) {
        groups[cls].set(reasonCode, label)
        break
      }
    }
  }
  if (bmi && bmi >= 40) groups[3].set("morbid_obesity_bmi", `Morbid obesity (BMI ${bmi.toFixed(1)})`)
  else if (bmi && bmi >= 30) groups[2].set("obesity_bmi", `Obesity (BMI ${bmi.toFixed(1)})`)
  const result = (cls: ASASuggestion["cls"], reasons: Map<string, string>): ASASuggestion => ({
    cls,
    reasonCodes: [...reasons.keys()].slice(0, 4),
    reasons: [...reasons.values()].slice(0, 4),
  })
  if (groups[4].size > 0) return result("IV", groups[4])
  if (groups[3].size > 0) return result("III", groups[3])
  if (groups[2].size > 0) return result("II", groups[2])
  if (tags.length > 0) return { cls: "II", reasonCodes: ["comorbidities_present"], reasons: ["Comorbidities present"] }
  return { cls: "I", reasonCodes: [], reasons: [] }
}
