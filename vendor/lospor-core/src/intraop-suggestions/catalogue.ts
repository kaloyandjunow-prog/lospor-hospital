import { canonicalComplicationLabel } from "../complications"
import { FIXED_HEART_RATE, vitalBandFor } from "../vital-questions"
import { ageYears, given, isChild, lastVital, mhTriggerCharted, runningAt, volatileCharted, type SuggestionPatient } from "./context"
import type { AgeDose, CardDef, DoseSpec, RowContext, RowDef, Words } from "./cards"

/**
 * Every treatment suggestion agreed for 10.2.0, one card per complication
 * (the proposal and its agreed answers: the SPS doc,
 * 2026-11-01). Doses are what each card prefills; the sheet still offers its
 * whole range, quick values and typing.
 */

/* ---------- helpers ---------- */

const fixed = (amount: number): DoseSpec => ({ from: "fixed", amount })
const perKg = (amount: number, options: { cap?: number; round?: number; basis?: "TBW" | "IBW"; roundMode?: "nearest" | "up" } = {}): DoseSpec => ({ from: "perKg", perKg: amount, ...options })
const none: DoseSpec = { from: "none" }
const catalogue: DoseSpec = { from: "catalogue" }
const adultChild = (adult: DoseSpec, child?: DoseSpec | null): AgeDose => (child === undefined ? { adult } : { adult, child })
const w = (en: string, bg: string): Words => ({ en, bg })

const drug = (id: string, drugName: string, title: Words, unit: string, dose: AgeDose, extra: Partial<Extract<RowDef, { kind: "drug" }>> = {}): RowDef =>
  ({ kind: "drug", id, drug: drugName, title, unit, dose, ...extra })

const gas = (id = "fio2", fgf = 10): RowDef =>
  ({ kind: "gas", id, title: w(`FiO₂ 100% · fresh gas ${fgf} L/min`, `FiO₂ 100% · свеж газ ${fgf} L/min`), fio2: 100, fgf })

const treatHypotension: RowDef = { kind: "openCard", id: "treat-hypotension", title: w("Treat hypotension", "Лечение на хипотенсията"), complication: "Hypotension" }

const steroidalRelaxantGiven = (context: RowContext) => given(context.log, "steroidalRelaxant", context.complication.ts)
const heartRateAbove = (limit: number) => (context: RowContext) => (lastVital(context.log, "heartRate", context.complication.ts)?.value ?? 0) > limit
const heartRateLow = (context: RowContext) => {
  const band = vitalBandFor(context.patient.ageDays)
  const hr = lastVital(context.log, "heartRate", context.complication.ts)?.value
  return hr != null && band != null && hr < FIXED_HEART_RATE[band.key].bradycardiaBelow
}
const childOnly = (context: RowContext) => isChild(context.patient)

/** Suxamethonium 0.5 mg/kg: to the nearest 10 mg from 10 kg, up to the next whole mg under 10 kg. */
const suxamethoniumHalf = (patient: SuggestionPatient): number | null => {
  if (patient.weightKg == null || !(patient.weightKg > 0)) return null
  const raw = patient.weightKg * 0.5
  return patient.weightKg >= 10 ? Math.max(10, Math.round(raw / 10) * 10) : Math.ceil(raw)
}

/* ---------- shared rows ---------- */

const ephedrine = drug("ephedrine", "Ephedrine", w("Ephedrine", "Ефедрин"), "mg", adultChild(fixed(10), perKg(0.1, { cap: 10, round: 0.5 })))
const phenylephrine = drug("phenylephrine", "Phenylephrine", w("Phenylephrine", "Фенилефрин"), "mcg", adultChild(fixed(100), perKg(1, { cap: 100, round: 5 })))
const atropine = (when?: RowDef["when"]): RowDef => drug("atropine", "Atropine", w("Atropine", "Атропин"), "mg",
  adultChild(fixed(0.5), perKg(0.01, { cap: 0.6, round: 0.05 })), { totalAgainst: 3, ...(when ? { when } : {}) })
