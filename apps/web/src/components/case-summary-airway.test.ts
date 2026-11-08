import { describe, expect, it } from "vitest"
import type { CaseDetailIntraop } from "@lospor/core/case-detail"
import { accessLabel, deviceLabel } from "./CaseSummary"

const intraop = (extra: Record<string, unknown>) => ({ timezone: "Europe/Sofia", ...extra }) as unknown as CaseDetailIntraop

describe("the summary and printed record after a reintubation and a failed line (10.2.0)", () => {
  it("lists both tubes, the first failed with its time in the case's zone", () => {
    const label = deviceLabel(intraop({
      airwayDevices: ["ORAL_ETT"], oralTubeSize: 8, oralCuffed: true,
      airwayDeviceEntries: [
        { id: "a", device: "ORAL_ETT", details: { oralTubeSize: 7.5, oralCuffed: true }, status: "failed", endedAt: "2026-11-02T08:42:00.000Z" },
        { id: "b", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, status: "in_use" },
      ],
    }), "en")
    expect(label).toMatch(/7\.5.*failed 10:42 \+ .*8/)
  })

  it("reads an older case from its old fields", () => {
    expect(deviceLabel(intraop({ airwayDevices: ["LMA"], lmaSize: 4 }), "en")).toContain("4")
  })

  it("marks a failed line, in Bulgarian too", () => {
    const lines = [{ site: "VEN_PERIPHERAL", siteLabel: "Peripheral IV", size: "18", sizeUnit: "G", failed: true, failedAt: "2026-11-02T08:42:00.000Z" }, { site: "VEN_PERIPHERAL", siteLabel: "Peripheral IV", size: "20", sizeUnit: "G" }]
    expect(accessLabel(intraop({}), lines, "en")).toMatch(/18G · failed 10:42 · .*20G$/)
    expect(accessLabel(intraop({}), lines, "bg")).toContain("неуспешен опит 10:42")
  })
})
