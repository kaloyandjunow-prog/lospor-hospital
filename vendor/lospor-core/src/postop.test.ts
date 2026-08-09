import { describe, expect, it } from "vitest"
import {
  ALDRETE_TOTAL_MAX,
  aldreteBand,
  aldreteTotal,
  isAldreteComplete,
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
    expect(aldreteBand(total!)).toBe("ready")
  })

  /**
   * A missing component used to count as zero, so one recorded subscore
   * produced a total as though the other four had been assessed and found
   * absent. Zero on every component is not a cautious default — it describes
   * someone unresponsive, apnoeic and shut down, and it reached the research
   * export as a fact about a patient nobody had assessed.
   */
  it("has no total until every component is assessed", () => {
    expect(aldreteTotal({ aldreteSpO2: 2 })).toBeNull()
    expect(aldreteTotal({})).toBeNull()
    expect(aldreteTotal({
      aldreteActivity: 2,
      aldreteRespiration: 2,
      aldreteCirculation: 2,
      aldreteConsciousness: 2,
      // spO2 left unassessed
    })).toBeNull()
    expect(isAldreteComplete({ aldreteSpO2: 2 })).toBe(false)
  })

  it("still distinguishes a genuine zero from an unassessed one", () => {
    // A patient really scored at zero throughout is a real, recordable finding.
    const assessed = aldreteTotal({
      aldreteActivity: 0,
      aldreteRespiration: 0,
      aldreteCirculation: 0,
      aldreteConsciousness: 0,
      aldreteSpO2: 0,
    })
    expect(assessed).toBe(0)
    expect(isAldreteComplete({
      aldreteActivity: 0,
      aldreteRespiration: 0,
      aldreteCirculation: 0,
      aldreteConsciousness: 0,
      aldreteSpO2: 0,
    })).toBe(true)
  })

  it("normalizes legacy handover codes before lookup", () => {
    expect(normalizeHandoverCodes(["obs_q15", "obs_freq"])).toEqual(["obs_freq"])
    expect(handoverLabel("obs_q15", "en")).toBe(handoverLabel("obs_freq", "en"))
    expect(handoverGroups("bg").flatMap(group => group.items).length).toBeGreaterThan(0)
  })
})
