import type { LabEntry } from "./risk"

/**
 * Gupta perioperative risk of myocardial infarction or cardiac arrest (MICA).
 *
 * Gupta PK et al. Development and validation of a risk calculator for
 * prediction of cardiac risk after surgery. Circulation 2011;124:381-387.
 * Logistic regression on ACS-NSQIP (211,410 derivation, 257,385 validation
 * patients): the probability of myocardial infarction or cardiac arrest within
 * 30 days of surgery, for adults.
 *
 *   x = -5.25 + 0.02 x age + functional status + ASA + creatinine + procedure
 *   risk = e^x / (1 + e^x)
 *
 * Only the inputs are stored -- functional status and procedure type as
 * catalogue answers, beside the age, ASA and labs the record already has. The
 * percentage is derived wherever it is shown or exported, like every other
 * score (see research-scores.ts).
 */

export const GUPTA_INTERCEPT = -5.25
export const GUPTA_AGE_PER_YEAR = 0.02

export type GuptaFunctionalStatus = "INDEPENDENT" | "PARTIALLY_DEPENDENT" | "TOTALLY_DEPENDENT"

/** NSQIP functional status in the 30 days before surgery. */
export const GUPTA_FUNCTIONAL_STATUS: readonly { key: GuptaFunctionalStatus; coefficient: number; labelEn: string; labelBg: string }[] = [
  { key: "INDEPENDENT", coefficient: 0, labelEn: "Independent", labelBg: "Независим" },
  { key: "PARTIALLY_DEPENDENT", coefficient: 0.65, labelEn: "Partially dependent: needs help with some daily activities", labelBg: "Частично зависим: нуждае се от помощ за някои ежедневни дейности" },
  { key: "TOTALLY_DEPENDENT", coefficient: 1.03, labelEn: "Totally dependent: needs help with all daily activities", labelBg: "Напълно зависим: нуждае се от помощ за всички ежедневни дейности" },
]

/** ASA VI is outside the model; an organ donor has no perioperative cardiac risk to predict. */
export const GUPTA_ASA: Readonly<Record<"I" | "II" | "III" | "IV" | "V", number>> = { I: -5.17, II: -3.29, III: -1.92, IV: -0.95, V: 0 }

export type GuptaCreatinine = "NORMAL" | "ELEVATED" | "UNKNOWN"

/** Serum creatinine above 1.5 mg/dL (133 µmol/L); the calculator's "unknown" when there is no result. */
export const GUPTA_CREATININE: Readonly<Record<GuptaCreatinine, number>> = { NORMAL: 0, ELEVATED: 0.61, UNKNOWN: -0.1 }

export type GuptaProcedureType =
  | "ANORECTAL" | "AORTIC" | "BARIATRIC" | "BRAIN" | "BREAST" | "CARDIAC" | "ENT"
  | "FOREGUT_HPB" | "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN" | "HERNIA" | "INTESTINAL"
  | "NECK" | "OBSTETRIC_GYNAECOLOGIC" | "ORTHOPAEDIC" | "OTHER_ABDOMINAL"
  | "PERIPHERAL_VASCULAR" | "SKIN" | "SPINE" | "THORACIC" | "VEIN" | "UROLOGY"