const glycopyrrolate = drug("glycopyrrolate", "Glycopyrrolate", w("Glycopyrrolate", "Гликопиролат"), "mg", adultChild(perKg(0.01, { basis: "IBW", round: 0.1 }), perKg(0.01, { basis: "IBW", round: 0.01 })))
const deepen: RowDef = { kind: "deepen", id: "deepen", title: w("Deepen anaesthesia", "Задълбочаване на анестезията") }
const esmolol = (child: DoseSpec | null = none): RowDef => drug("esmolol", "Esmolol", w("Esmolol", "Есмолол"), "mg", adultChild(perKg(0.5, { round: 5 }), child))
const metoprolol = drug("metoprolol", "Metoprolol", w("Metoprolol", "Метопролол"), "mg", adultChild(fixed(5), perKg(0.1, { cap: 5, round: 0.1 })))
const crystalloid: RowDef = { kind: "fluid", id: "crystalloid", title: w("Crystalloid bolus", "Кристалоиден болус"), category: "Crystalloids", mode: "VOLUME", amount: adultChild(fixed(500), perKg(20, { round: 10 })) }
const furosemide = drug("furosemide", "Furosemide", w("Furosemide", "Фуроземид"), "mg", adultChild(fixed(20), perKg(1, { cap: 40, round: 0.5 })))
const stopBlood: RowDef = { kind: "stop", id: "stop-blood", title: w("Stop the running blood product", "Спиране на преливания кръвен продукт"), target: "bloodProduct" }
const stopSuspect: RowDef = { kind: "stop", id: "stop-trigger", title: w("Stop the suspected trigger", "Спиране на подозирания причинител"), target: "suspects", note: w("Drugs from the last 30 min are shown as suspects", "Медикаментите от последните 30 min са показани като подозирани") }
const calciumChloride = drug("calcium-chloride", "Calcium chloride", w("Calcium chloride 10%", "Калциев хлорид 10%"), "mg", adultChild(fixed(1000), perKg(20, { round: 10 })))
const fibrinogen = drug("fibrinogen", "Fibrinogen concentrate", w("Fibrinogen concentrate", "Фибриноген концентрат"), "mg", adultChild(fixed(2000), perKg(30, { round: 50 })))
const blood = (id: string, fluid: string, title: Words, adultMl: number, childMlPerKg: number): RowDef =>
  ({ kind: "fluid", id, fluid, title, mode: "VOLUME", amount: adultChild(fixed(adultMl), perKg(childMlPerKg, { round: 5 })) })
const ffp = blood("ffp", "Fresh frozen plasma (FFP)", w("Fresh frozen plasma", "Прясно замразена плазма"), 250, 15)
const cryo = blood("cryo", "Cryoprecipitate", w("Cryoprecipitate", "Криопреципитат"), 100, 5)
const platelets = blood("platelets", "Platelets", w("Platelets", "Тромбоцити"), 300, 10)
const rbc = blood("rbc", "Packed red blood cells (PRBC)", w("Red cells", "Еритроцити"), 250, 15)
const labRecheck = (id: string, tests: readonly string[], title: Words): RowDef => ({ kind: "lab", id, title, tests })
const resolve: RowDef = { kind: "resolve", id: "resolved", title: w("Resolved?", "Отстранено?") }
const relabel = (id: string, title: Words, choices: readonly string[], when?: RowDef["when"]): RowDef => ({ kind: "relabel", id, title, choices, ...(when ? { when } : {}) })
const alsoLog = (id: string, title: Words, complications: readonly string[], when?: RowDef["when"]): RowDef => ({ kind: "alsoLog", id, title, complications, ...(when ? { when } : {}) })
const isAnaphylaxis = relabel("is-anaphylaxis", w("Is this anaphylaxis?", "Анафилаксия ли е?"), ["Anaphylaxis / allergic reaction"])
const shock = (synchronized: boolean, branches?: readonly string[]): RowDef => ({
  kind: "shock", id: synchronized ? "cardioversion" : "defibrillation", synchronized,
  title: synchronized ? w("Synchronised cardioversion", "Синхронизирана кардиоверсия") : w("Defibrillation", "Дефибрилация"),
  ...(branches ? { branches } : {}),
})
const UNSTABLE_STABLE = { options: [{ id: "unstable", title: w("Unstable", "Нестабилен") }, { id: "stable", title: w("Stable", "Стабилен") }] }

/* ---------- the cards ---------- */

