import { describe, expect, it } from "vitest"
import { resolveIntraopEventLabel, summaryLaneDomain } from "./clinical-display"

describe("summaryLaneDomain", () => {
  it("maps each lane kind the record draws to the option domain the record uses", () => {
    expect(summaryLaneDomain("agent")).toBe("option:INHALATIONAL_AGENT")
    expect(summaryLaneDomain("infusion")).toBe("option:INTRAOP_INFUSION")
    expect(summaryLaneDomain("fluid")).toBe("option:INTRAOP_FLUID")
    expect(summaryLaneDomain("position")).toBe("option:POSITION")
  })

  it("has no code domain of its own for gas -- gas text is formatted by formatClinicalGasMixLabel instead", () => {
    expect(summaryLaneDomain("gas")).toBeNull()
  })
})

describe("resolveIntraopEventLabel", () => {
  it("resolves a known event code through the option domain", () => {
    expect(resolveIntraopEventLabel("AIRWAY_INDUCTION", "bg")).toBe("Увод")
    expect(resolveIntraopEventLabel("AIRWAY_INDUCTION", "en")).toBe("Induction")
  })

  it("falls back to the complication label for an unmapped code, rather than the raw code", () => {
    const label = resolveIntraopEventLabel("some-legacy-free-text-event", "en")
    expect(label).not.toBe("")
    expect(typeof label).toBe("string")
  })
})
