export type ASASuggestion = {
  cls: "I" | "II" | "III" | "IV"
  reasons: string[]
  reasonCodes: string[]
}

type ASARule = [prefix: string, minLength: number, cls: 2 | 3 | 4, reasonCode: string, label: string, labelBg: string]

// Codes are WHO ICD-10, the edition Bulgaria codes in: a US-only (ICD-10-CM)
// code such as J45.5 would never match, and was removed for that reason.
const ASA_RULES: ASARule[] = [
  ["N18.6", 5, 4, "esrd", "End-stage renal disease (not on dialysis)", "Терминална бъбречна недостатъчност (без диализа)"],
  ["N18.5", 5, 4, "ckd_stage_5", "Chronic kidney disease stage 5", "Хронично бъбречно заболяване, стадий 5"],
  ["I50.2", 5, 4, "systolic_heart_failure", "Systolic heart failure", "Систолна сърдечна недостатъчност"],
  ["I50.3", 5, 4, "diastolic_heart_failure", "Diastolic heart failure", "Диастолна сърдечна недостатъчност"],
  ["I50", 3, 3, "heart_failure", "Heart failure", "Сърдечна недостатъчност"],
  // ASA examples: an MI within the last 3 months is ASA IV. An I21 code is an
  // acute MI, which is within that window by definition (28 days).
  ["I21", 3, 4, "acute_mi", "Acute MI", "Остър миокарден инфаркт"],
  ["I25", 3, 3, "ischemic_heart_disease", "Chronic ischaemic heart disease", "Хронична исхемична болест на сърцето"],
  ["I63", 3, 3, "cerebral_infarction", "Cerebral infarction (stroke)", "Мозъчен инфаркт (инсулт)"],
  ["I64", 3, 3, "stroke", "Stroke / CVA", "Инсулт / мозъчносъдов инцидент"],
  ["G45", 3, 3, "tia", "TIA", "Транзиторна исхемична атака (ТИА)"],
  ["Z95.0", 5, 3, "pacemaker_icd", "Pacemaker / ICD", "Пейсмейкър / ИКД"],
  ["Z95.1", 5, 3, "implanted_cardiac_device", "Coronary artery bypass graft", "Аортокоронарен байпас"],
  ["J44", 3, 3, "copd", "COPD", "ХОББ"],
  ["E10", 3, 3, "type_1_diabetes", "Type 1 diabetes mellitus", "Захарен диабет тип 1"],
  ["K70.3", 5, 3, "alcoholic_cirrhosis", "Alcoholic liver cirrhosis", "Алкохолна цироза на черния дроб"],
  ["K74", 3, 3, "cirrhosis", "Cirrhosis of liver", "Цироза на черния дроб"],
  ["N18", 3, 3, "ckd", "Chronic kidney disease", "Хронично бъбречно заболяване"],
  ["Z99.2", 5, 3, "dialysis", "Dialysis", "Диализа"],
  ["G20", 3, 3, "parkinson", "Parkinson's disease", "Болест на Паркинсон"],
  ["F10.2", 5, 3, "alcohol_dependence", "Alcohol dependence", "Алкохолна зависимост"],
  ["F19.2", 5, 3, "substance_dependence", "Substance dependence", "Зависимост към психоактивни вещества"],
  ["Z86.7", 5, 2, "cardiovascular_history", "History of circulatory disease", "Анамнеза за заболяване на кръвообращението"],
  ["I10", 3, 2, "hypertension", "Hypertension", "Артериална хипертония"],
  ["I11", 3, 2, "hypertensive_heart_disease", "Hypertensive heart disease", "Хипертонична болест на сърцето"],
  ["I48", 3, 2, "atrial_fibrillation", "Atrial fibrillation", "Предсърдно мъждене"],
  ["I49", 3, 2, "arrhythmia", "Arrhythmia", "Ритъмно нарушение"],
  ["I73", 3, 2, "peripheral_vascular_disease", "Peripheral vascular disease", "Периферна съдова болест"],
  ["I83", 3, 2, "varicose_veins", "Varicose veins / CVI", "Варикозни вени / хронична венозна недостатъчност"],
  ["I82", 3, 2, "dvt_history", "DVT history", "Анамнеза за дълбока венозна тромбоза"],
  ["J45", 3, 2, "asthma", "Asthma", "Бронхиална астма"],
  ["E11", 3, 2, "type_2_diabetes", "Type 2 diabetes mellitus", "Захарен диабет тип 2"],
  ["E03", 3, 2, "hypothyroidism", "Hypothyroidism", "Хипотиреоидизъм"],
  ["E05", 3, 2, "hyperthyroidism", "Hyperthyroidism", "Хипертиреоидизъм"],
  ["E04", 3, 2, "goitre", "Non-toxic goitre", "Нетоксична гуша"],
  ["G40", 3, 2, "epilepsy", "Epilepsy", "Епилепсия"],
  ["G43", 3, 2, "migraine", "Migraine", "Мигрена"],
  ["F32", 3, 2, "depression", "Depressive episode", "Депресивен епизод"],
  ["F33", 3, 2, "recurrent_depression", "Recurrent depression", "Рецидивиращо депресивно разстройство"],
  ["F41", 3, 2, "anxiety", "Anxiety disorder", "Тревожно разстройство"],
  ["K25", 3, 2, "gastric_ulcer", "Gastric ulcer", "Язва на стомаха"],
  ["K26", 3, 2, "duodenal_ulcer", "Duodenal ulcer", "Язва на дванадесетопръстника"],
  ["K27", 3, 2, "peptic_ulcer", "Peptic ulcer", "Пептична язва"],
  ["K29", 3, 2, "gastritis", "Gastritis and duodenitis", "Гастрит и дуоденит"],
  ["K57", 3, 2, "diverticular_disease", "Diverticular disease", "Дивертикулна болест"],
  ["K21", 3, 2, "gerd", "GERD", "Гастроезофагеална рефлуксна болест"],
  ["K73", 3, 2, "chronic_hepatitis", "Chronic hepatitis", "Хроничен хепатит"],
  ["D50", 3, 2, "iron_deficiency_anaemia", "Anaemia (iron deficiency)", "Желязодефицитна анемия"],
  ["D51", 3, 2, "b12_anaemia", "Vitamin B12 deficiency anaemia", "Анемия поради недостиг на витамин B12"],
  ["D64", 3, 2, "anaemia", "Anaemia", "Анемия"],
  ["M05", 3, 2, "rheumatoid_arthritis", "Rheumatoid arthritis", "Ревматоиден артрит"],
  ["M06", 3, 2, "rheumatoid_arthritis", "Rheumatoid arthritis", "Ревматоиден артрит"],
  ["M81", 3, 2, "osteoporosis", "Osteoporosis", "Остеопороза"],
  ["Z87.3", 5, 2, "musculoskeletal_history", "History of musculoskeletal disease", "Анамнеза за заболяване на опорно-двигателния апарат"],
  ["F17.2", 5, 2, "nicotine_dependence", "Nicotine dependence (smoker)", "Никотинова зависимост (тютюнопушене)"],
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
  // No coded condition and an unremarkable BMI is an absence of information,
  // not evidence of health: it used to suggest ASA I for a patient whose
  // conditions had simply not been coded yet.
  return null
}

