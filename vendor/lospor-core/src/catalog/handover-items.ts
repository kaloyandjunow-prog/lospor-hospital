// HANDOVER_ITEM — postop handover checklist, tree-shaped like TECHNIQUE/
// VASCULAR_ACCESS (group rows as parents, item rows as children). Replaces
// PostopForm.tsx's HANDOVER_GROUPS_EN/BG and mobile's matching hardcoded copy.
import type { TreeNode } from "./types"

export const HANDOVER_ITEMS: TreeNode[] = [
  { v: "VITAL_SIGNS_MONITORING", label: "Vital Signs & Monitoring", labelBg: "Жизнени показатели и мониторинг", children: [
    { v: "obs_freq", label: "Observations q15 min × 1h, then q30 min × 1h", labelBg: "Контрол на жизнените показатели на всеки 15 мин за 1 ч, след това на всеки 30 мин за 1 ч" },
    { v: "spo2_cont", label: "Continuous SpO₂ monitoring", labelBg: "Непрекъснато мониториране на SpO₂" },
    { v: "alert_bp", label: "Blood pressure — target range communicated", labelBg: "АН — съобщен целеви диапазон" },
    { v: "temp_monitor", label: "Temperature monitoring / active warming", labelBg: "Мониториране на температурата / активно затопляне" },
    { v: "urine_output", label: "Urine output monitoring (IDC in situ)", labelBg: "Мониториране на диурезата (поставен уринарен катетър)" },
    { v: "glucose", label: "Serum/peripheral glucose monitoring", labelBg: "Мониториране на серумна/капилярна глюкоза" },
  ]},
  { v: "AIRWAY_OXYGEN", label: "Airway & Oxygen", labelBg: "Дихателен път и кислородотерапия", children: [
    { v: "o2_supp", label: "Supplemental O₂ — rate and duration specified", labelBg: "Допълнителен O₂ — уточнени дебит и продължителност" },
    { v: "npo", label: "Fasting status / nil by mouth until fully awake", labelBg: "Гладуване / без прием през устата до пълно събуждане" },
    { v: "diet_advance", label: "Advance diet when tolerating", labelBg: "Захранване при добра поносимост" },
    { v: "alert_resp", label: "Alert if SpO₂ < 92% or RR < 8 or > 25/min", labelBg: "Сигнализирай при SpO₂ < 92% или ДЧ < 8 или > 25/мин" },
    { v: "airway_alert", label: "Difficult airway — alert at bedside", labelBg: "Труден дихателен път — обозначен при леглото" },
    { v: "airway_position", label: "Position: head up / lateral / as specified", labelBg: "Позиция: повдигната горна част на тялото / странично / според указанията" },
  ]},
  { v: "CARDIOVASCULAR", label: "Cardiovascular", labelBg: "Сърдечно-съдова система", children: [
    { v: "piv", label: "Peripheral IV in situ", labelBg: "Поставен периферен венозен катетър (ПВК)" },
    { v: "cvk", label: "Central venous catheter in situ", labelBg: "Поставен централен венозен катетър (ЦВК)" },
    { v: "art_line", label: "Arterial line in situ", labelBg: "Поставена артериална линия" },
    { v: "alert_hr", label: "Alert if HR < 50 or > 120 bpm", labelBg: "Сигнализирай при СЧ < 50 или > 120/мин" },
    { v: "fluid_plan", label: "IV fluid plan — type, rate, volume specified", labelBg: "План за венозни вливания — уточнени разтвор, скорост и обем" },
    { v: "fluid_balance", label: "Fluid balance monitoring and documentation", labelBg: "Мониториране и документиране на водния баланс" },
    { v: "antihypertensive", label: "Antihypertensive medications resumed / held", labelBg: "Антихипертензивни медикаменти — възобновени / временно преустановени" },
    { v: "anticoagulation", label: "Anticoagulation plan documented", labelBg: "Документиран план за антикоагулантна терапия" },
  ]},
  { v: "PAIN", label: "Pain management", labelBg: "Контрол на болката", children: [
    { v: "analgesia_protocol", label: "Regular analgesic schedule prescribed", labelBg: "Назначена схема за редовна аналгезия" },
    { v: "pca", label: "PCA / epidural infusion — pump settings checked", labelBg: "ПКА / епидурална инфузия — настройките на помпата са проверени" },
    { v: "epidural_catheter", label: "Epidural catheter — pain team review", labelBg: "Епидурален катетър — преглед от екипа за лечение на болката" },
    { v: "nerve_catheter", label: "Peripheral nerve catheter in situ", labelBg: "Периферен нервен катетър на място" },
    { v: "pain_rescue", label: "Rescue analgesia — drug, dose, frequency", labelBg: "Аналгезия при нужда — медикамент, доза и честота" },
    { v: "alert_pain", label: "Alert if NRS pain score > 4 at rest", labelBg: "Сигнализирай при оценка на болката по NRS > 4 в покой" },
  ]},
  { v: "PONV_GI", label: "PONV & gastrointestinal care", labelBg: "Постоперативно гадене и повръщане (ПОГП) и стомашно-чревна система", children: [
    { v: "antiemetic_prn", label: "Antiemetics as needed / regimen prescribed", labelBg: "Антиеметици при нужда / назначена антиеметична схема" },
    { v: "ponv_protocol", label: "PONV prophylaxis", labelBg: "Профилактика на ПОГП" },
    { v: "oral_intake", label: "Resume oral intake when tolerated", labelBg: "Захранване при добра поносимост" },
    { v: "ngt", label: "NGT in situ — position confirmed / output documented", labelBg: "Назогастрална сонда (НГС) на място — потвърдена позиция / документирано отделено количество" },
  ]},
  { v: "MEDICATIONS_PROPHYLAXIS", label: "Medications & Prophylaxis", labelBg: "Медикаменти и профилактика", children: [
    { v: "resume_meds", label: "Regular medications resumed / held — list confirmed", labelBg: "Редовни медикаменти — възобновени / временно преустановени; списъкът е потвърден" },
    { v: "dvt_lmwh", label: "Pharmacological DVT prophylaxis — LMWH dose and timing", labelBg: "Медикаментозна профилактика на ДВТ — доза НМХ и час на приложение" },
    { v: "dvt_mechanical", label: "Mechanical DVT prophylaxis — compression stockings / IPC", labelBg: "Механична профилактика на ДВТ — компресионни чорапи / интермитентна пневматична компресия (ИПК)" },
    { v: "mobilisation", label: "Early mobilisation plan documented", labelBg: "Документиран план за ранна мобилизация" },
    { v: "stress_ulcer", label: "Stress ulcer prophylaxis", labelBg: "Профилактика на стресови язви" },
    { v: "antibiotics", label: "Antibiotics per surgical plan / course continued", labelBg: "Антибиотици според хирургичния план / курсът е продължен" },
    { v: "insulin", label: "Insulin / diabetes management plan active", labelBg: "Активен план за инсулиново лечение / контрол на диабета" },
    { v: "steroids", label: "Steroid supplementation if indicated", labelBg: "Кортикостероидна суплементация при показания" },
  ]},
  { v: "INVESTIGATIONS", label: "Investigations", labelBg: "Изследвания", children: [
    { v: "bloods", label: "Blood tests in ___ hours", labelBg: "Кръвни изследвания след ___ часа" },
    { v: "ecg", label: "12-lead ECG", labelBg: "12-отвеждаща ЕКГ" },
    { v: "cxr", label: "Chest X-ray / pending imaging follow-up", labelBg: "Рентгенография на гръден кош / проследяване на неприключили образни изследвания" },
  ]},
  { v: "CONSULTATIONS_FOLLOWUP", label: "Consultations & Follow-up", labelBg: "Консултации и проследяване", children: [
    { v: "pain_team", label: "Pain management team review", labelBg: "Преглед от екипа за лечение на болката" },
    { v: "physio", label: "Physiotherapy", labelBg: "Физиотерапия" },
    { v: "dietitian", label: "Dietitian / nutritional support", labelBg: "Диетолог / нутритивна подкрепа" },
    { v: "wound_care", label: "Wound / drain care instructions documented", labelBg: "Документирани указания за грижи за оперативната рана / дренажа" },
    { v: "follow_up", label: "Follow-up appointment / plan communicated", labelBg: "Предадена информация за контролния преглед / плана за проследяване" },
  ]},
]