/** The 21 procedure types, hernia as the reference (0). */
export const GUPTA_PROCEDURE_TYPES: readonly { key: GuptaProcedureType; coefficient: number; labelEn: string; labelBg: string }[] = [
  { key: "ANORECTAL", coefficient: -0.16, labelEn: "Anorectal", labelBg: "Аноректална" },
  { key: "AORTIC", coefficient: 1.6, labelEn: "Aortic", labelBg: "Аортна" },
  { key: "BARIATRIC", coefficient: -0.25, labelEn: "Bariatric", labelBg: "Бариатрична" },
  { key: "BRAIN", coefficient: 1.4, labelEn: "Brain", labelBg: "Мозък" },
  { key: "BREAST", coefficient: -1.61, labelEn: "Breast", labelBg: "Гърда" },
  { key: "CARDIAC", coefficient: 1.01, labelEn: "Cardiac", labelBg: "Сърдечна" },
  { key: "ENT", coefficient: 0.71, labelEn: "ENT (except thyroid and parathyroid)", labelBg: "УНГ (без щитовидна и паращитовидни жлези)" },
  { key: "FOREGUT_HPB", coefficient: 1.39, labelEn: "Foregut or hepatopancreatobiliary", labelBg: "Хранопровод, стомах, черен дроб, жлъчни пътища или панкреас" },
  { key: "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN", coefficient: 0.59, labelEn: "Gallbladder, appendix, adrenals or spleen", labelBg: "Жлъчен мехур, апендикс, надбъбречни жлези или далак" },
  { key: "HERNIA", coefficient: 0, labelEn: "Hernia (ventral, inguinal, femoral)", labelBg: "Херния (вентрална, ингвинална, феморална)" },
  { key: "INTESTINAL", coefficient: 1.14, labelEn: "Intestinal", labelBg: "Черва" },
  { key: "NECK", coefficient: 0.18, labelEn: "Neck (thyroid and parathyroid)", labelBg: "Шия (щитовидна и паращитовидни жлези)" },
  { key: "OBSTETRIC_GYNAECOLOGIC", coefficient: 0.76, labelEn: "Obstetric or gynaecologic", labelBg: "Акушерска или гинекологична" },
  { key: "ORTHOPAEDIC", coefficient: 0.8, labelEn: "Orthopaedic and non-vascular extremity", labelBg: "Ортопедична и несъдова на крайник" },
  { key: "OTHER_ABDOMINAL", coefficient: 1.13, labelEn: "Other abdominal", labelBg: "Друга коремна" },
  { key: "PERIPHERAL_VASCULAR", coefficient: 0.86, labelEn: "Peripheral vascular (non-aortic, non-vein)", labelBg: "Периферна съдова (без аорта и вени)" },
  { key: "SKIN", coefficient: 0.54, labelEn: "Skin", labelBg: "Кожа" },
  { key: "SPINE", coefficient: 0.21, labelEn: "Spine", labelBg: "Гръбначен стълб" },
  { key: "THORACIC", coefficient: 0.4, labelEn: "Thoracic (non-oesophageal, non-cardiac)", labelBg: "Гръдна (без хранопровод и сърце)" },
  { key: "VEIN", coefficient: -1.09, labelEn: "Vein", labelBg: "Вени" },
  { key: "UROLOGY", coefficient: -0.26, labelEn: "Urology", labelBg: "Урологична" },
]

export type GuptaInput = {
  ageYears: number
  asa: keyof typeof GUPTA_ASA
  functionalStatus: GuptaFunctionalStatus
  creatinine: GuptaCreatinine
  procedureType: GuptaProcedureType
}

/** The predicted risk in percent, to one decimal place. */
export function calcGuptaMica(input: GuptaInput): number {
  const functional = GUPTA_FUNCTIONAL_STATUS.find(item => item.key === input.functionalStatus)!.coefficient
  const procedure = GUPTA_PROCEDURE_TYPES.find(item => item.key === input.procedureType)!.coefficient
  const x = GUPTA_INTERCEPT
    + GUPTA_AGE_PER_YEAR * input.ageYears
    + functional
    + GUPTA_ASA[input.asa]
    + GUPTA_CREATININE[input.creatinine]
    + procedure
  return Math.round((100 / (1 + Math.exp(-x))) * 10) / 10
}

/** Above 1% is the threshold ACC/AHA use for "elevated" perioperative cardiac risk. */
export function guptaRiskBand(percent: number): { key: "low" | "elevated"; severity: "low" | "high" } {
  return percent < 1 ? { key: "low", severity: "low" } : { key: "elevated", severity: "high" }
}

/** From the case's creatinine result: > 1.5 mg/dL or > 133 µmol/L; no usable result is UNKNOWN. */
export function guptaCreatinineFromLabs(labResults: readonly LabEntry[]): GuptaCreatinine {
  const entry = labResults.find(lab => lab.test === "Creatinine")
  const value = entry?.value == null ? Number.NaN : parseFloat(entry.value.replace(",", "."))
  if (!Number.isFinite(value)) return "UNKNOWN"
  const elevated = entry?.unit === "mg/dL" ? value > 1.5 : value > 133
  return elevated ? "ELEVATED" : "NORMAL"
}