/**
 * Version of the rule table above. Stored with every suggestion so agreement
 * can be read per rule version: when a rule changes, cases scored by the old
 * one stay attributed to it.
 *
 * Bump it when a changed table ships. Until the first appliance release no case
 * holds a suggestion, so changes made before then stay in this version.
 */
export const ASA_SUGGESTION_RULES_VERSION = "2026.10.1"

const BMI_RULES: Record<string, { cls: ASASuggestion["cls"]; label: string; labelBg: string }> = {
  morbid_obesity_bmi: { cls: "III", label: "Morbid obesity (BMI ≥ 40)", labelBg: "Морбидно затлъстяване (ИТМ ≥ 40)" },
  obesity_bmi: { cls: "II", label: "Obesity (BMI 30–39.9)", labelBg: "Затлъстяване (ИТМ 30–39,9)" },
  comorbidities_present: { cls: "II", label: "Comorbidities present (none matched a rule)", labelBg: "Придружаващи заболявания (без съвпадение с правило)" },
}

const ROMAN = { 2: "II", 3: "III", 4: "IV" } as const

/** The class and wording of the rule a reason code came from, in the reader's language. */
export function asaSuggestionRule(reasonCode: string, locale: "en" | "bg" = "en"): { cls: ASASuggestion["cls"]; label: string } | null {
  const rule = ASA_RULES.find(item => item[3] === reasonCode)
  if (rule) return { cls: ROMAN[rule[2]], label: locale === "bg" ? rule[5] : rule[4] }
  const bmiRule = BMI_RULES[reasonCode]
  return bmiRule ? { cls: bmiRule.cls, label: locale === "bg" ? bmiRule.labelBg : bmiRule.label } : null
}

/**
 * A suggestion's reason as a clinician reads it, in their language. The BMI
 * reasons name the patient's own BMI, as the English reasons always have.
 */
export function asaReasonLabel(reasonCode: string, locale: "en" | "bg", bmi?: number | null): string {
  if ((reasonCode === "morbid_obesity_bmi" || reasonCode === "obesity_bmi") && bmi != null) {
    const value = locale === "bg" ? bmi.toFixed(1).replace(".", ",") : bmi.toFixed(1)
    const name = reasonCode === "morbid_obesity_bmi"
      ? (locale === "bg" ? "Морбидно затлъстяване" : "Morbid obesity")
      : (locale === "bg" ? "Затлъстяване" : "Obesity")
    return `${name} (${locale === "bg" ? "ИТМ" : "BMI"} ${value})`
  }
  return asaSuggestionRule(reasonCode, locale)?.label ?? reasonCode
}
