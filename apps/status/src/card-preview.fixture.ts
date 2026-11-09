import type { CardPreviewView } from "./control-plane.js"

export function cardPreviewFixture(over: Partial<CardPreviewView> = {}): CardPreviewView {
  return {
    patients: [
      { key: "adult", labelEn: "Adult, 80 kg", labelBg: "Възрастен, 80 kg" },
      { key: "child", labelEn: "Child, 5 years, 18 kg", labelBg: "Дете, 5 г., 18 kg" },
    ],
    preview: {
      complication: "Hypotension",
      complicationBg: "Хипотенсия",
      kind: "card",
      redStrip: false,
      question: { en: "Treat now?", bg: "Лечение сега?" },
      branches: null,
      patient: { key: "adult", labelEn: "Adult, 80 kg", labelBg: "Възрастен, 80 kg" },
      rows: [
        { id: "ephedrine", kind: "drug", titleEn: "Ephedrine", titleBg: "Ефедрин", noteEn: null, noteBg: null, dose: { en: "10 mg", bg: "10 mg" }, branches: null, step: null, total: null },
        { id: "atropine", kind: "drug", titleEn: "Atropine <b>x</b>", titleBg: "Атропин", noteEn: "Up to 3 mg", noteBg: "До 3 mg", dose: { en: "0.5 mg", bg: "0.5 mg" }, branches: null, step: { index: 0, of: 3 }, total: { amount: 0, max: 3, unit: "mg" } },
      ],
    },
    ...over,
  }
}