/** The catalogue questions that carry the two inputs the record does not otherwise hold. */
export const GUPTA_FUNCTIONAL_STATUS_QUESTION = "A15_FUNCTIONAL_STATUS"
export const GUPTA_PROCEDURE_TYPE_QUESTION = "A16_GUPTA_PROCEDURE_TYPE"

export type GuptaFromRecord =
  | { available: true; percent: number; input: GuptaInput }
  | { available: false; missing: Array<"age" | "asa" | "functionalStatus" | "procedureType"> }

/**
 * Gupta from what a preop record holds. Missing inputs are named rather than
 * guessed: an unanswered functional status is not "independent".
 */
export function guptaFromRecord(record: {
  ageYears?: number | null
  asaScore?: string | null
  labResults?: readonly LabEntry[] | null
  answers?: readonly { stableKey: string; optionKey?: string | null }[] | null
}): GuptaFromRecord {
  const optionOf = (key: string) => record.answers?.find(answer => answer.stableKey === key)?.optionKey ?? null
  const functionalStatus = GUPTA_FUNCTIONAL_STATUS.find(item => item.key === optionOf(GUPTA_FUNCTIONAL_STATUS_QUESTION))?.key
  const procedureType = GUPTA_PROCEDURE_TYPES.find(item => item.key === optionOf(GUPTA_PROCEDURE_TYPE_QUESTION))?.key
  const asa = record.asaScore && record.asaScore in GUPTA_ASA ? record.asaScore as keyof typeof GUPTA_ASA : undefined
  const ageYears = record.ageYears != null && Number.isFinite(record.ageYears) && record.ageYears >= 18 ? record.ageYears : undefined
  const missing: Array<"age" | "asa" | "functionalStatus" | "procedureType"> = []
  if (ageYears == null) missing.push("age")
  if (!asa) missing.push("asa")
  if (!functionalStatus) missing.push("functionalStatus")
  if (!procedureType) missing.push("procedureType")
  if (ageYears == null || !asa || !functionalStatus || !procedureType) return { available: false, missing }
  const input: GuptaInput = { ageYears, asa, functionalStatus, procedureType, creatinine: guptaCreatinineFromLabs(record.labResults ?? []) }
  return { available: true, percent: calcGuptaMica(input), input }
}

/**
 * The Gupta procedure type suggested for each LOSPOR procedure group. A
 * suggestion only: the clinician confirms it, and a group with no entry gets
 * none (endoscopy, imaging, eye surgery and the like are outside the model).
 */
