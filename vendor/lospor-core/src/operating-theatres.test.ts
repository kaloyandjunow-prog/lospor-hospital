import { describe, expect, it } from "vitest"
import {
  caseTheatreView,
  intraopHasStarted,
  normalizeTheatreName,
  OPERATING_THEATRES_OFF,
  parseOperatingTheatreConfig,
  theatreChangeAllowed,
} from "./operating-theatres"

describe("operating theatres (10.0.0)", () => {
  it("can change a theatre until intraop starts", () => {
    expect(theatreChangeAllowed({ status: "DRAFT", intraop: null })).toBe(true)
    expect(theatreChangeAllowed({ status: "IN_PROGRESS", intraop: { startedAt: null } })).toBe(true)
    expect(theatreChangeAllowed({ status: "IN_PROGRESS", intraop: { startedAt: "2026-10-27T08:00:00Z" } })).toBe(false)
    // A legacy record has only the wall clock.
    expect(intraopHasStarted({ startTime: "2000-01-01T08:00:00Z" })).toBe(true)
    expect(theatreChangeAllowed({ status: "COMPLETE", intraop: null })).toBe(false)
  })

  it("shows the name a started case kept, else the theatre's name now", () => {
    expect(caseTheatreView({ status: "COMPLETE", operatingTheatreId: "t1", operatingTheatreName: "Зала 3", operatingTheatre: { name: "Зала 3А" } }))
      .toEqual({ id: "t1", name: "Зала 3", changeable: false })
    expect(caseTheatreView({ status: "DRAFT", operatingTheatreId: "t1", operatingTheatre: { name: "Зала 3А" } }))
      .toEqual({ id: "t1", name: "Зала 3А", changeable: true })
    expect(caseTheatreView({ status: "DRAFT" })).toEqual({ id: null, name: null, changeable: true })
  })

  it("keeps a name tidy and bounded", () => {
    expect(normalizeTheatreName("  Зала   3 ")).toBe("Зала 3")
    expect(normalizeTheatreName("   ")).toBeNull()
    expect(normalizeTheatreName("x".repeat(61))).toBeNull()
    expect(normalizeTheatreName(3)).toBeNull()
  })

  it("reads anything but a well-formed configuration as off", () => {
    expect(parseOperatingTheatreConfig({ enabled: true, theatres: [{ id: "a", name: "Зала 1" }, { id: 2 }] }))
      .toEqual({ enabled: true, theatres: [{ id: "a", name: "Зала 1" }] })
    expect(parseOperatingTheatreConfig({ enabled: false, theatres: [{ id: "a", name: "Зала 1" }] })).toBe(OPERATING_THEATRES_OFF)
    expect(parseOperatingTheatreConfig(null)).toBe(OPERATING_THEATRES_OFF)
  })
})
