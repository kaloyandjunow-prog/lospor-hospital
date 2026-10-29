import { describe, expect, it } from "vitest"
import { recoveryScoreFor, stewardBand, stewardTotal } from "./postop"
import { evaluatePostopReadiness, validatePostopPatch } from "./clinical-validation"
import { canonicalizePostopPatch } from "./case-payloads"

// A child's recovery is scored on Steward, not Aldrete (10.0.0): consciousness,
// airway and movement, 0-2 each, 0-6 in all.

const STEWARD = { stewardConsciousness: 2, stewardAirway: 1, stewardMovement: 2 }
const ALDRETE = { aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: 2 }

describe("the Steward score", () => {
  it("totals all three components, and has no total until all three are recorded", () => {
    expect(stewardTotal(STEWARD)).toBe(5)
    expect(stewardTotal({ stewardConsciousness: 0, stewardAirway: 0, stewardMovement: 0 })).toBe(0)
    expect(stewardTotal({ stewardConsciousness: 2, stewardAirway: 2 })).toBeNull()
  })

  it("is ready at 4 or more, and not ready below", () => {
    expect(stewardBand(6)).toBe("ready")
    expect(stewardBand(5)).toBe("ready")
    expect(stewardBand(4)).toBe("ready")
    expect(stewardBand(3)).toBe("not_ready")
    expect(stewardBand(0)).toBe("not_ready")
  })

  it("is the score for a paediatric case, and Aldrete for any other", () => {
    expect(recoveryScoreFor("PEDIATRIC")).toBe("STEWARD")
    expect(recoveryScoreFor("ADULT")).toBe("ALDRETE")
    expect(recoveryScoreFor(undefined)).toBe("ALDRETE")
  })
})
describe("finishing the recovery record", () => {
  it("asks a child for every Steward component, and not for Aldrete", () => {
    const codes = (postop: Record<string, unknown>) => evaluatePostopReadiness({ disposition: "WARD", ...postop }, "PEDIATRIC").issues.map(i => i.code)
    expect(codes(STEWARD)).toEqual([])
    expect(codes({ ...STEWARD, stewardMovement: null })).toEqual(["missing_steward"])
    expect(codes(ALDRETE)).toEqual(["missing_steward"])
  })

  it("still asks an adult for Aldrete, and Steward does not stand in for it", () => {
    const codes = (postop: Record<string, unknown>) => evaluatePostopReadiness({ disposition: "WARD", ...postop }, "ADULT").issues.map(i => i.code)
    expect(codes(ALDRETE)).toEqual([])
    expect(codes(STEWARD)).toEqual(["missing_aldrete"])
  })
})

describe("saving a Steward score", () => {
  it("refuses a component outside 0-2", () => {
    expect(validatePostopPatch({ stewardAirway: 3 }).valid).toBe(false)
    expect(validatePostopPatch({ stewardAirway: 2 }).valid).toBe(true)
  })

  it("stores the total with a complete set, and clears a stale one when the set is broken", () => {
    expect(canonicalizePostopPatch(STEWARD).stewardTotal).toBe(5)
    expect(canonicalizePostopPatch({ stewardAirway: null }).stewardTotal).toBeNull()
  })
})
