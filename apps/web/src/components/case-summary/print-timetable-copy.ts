// Chart-internal labels (everything else on the sheet is translated in CaseSummary).
export const CHART_STR = {
  en: {
    time: "Time", drugs: "Drugs", agent: "Agent", infusion: "Infusion", gas: "Gas", fluids: "Fluids", position: "Position",
    bp: "BP", hr: "HR", spo2: "SpO₂", etco2: "EtCO₂", temp: "Temp",
    sbp: "SBP", dbp: "DBP", units: "mmHg / bpm",
    noData: "No intraoperative data recorded",
  },
  bg: {
    time: "Час", drugs: "Медикаменти", agent: "Агент", infusion: "Инфузия", gas: "Газова смес", fluids: "Флуиди", position: "Позиция",
    // Chart row labels stay abbreviated — the column is narrow. SpO₂/EtCO₂ are
    // written the same way in Bulgarian clinical practice.
    bp: "АН", hr: "СЧ", spo2: "SpO₂", etco2: "EtCO₂", temp: "Темп",
    sbp: "САН", dbp: "ДАН", units: "mmHg / удм",
    noData: "Няма записани интраоперативни данни",
  },
}

export type ChartStr = typeof CHART_STR.en