export const SUGGESTION_CARDS: readonly CardDef[] = [
  // Cardiovascular
  {
    complications: ["Hypotension"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [ephedrine, phenylephrine, drug("metaraminol", "Metaraminol", w("Metaraminol", "Метараминол"), "mg", adultChild(fixed(0.5), perKg(0.01, { cap: 0.5, round: 0.05 })))],
  },
  {
    complications: ["Hypertension"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      deepen,
      drug("labetalol", "Labetalol", w("Labetalol", "Лабеталол"), "mg", adultChild(fixed(10), perKg(0.2, { cap: 40, round: 0.5 }))),
      esmolol(),
      drug("nitroglycerin", "Nitroglycerin / Glyceryl trinitrate", w("Nitroglycerin", "Нитроглицерин"), "mcg", adultChild(none, null)),
    ],
  },
  {
    complications: ["Bradycardia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [atropine(), glycopyrrolate],
  },
  {
    complications: ["Tachycardia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      deepen,
      drug("fentanyl", "Fentanyl", w("Fentanyl", "Фентанил"), "mcg", adultChild(catalogue, perKg(1, { round: 5 }))),
      esmolol(),
      relabel("arrhythmia", w("Is it an arrhythmia?", "Аритмия ли е?"), ["Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia"]),
    ],
  },
  {
    complications: ["Atrial fibrillation"], kind: "card", branches: UNSTABLE_STABLE,
    rows: [
      shock(true, ["unstable"]),
      { ...esmolol(), branches: ["stable"] },
      { ...metoprolol, branches: ["stable"] },
      drug("diltiazem", "Diltiazem", w("Diltiazem", "Дилтиазем"), "mg", adultChild(perKg(0.25, { round: 5 }), none), { branches: ["stable"] }),
      drug("amiodarone", "Amiodarone", w("Amiodarone", "Амиодарон"), "mg", adultChild(fixed(300), none), { branches: ["stable"] }),
    ],
  },
  {
    complications: ["Supraventricular arrhythmia"], kind: "card", branches: UNSTABLE_STABLE,
    rows: [
      shock(true, ["unstable"]),
      drug("adenosine", "Adenosine", w("Adenosine", "Аденозин"), "mg", adultChild(fixed(6), perKg(0.1, { cap: 6, round: 0.1 })), {
        branches: ["stable"],
        escalation: {
          adult: [fixed(6), fixed(12), fixed(18)],
          child: [perKg(0.1, { cap: 6, round: 0.1 }), perKg(0.2, { cap: 12, round: 0.1 }), perKg(0.2, { cap: 12, round: 0.1 })],
          episodeGapMinutes: 30,
        },
      }),
    ],
  },
  {
    complications: ["Ventricular tachycardia"], kind: "card",
    branches: { options: [
      { id: "pulseless", title: w("No pulse", "Без пулс") },
      { id: "unstable", title: w("Pulse · unstable", "С пулс · нестабилен") },
      { id: "stable", title: w("Pulse · stable", "С пулс · стабилен") },
    ] },
    rows: [
      { ...alsoLog("cardiac-arrest", w("Log cardiac arrest", "Записване на сърдечен арест"), ["Cardiac arrest"]), branches: ["pulseless"] },
      shock(true, ["unstable"]),
      drug("amiodarone", "Amiodarone", w("Amiodarone", "Амиодарон"), "mg", adultChild(fixed(300), perKg(5, { round: 5 })), { branches: ["unstable", "stable"] }),
    ],
  },
  {
    // The Defibrillation sheet opens straight away (VF flow); the card then asks about the arrest.
    complications: ["Ventricular fibrillation"], kind: "card", redStrip: true,
    rows: [shock(false), alsoLog("cardiac-arrest", w("Log cardiac arrest?", "Записване на сърдечен арест?"), ["Cardiac arrest"])],
  },
  {
    complications: ["Myocardial ischaemia", "Myocardial infarction", "ST changes"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      drug("nitroglycerin", "Nitroglycerin / Glyceryl trinitrate", w("Nitroglycerin", "Нитроглицерин"), "mcg", adultChild(none, none)),
      { ...esmolol(), when: heartRateAbove(80) },
      { ...metoprolol, when: heartRateAbove(80) },
      treatHypotension,
    ],
  },
  {
    complications: ["Cardiac arrest"], kind: "checklist", redStrip: true,
    branches: { prompt: w("Rhythm", "Ритъм"), options: [
      { id: "shockable", title: w("Shockable (VF / pVT)", "За дефибрилация (КМ / бКТ)") },
      { id: "nonshockable", title: w("Non-shockable (asystole / PEA)", "Не за дефибрилация (асистолия / ЕАБП)") },
    ] },
    rows: [
      { kind: "event", id: "cpr", title: w("CPR started", "Начало на КПР"), label: "CPR started" },
      { ...shock(false, ["shockable"]), note: w("Each 2-minute cycle", "На всеки 2-минутен цикъл") },
      drug("adrenaline", "Epinephrine / Adrenaline", w("Adrenaline 1 mg", "Адреналин 1 mg"), "mcg", adultChild(fixed(1000), perKg(10, { cap: 1000, round: 10 })), {
        note: w("Shockable: after the 3rd shock, then every 3–5 min. Non-shockable: now, then every 3–5 min.", "За дефибрилация: след 3-тия шок, после на 3–5 min. Не за дефибрилация: веднага, после на 3–5 min."),
      }),
      drug("amiodarone", "Amiodarone", w("Amiodarone", "Амиодарон"), "mg", adultChild(fixed(300), perKg(5, { round: 5 })), {
        branches: ["shockable"], note: w("300 mg after the 3rd shock, 150 mg after the 5th", "300 mg след 3-тия шок, 150 mg след 5-ия"),
      }),
      { kind: "memory", id: "4h4t", title: w("4 H / 4 T", "4 Х / 4 Т"), items: [
        w("Hypoxia", "Хипоксия"), w("Hypovolaemia", "Хиповолемия"), w("Hypo-/hyperkalaemia, metabolic", "Хипо-/хиперкалиемия, метаболитни"), w("Hypothermia", "Хипотермия"),
        w("Thrombosis (coronary, pulmonary)", "Тромбоза (коронарна, белодробна)"), w("Tension pneumothorax", "Тензионен пневмоторакс"), w("Tamponade", "Тампонада"), w("Toxins", "Токсини"),
      ] },
      { kind: "event", id: "rosc", title: w("ROSC", "ROSC"), label: "ROSC" },
      { kind: "event", id: "rosb", title: w("ROSB", "ROSB"), label: "ROSB" },
      { kind: "event", id: "death", title: w("Death (exitus letalis)", "Exitus letalis (смърт)"), label: "Death (exitus letalis)" },
    ],
  },
  {
    complications: ["Venous air embolism"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      gas(),
      { kind: "gas", id: "stop-nitrous", title: w("Stop nitrous oxide (switch to air)", "Спиране на азотния оксид (преминаване към въздух)"), fio2: 100, fgf: 10, stopNitrous: true,
        when: context => runningAt(context.log, context.complication.ts).some(item => item.kind === "gas" && (item.startEvent.fiN2O ?? 0) > 0) },
      { kind: "event", id: "position", title: w("Left lateral, head down", "Ляво странично, с наведена глава"), label: "Positioned" },
      treatHypotension,
    ],
  },
  {
    complications: ["Pulmonary embolism"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      gas(),
      treatHypotension,
      drug("heparin", "Unfractionated heparin", w("Heparin", "Хепарин"), "IU", adultChild(perKg(80, { round: 100 }), none)),
      drug("alteplase-infusion", "Alteplase", w("Alteplase 100 mg over 2 h", "Алтеплаза 100 mg за 2 h"), "mg", adultChild(fixed(100), none)),
      drug("alteplase-bolus", "Alteplase", w("Alteplase 50 mg bolus (arrest)", "Алтеплаза 50 mg болус (арест)"), "mg", adultChild(fixed(50), none)),
    ],
  },
  {
    complications: ["Vasoplegia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      { kind: "infusion", id: "noradrenaline", drug: "Norepinephrine / Noradrenaline", title: w("Noradrenaline infusion", "Норадреналин инфузия"), unit: "mcg/kg/min", rate: adultChild(catalogue) },
      drug("vasopressin", "Vasopressin", w("Vasopressin", "Вазопресин"), "IU", adultChild(catalogue)),
      drug("methylene-blue", "Methylene blue", w("Methylene blue", "Метиленово синьо"), "mg", adultChild(catalogue)),
    ],
  },

  // Respiratory
  {
    complications: ["Hypoxia / desaturation"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [gas(), relabel("cause", w("Is there a cause?", "Има ли причина?"), [
      "Laryngospasm", "Bronchospasm", "Aspiration", "Endobronchial intubation", "Accidental extubation", "Pneumothorax",
      "Tension pneumothorax", "Circuit disconnection", "Gas supply failure", "Anaphylaxis / allergic reaction", "Pulmonary embolism", "Venous air embolism",
    ])],
  },
  {
    complications: ["Laryngospasm"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      gas(),
      drug("propofol", "Propofol", w("Propofol", "Пропофол"), "mg", adultChild(perKg(0.5, { round: 5 }), perKg(0.5, { round: 1 }))),
      drug("suxamethonium", "Succinylcholine / Suxamethonium", w("Suxamethonium", "Суксаметоний"), "mg", adultChild({ from: "custom", amount: suxamethoniumHalf })),
      atropine(childOnly),
    ],
  },
  {
    complications: ["Bronchospasm"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      { ...deepen, title: w("Deepen the volatile (propofol under TIVA)", "Задълбочаване с инхалационен анестетик (пропофол при ТИВА)") },
      drug("salbutamol-inhaled", "Salbutamol / Albuterol", w("Salbutamol inhaled (4 puffs)", "Салбутамол инхалаторно (4 впръсквания)"), "mg", adultChild(fixed(0.4)), { route: "INHALATION" }),
      drug("salbutamol-nebulised", "Salbutamol / Albuterol", w("Salbutamol nebulised", "Салбутамол небулизиран"), "mg", adultChild(fixed(2.5)), { route: "INHALATION", when: childOnly }),
      drug("salbutamol-iv", "Salbutamol / Albuterol", w("Salbutamol IV", "Салбутамол i.v."), "mcg", adultChild(fixed(250), null), { route: "IV" }),
      drug("adrenaline", "Epinephrine / Adrenaline", w("Adrenaline", "Адреналин"), "mcg", adultChild(fixed(10), perKg(1, { round: 1 }))),
      drug("magnesium", "Magnesium sulfate", w("Magnesium sulfate", "Магнезиев сулфат"), "mg", adultChild(perKg(30, { cap: 2000, round: 50 }))),
      drug("hydrocortisone", "Hydrocortisone", w("Hydrocortisone", "Хидрокортизон"), "mg", adultChild(fixed(100), perKg(4, { cap: 100, round: 5 }))),
      relabel("cause", w("Is there a cause?", "Има ли причина?"), ["Anaphylaxis / allergic reaction", "Aspiration", "Endobronchial intubation"]),
    ],
  },
  {
    complications: ["CICO (can't intubate can't oxygenate)"], kind: "card", redStrip: true,
    rows: [
      gas(),
      drug("sugammadex-rescue", "Sugammadex", w("Sugammadex 16 mg/kg", "Сугамадекс 16 mg/kg"), "mg", adultChild(perKg(16, { round: 50 }), perKg(16, { round: 10 })), { when: steroidalRelaxantGiven }),
      { kind: "event", id: "cricothyrotomy", title: w("Cricothyrotomy (scalpel)", "Крикотомия (скалпел)"), label: "Cricothyrotomy",
        when: context => (ageYears(context.patient) ?? 99) > 8 },
      { kind: "event", id: "needle-cricothyrotomy", title: w("Needle cricothyrotomy", "Иглена крикотомия"), label: "Needle cricothyrotomy",
        when: context => (ageYears(context.patient) ?? 99) <= 8 },
    ],
  },
  {
    complications: ["Accidental extubation"], kind: "card",
    rows: [{ kind: "airway", id: "reintubate", title: w("Reintubate?", "Реинтубация?") }],
  },
  {
    complications: ["Hypercarbia"], kind: "card",
    rows: [
      relabel("cause-mh", w("Is there a cause?", "Има ли причина?"), ["Malignant hyperthermia", "Bronchospasm", "Equipment malfunction"],
        context => mhTriggerCharted(context.log, context.complication.ts)),
      relabel("cause", w("Is there a cause?", "Има ли причина?"), ["Bronchospasm", "Equipment malfunction"],
        context => !mhTriggerCharted(context.log, context.complication.ts)),
    ],
  },

  // Neurological
  {
    complications: ["Seizure"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      drug("midazolam", "Midazolam", w("Midazolam", "Мидазолам"), "mg", adultChild(perKg(0.15, { cap: 10, round: 0.5 }))),
      drug("lorazepam", "Lorazepam", w("Lorazepam", "Лоразепам"), "mg", adultChild(perKg(0.1, { cap: 4, round: 0.5 }))),
      drug("propofol", "Propofol", w("Propofol", "Пропофол"), "mg", adultChild(perKg(1, { round: 10 }), perKg(1, { round: 1 }))),
      drug("levetiracetam", "Levetiracetam", w("Levetiracetam", "Леветирацетам"), "mg", adultChild(perKg(60, { cap: 4500, round: 50 }))),
      alsoLog("consider-last", w("Consider LAST", "Помислете за ЛАСТ"), ["Local anaesthetic systemic toxicity (LAST)"],
        context => given(context.log, "localAnaesthetic", context.complication.ts)),
    ],
  },
  {
    complications: ["High spinal", "Total spinal"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [ephedrine, phenylephrine, atropine(heartRateLow), gas(), { kind: "event", id: "intubated", title: w("Intubated", "Интубация"), label: "Intubated" }],
  },
  {
    complications: ["Delayed emergence"], kind: "card",
    rows: [
      drug("naloxone", "Naloxone", w("Naloxone", "Налоксон"), "mcg", adultChild(fixed(40), perKg(2, { cap: 200, round: 10 })),
        { when: context => given(context.log, "opioid", context.complication.ts) }),
      drug("flumazenil", "Flumazenil", w("Flumazenil", "Флумазенил"), "mcg", adultChild(fixed(200), perKg(10, { cap: 200, round: 10 })),
        { when: context => given(context.log, "benzodiazepine", context.complication.ts) }),
      ...residualBlockRows(context => steroidalRelaxantGiven(context) && context.tofMonitor
        && (lastVital(context.log, "tofRatio", context.complication.ts)?.value ?? 1) < 0.9),
      labRecheck("glucose", ["Glucose"], w("Check glucose", "Проверка на глюкозата")),
    ],
  },
  {
    complications: ["Masseter spasm"], kind: "card",
    rows: [alsoLog("consider-mh", w("Consider malignant hyperthermia?", "Помислете за малигнена хипертермия?"), ["Malignant hyperthermia"])],
  },

  // Metabolic
  {
    complications: ["Malignant hyperthermia"], kind: "checklist", redStrip: true,
    rows: [
      { kind: "stop", id: "stop-volatile", title: w("Stop the triggers (volatile; no suxamethonium)", "Спиране на отключващите (инхалационен; без суксаметоний)"), target: "volatile" },
      gas("fio2", 10),
      { kind: "infusion", id: "tiva", drug: "Propofol", title: w("Switch to TIVA (propofol infusion)", "Преминаване към ТИВА (пропофол инфузия)"), unit: "mg/kg/hr", rate: adultChild(catalogue) },
      drug("dantrolene", "Dantrolene", w("Dantrolene 2.5 mg/kg", "Дантролен 2,5 mg/kg"), "mg", adultChild(perKg(2.5, { round: 10 }))),
      { kind: "openCard", id: "hyperkalaemia", title: w("Hyperkalaemia checklist", "Чеклист за хиперкалиемия"), complication: "Hyperkalaemia" },
      labRecheck("blood-gas", ["pH", "Potassium (K⁺)", "CK (Creatine kinase)"], w("Blood gas, K⁺, CK", "Кръвни газове, K⁺, КК")),
      alsoLog("arrhythmia", w("Arrhythmia?", "Аритмия?"), ["Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia"]),
      { kind: "event", id: "charcoal", title: w("Charcoal filters fitted", "Поставени филтри с активен въглен"), label: "Charcoal filters fitted" },
      { kind: "event", id: "cooling", title: w("Active cooling started", "Начало на активно охлаждане"), label: "Active cooling started" },
    ],
  },
  {
    complications: ["Hyperkalaemia"], kind: "checklist",
    rows: [
      calciumChloride,
      drug("calcium-gluconate", "Calcium gluconate", w("Calcium gluconate 10%", "Калциев глюконат 10%"), "mg", adultChild(fixed(3000), perKg(50, { round: 10 }))),
      drug("insulin", "Regular insulin / Actrapid", w("Insulin with glucose", "Инсулин с глюкоза"), "IU", adultChild(fixed(10), perKg(0.1, { round: 0.5 }))),
      { kind: "fluid", id: "glucose", fluid: "Glucose", title: w("Glucose (with the insulin)", "Глюкоза (с инсулина)"), mode: "VOLUME", concentration: { adult: "20%", child: "10%" },
        amount: adultChild(fixed(125), perKg(5, { round: 5 })), note: w("Adult 25 g = 125 mL of 20%; child 0.5 g/kg = 5 mL/kg of 10%", "Възрастни 25 g = 125 mL 20%; деца 0,5 g/kg = 5 mL/kg 10%") },
      drug("salbutamol", "Salbutamol / Albuterol", w("Salbutamol nebulised", "Салбутамол небулизиран"), "mg", adultChild(fixed(10), fixed(2.5)), { route: "INHALATION" }),
      drug("bicarbonate", "Sodium bicarbonate", w("Sodium bicarbonate (if acidotic)", "Натриев бикарбонат (при ацидоза)"), "mEq", adultChild(perKg(1, { round: 10 }), perKg(1, { round: 1 }))),
      labRecheck("potassium", ["Potassium (K⁺)"], w("Recheck K⁺", "Повторен K⁺")),
    ],
  },
  {
    complications: ["Hypoglycaemia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      { kind: "fluid", id: "glucose", fluid: "Glucose", title: w("Glucose", "Глюкоза"), mode: "VOLUME", concentration: { adult: "40%", child: "10%" },
        amount: adultChild(fixed(50), perKg(2, { round: 1 })), note: w("Adult 20 g = 50 mL of 40%; child 0.2 g/kg = 2 mL/kg of 10%", "Възрастни 20 g = 50 mL 40%; деца 0,2 g/kg = 2 mL/kg 10%") },
      drug("glucagon", "Glucagon", w("Glucagon (no IV access)", "Глюкагон (без венозен път)"), "mg",
        adultChild(fixed(1), { from: "custom", amount: patient => (patient.weightKg != null && patient.weightKg < 25 ? 0.5 : 1) }), { route: "IM" }),
      labRecheck("recheck-glucose", ["Glucose"], w("Recheck glucose", "Повторна глюкоза")),
    ],
  },
  {
    complications: ["Hypocalcaemia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      calciumChloride,
      drug("calcium-gluconate", "Calcium gluconate", w("Calcium gluconate 10%", "Калциев глюконат 10%"), "mg", adultChild(fixed(1000), perKg(50, { round: 10 }))),
      labRecheck("ionised-calcium", ["Ionised Ca²⁺"], w("Recheck ionised calcium", "Повторен йонизиран калций")),
    ],
  },
  {
    complications: ["Hyperglycaemia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [
      drug("insulin-bolus", "Regular insulin / Actrapid", w("Insulin bolus", "Инсулин болус"), "IU", adultChild(none, none)),
      { kind: "infusion", id: "insulin-infusion", drug: "Regular insulin / Actrapid", title: w("Insulin infusion", "Инсулин инфузия"), unit: "IU/hr", rate: adultChild(fixed(2), perKg(0.05, { round: 0.01 })) },
      labRecheck("glucose", ["Glucose"], w("Recheck glucose", "Повторна глюкоза")),
    ],
  },
  {
    complications: ["Hyponatraemia"], kind: "card",
    rows: [
      { kind: "question", id: "seizures", title: w("Seizures", "Гърчове"), prompt: w("Symptomatic?", "Симптоматична?"), logs: "Seizure", reveals: ["hypertonic-saline"] },
      { kind: "question", id: "consciousness", title: w("Reduced consciousness / confusion", "Нарушено съзнание / обърканост"), prompt: w("Symptomatic?", "Симптоматична?"), reveals: ["hypertonic-saline"] },
      drug("hypertonic-saline", "Sodium chloride hypertonic (3%)", w("Hypertonic saline 3%", "Хипертоничен NaCl 3%"), "mL", adultChild(fixed(150), perKg(3, { cap: 150, round: 1 })),
        { when: context => context.log.some(event => event.type === "prompt_answer" && event.answerFor === context.complication.id && event.answerKind === "card-reveal:hypertonic-saline")
          || context.log.some(event => event.type === "complication" && event.label === "Seizure" && Date.parse(event.ts) >= Date.parse(context.complication.ts)) }),
      { kind: "note", id: "sodium-limit", title: w("Raise Na⁺ by no more than 10 mmol/L in 24 h", "Повишаване на Na⁺ с не повече от 10 mmol/L за 24 h") },
    ],
  },
  {
    complications: ["Hypokalaemia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [{ kind: "infusion", id: "potassium", drug: "Potassium chloride", title: w("Potassium chloride infusion", "Калиев хлорид инфузия"), unit: "mmol/hr", rate: adultChild(fixed(10), none),
      note: w("Children: check the maximum rate for the line", "Деца: проверете максималната скорост за линията") }],
  },

  // Drug / pharmacological
  {
    complications: ["Local anaesthetic systemic toxicity (LAST)"], kind: "checklist", redStrip: true,
    rows: [
      { kind: "stop", id: "stop-la", title: w("Stop the local anaesthetic", "Спиране на локалния анестетик"), target: "localAnaesthetic" },
      { kind: "fluid", id: "lipid-bolus", fluid: "Lipid emulsion 20%", title: w("Lipid emulsion 20% bolus", "Липидна емулсия 20% болус"), mode: "VOLUME", amount: adultChild(perKg(1.5, { round: 10 }), perKg(1.5, { round: 1 })) },
      { kind: "fluid", id: "lipid-infusion", fluid: "Lipid emulsion 20%", title: w("Lipid infusion 0.25 mL/kg/min", "Липидна инфузия 0,25 mL/kg/min"), mode: "RATE", amount: adultChild(perKg(15, { round: 10 }), perKg(15, { round: 1 })) },
      { kind: "question", id: "seizure", title: w("Is a seizure happening?", "Има ли гърч?"), prompt: w("Is a seizure happening?", "Има ли гърч?"), logs: "Seizure", reveals: ["midazolam"] },
      drug("midazolam", "Midazolam", w("Midazolam", "Мидазолам"), "mg", adultChild(catalogue),
        { when: context => context.log.some(event => event.type === "complication" && event.label === "Seizure" && Date.parse(event.ts) >= Date.parse(context.complication.ts)) }),
      alsoLog("cardiac-arrest", w("Cardiac arrest", "Сърдечен арест"), ["Cardiac arrest"]),
    ],
  },
  {
    complications: ["Anaphylaxis / allergic reaction", "Latex reaction"], kind: "checklist", redStrip: true,
    rows: [
      stopSuspect,
      drug("adrenaline-iv", "Epinephrine / Adrenaline", w("Adrenaline IV", "Адреналин i.v."), "mcg",
        adultChild(fixed(50), { from: "custom", amount: patient => ((ageYears(patient) ?? 18) < 12 ? (patient.weightKg ? Math.round(patient.weightKg) : null) : 50) }), { route: "IV" }),
      drug("adrenaline-im", "Epinephrine / Adrenaline", w("Adrenaline IM (no IV access)", "Адреналин i.m. (без венозен път)"), "mcg", adultChild(fixed(500), perKg(10, { cap: 500, round: 10 })), { route: "IM" }),
      crystalloid,
      drug("glucagon", "Glucagon", w("Glucagon (on a beta-blocker)", "Глюкагон (при бета-блокер)"), "mg", adultChild(catalogue), { when: context => !!context.preop.betaBlocker }),
    ],
  },
  {
    complications: ["Residual neuromuscular blockade"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: residualBlockRows(),
  },
  {
    complications: ["Drug overdose"], kind: "card",
    rows: [
      drug("naloxone", "Naloxone", w("Naloxone", "Налоксон"), "mcg", adultChild(fixed(40), perKg(2, { cap: 200, round: 10 })),
        { when: context => given(context.log, "opioid", context.complication.ts) && (context.patient.ageDays ?? 99999) >= 28 }),
      drug("flumazenil", "Flumazenil", w("Flumazenil", "Флумазенил"), "mcg", adultChild(fixed(200), perKg(10, { cap: 200, round: 10 })),
        { when: context => given(context.log, "benzodiazepine", context.complication.ts) && (ageYears(context.patient) ?? 99) >= 1 }),
      drug("sugammadex", "Sugammadex", w("Sugammadex", "Сугамадекс"), "mg", adultChild(perKg(2, { round: 10 })), { when: steroidalRelaxantGiven }),
      alsoLog("is-last", w("Is this LAST?", "ЛАСТ ли е?"), ["Local anaesthetic systemic toxicity (LAST)"],
        context => given(context.log, "localAnaesthetic", context.complication.ts)),
    ],
  },
  {
    complications: ["Drug reaction"], kind: "card",
    rows: [
      { ...stopSuspect, title: w("Stop the suspected drug", "Спиране на подозирания медикамент") },
      drug("chlorphenamine", "Chlorphenamine / Chlorpheniramine", w("Chlorphenamine", "Хлорфенамин"), "mg", adultChild(fixed(10), null)),
      drug("hydrocortisone", "Hydrocortisone", w("Hydrocortisone", "Хидрокортизон"), "mg", adultChild(fixed(100), perKg(4, { cap: 100, round: 5 }))),
      isAnaphylaxis,
    ],
  },

  // Haematological
  {
    complications: ["Massive haemorrhage"], kind: "checklist", redStrip: true,
    rows: [
      drug("tranexamic-acid", "Tranexamic acid", w("Tranexamic acid", "Транексамова киселина"), "mg", adultChild(fixed(1000), perKg(10, { cap: 1000, round: 10 })),
        { when: context => (context.patient.ageDays ?? 99999) >= 28 }),
      rbc, ffp, platelets, cryo, fibrinogen, calciumChloride,
    ],
  },
  {
    complications: ["DIC (disseminated intravascular coagulation)"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [ffp, cryo, platelets, fibrinogen, alsoLog("massive-haemorrhage", w("Is there massive haemorrhage too?", "Има ли и масивна кръвозагуба?"), ["Massive haemorrhage"])],
  },
  {
    complications: ["Haemolytic transfusion reaction"], kind: "card",
    rows: [stopBlood, crystalloid, furosemide, alsoLog("dic", w("Is there DIC too?", "Има ли и ДИК?"), ["DIC (disseminated intravascular coagulation)"]), isAnaphylaxis],
  },
  {
    complications: ["Febrile non-haemolytic transfusion reaction"], kind: "card",
    rows: [
      { ...stopBlood, title: w("Pause or stop the blood product", "Спиране на кръвния продукт") },
      drug("paracetamol", "Paracetamol / Acetaminophen", w("Paracetamol", "Парацетамол"), "mg", adultChild(catalogue)),
      relabel("is-haemolytic", w("Is this a haemolytic reaction?", "Хемолитична реакция ли е?"), ["Haemolytic transfusion reaction"]),
      relabel("is-mh", w("Is this malignant hyperthermia?", "Малигнена хипертермия ли е?"), ["Malignant hyperthermia"],
        context => mhTriggerCharted(context.log, context.complication.ts)),
    ],
  },
  {
    complications: ["TACO (transfusion-associated circulatory overload)"], kind: "card",
    rows: [
      { ...stopBlood, title: w("Stop or slow the blood product", "Спиране или забавяне на кръвния продукт") },
      furosemide, gas(),
      relabel("is-trali", w("Is this TRALI?", "TRALI ли е?"), ["TRALI (transfusion-related acute lung injury)"]),
    ],
  },
  {
    complications: ["Methaemoglobinaemia"], kind: "card", question: w("Treat now?", "Лечение сега?"),
    rows: [drug("methylene-blue", "Methylene blue", w("Methylene blue", "Метиленово синьо"), "mg", adultChild(perKg(1, { round: 5 }), perKg(1, { round: 1 })))],
  },

  // Equipment
  {
    complications: ["IV line failure / extravasation"], kind: "card",
    rows: [{ kind: "access", id: "new-line", title: w("Insert a new one?", "Поставяне на нов?"), access: "VENOUS" }],
  },
  {
    complications: ["Arterial line failure"], kind: "card",
    rows: [{ kind: "access", id: "new-line", title: w("Insert a new one?", "Поставяне на нов?"), access: "ARTERIAL" }],
  },
  {
    complications: ["CVK failure"], kind: "card",
    rows: [{ kind: "access", id: "new-line", title: w("Insert a new one?", "Поставяне на нов?"), access: "CENTRAL" }],
  },
  {
    complications: ["Gas supply failure"], kind: "card",
    rows: [
      { kind: "infusion", id: "propofol", drug: "Propofol", title: w("Start a propofol infusion?", "Започване на пропофол инфузия?"), unit: "mg/kg/hr", rate: adultChild(catalogue),
        when: context => volatileCharted(context.log, context.complication.ts) && runningAt(context.log, context.complication.ts).some(item => item.kind === "agent") },
      gas(), resolve,
    ],
  },
  { complications: ["Monitoring failure", "Equipment malfunction"], kind: "card", rows: [resolve] },

  // Surgical
  {
    complications: ["Injury to major vessel"], kind: "card",
    rows: [alsoLog("massive-haemorrhage", w("Log massive haemorrhage too?", "Записване и на масивна кръвозагуба?"), ["Massive haemorrhage"])],
  },
  {
    complications: ["Tourniquet complication"], kind: "card",
    rows: [{ kind: "event", id: "tourniquet-off", title: w("Release the tourniquet?", "Отпускане на турникета?"), label: "Tourniquet off" }],
  },
  {
    complications: ["Positioning injury"], kind: "card",
    rows: [{ kind: "event", id: "repositioned", title: w("Repositioned?", "Препозициониране?"), label: "Positioned" }],
  },
]

/** The residual-blockade rows (also offered in delayed emergence, under its condition). */
function residualBlockRows(extra?: (context: RowContext) => boolean): RowDef[] {
  const and = (when: (context: RowContext) => boolean) => (extra ? (context: RowContext) => when(context) && extra(context) : when)
  return [
    drug("sugammadex", "Sugammadex", w("Sugammadex", "Сугамадекс"), "mg", adultChild(perKg(2, { round: 10 })), { when: and(steroidalRelaxantGiven) }),
    drug("neostigmine", "Neostigmine", w("Neostigmine", "Неостигмин"), "mg", adultChild(perKg(0.05, { basis: "IBW", cap: 5, round: 0.5 }), perKg(0.05, { basis: "IBW", cap: 2.5, round: 0.1 })),
      { when: and(context => given(context.log, "nonDepolarising", context.complication.ts)) }),
    { ...glycopyrrolate, ...(extra ? { when: extra } : {}) },
  ]
}

const BY_COMPLICATION = new Map<string, CardDef>()
for (const card of SUGGESTION_CARDS) for (const name of card.complications) BY_COMPLICATION.set(name, card)

/** The card for a complication, or undefined when it has none (TRALI, hypothermia, …). */
export function suggestionCardFor(label: string | null | undefined): CardDef | undefined {
  return label ? BY_COMPLICATION.get(canonicalComplicationLabel(label)) : undefined
}
