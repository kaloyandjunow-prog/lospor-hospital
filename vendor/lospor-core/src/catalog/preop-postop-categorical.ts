// Categorical preop/postop pickers — sex, blood group, airway-assessment
// classifications, disposition. Each is a flat value/label/color list (PreopForm.tsx
// / PostopForm.tsx inline button arrays). CORMACK_LEHANE is shared between preop's
// "predicted" picker and intraop's "actual observed" picker (IntraopForm.tsx /
// AirwaySection.tsx, lib/airway-ventilation.ts on mobile) — same clinical grades,
// one canonical source.

export const SEX = [
  { v: "MALE", label: "Male", labelBg: "Мъж" },
  { v: "FEMALE", label: "Female", labelBg: "Жена" },
  { v: "OTHER", label: "Other", labelBg: "Друго" },
]

// Combined 8-button blood group (mobile's existing BloodGrid layout). metadata
// carries the decomposition back into the two underlying schema fields
// (bloodType, rhFactor) so the UI can recompose on save without a schema change.
export const BLOOD_GROUP = [
  { v: "A_POS", label: "A+", labelBg: "A+", bloodType: "A", rhFactor: "POSITIVE" },
  { v: "A_NEG", label: "A−", labelBg: "A−", bloodType: "A", rhFactor: "NEGATIVE" },
  { v: "B_POS", label: "B+", labelBg: "B+", bloodType: "B", rhFactor: "POSITIVE" },
  { v: "B_NEG", label: "B−", labelBg: "B−", bloodType: "B", rhFactor: "NEGATIVE" },
  { v: "AB_POS", label: "AB+", labelBg: "AB+", bloodType: "AB", rhFactor: "POSITIVE" },
  { v: "AB_NEG", label: "AB−", labelBg: "AB−", bloodType: "AB", rhFactor: "NEGATIVE" },
  { v: "O_POS", label: "O+", labelBg: "0+", bloodType: "O", rhFactor: "POSITIVE" },
  { v: "O_NEG", label: "O−", labelBg: "0−", bloodType: "O", rhFactor: "NEGATIVE" },
]

export const NECK_MOBILITY = [
  { v: "FULL", label: "Full", labelBg: "Пълна", color: "bg-green-500 border-green-500 text-white dark:bg-green-700 dark:border-green-500" },
  { v: "LIMITED", label: "Limited", labelBg: "Ограничена", color: "bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
  { v: "FIXED", label: "Fixed", labelBg: "Неподвижна", color: "bg-red-500 border-red-500 text-white dark:bg-red-700 dark:border-red-500" },
]

export const MALLAMPATI = [
  { v: "I", label: "I", labelBg: "I", desc: "Soft palate, uvula, fauces, pillars", color: "bg-green-500 border-green-500 text-white dark:bg-green-700 dark:border-green-500" },
  { v: "II", label: "II", labelBg: "II", desc: "Soft palate, uvula, fauces", color: "bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
  { v: "III", label: "III", labelBg: "III", desc: "Soft palate, base of uvula", color: "bg-orange-500 border-orange-500 text-white dark:bg-orange-700 dark:border-orange-500" },
  { v: "IV", label: "IV", labelBg: "IV", desc: "Hard palate only", color: "bg-red-500 border-red-500 text-white dark:bg-red-700 dark:border-red-500" },
]

export const UPPER_LIP_BITE = [
  { v: "CLASS_I", label: "Class I", labelBg: "Клас I", desc: "Incisors bite above vermillion", color: "bg-green-500 border-green-500 text-white dark:bg-green-700 dark:border-green-500" },
  { v: "CLASS_II", label: "Class II", labelBg: "Клас II", desc: "Incisors bite below vermillion", color: "bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
  { v: "CLASS_III", label: "Class III", labelBg: "Клас III", desc: "Cannot bite upper lip", color: "bg-red-500 border-red-500 text-white dark:bg-red-700 dark:border-red-500" },
]

export const CORMACK_LEHANE = [
  { v: "I", label: "I", labelBg: "I", desc: "Full glottis", color: "bg-green-500 border-green-500 text-white dark:bg-green-700 dark:border-green-500" },
  { v: "IIa", label: "IIa", labelBg: "IIa", desc: "Posterior glottis", color: "bg-lime-500 border-lime-500 text-white dark:bg-lime-700 dark:border-lime-500" },
  { v: "IIb", label: "IIb", labelBg: "IIb", desc: "Arytenoids only", color: "bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
  { v: "III", label: "III", labelBg: "III", desc: "Epiglottis only", color: "bg-orange-500 border-orange-500 text-white dark:bg-orange-700 dark:border-orange-500" },
  { v: "IV", label: "IV", labelBg: "IV", desc: "No glottic structures", color: "bg-red-500 border-red-500 text-white dark:bg-red-700 dark:border-red-500" },
]

export const DISPOSITION = [
  { v: "WARD", label: "Ward", labelBg: "Отделение", color: "bg-green-100 border-green-400 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300" },
  { v: "PACU", label: "PACU", labelBg: "Зала за събуждане (PACU)", color: "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300" },
  { v: "ICU", label: "ICU", labelBg: "ОАИЛ (ICU)", color: "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300" },
]
