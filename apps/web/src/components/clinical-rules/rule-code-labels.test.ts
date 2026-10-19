import { describe, expect, it } from "vitest"
import { ruleCodeLabel, ruleRoutesLabel } from "./rule-code-labels"
import { ruleLabel } from "@/app/(app)/clinical-rules/rule-display"

// The clinical-rules screens name what a code means, in the reader's language
// (2026-10-18); they printed AUTO, MANUAL_NO_PROFILE and INTRATHECAL as stored.
describe("clinical rule code labels", () => {
  it("names availability, routes and policy codes in either language", () => {
    expect(ruleCodeLabel("availability", "LOCAL", "en")).toBe("Local policy")
    expect(ruleCodeLabel("availability", "HIDDEN", "bg")).toBe("Скрит")
    expect(ruleCodeLabel("policyDisposition", "MANUAL_NO_PROFILE", "bg")).toBe("Ръчно, без профил")
    expect(ruleRoutesLabel(["IV", "INTRATHECAL"], "bg")).toBe("Интравенозно, Интратекално")
    expect(ruleCodeLabel("availability", "SOMETHING_NEW", "bg")).toBe("SOMETHING_NEW")
  })

  it("writes the rule summary without stored codes", () => {
    const detail = ruleLabel({
      kind: "ADULT_DRUG_PROFILE", labelEn: "Bupivacaine", labelBg: "Бупивакаин",
      profile: { unit: "mL", routes: ["INFILTRATION", "EPIDURAL"] },
    } as never, true).detail
    expect(detail).toBe("Медикамент · mL · Инфилтрация, Епидурално")
  })
})
