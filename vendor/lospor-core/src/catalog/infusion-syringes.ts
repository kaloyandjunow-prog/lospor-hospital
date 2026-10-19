/**
 * The syringe (or bag) strengths offered when an infusion is started: how many
 * milligrams (micrograms, units...) in how many millilitres. Approved as the
 * default list on 2026-10-18; any other strength is typed with "Other".
 *
 * The strength is what turns a dose rate (mcg/kg/min, mg/hr) into the pump rate
 * (mL/hr) and back, and what gives an infusion's millilitres for the fluid
 * balance. Local anaesthetics keep their % strengths instead (catalogue
 * concentrationOptions); epoprostenol and iloprost are made up per patient, so
 * they offer none and are typed.
 *
 * Keyed by catalogue name; a route of its own (epidural fentanyl) replaces the
 * drug's list for that route.
 */
export type SyringeStrength = {
  amount: number
  amountUnit: "ng" | "mcg" | "mg" | "g" | "IU" | "mmol" | "mEq"
  volumeMl: number
}

const s = (amount: number, amountUnit: SyringeStrength["amountUnit"], volumeMl: number): SyringeStrength =>
  ({ amount, amountUnit, volumeMl })

export const INFUSION_SYRINGES: Readonly<Record<string, readonly SyringeStrength[]>> = {
  // Anaesthetics and sedatives
  "Propofol": [s(500, "mg", 50), s(1000, "mg", 50)],
  "Ketamine": [s(50, "mg", 50), s(500, "mg", 50)],
  "Esketamine": [s(50, "mg", 50), s(250, "mg", 50)],
  "Thiopental / Thiopentone": [s(1250, "mg", 50)],
  "Midazolam": [s(50, "mg", 50)],
  "Remimazolam": [s(50, "mg", 50)],
  "Dexmedetomidine": [s(200, "mcg", 50), s(400, "mcg", 50)],
  "Clonidine": [s(750, "mcg", 50)],
  // Opioids
  "Fentanyl": [s(500, "mcg", 50), s(2500, "mcg", 50)],
  "Sufentanil": [s(50, "mcg", 50), s(250, "mcg", 50)],
  "Remifentanil": [s(1000, "mcg", 50), s(2000, "mcg", 50), s(2500, "mcg", 50)],
  "Alfentanil": [s(5000, "mcg", 50), s(25000, "mcg", 50)],
  "Morphine": [s(50, "mg", 50)],
  // Relaxants
  "Rocuronium": [s(500, "mg", 50)],
  "Vecuronium": [s(50, "mg", 50)],
  "Cisatracurium": [s(100, "mg", 50), s(250, "mg", 50)],
  "Atracurium": [s(500, "mg", 50)],
  "Mivacurium": [s(100, "mg", 50)],
  // Vasopressors
  "Norepinephrine / Noradrenaline": [s(1, "mg", 50), s(2, "mg", 50), s(4, "mg", 50), s(5, "mg", 50), s(10, "mg", 50)],
  "Epinephrine / Adrenaline": [s(1, "mg", 50), s(2, "mg", 50), s(5, "mg", 50)],
  "Phenylephrine": [s(5, "mg", 50), s(10, "mg", 50)],
  "Metaraminol": [s(25, "mg", 50)],
  "Vasopressin": [s(20, "IU", 50), s(50, "IU", 50)],
  "Angiotensin II": [s(2500, "mcg", 250)],
  // Inotropes
  "Dopamine": [s(200, "mg", 50)],
  "Dobutamine": [s(250, "mg", 50)],
  "Milrinone": [s(10, "mg", 50)],
  "Levosimendan": [s(12.5, "mg", 500), s(12.5, "mg", 250)],
  "Isoproterenol / Isoprenaline": [s(200, "mcg", 50)],
  // Antihypertensives and antiarrhythmics
  "Nitroglycerin / Glyceryl trinitrate": [s(50, "mg", 50)],
  "Sodium nitroprusside": [s(50, "mg", 50)],
  "Nicardipine": [s(25, "mg", 250), s(50, "mg", 250)],
  "Clevidipine": [s(25, "mg", 50)],
  "Urapidil": [s(250, "mg", 50)],
  "Labetalol": [s(50, "mg", 50), s(250, "mg", 50)],
  "Esmolol": [s(2500, "mg", 250)],
  "Amiodarone": [s(300, "mg", 50), s(900, "mg", 500)],
  "Diltiazem": [s(50, "mg", 50)],
  // Haemostasis
  "Unfractionated heparin": [s(25000, "IU", 50), s(50000, "IU", 50)],
  "Bivalirudin": [s(250, "mg", 50)],
  "Argatroban": [s(250, "mg", 250)],
  "Tranexamic acid": [s(1000, "mg", 50)],
  // Electrolytes and endocrine
  "Potassium chloride": [s(20, "mmol", 100), s(50, "mmol", 50)],
  "Calcium gluconate": [s(5, "g", 50)],
  "Calcium chloride": [s(5, "g", 50)],
  "Sodium bicarbonate": [s(50, "mEq", 50), s(25, "mEq", 50)],
  "Magnesium sulfate": [s(4, "g", 50), s(5, "g", 50)],
  "Regular insulin / Actrapid": [s(50, "IU", 50)],
  "Hydrocortisone": [s(100, "mg", 50)],
  // Other
  "Oxytocin": [s(10, "IU", 500), s(40, "IU", 500)],
  "Furosemide": [s(500, "mg", 50)],
  "Aminophylline": [s(500, "mg", 500)],
  "Nimodipine": [s(10, "mg", 50)],
  "Octreotide": [s(500, "mcg", 50)],
  "Somatostatin": [s(3000, "mcg", 50)],
  "Pantoprazole": [s(40, "mg", 50)],
  "Methylene blue": [s(500, "mg", 50)],
  "Lidocaine": [s(1000, "mg", 50), s(500, "mg", 50)],
}

/** Route-specific lists: the strength differs from the drug's IV syringes. */
export const INFUSION_SYRINGES_BY_ROUTE: Readonly<Record<string, Readonly<Record<string, readonly SyringeStrength[]>>>> = {
  "Fentanyl": { EPIDURAL: [s(100, "mcg", 50)] },
}
