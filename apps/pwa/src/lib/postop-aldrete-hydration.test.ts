import { describe, expect, it } from "vitest"
import { aldreteFromServerPostop } from "./postop-aldrete-hydration"

describe("aldreteFromServerPostop", () => {
  /**
   * The regression this module exists to prevent. Zero is a real, recordable
   * Aldrete score (no movement, apnoeic, circulatory collapse) -- indistinct
   * from "not assessed" only if this function makes them indistinct.
   */
  it("leaves an unassessed component undefined, not 0", () => {
    expect(aldreteFromServerPostop({})).toEqual({
      aldreteActivity: undefined,
      aldreteRespiration: undefined,
      aldreteCirculation: undefined,
      aldreteConsciousness: undefined,
      aldreteSpO2: undefined,
    })
  })

  it("keeps a genuinely recorded zero as zero", () => {
    expect(aldreteFromServerPostop({ aldreteActivity: 0 }).aldreteActivity).toBe(0)
  })

  it("reads the canonical field over the legacy one when both are present", () => {
    expect(aldreteFromServerPostop({ aldreteActivity: 2, activityScore: 1 }).aldreteActivity).toBe(2)
  })

  it("falls back to the legacy column name for a record written before the rename", () => {
    expect(aldreteFromServerPostop({ activityScore: 1 }).aldreteActivity).toBe(1)
  })

  it("does not confuse a legacy zero with a missing legacy value", () => {
    expect(aldreteFromServerPostop({ activityScore: 0 }).aldreteActivity).toBe(0)
  })
})
