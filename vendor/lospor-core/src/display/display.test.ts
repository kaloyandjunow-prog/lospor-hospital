import { describe, expect, it } from "vitest"
import {
  APPROVED_CLINICAL_DISPLAY_TERMS,
  INTERNATIONAL_FLUID_DISPLAY_DOMAINS,
  INTERNATIONAL_LAB_DISPLAY_DOMAINS,
  INTERNATIONAL_MEDICATION_DISPLAY_DOMAINS,
  clinicalDisplayInventory,
  clinicalDisplayLabel,
  clinicalShortDisplayLabel,
  formatClinicalGasMixLabel,
  humanizeClinicalCode,
  optionDisplayEntry,
  optionDisplayPath,
  pendingClinicalDisplayTerms,
  resolveClinicalDisplay,
  resolveOptionDisplay,
} from "./index"
import { catalogOption } from "../catalog"

describe("clinical display registry", () => {
  it("keeps stable codes separate from localized labels", () => {
    const result = resolveClinicalDisplay(
      "option:DISPOSITION",
      "WARD",
      "bg",
    )

    expect(result.code).toBe("WARD")
    expect(result.label).toBe("Отделение")
    expect(result.labelEn).toBe("Ward")
    expect(result.known).toBe(true)
  })

  it("tracks clinician-reviewed wording separately from pending terms", () => {
    const approvedKeys = APPROVED_CLINICAL_DISPLAY_TERMS
      .map(([domain, code]) => `${domain}:${code.toLocaleLowerCase("en")}`)
    expect(new Set(approvedKeys).size).toBe(approvedKeys.length)
    for (const [domain, code] of APPROVED_CLINICAL_DISPLAY_TERMS) {
      expect(resolveClinicalDisplay(domain, code, "en").reviewStatus).toBe("approved")
    }

    expect(resolveClinicalDisplay("clinicalAttribute", "left", "bg").label).toBe("Лява")
    expect(resolveClinicalDisplay("ventilationMode", "A/C", "bg").label).toBe("Assist/Control (A/C)")
    expect(resolveClinicalDisplay("ventilationMode", "VG", "bg").label).toBe("Volume Guarantee (VG)")
    expect(resolveClinicalDisplay("scenarioGroup", "induction", "bg").label).toBe("Увод")
    expect(resolveClinicalDisplay("labFlag", "low", "bg").label).toBe("Под референтните граници")
    expect(resolveClinicalDisplay("researchScope", "GRANT", "bg").label).toBe("Предоставен достъп")
    expect(resolveClinicalDisplay("researchDomain", "selection", "bg").label).toBe("Избрани клинични опции")
    expect(resolveClinicalDisplay("researchSection", "postop", "bg").label).toBe("Постоперативен запис")
    expect(resolveClinicalDisplay("researchMetric", "meanBmi", "bg").label).toBe("Среден ИТМ")
    expect(resolveClinicalDisplay("researchDistribution", "disposition", "bg").label).toBe("Следоперативно звено")
    expect(resolveClinicalDisplay("researchField", "rcri", "bg").label).toBe("Оценка по RCRI")
    expect(resolveClinicalDisplay("researchField", "positions", "bg").label).toBe("Позиция на масата")
    expect(resolveClinicalDisplay("researchField", "recoveryBpSystolic", "bg").label).toBe("Систолно АН при предаване")
    expect(resolveClinicalDisplay("researchField", "recoverySpO2", "bg").label).toBe("SpO₂ при предаване")
    expect(resolveClinicalDisplay("eventType", "gas_start", "bg").label).toBe("Свеж газ - начало")
    expect(resolveClinicalDisplay("eventType", "fluid_stop", "bg").label).toBe("Вливане спряно")
    expect(resolveClinicalDisplay("optionGroup", "standard", "bg").label).toBe("Стандартен мониторинг")
    expect(resolveClinicalDisplay("optionGroup", "Transfer", "bg").label).toBe("Извеждане на пациента")
    expect(clinicalDisplayLabel("option:POSITION", "FOWLER", "bg")).toBe("Позиция на Фаулър")
    expect(clinicalDisplayLabel("option:POSITION", "LATERAL_DECUBITUS_RIGHT", "bg")).toBe("Дясна декубитусна позиция")
    expect(clinicalDisplayLabel("option:AIRWAY_MANAGEMENT", "OPA", "bg")).toBe("Орофарингеален въздуховод")
    expect(clinicalDisplayLabel("option:AIRWAY_MANAGEMENT", "ORAL_ETT", "bg")).toBe("Оротрахеална ЕТТ")
    expect(clinicalDisplayLabel("option:AIRWAY_MANAGEMENT", "BOUGIE", "bg")).toBe("Bougie")
    expect(clinicalDisplayLabel("option:VASCULAR_ACCESS", "ART_CAROTID", "bg")).toBe("Arteria carotis communis")
    expect(clinicalDisplayLabel("option:VASCULAR_ACCESS", "PICC_BRACHIAL", "bg")).toBe("Venae brachiales")
    expect(clinicalDisplayLabel("option:VASCULAR_ACCESS", "CVK_IJV", "bg")).toBe("Vena jugularis interna")
    expect(clinicalDisplayLabel("option:TECHNIQUE", "NEURAXIAL", "bg")).toBe("Невроаксиален блок")
    expect(clinicalDisplayLabel("option:TECHNIQUE", "DPE", "bg")).toBe("Епидурална техника с дурална пункция (DPE)")
    expect(clinicalDisplayLabel("option:TECHNIQUE", "BLOCK_ADDUCTOR", "bg")).toBe("Блок на аддукторния канал (n. saphenus)")
    expect(resolveClinicalDisplay("option:VASCULAR_ACCESS", "CVK_IJV", "en").reviewStatus).toBe("approved")
    expect(clinicalDisplayLabel("option:TECHNIQUE", "BLOCK_FOOT", "bg")).toBe("Фус блок")
    expect(clinicalDisplayLabel("option:TECHNIQUE", "BLOCK_PECS1", "bg")).toBe("PECS I block")
    expect(clinicalDisplayLabel("option:TECHNIQUE", "BLOCK_INTERCOSTAL", "bg")).toBe("Интеркостален блок")
    expect(clinicalDisplayLabel("option:TECHNIQUE", "SEDATION_MAC", "bg")).toBe("Мониторирана анестезиологична грижа (МАГ)")
    expect(clinicalDisplayLabel("option:MONITORING", "bglMonitor", "bg")).toBe("Серумна глюкоза")
    expect(clinicalDisplayLabel("option:MONITORING", "bloodGasMonitor", "bg")).toBe("Кръвно-газов анализ (КГА)")
    expect(resolveClinicalDisplay("option:MONITORING", "bloodGasMonitor", "en").reviewStatus).toBe("approved")
    expect(clinicalDisplayLabel("option:MONITORING", "urinaryCatheter", "bg")).toBe("Диуреза")
    expect(clinicalDisplayLabel("option:MONITORING", "stomachTube", "bg")).toBe("Назогастрална сонда (НГС)")

    expect(clinicalDisplayLabel("option:INTRAOP_EVENT", "AIRWAY_INDUCTION", "bg")).toBe("Увод")
    expect(clinicalDisplayLabel("option:INTRAOP_EVENT", "ACCESS_CVC_IN", "bg")).toBe("Поставяне на централен венозен катетър (ЦВК)")
    expect(clinicalDisplayLabel("option:INTRAOP_EVENT", "COMPLICATIONS_LAST", "bg")).toBe("Системна токсичност на локалните анестетици (LAST)")
    expect(clinicalDisplayLabel("option:SEX", "MALE", "bg")).toBe("Мъж")
    expect(clinicalDisplayLabel("option:BLOOD_GROUP", "O_POS", "bg")).toBe("0+")
    expect(clinicalDisplayLabel("option:DISPOSITION", "PACU", "bg")).toBe("Зала за събуждане (PACU)")
    expect(clinicalDisplayLabel("option:HANDOVER_ITEM", "VITAL_SIGNS_MONITORING", "bg")).toBe("Жизнени показатели и мониторинг")
    expect(clinicalDisplayLabel("eventType", "vital", "bg")).toBe("Жизнени показатели")
    expect(clinicalDisplayLabel("option:HANDOVER_ITEM", "antihypertensive", "bg"))
      .toBe("Антихипертензивни медикаменти — възобновени / временно преустановени")
    expect(clinicalDisplayLabel("option:HANDOVER_ITEM", "PONV_GI", "bg"))
      .toBe("Постоперативно гадене и повръщане (ПОГП) и стомашно-чревна система")
    expect(clinicalDisplayLabel("optionGroup", "Acid suppression / aspiration prophylaxis / GI adjuncts", "en"))
      .toBe("Gastrointestinal / antiemetic medications")
    expect(clinicalDisplayLabel("optionGroup", "Anaphylaxis / allergy adjuncts", "bg"))
      .toBe("Медикаменти при анафилаксия / алергични реакции")
    expect(clinicalDisplayLabel("optionGroup", "Hemostasis / anticoagulation / transfusion pharmacology", "bg"))
      .toBe("Хемостаза / антикоагулация / тромболиза")
    expect(clinicalDisplayLabel("optionGroup", "Obstetric uterotonics / tocolytics", "en"))
      .toBe("Obstetric uterotonics")
    expect(clinicalDisplayLabel("optionGroup", "Miscellaneous perioperative adjuncts", "bg"))
      .toBe("Други периоперативни адюванти")
    expect(clinicalDisplayLabel("optionGroup", "Vasoactive drugs - inotropes / inodilators", "bg"))
      .toBe("Вазоактивни медикаменти — инотропи / инодилататори")
    expect(clinicalDisplayLabel("complication", "Hypoxia / desaturation", "en"))
      .toBe("Hypoxaemia / desaturation")
    expect(clinicalDisplayLabel("complication", "CICO (can't intubate can't oxygenate)", "bg"))
      .toBe("CICO (невъзможна интубация и оксигенация)")
    expect(clinicalDisplayLabel("complication", "Delayed emergence", "bg"))
      .toBe("Забавено събуждане от анестезия")
    expect(clinicalDisplayLabel("complication", "Malignant hyperthermia", "bg"))
      .toBe("Малигнена хипертермия")
    expect(clinicalDisplayLabel("complication", "Anaphylactoid reaction", "en"))
      .toBe("Anaphylaxis (legacy label: anaphylactoid reaction)")
    expect(clinicalDisplayLabel("complication", "DIC (disseminated intravascular coagulation)", "bg"))
      .toBe("Дисеминирана интравазална коагулация (ДИК)")
    expect(clinicalDisplayLabel("complication", "TACO (transfusion-associated circulatory overload)", "bg"))
      .toBe("Циркулаторно претоварване, свързано с трансфузия (TACO)")
    expect(clinicalDisplayLabel("complication", "equipment", "bg"))
      .toBe("Инциденти с оборудване / технически инциденти")
    expect(clinicalDisplayLabel("complication", "CVK failure", "bg"))
      .toBe("Неизправност на централен венозен катетър (ЦВК)")

    const inventory = clinicalDisplayInventory()
    const medicationTerms = inventory.filter(term =>
      INTERNATIONAL_MEDICATION_DISPLAY_DOMAINS.includes(
        term.domain as typeof INTERNATIONAL_MEDICATION_DISPLAY_DOMAINS[number],
      ),
    )
    // 283 since intranasal dexmedetomidine joined the premedication catalogue.
    expect(medicationTerms).toHaveLength(283)
    for (const term of medicationTerms) {
      expect(term.label.bg).toBe(term.label.en)
      expect(term.bgSource).toBe("international")
      expect(term.reviewStatus).toBe("approved")
    }
    const fluidTerms = inventory.filter(term =>
      INTERNATIONAL_FLUID_DISPLAY_DOMAINS.includes(
        term.domain as typeof INTERNATIONAL_FLUID_DISPLAY_DOMAINS[number],
      ),
    )
    expect(fluidTerms).toHaveLength(22)
    for (const term of fluidTerms) {
      expect(term.label.bg).toBe(term.label.en)
      expect(term.bgSource).toBe("international")
      expect(term.reviewStatus).toBe("approved")
    }
    const labTerms = inventory.filter(term =>
      INTERNATIONAL_LAB_DISPLAY_DOMAINS.includes(
        term.domain as typeof INTERNATIONAL_LAB_DISPLAY_DOMAINS[number],
      ),
    )
    expect(labTerms).toHaveLength(75)
    for (const term of labTerms) {
      expect(term.label.bg).toBe(term.label.en)
      expect(term.bgSource).toBe("international")
      expect(term.reviewStatus).toBe("approved")
    }
    const complicationTerms = inventory.filter(term => term.domain === "complication")
    expect(complicationTerms).toHaveLength(89)
    expect(complicationTerms.every(term => term.reviewStatus === "approved")).toBe(true)
    const eventTerms = inventory.filter(term => term.domain === "option:INTRAOP_EVENT")
    expect(eventTerms).toHaveLength(45)
    expect(eventTerms.every(term => term.reviewStatus === "approved")).toBe(true)
    expect(inventory.filter(term => term.reviewStatus === "approved")).toHaveLength(974)
    expect(pendingClinicalDisplayTerms()).toHaveLength(0)
  })
  it("normalizes legacy option aliases before resolving labels", () => {
    const result = resolveClinicalDisplay(
      "option:TECHNIQUE",
      "GENERAL_COMBINED",
      "en",
    )

    expect(result.code).toBe("GENERAL_BALANCED")
    expect(result.label).toBe("Balanced (inhaled + IV)")
  })

  it("resolves legacy English option labels to stable catalog codes", () => {
    const result = resolveClinicalDisplay("option:INTRAOP_DRUG", "Propofol", "en")

    expect(result.code).toBe("PROPOFOL")
    expect(result.label).toBe("Propofol")
    expect(result.known).toBe(true)
  })

  it("localizes scenario groups and option paths through the same registry", () => {
    expect(clinicalDisplayLabel("scenarioGroup", "induction", "en")).toBe("Induction")
    expect(clinicalShortDisplayLabel("carrierGas", "air", "bg")).toBe("Въздух")
    expect(formatClinicalGasMixLabel({ fgf: 1, carrierGas: "air", fio2: 50, fiAir: 50 }, "bg"))
      .toBe("O₂/Въздух 50/50")
    expect(optionDisplayPath("TECHNIQUE", "GENERAL_COMBINED", "en")).toContain("Balanced")
    expect(optionDisplayEntry("DISPOSITION", "WARD after review", "bg"))
      .toBe("Отделение after review")
  })

  it("uses runtime bilingual labels for database vocabularies", () => {
    const result = resolveClinicalDisplay("diagnosis", "K35", "bg", {
      labelEn: "Acute appendicitis",
      labelBg: "Остър апендицит",
    })

    expect(result.code).toBe("K35")
    expect(result.label).toBe("Остър апендицит")
    expect(result.reviewStatus).toBe("approved")
  })

  it("returns readable fallbacks while preserving unknown codes", () => {
    const result = resolveClinicalDisplay("researchField", "newClinicalField", "en")

    expect(result.code).toBe("newClinicalField")
    expect(result.label).toBe("New clinical field")
    expect(result.known).toBe(false)
    expect(humanizeClinicalCode("GENERAL_BALANCED")).toBe("General balanced")
  })

  it("exposes one unique domain/code inventory for terminology review", () => {
    const inventory = clinicalDisplayInventory()
    const keys = inventory.map(term => `${term.domain}:${term.code.toLocaleLowerCase("en")}`)

    expect(new Set(keys).size).toBe(keys.length)
    expect(inventory.length).toBeGreaterThan(100)
    expect(inventory.every(term => term.label.en && term.label.bg)).toBe(true)
  })

  it("resolves fetched options without replacing their identity", () => {
    const option = catalogOption("MONITORING", "ecg")
    expect(option).toBeDefined()

    const result = resolveOptionDisplay("MONITORING", option!, "en")
    expect(result.code).toBe("ecg")
    expect(result.label).toBe("ECG")
    expect(clinicalDisplayLabel("researchMetric", "caseCount", "bg")).toBe("Случаи")
  })
})
