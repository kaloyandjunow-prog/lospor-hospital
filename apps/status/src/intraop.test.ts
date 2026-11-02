import { describe, expect, it } from "vitest"
import { ControlPlaneClientError, intraopAutomationShape } from "./control-plane.js"
import { intraopUpdateFromForm, renderIntraopPage } from "./intraop-ui.js"
import { intraopFixture } from "./intraop.fixture.js"

const form = (overrides: Record<string, string> = {}) => ({
  enabled: "true", group_treatmentSuggestions: "true", group_timers: "true", vitalsEnabled: "true", minCases: "200",
  vial_20: "true", vial_250: "true",
  tail_INFANT_hr_low: "1", tail_INFANT_hr_high: "0.5", tail_INFANT_sbp_low: "0.5", tail_INFANT_sbp_high: "0.5",
  tail_ADULT_hr_low: "0,25", tail_ADULT_hr_high: "5", tail_ADULT_sbp_low: "0.5", tail_ADULT_sbp_high: "2.5",
  ...overrides,
})

describe("intraoperative suggestions page (10.2.0)", () => {
  it("accepts the view the API sends", () => {
    expect(intraopAutomationShape(intraopFixture())).toBe(true)
    expect(intraopAutomationShape({ config: {} })).toBe(false)
    expect(intraopAutomationShape(null)).toBe(false)
  })

  it("shows the master switch, each group, the limits by band and the vial sizes", () => {
    const html = renderIntraopPage(intraopFixture(), "en")
    expect(html).toContain('data-testid="intraop-form"')
    expect(html).toMatch(/name="enabled" value="true" checked/)
    expect(html).toMatch(/name="group_treatmentSuggestions" value="true" checked/)
    expect(html).not.toMatch(/name="group_reverseQuestions" value="true" checked/)
    expect(html).toContain('name="tail_ADULT_hr_low"')
    expect(html).toMatch(/name="vial_250" value="true" checked/)
    expect(html).not.toMatch(/name="vial_120" value="true" checked/)
    expect(renderIntraopPage(intraopFixture(), "bg")).toContain("Предложения за лечение")
  })

  it("degrades when the API does not offer the page yet", () => {
    expect(renderIntraopPage(null, "en")).toContain("This API does not offer the intraoperative suggestions yet.")
    expect(renderIntraopPage(undefined, "bg")).toContain("още не предлага")
  })

  it("reads the form: ticked boxes on, a comma as a decimal point, groups from the view", () => {
    const update = intraopUpdateFromForm(intraopFixture(), form(), "Agreed by the department")
    expect(update.enabled).toBe(true)
    expect(update.groups).toEqual({ treatmentSuggestions: true, reverseQuestions: false, timers: true })
    expect(update.dantroleneVialsMg).toEqual([20, 250])
    expect(update.vitalQuestions.minCases).toBe(200)
    expect(update.vitalQuestions.tails.ADULT.hr).toEqual({ low: 0.25, high: 5 })
    expect(update.reason).toBe("Agreed by the department")
  })

  it("refuses a share the slider does not offer, a case count out of range, and no vial size", () => {
    const view = intraopFixture()
    const reason = "x".repeat(10)
    expect(() => intraopUpdateFromForm(view, form({ tail_ADULT_hr_low: "3" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => intraopUpdateFromForm(view, form({ minCases: "19" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => intraopUpdateFromForm(view, form({ minCases: "10001" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => intraopUpdateFromForm(view, form({ minCases: "" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => intraopUpdateFromForm(view, form({ vial_20: "", vial_250: "" }), reason)).toThrow(ControlPlaneClientError)
    expect(intraopUpdateFromForm(view, form({ vial_20: "", vial_120: "true" }), reason).dantroleneVialsMg).toEqual([120, 250])
  })
})
