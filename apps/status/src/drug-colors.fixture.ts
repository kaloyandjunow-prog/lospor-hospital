import type { DrugColorsView } from "./control-plane.js"

/** A small drug colours view, shaped as the API sends it (10.0.0). */
export function drugColorsFixture(): DrugColorsView {
  return {
    palette: [
      { hex: "#ef4444", labelEn: "Red", labelBg: "Червено" },
      { hex: "#3b82f6", labelEn: "Blue", labelBg: "Синьо" },
      { hex: "#ec4899", labelEn: "Pink", labelBg: "Розово" },
    ],
    groups: [
      {
        name: "Opioid analgesics", labelEn: "Opioid analgesics", labelBg: "Опиоидни аналгетици",
        bundledColor: "#f97316", color: "#3b82f6",
        drugs: [
          { name: "Fentanyl", labelBg: "Фентанил", bundledColor: "#f97316", color: null, bolus: true, infusion: true },
          { name: "Remifentanil", labelBg: "Ремифентанил", bundledColor: "#ec4899", color: "#a1b2c3", bolus: false, infusion: true },
        ],
      },
      {
        name: "Antiemetics / prokinetics", labelEn: "Antiemetics / prokinetics", labelBg: "Антиеметици / прокинетици",
        bundledColor: "#10b981", color: null,
        drugs: [{ name: "Ondansetron", labelBg: "Ондансетрон", bundledColor: "#10b981", color: null, bolus: true, infusion: false }],
      },
    ],
  }
}
