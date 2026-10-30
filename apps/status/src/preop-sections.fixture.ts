import type { PreopSectionConfigView, PreopSectionsView } from "./control-plane.js"

/** A small but complete sections view, shaped as the API sends it (1.7.0). */
export function preopSectionsFixture(): PreopSectionsView {
  const config = (pediatric: boolean): PreopSectionConfigView => ({
    sections: {
      MEDICAL_HISTORY: true,
      CURRENT_MEDICATIONS: true,
      MEDICATION_INSTRUCTIONS: true,
      PEDIATRIC_FASTING: pediatric,
      POSTOP_RECOVERY_VITALS: true,
      POSTOP_PAIN: true,
      POSTOP_DELIRIUM: pediatric,
      POSTOP_PONV: true,
    },
    orderOptions: [
      { key: "NONE", list: "WARD_ORDER", kind: "NONE", labelEn: "No orders", labelBg: "Без назначения", conceptId: 0, bundled: true, enabled: true, sortOrder: 0, hoursMode: "NONE", labTest: null },
      { key: "CUSTOM_ABC123", list: "WARD_ORDER", kind: "SIMPLE", labelEn: "Shave the site", labelBg: "Обръсване", conceptId: 0, bundled: false, enabled: true, sortOrder: 1, hoursMode: "NONE", labTest: null },
      { key: "STOP", list: "MEDICATION_INSTRUCTION", kind: "MEDICATION", labelEn: "Stop", labelBg: "Спиране", conceptId: 764611, bundled: true, enabled: true, sortOrder: 0, hoursMode: "REQUIRED", labTest: null },
    ],
    consultSpecialtyKeys: ["1001"],
  })
  return {
    definitions: [
      { key: "MEDICAL_HISTORY", labelEn: "Medical history", labelBg: "Придружаващи заболявания", populations: ["ADULT", "PEDIATRIC"], requires: null },
      { key: "CURRENT_MEDICATIONS", labelEn: "Current medications", labelBg: "Приемани медикаменти", populations: ["ADULT", "PEDIATRIC"], requires: null },
      { key: "MEDICATION_INSTRUCTIONS", labelEn: "Medication instructions", labelBg: "Указания за медикаментите", populations: ["ADULT", "PEDIATRIC"], requires: "CURRENT_MEDICATIONS" },
      { key: "PEDIATRIC_FASTING", labelEn: "Nil by mouth", labelBg: "Гладуване", populations: ["PEDIATRIC"], requires: null },
      { key: "POSTOP_RECOVERY_VITALS", labelEn: "Recovery vital signs", labelBg: "Витални показатели при възстановяване", populations: ["ADULT", "PEDIATRIC"], requires: null, form: "POSTOP" },
      { key: "POSTOP_PAIN", labelEn: "Pain", labelBg: "Болка", populations: ["ADULT", "PEDIATRIC"], requires: null, form: "POSTOP" },
      { key: "POSTOP_DELIRIUM", labelEn: "Emergence delirium (PAED)", labelBg: "Делир при събуждане (PAED)", populations: ["PEDIATRIC"], requires: null, form: "POSTOP" },
      { key: "POSTOP_PONV", labelEn: "Postoperative nausea and vomiting", labelBg: "Постоперативно гадене и повръщане (ПОГП)", populations: ["ADULT", "PEDIATRIC"], requires: null, form: "POSTOP" },
    ],
    fixed: [{ key: "DEMOGRAPHICS", labelEn: "Demographics", labelBg: "Демографски данни", reasonEn: "Required to continue", reasonBg: "Задължителен за продължаване" }],
    postopFixed: [{ key: "RECOVERY_SCORE", labelEn: "Recovery score (Aldrete / Steward)", labelBg: "Скор при възстановяване (Aldrete / Steward)", reasonEn: "Required to finalise", reasonBg: "Задължителен за приключване" }],
    specialties: [
      { key: "1001", labelEn: "Cardiology", labelBg: "Кардиология", clinical: true, doctor: true },
      { key: "1002", labelEn: "Nephrology", labelBg: "Нефрология", clinical: true, doctor: true },
    ],
    holdHours: [12, 24, 48],
    configs: { ADULT: config(false), PEDIATRIC: config(true) },
  }
}
