import { describe, expect, it } from "vitest"

import { formatGasSettingsLabel, gasEventDisplay } from "@/lib/intraop-gas-display"

describe("intraoperative gas display", () => {
  it("shows pure oxygen and mixed oxygen/air settings clearly", () => {
    expect(formatGasSettingsLabel({
      fgf: 10,
      carrierGas: null,
      fio2: 100,
    })).toBe("FGF 10 L/min \u00b7 O2 100%")

    expect(formatGasSettingsLabel({
      fgf: 1,
      carrierGas: "air",
      fio2: 50,
      fiAir: 50,
    })).toBe("FGF 1 L/min \u00b7 O2/Air 50/50")
  })

  it("turns gas log event types into clinical descriptions", () => {
    expect(gasEventDisplay({
      id: "gas-1",
      ts: "2026-07-24T08:00:00.000Z",
      type: "gas_start",
      fgf: 10,
      carrierGas: null,
      fio2: 100,
    })).toMatchObject({
      text: "FGF 10 L/min \u00b7 O2 100%",
      sub: "Gas settings started",
    })

    expect(gasEventDisplay({
      id: "gas-2",
      ts: "2026-07-24T08:05:00.000Z",
      type: "gas_change",
      fgf: 1,
      carrierGas: "air",
      fio2: 50,
      fiAir: 50,
    })).toMatchObject({
      text: "FGF 1 L/min \u00b7 O2/Air 50/50",
      sub: "Gas settings changed",
    })
  })
})
