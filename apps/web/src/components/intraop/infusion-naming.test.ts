import { describe, expect, it } from "vitest"
import { baseInfusionName } from "./infusion-naming"

/**
 * Failing to strip the stored concentration does not throw. The library lookup
 * misses, a default configuration is used, and the rate dialog offers the wrong
 * range for the drug actually running — which looks like a working screen.
 */
describe("baseInfusionName", () => {
  it("removes the concentration a local anaesthetic was stored with", () => {
    expect(baseInfusionName("Ropivacaine 0.2%", "0.2%")).toBe("Ropivacaine")
    expect(baseInfusionName("Bupivacaine 0.125%", "0.125%")).toBe("Bupivacaine")
  })

  it("leaves the name alone when nothing was stored", () => {
    expect(baseInfusionName("Propofol", undefined)).toBe("Propofol")
    expect(baseInfusionName("Propofol", null)).toBe("Propofol")
    expect(baseInfusionName("Propofol", "")).toBe("Propofol")
  })

  it("only strips a suffix that is actually this entry's concentration", () => {
    // The stored strength disagrees with the name; removing anything here would
    // invent a drug that was never charted.
    expect(baseInfusionName("Ropivacaine 0.2%", "0.5%")).toBe("Ropivacaine 0.2%")
  })

  it("leaves a name that is only a concentration alone", () => {
    // Stripping would leave nothing to look up at all.
    expect(baseInfusionName("0.9%", "0.9%")).toBe("0.9%")
  })

  it("keeps multi-word drug names whole", () => {
    expect(baseInfusionName("Lidocaine with adrenaline 1%", "1%"))
      .toBe("Lidocaine with adrenaline")
  })
})
