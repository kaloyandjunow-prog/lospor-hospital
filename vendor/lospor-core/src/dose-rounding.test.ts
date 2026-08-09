import { describe, expect, it } from "vitest"
import {
  effectiveDoseIncrement,
  practicalDoseIncrement,
  roundToPracticalDose,
} from "./dose-rounding"

describe("practical dose rounding", () => {
  it("fixes the reported undosable paediatric doses", () => {
    // 2.5 mg/kg propofol on a 27 kg child = 67.5 mg; the slider-derived
    // roundTo of 1 gave 68 mg, which nobody can draw.
    expect(roundToPracticalDose(67.5, 1)).toBe(70)
    // 1.5 mg/kg suxamethonium on a 22 kg child = 33 mg.
    expect(roundToPracticalDose(33, 1)).toBe(35)
  })

  it("does not coarsen small neonatal doses", () => {
    // 2.5 mg/kg on a 3 kg neonate = 7.5 mg. Adult propofol rounds to 10 mg,
    // which here would be a +33% overdose.
    expect(roundToPracticalDose(7.5)).toBe(7.5)
    expect(roundToPracticalDose(7.4)).toBe(7.5)
    // Atropine 0.02 mg/kg on 10 kg = 0.2 mg stays exact.
    expect(roundToPracticalDose(0.2)).toBe(0.2)
  })

  it("scales the increment with the size of the dose", () => {
    expect(practicalDoseIncrement(0.3)).toBe(0.05)
    expect(practicalDoseIncrement(1.5)).toBe(0.1)
    expect(practicalDoseIncrement(7.5)).toBe(0.5)
    expect(practicalDoseIncrement(12)).toBe(1)
    expect(practicalDoseIncrement(67.5)).toBe(5)
    expect(practicalDoseIncrement(250)).toBe(10)
  })

  it("honours a deliberately coarser increment but never a finer one", () => {
    // A clinician may choose to draw a drug in 10s.
    expect(effectiveDoseIncrement(67.5, 10)).toBe(10)
    expect(roundToPracticalDose(67.5, 10)).toBe(70)
    // A stale UI-step increment must not reintroduce undosable precision.
    expect(effectiveDoseIncrement(67.5, 0.1)).toBe(5)
    expect(effectiveDoseIncrement(67.5, undefined)).toBe(5)
    expect(effectiveDoseIncrement(67.5, null)).toBe(5)
  })

  it("leaves adult profiles alone — their increments are already coarser", () => {
    // Adult propofol: 2 mg/kg IBW on 70 kg = 140 mg, roundTo 10.
    expect(roundToPracticalDose(140, 10)).toBe(140)
    expect(roundToPracticalDose(137, 10)).toBe(140)
    // Adult suxamethonium: 1 mg/kg on 70 kg = 70 mg, roundTo 5.
    expect(roundToPracticalDose(72, 5)).toBe(70)
  })

  it("respects floor and ceil rounding modes", () => {
    expect(roundToPracticalDose(67.5, 1, "floor_step")).toBe(65)
    expect(roundToPracticalDose(67.5, 1, "ceil_step")).toBe(70)
  })

  it("avoids floating point artefacts", () => {
    expect(roundToPracticalDose(7.45)).toBe(7.5)
    expect(String(roundToPracticalDose(0.15))).not.toContain("000000")
  })

  it("passes non-finite values through untouched", () => {
    expect(roundToPracticalDose(Number.NaN)).toBeNaN()
    expect(practicalDoseIncrement(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
