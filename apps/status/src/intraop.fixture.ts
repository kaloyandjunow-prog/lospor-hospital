import type { IntraopAutomationConfigView, IntraopAutomationView } from "./control-plane.js"

/** The intraoperative suggestions' settings, shaped as the API sends them (10.2.0). */
export function intraopFixture(overrides: Partial<IntraopAutomationConfigView> = {}): IntraopAutomationView {
  const signs = [
    { key: "hr", labelEn: "Heart rate", labelBg: "Пулс" },
    { key: "sbp", labelEn: "Systolic", labelBg: "Систолно" },
  ]
  const bands = [
    { key: "INFANT", labelEn: "Infant", labelBg: "Кърмаче" },
    { key: "ADULT", labelEn: "Adult", labelBg: "Възрастен" },
  ]
  const config: IntraopAutomationConfigView = {
    enabled: true,
    groups: { treatmentSuggestions: true, reverseQuestions: false, timers: true },
    dantroleneVialsMg: [20, 250],
    vitalQuestions: {
      enabled: true,
      minCases: 100,
      tails: Object.fromEntries(bands.map(band => [band.key, Object.fromEntries(signs.map(sign => [sign.key, { low: 0.5, high: 0.5 }]))])),
    },
    ...overrides,
  }
  return {
    config,
    groups: [
      { key: "treatmentSuggestions", labelEn: "Treatment suggestions", labelBg: "Предложения за лечение", detailEn: "The card after a complication.", detailBg: "Картата след усложнение." },
      { key: "reverseQuestions", labelEn: "Questions after a rescue drug", labelBg: "Въпроси след спасително лекарство", detailEn: "Asks which complication.", detailBg: "Пита за кое усложнение." },
      { key: "timers", labelEn: "Follow-ups", labelBg: "Последващи стъпки", detailEn: "Timers after a treatment.", detailBg: "Таймери след лечение." },
    ],
    bands,
    signs,
    tailSteps: [0.1, 0.25, 0.5, 1, 2, 2.5, 5],
    defaultTail: 0.5,
    defaultMinCases: 100,
    minCasesRange: { min: 20, max: 10_000 },
    vialSizesMg: [20, 120, 250],
  }
}