export const GUPTA_PROCEDURE_TYPE_BY_GROUP: Readonly<Record<string, GuptaProcedureType>> = {
  // Anorectal
  "Anorectal repair (3rd and 4th degree obstetrical repairs and other)": "ANORECTAL",
  // Aortic
  "Aneurysm repair procedures": "AORTIC",
  // Bariatric
  "Gastro-jejunal bypass (including bariatric)": "BARIATRIC",
  // Brain
  "CNS excision procedures": "BRAIN",
  "CNS neurostimulator procedures": "BRAIN",
  "CNS procedures, NEC": "BRAIN",
  "Cerebrospinal fluid shunt procedures": "BRAIN",
  "Decompressive craniectomy": "BRAIN",
  "Intracranial epidural and subdural space drainage": "BRAIN",
  "Meninges repair": "BRAIN",
  "Minimally invasive CNS biopsy": "BRAIN",
  "Other CNS drainage and related procedures": "BRAIN",
  "Pituitary gland resection": "BRAIN",
  // Breast
  "Breast reconstruction": "BREAST",
  "Mastectomy and lumpectomy": "BREAST",
  // Cardiac
  "Coronary artery bypass grafts (CABG)": "CARDIAC",
  "Heart and great vessel bypass procedures": "CARDIAC",
  "Heart assist device procedures": "CARDIAC",
  "Heart transplant": "CARDIAC",
  "Heart valve replacement and other valve procedures (endovascular)": "CARDIAC",
  "Heart valve replacement and other valve procedures (non-endovascular)": "CARDIAC",
  "Left atrial appendage procedures": "CARDIAC",
  "Other coronary artery procedures (excluding CABG and PCI)": "CARDIAC",
  "Pericardial procedures": "CARDIAC",
  "Septal repair and other therapeutic heart procedures": "CARDIAC",
  // ENT
  "Dental procedures": "ENT",
  "ENT drainage (excluding myringotomy)": "ENT",
  "ENT excision (excluding nasal passage, sinuses, tongue, salivary glands, larynx)": "ENT",
  "ENT procedures, NEC": "ENT",
  "ENT repair": "ENT",
  "Face transplant": "ENT",
  "Frenectomy": "ENT",
  "Laryngectomy": "ENT",
  "Myringotomy": "ENT",
  "Nasal and sinus excision": "ENT",
  "Salivary gland excision": "ENT",
  "Tongue excision": "ENT",
  "Tonsilectomy and adenoidectomy": "ENT",
  "Tracheostomy": "ENT",
  // Foregut or hepatopancreatobiliary
  "Diaphragmatic hernia repair": "FOREGUT_HPB",
  "Duodenal resection": "FOREGUT_HPB",
  "Esophagectomy": "FOREGUT_HPB",
  "Gastrectomy": "FOREGUT_HPB",
  "Gastrostomy": "FOREGUT_HPB",
  "Hepatobiliary and pancreatic procedures, NEC": "FOREGUT_HPB",
  "Hepatobiliary resection and ablation": "FOREGUT_HPB",
  "Liver transplant": "FOREGUT_HPB",
  "Pancreas transplant": "FOREGUT_HPB",
  "Pancreatectomy": "FOREGUT_HPB",
  "Upper GI therapeutic procedures, NEC (open and laparoscopic)": "FOREGUT_HPB",
  // Gallbladder, appendix, adrenals or spleen
  "Adrenalectomy": "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN",
  "Appendectomy": "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN",
  "Cholecystectomy": "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN",
  "Spleen procedures (excluding splenectomy)": "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN",
  "Splenectomy": "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN",
  // Hernia
  "Abdominal wall repair (including hernia)": "HERNIA",
  "Inguinal and femoral hernia repair": "HERNIA",
  // Intestinal
  "Colectomy": "INTESTINAL",
  "GI system lysis of adhesions": "INTESTINAL",
  "GI system repair (excluding anorectal)": "INTESTINAL",
  "GI transplant": "INTESTINAL",
  "Ileostomy and colostomy": "INTESTINAL",
  "Lower GI therapeutic procedures, NEC (open and laparoscopic)": "INTESTINAL",
  "Proctectomy or anal resection": "INTESTINAL",
  "Small bowel resection": "INTESTINAL",
  // Neck (thyroid and parathyroid)
  "Endocrine procedures, NEC": "NECK",
  "Endocrine system biopsy": "NECK",
  "Parathyroidectomy": "NECK",
  "Thyroidectomy": "NECK",
  // Obstetric or gynaecologic
  "Abortion": "OBSTETRIC_GYNAECOLOGIC",
  "Assisted vaginal delivery": "OBSTETRIC_GYNAECOLOGIC",
  "Cervical cerclage": "OBSTETRIC_GYNAECOLOGIC",
  "Cervical dilation": "OBSTETRIC_GYNAECOLOGIC",
  "Cesarean section": "OBSTETRIC_GYNAECOLOGIC",
  "Episiotomy": "OBSTETRIC_GYNAECOLOGIC",
  "Fallopian tube ligation and excision": "OBSTETRIC_GYNAECOLOGIC",
  "Female genital tract repair (excluding vulva)": "OBSTETRIC_GYNAECOLOGIC",
  "Female lower genital tract excision": "OBSTETRIC_GYNAECOLOGIC",
  "Female reproductive system procedures, NEC": "OBSTETRIC_GYNAECOLOGIC",
  "Female upper genital tract excision": "OBSTETRIC_GYNAECOLOGIC",
  "Hysterectomy": "OBSTETRIC_GYNAECOLOGIC",
  "Oophorectomy": "OBSTETRIC_GYNAECOLOGIC",
  "Ovary or uterus transplant": "OBSTETRIC_GYNAECOLOGIC",
  "Pregnancy and fetal procedures, NEC": "OBSTETRIC_GYNAECOLOGIC",
  "Removal of ectopic pregnancy": "OBSTETRIC_GYNAECOLOGIC",
  "Removal of placenta and other retained products of conception": "OBSTETRIC_GYNAECOLOGIC",
  "Salpingectomy": "OBSTETRIC_GYNAECOLOGIC",
  "Spontaneous vaginal delivery": "OBSTETRIC_GYNAECOLOGIC",
  "Trachelectomy": "OBSTETRIC_GYNAECOLOGIC",
  "Vulvar laceration repair": "OBSTETRIC_GYNAECOLOGIC",
  // Orthopaedic and non-vascular extremity
  "Above knee and other proximal lower extremity amputation": "ORTHOPAEDIC",
  "Arthroplasty of other joint (excluding knee and hip)": "ORTHOPAEDIC",
  "Below knee amputation": "ORTHOPAEDIC",
  "Bone and joint biopsy": "ORTHOPAEDIC",
  "Bone excision": "ORTHOPAEDIC",
  "Bone fixation (excluding extremities)": "ORTHOPAEDIC",
  "Closed reduction of bones and joints": "ORTHOPAEDIC",
  "Femur fixation": "ORTHOPAEDIC",
  "Finger and other upper extremity amputation": "ORTHOPAEDIC",
  "Fixation of leg and foot bones": "ORTHOPAEDIC",
  "Fixation of upper extremity bones": "ORTHOPAEDIC",
  "Hand transplant": "ORTHOPAEDIC",
  "Hip arthroplasty": "ORTHOPAEDIC",
  "Incision and drainage of musculoskeletal tissue and joints": "ORTHOPAEDIC",
  "Joint fusion (excluding spine)": "ORTHOPAEDIC",
  "Joint tissue excision (excluding discectomy)": "ORTHOPAEDIC",
  "Knee arthroplasty": "ORTHOPAEDIC",
  "Muscle, tendon, bursa, and ligament excision": "ORTHOPAEDIC",
  "Musculoskeletal device procedures, NEC": "ORTHOPAEDIC",
  "Musculoskeletal procedures, NEC": "ORTHOPAEDIC",
  "Nerve repair": "ORTHOPAEDIC",
  "Peripheral nerve decompression (excluding lumbosacral and cervicothoracic)": "ORTHOPAEDIC",
  "Tendon, muscle, bursa, and ligament repair (excluding perineal)": "ORTHOPAEDIC",
  "Toe and mid foot amputation": "ORTHOPAEDIC",
  // Other abdominal
  "Abdominal wall procedures, NEC": "OTHER_ABDOMINAL",
  "Exploration of peritoneal cavity": "OTHER_ABDOMINAL",
  "GI system biopsy (non-endoscopic)": "OTHER_ABDOMINAL",
  "GI system drainage (excluding paracentesis)": "OTHER_ABDOMINAL",
  "Omentectomy or peritoneum resection": "OTHER_ABDOMINAL",
  "Other peritoneal cavity procedures": "OTHER_ABDOMINAL",
  "Retroperitoneal procedures, NEC": "OTHER_ABDOMINAL",
  // Peripheral vascular
  "Angioplasty and related vessel procedures (endovascular; excluding carotid)": "PERIPHERAL_VASCULAR",
  "Artery, vein, and great vessel procedures, NEC": "PERIPHERAL_VASCULAR",
  "Carotid endarterectomy and stenting": "PERIPHERAL_VASCULAR",
  "Embolectomy, endarterectomy, and related vessel procedures (non-endovascular; excluding carotid)": "PERIPHERAL_VASCULAR",
  "Peripheral arterial bypass procedures": "PERIPHERAL_VASCULAR",
  "Peripheral arteriovenous fistula and shunt procedures": "PERIPHERAL_VASCULAR",
  "Vessel repair and replacement": "PERIPHERAL_VASCULAR",
  // Skin
  "Cosmetic procedures": "SKIN",
  "Incision and drainage of skin": "SKIN",
  "Incision and drainage of subcutaneous tissue and fascia": "SKIN",
  "Nail procedures": "SKIN",
  "Perineal skin repair (1st degree obstetrical and other)": "SKIN",
  "Skin and breast procedures, NEC": "SKIN",
  "Skin excision and debridement": "SKIN",
  "Skin graft": "SKIN",
  "Skin laceration repair (excluding perineum)": "SKIN",
  "Subcutaneous tissue and fascia excision": "SKIN",
  "Subcutaneous tissue and fascia procedures, NEC": "SKIN",
  "Subcutaneous tissue, fascia, and muscle biopsy": "SKIN",
  // Spine
  "Cervicothoracic nerve decompression": "SPINE",
  "Lumbosacral nerve decompression": "SPINE",
  "Spinal canal and spinal cord drainage (excluding lumbar puncture)": "SPINE",
  "Spinal cord decompression": "SPINE",
  "Spine fusion": "SPINE",
  "Vertebral discectomy": "SPINE",
  // Thoracic
  "Chest wall procedures, NEC": "THORACIC",
  "Lung transplant": "THORACIC",
  "Lung, pleura, or diaphragm biopsy (non-endoscopic)": "THORACIC",
  "Lung, pleura, or diaphragm resection (open and thoracoscopic)": "THORACIC",
  "Mediastinal procedures, NEC": "THORACIC",
  "Open and thoracoscopic pleural drainage": "THORACIC",
  "Release of lung and pleura": "THORACIC",
  "Respiratory system procedures, NEC": "THORACIC",
  "Thymectomy": "THORACIC",
  // Vein
  "Saphenous vein harvest and other therapeutic vessel removal": "VEIN",
  // Urology
  "Circumcision": "UROLOGY",
  "Cystectomy (including fulguration) and urethrectomy": "UROLOGY",
  "Cystoscopy and ureteroscopy (including biopsy)": "UROLOGY",
  "Genitourinary tract procedures, NEC": "UROLOGY",
  "Kidney and other urinary tract biopsy (non-endoscopic)": "UROLOGY",
  "Kidney transplant": "UROLOGY",
  "Male perineum procedures": "UROLOGY",
  "Male reproductive system procedures, NEC": "UROLOGY",
  "Male reproductive system transplant": "UROLOGY",
  "Nephrectomy and ureterectomy": "UROLOGY",
  "Nephrostomy and ureterostomy procedures (including stents)": "UROLOGY",
  "Penis procedures (excluding circumcision)": "UROLOGY",
  "Prostate and seminal vesicle procedures (excluding prostatectomy)": "UROLOGY",
  "Prostatectomy": "UROLOGY",
  "Removal of calculi and other matter from urinary tract": "UROLOGY",
  "Ureter and other urinary tract dilation": "UROLOGY",
  "Urinary diversion with anastomosis or ostomy": "UROLOGY",
  "Urinary system procedures, NEC": "UROLOGY",
  "Urinary tract repair": "UROLOGY",
}

