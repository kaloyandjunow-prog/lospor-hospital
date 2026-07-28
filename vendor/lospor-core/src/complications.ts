// Shared intraop complication taxonomy — previously duplicated as two
// different-sized lists: lospor-mobile's intraop-static-options.ts
// (COMPLICATION_GROUPS, superset) and lospor-app's ComplicationsPicker.tsx
// (COMPLICATION_CATS, subset with no Bulgarian titles). This is the merged
// superset; item values intentionally stay English-only (clinical
// vocabulary, same as technique/position/monitoring option-library values)
// — only the 8 category titles are translated.
export type ComplicationCategory = {
  id: string
  title: string
  titleBg: string
  items: string[]
}

export const COMPLICATION_CATEGORIES: ComplicationCategory[] = [
  {
    id: "cardiovascular",
    title: "Cardiovascular",
    titleBg: "Сърдечно-съдови",
    items: [
      "Hypotension", "Hypertension", "Bradycardia", "Tachycardia",
      "Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia",
      "Ventricular fibrillation", "Myocardial ischaemia", "Myocardial infarction",
      "Cardiac arrest", "Venous air embolism", "Pulmonary embolism", "ST changes",
    ],
  },
  {
    id: "respiratory",
    title: "Respiratory",
    titleBg: "Дихателни",
    items: [
      "Hypoxia / desaturation", "Laryngospasm", "Bronchospasm", "Aspiration",
      "Difficult intubation", "Failed intubation", "CICO (can't intubate can't oxygenate)",
      "Accidental extubation", "Endobronchial intubation",
      "Pneumothorax", "Tension pneumothorax", "Hypercarbia",
    ],
  },
  {
    id: "neurological",
    title: "Neurological",
    titleBg: "Неврологични",
    items: [
      "Awareness under anaesthesia", "Cerebrovascular accident / stroke",
      "Raised intracranial pressure", "Peripheral nerve injury",
      "Spinal cord ischaemia", "Total spinal",
      "Delayed emergence", "Seizure", "High spinal", "Failed block",
    ],
  },
  {
    id: "metabolic",
    title: "Metabolic / Temperature",
    titleBg: "Метаболитни / Температурни",
    items: [
      "Hypothermia", "Hyperthermia", "Malignant hyperthermia",
      "Hypoglycaemia", "Hyperglycaemia",
      "Hyponatraemia", "Hypernatraemia", "Hypokalaemia", "Hyperkalaemia",
      "Hypocalcaemia", "Adrenal crisis",
    ],
  },
  {
    id: "drug",
    title: "Drug / Pharmacological",
    titleBg: "Медикаментозни / Фармакологични",
    items: [
      "Anaphylaxis / allergic reaction", "Anaphylactoid reaction", "Drug reaction", "Latex reaction",
      "Drug error", "Drug overdose",
      "Local anaesthetic systemic toxicity (LAST)",
      "Residual neuromuscular blockade", "Serotonin syndrome",
    ],
  },
  {
    id: "haematological",
    title: "Haematological",
    titleBg: "Хематологични",
    items: [
      "Massive haemorrhage", "Blood loss >1L", "Coagulopathy",
      "DIC (disseminated intravascular coagulation)",
      "Haemolytic transfusion reaction", "Febrile non-haemolytic transfusion reaction",
      "TRALI (transfusion-related acute lung injury)",
      "TACO (transfusion-associated circulatory overload)",
    ],
  },
  {
    id: "equipment",
    title: "Equipment / Technical",
    titleBg: "Оборудване / Технически",
    items: [
      "IV line failure / extravasation", "Arterial line failure", "CVK failure",
      "ETT displacement", "Circuit disconnection", "Gas supply failure",
      "Monitoring failure", "Regional block failure", "Equipment malfunction",
    ],
  },
  {
    id: "surgical",
    title: "Surgical",
    titleBg: "Хирургични",
    items: [
      "Unexpected major haemorrhage", "Injury to major vessel", "Injury to organ",
      "Tourniquet complication", "Pneumoperitoneum complication",
      "Positioning injury", "Compartment syndrome", "Venous gas embolism",
    ],
  },
]

export const ALL_COMPLICATIONS: string[] = COMPLICATION_CATEGORIES.flatMap(c => c.items)
