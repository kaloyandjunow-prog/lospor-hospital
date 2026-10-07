import { describe, expect, it } from "vitest"

import { evaluateVitalInput, vitalFeedbackMessageKey } from "./intraop-vital-entry"

describe("web intraoperative vital entry", () => {
  it("blocks hard device-scale violations and accepts their boundaries", () => {
    expect(evaluateVitalInput("bis", "0").error).toBeNull()
    expect(evaluateVitalInput("bis", "100").error).toBeNull()
    expect(evaluateVitalInput("bis", "-1").error).toBe("below_min")
    expect(evaluateVitalInput("bis", "101").error).toBe("above_max")
    expect(evaluateVitalInput("bis", "50.5").error).toBe("not_integer")
    expect(evaluateVitalInput("tofRatio", "0").error).toBeNull()
    expect(evaluateVitalInput("tofRatio", "1").error).toBeNull()
    expect(evaluateVitalInput("tofRatio", "1.1").error).toBe("above_max")
    expect(evaluateVitalInput("spO2", "101").error).toBe("above_max")
  })

  it("returns non-blocking warnings for chartable clinical extremes", () => {
    expect(evaluateVitalInput("systolic", "301")).toMatchObject({ error: null, warning: "high" })
    expect(evaluateVitalInput("diastolic", "151")).toMatchObject({ error: null, warning: "high" })
    expect(evaluateVitalInput("heartRate", "39")).toMatchObject({ error: null, warning: "low" })
    expect(evaluateVitalInput("heartRate", "251")).toMatchObject({ error: null, warning: "high" })
    expect(evaluateVitalInput("temp", "27")).toMatchObject({ error: null, warning: "low" })
    expect(evaluateVitalInput("temp", "42")).toMatchObject({ error: null, warning: "high" })
  })

  // 9.14.3: SpO2, EtCO2 and low systolic pressure warn too, each with its own
  // text -- a SpO2 of 75 used to fall through to the temperature message.
  it("names the vital that is out of its band", () => {
    const key = (field: Parameters<typeof evaluateVitalInput>[0], raw: string) =>
      vitalFeedbackMessageKey(field, evaluateVitalInput(field, raw))
    expect(key("systolic", "59")).toBe("vitalWarningSysLow")
    expect(key("systolic", "60")).toBeNull()
    expect(key("spO2", "79")).toBe("vitalWarningSpo2Low")
    expect(key("spO2", "80")).toBeNull()
    expect(key("etco2", "24")).toBe("vitalWarningEtco2Low")
    expect(key("etco2", "61")).toBe("vitalWarningEtco2High")
    expect(key("etco2", "40")).toBeNull()
    expect(vitalFeedbackMessageKey("bis", { error: null, warning: "low" })).toBeNull()
  })

  it("converts a displayed CVP value before applying the shared contract", () => {
    expect(evaluateVitalInput("cvp", "13.6", "cmH2O").value).toBeCloseTo(10)
  })
})
