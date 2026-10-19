import { describe, expect, it } from "vitest"
import {
  consentTechniquesForPlan,
  isPlannedAnaesthesiaEmpty,
  normalizePlannedAnaesthesia,
  plannedAnaesthesiaText,
} from "./preop-plan"

describe("the planned anaesthesia", () => {
  it("reads anything that is not a plan as nothing planned", () => {
    expect(isPlannedAnaesthesiaEmpty(null)).toBe(true)
    expect(isPlannedAnaesthesiaEmpty(["general"])).toBe(true)
    expect(normalizePlannedAnaesthesia({ techniques: ["GENERAL_TIVA", "GENERAL_TIVA", 3], vascularAccesses: [{ site: "ART_RADIAL" }, { size: "20" }] }))
      .toEqual({ techniques: ["GENERAL_TIVA"], airwayDevices: [], airwayTools: [], vascularAccesses: [{ site: "ART_RADIAL" }], postopVentilation: false })
  })

  it("ticks the consent sections the plan needs", () => {
    expect(consentTechniquesForPlan({ techniques: ["GENERAL_BALANCED"] })).toEqual(["general"])
    expect(consentTechniquesForPlan({ techniques: ["GENERAL_TIVA", "BLOCK_ESP"], vascularAccesses: [{ site: "CVK_IJV" }, { site: "ART_RADIAL" }], postopVentilation: true }))
      .toEqual(["general", "block", "combined", "cvc", "arterial", "ventilation"])
    expect(consentTechniquesForPlan({ techniques: ["SPINAL_SINGLE_LUMBAR", "SEDATION"] })).toEqual(["neuraxial", "sedation"])
    expect(consentTechniquesForPlan({ vascularAccesses: [{ site: "VEN_PERIPHERAL" }] })).toEqual([])
  })

  it("prints in one line, as the intraoperative record names things", () => {
    const plan = {
      techniques: ["GENERAL_TIVA", "EPIDURAL_LOW_THORACIC", "OTHER:Wound catheter"],
      airwayDevices: ["ORAL_ETT"], airwayTools: ["VIDEO_LARY"],
      vascularAccesses: [{ site: "ART_RADIAL" }, { site: "CVK_IJV" }, { site: "VEN_PERIPHERAL" }],
      postopVentilation: true,
    }
    const bg = plannedAnaesthesiaText(plan, "bg")
    expect(bg).toContain("ТИВА")
    expect(bg).toContain("Епидурална анестезия: ниска торакална; ")
    expect(bg).toContain("Wound catheter")
    expect(bg).toContain("Оротрахеална ЕТТ")
    expect(bg).toContain("Видеоларингоскопия")
    expect(bg).toContain("Артериален достъп (Arteria radialis)")
    expect(bg).toContain("Централен венозен катетър (Vena jugularis interna)")
    expect(bg).toContain("Периферен венозен достъп")
    expect(bg).toContain("изкуствена вентилация след операцията")
    expect(plannedAnaesthesiaText({}, "en")).toBe("")
  })
})
