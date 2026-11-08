import { describe, expect, it } from "vitest"
import { ControlPlaneClientError, intraopAutomationShape, type StatusSuccessionRow } from "./control-plane.js"
import { intraopLines, intraopUpdateFromForm, renderIntraopPage } from "./intraop-ui.js"
import { intraopFixture } from "./intraop.fixture.js"

const form = (overrides: Record<string, string> = {}) => ({
  enabled: "true", group_treatmentSuggestions: "true", group_timers: "true", vitalsEnabled: "true", minCases: "200",
  vial_20: "true", vial_250: "true", "auto_card:Hypotension": "true", "auto_timer:arrest": "true",
  tail_INFANT_hr_low: "1", tail_INFANT_hr_high: "0.5", tail_INFANT_sbp_low: "0.5", tail_INFANT_sbp_high: "0.5",
  tail_ADULT_hr_low: "0,25", tail_ADULT_hr_high: "5", tail_ADULT_sbp_low: "0.5", tail_ADULT_sbp_high: "2.5",
  ...overrides,
})

describe("SPS page (10.2.0)", () => {
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
    // Each line under its group, switched off where Status has switched it off.
    expect(html).toMatch(/name="auto_card:Hypotension" value="true" checked/)
    expect(html).not.toMatch(/name="auto_card:Hypertension" value="true" checked/)
    expect(html).toContain("1 / 2")
    expect(html).toContain("1 / 1")
    expect(html).toMatch(/name="vial_250" value="true" checked/)
    expect(html).not.toMatch(/name="vial_120" value="true" checked/)
    expect(renderIntraopPage(intraopFixture(), "bg")).toContain("Предложения за лечение")
  })

  it("shows how each line was received, and marks one that is mostly put away", () => {
    const html = renderIntraopPage(intraopFixture(), "en")
    expect(html).toContain('data-testid="intraop-acceptance"')
    expect(html).toContain("30 taken · 10 not now · 75 %")
    expect(html).toMatch(/data-noisy>1 taken · 14 not now · 7 % — rarely taken up/)
    expect(html).toContain("no answers")
    expect(renderIntraopPage({ ...intraopFixture(), acceptance: null }, "en")).not.toContain("intraop-acceptance")
    expect(intraopAutomationShape({ ...intraopFixture(), acceptance: { days: 90, cases: 1, byId: { x: { accepted: "1", dismissed: 0 } } } })).toBe(false)
  })

  it("shows what Likely now has learned, read-only, and gives a learned link that was never a starting one its own switch", () => {
    const row = (over: Partial<StatusSuccessionRow>): StatusSuccessionRow => ({
      id: "succession:Induction>Intubated", context: "general", family: "general", child: false, from: "Induction", to: "Intubated",
      fromBg: "Увод", toBg: "Интубация", count: 11, total: 20, share: 0.55, gapMinutes: 3, source: "starting", learnedCases: 12, minCases: 30, ...over,
    })
    const succession = [
      row({}),
      row({ id: "succession:Positioned>Incision", context: "neuraxial:child", family: "neuraxial", child: true, from: "Positioned", to: "Incision", fromBg: "Позициониране", toBg: "Инцизия", count: 40, total: 44, share: 0.91, gapMinutes: 9, source: "learned", learnedCases: 44 }),
      row({ id: "succession:Induction>OPA in", to: "OPA in", toBg: "Въздуховод", count: 5, total: 40, share: 0.13, source: "learned", learnedCases: 40 }),
    ]
    const base = intraopFixture()
    const view = { ...base, succession, groups: [...base.groups, { key: "reminders", labelEn: "Reminders", labelBg: "Напомняния", detailEn: "Reminders.", detailBg: "Напомняния." }] }
    expect(intraopAutomationShape(view)).toBe(true)
    expect(intraopAutomationShape({ ...view, succession: [{ ...succession[0], share: 2 }] })).toBe(false)
    expect(intraopAutomationShape({ ...view, succession: [{ ...succession[0], id: "card:Hypotension" }] })).toBe(false)

    const en = renderIntraopPage(view, "en")
    expect(en).toContain('data-testid="intraop-succession"')
    expect(en).toContain("Starting value · 12 / 30 cases so far")
    expect(en).toContain("Neuraxial · children")
    expect(en).toContain("Learned · 44 cases")
    expect(en).toContain("91 %")
    expect(renderIntraopPage(view, "bg")).toContain("Начална стойност · 12 / 30 случая досега")
    expect(renderIntraopPage({ ...intraopFixture(), succession: undefined }, "en")).toContain('data-testid="intraop-succession-missing"')

    // The learned link outside the catalogue can be switched off; left unticked, it joins the switched-off list.
    expect(intraopLines(view).map(item => item.id)).toContain("succession:Induction>OPA in")
    expect(en).toContain('name="auto_succession:Induction&gt;OPA in"')
    expect(intraopUpdateFromForm(view, form(), "x".repeat(10)).disabled).toContain("succession:Induction>OPA in")
    expect(intraopUpdateFromForm(view, form({ "auto_succession:Induction>OPA in": "true" }), "x".repeat(10)).disabled).not.toContain("succession:Induction>OPA in")
  })

  it("degrades when the API does not offer the page yet", () => {
    expect(renderIntraopPage(null, "en")).toContain("This API does not offer SPS yet.")
    expect(renderIntraopPage(undefined, "bg")).toContain("още не предлага")
  })

  it("reads the form: ticked boxes on, a comma as a decimal point, groups from the view", () => {
    const update = intraopUpdateFromForm(intraopFixture(), form(), "Agreed by the department")
    expect(update.enabled).toBe(true)
    expect(update.groups).toEqual({ treatmentSuggestions: true, reverseQuestions: false, timers: true })
    expect(update.dantroleneVialsMg).toEqual([20, 250])
    // Lines left unticked are the switched-off list: only Hypotension and the arrest timer are ticked.
    expect(update.disabled).toEqual(["card:Hypertension"])
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

  it("saves each monitor's reading interval, keeps the saved one when the form omits it, and refuses 0, over 120 or a fraction", () => {
    const view = intraopFixture()
    const reason = "x".repeat(10)
    const update = intraopUpdateFromForm(view, form({ due_bis: "20", due_tofMonitor: "5" }), reason)
    expect(update.monitoringDueMinutes).toMatchObject({ bis: 20, tofMonitor: 5, cvpMonitor: 15, etco2Monitor: 15, tempMonitor: 30 })
    for (const bad of ["0", "121", "7.5", ""]) {
      expect(() => intraopUpdateFromForm(view, form({ due_bis: bad }), reason)).toThrow(ControlPlaneClientError)
    }
  })
})
