import type { IndicatorConfigView, IndicatorsView } from "./control-plane.js"

/** The unit indicators' settings, shaped as the API sends them (10.0.0). */
export function indicatorsFixture(overrides: Partial<IndicatorConfigView> = {}): IndicatorsView {
  const defaults: IndicatorConfigView = {
    hypotensionBands: [
      { key: "INFANT", labelEn: "Infant (28 days to 1 year)", labelBg: "Кърмачета (28 дни до 1 г.)", fromDays: 28, toDays: 365, mapBelow: null, sbpBelow: 70 },
      { key: "ADULT", labelEn: "18 to 64 years", labelBg: "От 18 до 64 г.", fromDays: 6575, toDays: 23741, mapBelow: 65, sbpBelow: null },
    ],
    spo2Below: 90, tempBelow: 36, painAbove: 3, paedAtLeast: 10, namedClinicians: false,
  }
  return { defaults, config: { ...defaults, ...overrides } }
}
