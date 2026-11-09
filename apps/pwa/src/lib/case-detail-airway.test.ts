import { describe, expect, it } from "vitest"
import { failedLineSuffix, formatAirway, type CaseData } from "./case-detail-summary"

const intraop = (extra: Record<string, unknown>) => ({ timezone: "Europe/Sofia", ...extra }) as unknown as NonNullable<CaseData["intraop"]>

describe("the phone summary after a reintubation and a failed line (10.2.0)", () => {
  it("lists both tubes, the first failed with its time in the case's zone", () => {
    const text = formatAirway(intraop({
      airwayDevices: ["ORAL_ETT"], oralTubeSize: 8, oralCuffed: true,
      airwayDeviceEntries: [
        { id: "a", device: "ORAL_ETT", details: { oralTubeSize: 7.5, oralCuffed: true }, status: "failed", endedAt: "2026-11-02T08:42:00.000Z" },
        { id: "b", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, status: "in_use" },
      ],
    }), "en")
    expect(text).toMatch(/7\.5.*failed 10:42 \+ .*8/)
    expect(formatAirway(intraop({ airwayDeviceEntries: [{ id: "a", device: "ORAL_ETT", details: {}, status: "replaced", endedAt: "2026-11-02T08:42:00.000Z" }, { id: "b", device: "LMA", details: { lmaSize: 4 }, status: "in_use" }] }), "bg")).toContain("подмяна 10:42")
  })

  it("reads an older case from its old fields", () => {
    expect(formatAirway(intraop({ airwayDevices: ["LMA"], tubeSize: 4 }), "en")).toContain("4")
  })

  it("marks a failed line with its time, and a working one not at all", () => {
    expect(failedLineSuffix({ failed: true, failedAt: "2026-11-02T08:42:00.000Z" }, intraop({}), "en")).toBe(" · failed 10:42")
    expect(failedLineSuffix({ failed: true, failedAt: "2026-11-02T08:42:00.000Z" }, intraop({}), "bg")).toBe(" · неуспешен опит 10:42")
    expect(failedLineSuffix({ failed: true }, intraop({}), "en")).toBe(" · failed")
    expect(failedLineSuffix({}, intraop({}), "en")).toBe("")
  })
})
