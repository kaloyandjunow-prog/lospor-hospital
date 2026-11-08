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
      "Vasoplegia",
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
      "Peripheral nerve injury",
      "Total spinal",
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
      "Hypocalcaemia",
    ],
  },
  {
    id: "drug",
    title: "Drug / Pharmacological",
    titleBg: "Медикаментозни / Фармакологични",
    items: [
      "Anaphylaxis / allergic reaction", "Drug reaction", "Latex reaction",
      "Drug error", "Drug overdose",
      "Local anaesthetic systemic toxicity (LAST)",
      "Residual neuromuscular blockade", "Serotonin syndrome",
      "Masseter spasm",
    ],
  },
  {
    id: "haematological",
    title: "Haematological",
    titleBg: "Хематологични",
    items: [
      "Massive haemorrhage",
      "DIC (disseminated intravascular coagulation)",
      "Haemolytic transfusion reaction", "Febrile non-haemolytic transfusion reaction",
      "TRALI (transfusion-related acute lung injury)",
      "TACO (transfusion-associated circulatory overload)",
      "Methaemoglobinaemia",
    ],
  },
  {
    id: "equipment",
    title: "Equipment / Technical",
    titleBg: "Оборудване / Технически",
    items: [
      "IV line failure / extravasation", "Arterial line failure", "CVK failure",
      "Circuit disconnection", "Gas supply failure",
      "Monitoring failure", "Equipment malfunction",
    ],
  },
  {
    id: "surgical",
    title: "Surgical",
    titleBg: "Хирургични",
    items: [
      "Injury to major vessel", "Injury to organ",
      "Tourniquet complication",
      "Positioning injury", "Compartment syndrome",
    ],
  },
]

/**
 * Names no longer offered (10.1.0), each a duplicate of one that is: kept so
 * a case that recorded one still reads, lists and exports it under its own
 * name and concept. A finalised case is never rewritten to the kept name.
 * Anaphylactoid reaction -> Anaphylaxis / allergic reaction; Venous gas
 * embolism -> Venous air embolism; Unexpected major haemorrhage and Blood loss
 * >1L -> Massive haemorrhage; Regional block failure -> Failed block; ETT
 * displacement -> Accidental extubation.
 */
export const RETIRED_COMPLICATIONS: readonly string[] = Object.freeze([
  "Anaphylactoid reaction", "Venous gas embolism", "Unexpected major haemorrhage",
  "Blood loss >1L", "Regional block failure", "ETT displacement",
])

/** Every name a record may hold: the ones offered, then the retired ones. */
export const ALL_COMPLICATIONS: string[] = [...COMPLICATION_CATEGORIES.flatMap(c => c.items), ...RETIRED_COMPLICATIONS]

/**
 * The chart's quick buttons name a few complications in short (10.1.0): a
 * timed complication is saved under the catalogue's name, so the record, the
 * list and the export all read one entry -- and its concept maps.
 */
const COMPLICATION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  LAST: "Local anaesthetic systemic toxicity (LAST)",
})

export function canonicalComplicationLabel(label: string): string {
  return COMPLICATION_ALIASES[label] ?? label
}

/**
 * The catalogue's groups without the complications already offered as quick
 * buttons, empty groups left out: what "Show all" adds under its headings.
 */
export function complicationGroupsBeyond(quick: readonly string[]): ComplicationCategory[] {
  const shown = new Set(quick.map(canonicalComplicationLabel))
  return COMPLICATION_CATEGORIES
    .map(category => ({ ...category, items: category.items.filter(item => !shown.has(item)) }))
    .filter(category => category.items.length > 0)
}
