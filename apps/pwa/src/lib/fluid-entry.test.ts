import { describe, expect, it } from "vitest"

import {
  calculatedFluidVolumeMl,
  fluidEntryModeOf,
  fluidEntryValueLabel,
} from "./fluid-entry"
import type { ActiveFluid } from "./intraop-log-event"

describe("mobile fluid entry helpers", () => {
  it("integrates a running rate against exact timestamps and rate changes", () => {
    const fluid: ActiveFluid = {
      fluidId: "rate-1",
      name: "Ringer",
      volume: "",
      color: "#06b6d4",
      fluidEntryMode: "RATE",
      startTs: "2026-08-02T08:00:00.000Z",
      initialRate: "100",
      rate: "200",
      unit: "mL/h",
      rateChanges: [{ ts: "2026-08-02T08:30:00.000Z", rate: "200", unit: "mL/h" }],
    }

    expect(calculatedFluidVolumeMl(fluid, "2026-08-02T09:00:00.000Z")).toBe(150)
    expect(fluidEntryValueLabel(fluid)).toBe("200 mL/h")
  })

  it("uses the clinician's actual amount instead of the planned bag", () => {
    const fluid: ActiveFluid = {
      fluidId: "bag-1",
      name: "Plasma-Lyte",
      volume: "500",
      bagVolumeMl: 500,
      administeredVolumeMl: 175,
      color: "#06b6d4",
      fluidEntryMode: "VOLUME",
      startTs: "2026-08-02T08:00:00.000Z",
    }

    expect(calculatedFluidVolumeMl(fluid)).toBe(175)
  })

  it("treats legacy entries without an explicit mode as volume entries", () => {
    const legacy = {
      fluidId: "legacy",
      name: "Saline",
      volume: "250",
      color: "#06b6d4",
    } as ActiveFluid

    expect(fluidEntryModeOf(legacy)).toBe("VOLUME")
    expect(calculatedFluidVolumeMl(legacy)).toBe(250)
  })
})