/**
 * The suggested procedure type for a case's planned procedures: the
 * highest-risk type among them, since the model takes one procedure and the
 * riskiest is the one that sets the cardiac risk. Null when no planned
 * procedure maps.
 */
export function suggestGuptaProcedureType(groups: readonly (string | null | undefined)[]): GuptaProcedureType | null {
  let best: { key: GuptaProcedureType; coefficient: number } | null = null
  for (const group of groups) {
    const key = group ? GUPTA_PROCEDURE_TYPE_BY_GROUP[group] : undefined
    if (!key) continue
    const coefficient = GUPTA_PROCEDURE_TYPES.find(item => item.key === key)!.coefficient
    if (!best || coefficient > best.coefficient) best = { key, coefficient }
  }
  return best?.key ?? null
}

/**
 * Gupta for a preop form as both clients hold it: the result (or what is
 * missing) and the procedure type the planned procedures suggest. One
 * function so the web and the PWA cannot read the same form differently.
 */
export function guptaFromForm(values: Record<string, unknown>): {
  result: GuptaFromRecord
  suggestedProcedureType: GuptaProcedureType | null
} {
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
  const ageYears = number(values.ageYears) ?? (values.ageUnit === "YEARS" ? number(values.ageValue) : null)
  const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : []
  const text = (value: unknown) => typeof value === "string" ? value : undefined
  return {
    result: guptaFromRecord({
      ageYears,
      asaScore: text(values.asaScore) ?? null,
      labResults: list(values.labResults).map(lab => ({ test: text(lab.test) ?? "", value: text(lab.value), unit: text(lab.unit) })),
      answers: list(values.preopAnswers)
        .filter(answer => answer.state === "YES")
        .map(answer => ({ stableKey: text(answer.stableKey) ?? "", optionKey: text(answer.optionKey) ?? null })),
    }),
    suggestedProcedureType: suggestGuptaProcedureType(list(values.procedures).map(procedure => text(procedure.group))),
  }
}
