import { describe, expect, it } from "vitest"
import { getMedicationWarnings } from "./risk"

// Each warning carries its Bulgarian wording, so neither app prints the
// English one to a Bulgarian reader (2026-10-18).
describe("getMedicationWarnings", () => {
  it("gives every warning in both languages", () => {
    const warnings = getMedicationWarnings([
      { label: "Apixaban", atcCode: "B01AF02" }, { label: "Prednisolone", atcCode: "H02AB06" }, { label: "Bisoprolol", atcCode: "C07AB07" },
    ] as never)
    expect(warnings.map(w => w.key)).toEqual(["anticoagulant", "steroid", "betablocker"])
    for (const w of warnings) expect(w.labelBg).toMatch(/[Ѐ-ӿ]/)
  })
})
