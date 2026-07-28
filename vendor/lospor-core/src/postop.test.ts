import { describe, expect, it } from "vitest"
import {
  ALDRETE_TOTAL_MAX,
  aldreteBand,
  aldreteTotal,
  handoverGroups,
  handoverLabel,
  normalizeHandoverCodes,
} from "./postop"

describe("postoperative domain", () => {
  it("calculates the canonical Aldrete total and readiness band", () => {
    const total = aldreteTotal({
      aldreteActivity: 2,
      aldreteRespiration: 2,
      aldreteCirculation: 2,
      aldreteConsciousness: 2,
      aldreteSpO2: 1,
    })
    expect(total).toBe(9)
    expect(ALDRETE_TOTAL_MAX).toBe(10)
    expect(aldreteBand(6)).toBe("not_ready")
    expect(aldreteBand(8)).toBe("observe")
    expect(aldreteBand(total)).toBe("ready")
  })

  it("normalizes legacy handover codes before lookup", () => {
    expect(normalizeHandoverCodes(["obs_q15", "obs_freq"])).toEqual(["obs_freq"])
    expect(handoverLabel("obs_q15", "en")).toBe(handoverLabel("obs_freq", "en"))
    expect(handoverGroups("bg").flatMap(group => group.items).length).toBeGreaterThan(0)
  })
})
