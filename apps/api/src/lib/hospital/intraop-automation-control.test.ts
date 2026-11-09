import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/intraop-automation", () => ({
  readIntraopAutomation: async () => parseIntraopAutomation(undefined),
  suggestionAcceptance: async () => ({ days: 90, cases: 0, byId: {} }),
  successionOverviewForStatus: async () => [],
  saveIntraopAutomation: async (_db: unknown, value: unknown) => parseIntraopAutomation(value),
}))

describe("the intraoperative suggestion control view (10.2.0)", () => {
  it("hands Status the settings, Core's catalogue and the labels in both languages", async () => {
    const { intraopAutomationControlView } = await import("./intraop-automation-control")
    const view = await intraopAutomationControlView({} as never)
    expect(view.config.enabled).toBe(true)
    expect(view.groups.map(group => group.key)).toEqual(["treatmentSuggestions", "reverseQuestions", "readingQuestions", "labQuestions", "reminders", "timers"])
    for (const group of view.groups) expect([group.labelEn, group.labelBg, group.detailEn, group.detailBg].every(text => text.length > 0)).toBe(true)
    expect(view.automations.length).toBeGreaterThan(100)
    expect(view.automations.map(item => item.id)).toEqual(expect.arrayContaining(["vital:hypotension", "vital:tachycardia"]))
    expect(view.bands).toHaveLength(8)
    expect(view.signs.map(sign => sign.key)).toEqual(["hr", "sbp", "dbp", "map"])
    expect(view.tailSteps).toContain(view.defaultTail)
    expect(view.vialSizesMg).toEqual([20, 120, 250])
    expect(view.acceptance).toEqual({ days: 90, cases: 0, byId: {} })
    expect(view.succession).toEqual([])
  })

  it("saves what Status sends, clamped by Core, and audits switches and counts, never the reason", async () => {
    const { intraopAutomationAuditDetail, intraopAutomationUpdateSchema } = await import("./control-plane")
    const { assertSafeAuditDetail } = await import("@/lib/audit-evidence")
    expect(() => intraopAutomationUpdateSchema.parse({ enabled: true, reason: "short" })).toThrow()
    const { reason, ...config } = intraopAutomationUpdateSchema.parse({ enabled: true, groups: { reminders: false }, disabled: ["vital:hypotension"], reason: "Ten characters at least" })
    expect(reason).toBe("Ten characters at least")
    const detail = intraopAutomationAuditDetail(parseIntraopAutomation(config))
    expect(detail.groupsOff).toEqual(["reminders"])
    expect(detail.linesOff).toBe(1)
    expect(JSON.stringify(detail)).not.toContain("Ten characters")
    expect(() => assertSafeAuditDetail(detail)).not.toThrow()
  })
})
