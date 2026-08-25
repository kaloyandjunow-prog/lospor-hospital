import { describe, expect, it } from "vitest"
import bg from "../../messages/bg.json"
import { LABELS } from "@/components/case-summary/labels"
import { CHART_STR } from "@/components/case-summary/print-timetable-copy"
import { clinicalRuleEditorCopy } from "@/components/clinical-rules/editor-copy"
import { CLINICAL_RULES_PAGE_COPY } from "@/components/clinical-rules/page-copy"
import { clinicalRuleUiCopy } from "@/components/clinical-rules/ui-copy"
import { intraopUiCopy } from "@/components/intraop/ui-copy"

const RETIRED_GENERIC_MEDICATION = /лекарств(?:о|а|ото|ата)/iu

describe("clinician-approved Bulgarian wording", () => {
  it("uses the six approved forms in the shared catalog and printed record", () => {
    expect(bg.preop.difficultAirway).toBe("Анамнеза за труден дихателен път")
    expect(LABELS.bg.difficultAirway).toBe("⚠ Анамнеза за труден дихателен път")
    expect(bg.intraop.equipment.labels["ETT depth (lip)"])
      .toBe("Дълбочина на ETT при устната комисура")
    expect(bg.intraop.equipment.text.cuffed).toBe("с маншет")
    expect(bg.pediatric.maintenanceFluid)
      .toBe("Поддържаща скорост на инфузия на течности")
    expect(bg.intraop.equipment.labels.Maintenance)
      .toBe("Поддържаща скорост на инфузия на течности")
    expect(bg.intraop.lab.referenceRange).toBe("Референтен интервал")
    expect(bg.intraop.timetable.drugs).toBe("Медикаменти")
    expect(CHART_STR.bg.drugs).toBe("Медикаменти")
  })

  it("keeps generic medication copy consistent outside controlled medical compounds", () => {
    const renderedCopy = JSON.stringify({
      messages: bg,
      print: LABELS.bg,
      chart: CHART_STR.bg,
      rulesEditor: clinicalRuleEditorCopy(true),
      rulesPage: CLINICAL_RULES_PAGE_COPY.bg,
      rulesUi: clinicalRuleUiCopy("bg"),
      intraop: intraopUiCopy("bg"),
    })

    expect(renderedCopy).not.toMatch(RETIRED_GENERIC_MEDICATION)
    expect(renderedCopy).not.toContain("История на труден дихателен път")
    expect(renderedCopy).not.toContain("с маншон")
    expect(renderedCopy).not.toContain("Реф. граници")
    expect(renderedCopy).not.toContain("Поддържащи течности")
    expect(renderedCopy).not.toContain("Поддържаща инфузия")
  })

  it("preserves controlled medical compounds and the established Web ETT abbreviation", () => {
    const renderedCopy = JSON.stringify({
      messages: bg,
      rulesEditor: clinicalRuleEditorCopy(true),
      rulesUi: clinicalRuleUiCopy("bg"),
    })

    expect(renderedCopy).toContain("Лекарствени / субстанционни алергии")
    expect(bg.intraop.equipment.labels["ETT depth (lip)"]).toContain("ETT")
  })
})
