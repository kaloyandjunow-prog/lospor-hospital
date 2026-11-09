import { describe, expect, it } from "vitest"
import { bodyBandFor, isLowerLimbSite, tourniquetBody, tourniquetSiteLabel, TOURNIQUET_SITES } from "./tourniquet-body"

describe("the tourniquet body picker", () => {
  it("picks the body for the age band and, for an adult, the recorded sex", () => {
    expect(bodyBandFor({ ageDays: 200 })).toBe("infant")
    expect(bodyBandFor({ ageDays: 6 * 365 })).toBe("child")
    expect(bodyBandFor({ ageDays: 40 * 365, sex: "FEMALE" })).toBe("adultFemale")
    expect(bodyBandFor({ ageDays: 40 * 365, sex: "MALE" })).toBe("adultMale")
    expect(bodyBandFor({ ageDays: null })).toBe("adultMale")
  })

  it("gives every band the eight cuff spots, inside the drawing, the patient's right on the viewer's left", () => {
    for (const band of ["infant", "child", "adultMale", "adultFemale"] as const) {
      const body = tourniquetBody(band, 358, 480)
      expect(body.spots.map(spot => spot.site).sort()).toEqual([...TOURNIQUET_SITES].sort())
      for (const spot of body.spots) {
        expect(spot.x).toBeGreaterThan(0)
        expect(spot.x).toBeLessThan(358)
        expect(spot.y).toBeGreaterThan(0)
        expect(spot.y).toBeLessThan(480)
        expect(spot.w).toBeGreaterThan(5)
      }
      const right = body.spots.find(spot => spot.site === "RIGHT_THIGH")!
      const left = body.spots.find(spot => spot.site === "LEFT_THIGH")!
      expect(right.x).toBeLessThan(179)
      expect(left.x).toBeGreaterThan(179)
      const upper = body.spots.find(spot => spot.site === "LEFT_UPPER_ARM")!
      const fore = body.spots.find(spot => spot.site === "LEFT_FOREARM")!
      expect(fore.y).toBeGreaterThan(upper.y)
      expect(body.outlines.length).toBe(band === "adultFemale" ? 7 : 6)
      expect(body.outlines.every(path => path.startsWith("M") && path.endsWith("Z"))).toBe(true)
    }
  })

  it("names the sites in both languages and knows a lower limb", () => {
    expect(tourniquetSiteLabel("LEFT_THIGH", "en")).toBe("Left thigh")
    expect(tourniquetSiteLabel("RIGHT_UPPER_ARM", "bg")).toBe("Дясна мишница")
    expect(tourniquetSiteLabel("custom", "en")).toBe("custom")
    expect(isLowerLimbSite("RIGHT_CALF")).toBe(true)
    expect(isLowerLimbSite("RIGHT_FOREARM")).toBe(false)
  })
})
