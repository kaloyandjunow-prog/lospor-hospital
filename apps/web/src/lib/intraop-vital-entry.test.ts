import { describe, expect, it } from "vitest"

import { evaluateVitalInput } from "./intraop-vital-entry"

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

  it("converts a displayed CVP value before applying the shared contract", () => {
    expect(evaluateVitalInput("cvp", "13.6", "cmH2O").value).toBeCloseTo(10)
  })
})
