import type { IntraopReadingsView } from "./control-plane.js"

/** A small, deterministic readings view, shaped as the API sends it (10.2.0): adults with plenty of cases, infants still collecting. */
export function readingsFixture(overrides: Partial<IntraopReadingsView> = {}): IntraopReadingsView {
  const signs = [
    { key: "hr", labelEn: "Heart rate", labelBg: "Пулс", shortEn: "HR", shortBg: "СЧ", unit: "bpm" },
    { key: "sbp", labelEn: "Systolic pressure", labelBg: "Систолично налягане", shortEn: "SBP", shortBg: "Сис", unit: "mmHg" },
    { key: "dbp", labelEn: "Diastolic pressure", labelBg: "Диастолично налягане", shortEn: "DBP", shortBg: "Диас", unit: "mmHg" },
    { key: "map", labelEn: "Mean arterial pressure", labelBg: "Средно артериално налягане", shortEn: "MAP", shortBg: "САН", unit: "mmHg" },
  ]
  const bands = [
    { key: "INFANT", labelEn: "Infant (1–12 months)", labelBg: "Кърмачета (1–12 месеца)", fixed: { tachycardiaAbove: 180, bradycardiaBelow: 100, hypotension: { sign: "sbp", from: 70, to: 70 } } },
    { key: "ADULT", labelEn: "Adult (18–64 years)", labelBg: "Възрастни (18–64 г.)", fixed: { tachycardiaAbove: 100, bradycardiaBelow: 50, hypotension: { sign: "map", from: 65, to: 65 } } },
  ]
  // A bell of whole-number readings around a mean.
  const histogram = (mean: number, sd: number, readings: number, cases: number) => {
    const min = Math.round(mean - 4 * sd), max = Math.round(mean + 4 * sd)
    const counts = Array.from({ length: max - min + 1 }, (_, i) => Math.round(readings * Math.exp(-0.5 * ((min + i - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))))
    return { min, counts, cases }
  }
  const stats = {
    ADULT: { hr: histogram(70, 10, 20_000, 150), sbp: histogram(118, 14, 20_000, 150), dbp: histogram(64, 9, 20_000, 150), map: histogram(82, 10, 20_000, 150) },
    INFANT: { hr: histogram(130, 13, 3_000, 40), sbp: histogram(76, 9, 3_000, 40), dbp: histogram(42, 7, 3_000, 40), map: histogram(54, 8, 3_000, 40) },
  }
  // Five figures a case: hrMin, hrMax, sbpMin, dbpMin, mapMin, spread deterministically.
  const cases = (hr: number, sbp: number, dbp: number, map: number, n: number) => Array.from({ length: n }, (_, i) => {
    const wobble = ((i * 37) % 21) - 10
    return [hr - 12 + wobble, hr + 15 + wobble, sbp - 22 + wobble, dbp - 14 + wobble, map - 17 + wobble]
  })
  const month = (index: number) => `2026-${String(index + 1).padStart(2, "0")}`
  const history = Array.from({ length: 6 }, (_, i) => ({
    month: month(i + 5),
    limits: {
      ADULT: Object.fromEntries(signs.map(sign => [sign.key, {
        cases: 25 * (i + 1),
        low: [0.1, 0.25, 0.5, 1, 2, 2.5, 5].map((_, step) => 40 + step * 2 + i),
        high: [0.1, 0.25, 0.5, 1, 2, 2.5, 5].map((_, step) => 110 - step * 2 - i),
      }])),
    },
  }))
  return {
    generatedAt: "2026-11-09T10:00:00.000Z",
    config: {
      enabled: true,
      minCases: 100,
      tails: Object.fromEntries(bands.map(band => [band.key, Object.fromEntries(signs.map(sign => [sign.key, { low: 0.5, high: 0.5 }]))])),
      hypertensionBaselinePercent: 20,
    },
    hypertensionUsesStatistics: false,
    bands,
    signs,
    tailSteps: [0.1, 0.25, 0.5, 1, 2, 2.5, 5],
    defaultTail: 0.5,
    defaultMinCases: 100,
    minCasesRange: { min: 20, max: 10_000 },
    stats,
    caseColumns: ["hrMin", "hrMax", "sbpMin", "dbpMin", "mapMin"],
    cases: { ADULT: cases(70, 118, 64, 82, 150), INFANT: cases(130, 76, 42, 54, 40) },
    history,
    ...overrides,
  }
}
