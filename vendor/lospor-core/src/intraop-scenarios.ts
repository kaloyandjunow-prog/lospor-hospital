// Intraoperative bolus and infusion menu categories — the 8 clinical groups
// each picker offers, plus their canonical drug names.
//
// Lives in core because both apps render this same menu: it was mobile-only,
// and the web app grew a different (flat) menu as a result. One definition
// means the two cannot diverge again.
export type ScenarioItem = { label: string; canonical: string }
export type ScenarioGroup = {
  key: string
  label: string
  color: string
  items: ScenarioItem[]
}

const item = (canonical: string, label = canonical): ScenarioItem => ({ label, canonical })

export const BOLUS_SCENARIOS: ScenarioGroup[] = [
  {
    key: "induction",
    label: "Induction",
    color: "#8b5cf6",
    items: [
      item("Propofol"),
      item("Etomidate"),
      item("Ketamine"),
      item("Esketamine"),
      item("Thiopental / Thiopentone", "Thiopental"),
      item("Methohexital"),
      item("Midazolam"),
      item("Fentanyl"),
    ],
  },
  {
    key: "relaxants",
    label: "Relaxants",
    color: "#14b8a6",
    items: [
      item("Succinylcholine / Suxamethonium", "Succinylcholine"),
      item("Rocuronium"),
      item("Vecuronium"),
      item("Pancuronium"),
      item("Pipecuronium"),
      item("Cisatracurium"),
      item("Atracurium"),
      item("Mivacurium"),
    ],
  },
  {
    key: "localRegional",
    label: "Local/Regional",
    color: "#0ea5e9",
    items: [
      item("Lidocaine"),
      item("Bupivacaine"),
      item("Levobupivacaine"),
      item("Ropivacaine"),
      item("Mepivacaine"),
      item("Prilocaine"),
      item("Chloroprocaine"),
      item("Tetracaine / Amethocaine", "Tetracaine"),
    ],
  },
  {
    key: "opioids",
    label: "Opioids",
    color: "#f97316",
    items: [
      item("Fentanyl"),
      item("Sufentanil"),
      item("Remifentanil"),
      item("Alfentanil"),
      item("Morphine"),
      item("Hydromorphone"),
      item("Pethidine / Meperidine", "Pethidine"),
      item("Nalbuphine"),
    ],
  },
  {
    key: "vasoactive",
    label: "Vasoactive",
    color: "#ef4444",
    items: [
      item("Phenylephrine"),
      item("Ephedrine"),
      item("Norepinephrine / Noradrenaline", "Norepinephrine"),
      item("Epinephrine / Adrenaline", "Epinephrine"),
      item("Metaraminol"),
      item("Vasopressin"),
      item("Nitroglycerin / Glyceryl trinitrate", "Nitroglycerin"),
      item("Esmolol"),
    ],
  },
  {
    key: "ponvGi",
    label: "PONV/GI",
    color: "#22c55e",
    items: [
      item("Ondansetron"),
      item("Dexamethasone"),
      item("Metoclopramide"),
      item("Droperidol"),
      item("Granisetron"),
      item("Palonosetron"),
      item("Cyclizine"),
      item("Dimenhydrinate"),
    ],
  },
  {
    key: "obstetrics",
    label: "Obstetrics",
    color: "#ec4899",
    items: [
      item("Oxytocin"),
      item("Carbetocin"),
      item("Methylergometrine"),
      item("Carboprost"),
      item("Misoprostol"),
      item("Terbutaline"),
      item("Tranexamic acid"),
      item("Phenylephrine"),
    ],
  },
  {
    key: "rescue",
    label: "Rescue",
    color: "#f59e0b",
    items: [
      item("Epinephrine / Adrenaline", "Epinephrine"),
      item("Atropine"),
      item("Calcium chloride"),
      item("Calcium gluconate"),
      item("Sodium bicarbonate"),
      item("Amiodarone"),
      item("Naloxone"),
      item("Flumazenil"),
    ],
  },
]

export const INFUSION_SCENARIOS: ScenarioGroup[] = [
  {
    key: "tiva",
    label: "TIVA",
    color: "#8b5cf6",
    items: [
      item("Propofol"),
      item("Remifentanil"),
      item("Fentanyl"),
      item("Sufentanil"),
      item("Alfentanil"),
      item("Ketamine"),
      item("Dexmedetomidine"),
      item("Lidocaine"),
    ],
  },
  {
    key: "vasoactive",
    label: "Vasoactive",
    color: "#ef4444",
    items: [
      item("Phenylephrine"),
      item("Norepinephrine / Noradrenaline", "Norepinephrine"),
      item("Epinephrine / Adrenaline", "Epinephrine"),
      item("Metaraminol"),
      item("Vasopressin"),
      item("Dopamine"),
      item("Dobutamine"),
      item("Angiotensin II"),
    ],
  },
  {
    key: "analgesia",
    label: "Analgesia",
    color: "#f97316",
    items: [
      item("Remifentanil"),
      item("Fentanyl"),
      item("Sufentanil"),
      item("Alfentanil"),
      item("Ketamine"),
      item("Esketamine"),
      item("Lidocaine"),
      item("Magnesium sulfate"),
    ],
  },
  {
    key: "sedation",
    label: "Sedation",
    color: "#6366f1",
    items: [
      item("Propofol"),
      item("Dexmedetomidine"),
      item("Ketamine"),
      item("Esketamine"),
      item("Fentanyl"),
      item("Sufentanil"),
      item("Remifentanil"),
      item("Magnesium sulfate"),
    ],
  },
  {
    key: "obstetrics",
    label: "Obstetrics",
    color: "#ec4899",
    items: [
      item("Oxytocin"),
      item("Phenylephrine"),
      item("Norepinephrine / Noradrenaline", "Norepinephrine"),
      item("Epinephrine / Adrenaline", "Epinephrine"),
      item("Magnesium sulfate"),
      item("Nitroglycerin / Glyceryl trinitrate", "Nitroglycerin"),
      item("Remifentanil"),
      item("Furosemide"),
    ],
  },
  {
    key: "cardiac",
    label: "Cardiac",
    color: "#06b6d4",
    items: [
      item("Dobutamine"),
      item("Milrinone"),
      item("Levosimendan"),
      item("Nitroglycerin / Glyceryl trinitrate", "Nitroglycerin"),
      item("Esmolol"),
      item("Labetalol"),
      item("Amiodarone"),
      item("Diltiazem"),
    ],
  },
  {
    key: "neuro",
    label: "Neuro",
    color: "#22c55e",
    items: [
      item("Propofol"),
      item("Remifentanil"),
      item("Dexmedetomidine"),
      item("Norepinephrine / Noradrenaline", "Norepinephrine"),
      item("Nicardipine"),
      item("Nimodipine"),
      item("Magnesium sulfate"),
      item("Furosemide"),
    ],
  },
  {
    key: "rescue",
    label: "Rescue",
    color: "#f59e0b",
    items: [
      item("Epinephrine / Adrenaline", "Epinephrine"),
      item("Norepinephrine / Noradrenaline", "Norepinephrine"),
      item("Vasopressin"),
      item("Amiodarone"),
      item("Regular insulin / Actrapid", "Insulin"),
      item("Unfractionated heparin", "Heparin"),
      item("Bivalirudin"),
      item("Aminophylline"),
    ],
  },
]
