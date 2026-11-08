import { describe, expect, it } from "vitest"
import {
  FRESH_GAS_FLOW,
  freshGasFlowStep,
  JET_VENTILATION,
  parseJetPressure,
  parseJetRate,
  parseTypedFreshGasFlow,
  snapFreshGasFlow,
  stepFreshGasFlow,
} from "./gas-ranges"

describe("fresh gas flow range", () => {
  it("slides 0-20 L/min, typed to 100", () => {
    expect(FRESH_GAS_FLOW).toMatchObject({ min: 0, sliderMax: 20, typedMax: 100 })
  })

  it("steps 0.1 below 5 L/min and 0.5 from 5", () => {
    expect(freshGasFlowStep(0.5)).toBe(0.1)
    expect(freshGasFlowStep(4.9)).toBe(0.1)
    expect(freshGasFlowStep(5)).toBe(0.5)
    expect(freshGasFlowStep(15)).toBe(0.5)
  })

  it("snaps a slider position to its step and keeps it on the slider", () => {
    expect(snapFreshGasFlow(0.74)).toBe(0.7)
    expect(snapFreshGasFlow(4.96)).toBe(5)
    expect(snapFreshGasFlow(7.3)).toBe(7.5)
    expect(snapFreshGasFlow(25)).toBe(20)
    expect(snapFreshGasFlow(-1)).toBe(0)
    expect(snapFreshGasFlow(Number.NaN)).toBe(0)
  })

  it("steps up and down across the 5 L/min boundary without skipping", () => {
    expect(stepFreshGasFlow(4.9, 1)).toBe(5)
    expect(stepFreshGasFlow(5, 1)).toBe(5.5)
    expect(stepFreshGasFlow(5, -1)).toBe(4.9)
    expect(stepFreshGasFlow(5.5, -1)).toBe(5)
    expect(stepFreshGasFlow(0, -1)).toBe(0)
    expect(stepFreshGasFlow(20, 1)).toBe(20)
    // A typed high flow is not pulled back to the slider by stepping down.
    expect(stepFreshGasFlow(60, -1)).toBe(59.5)
  })

  it("accepts a typed flow up to 100 L/min, with a decimal comma", () => {
    expect(parseTypedFreshGasFlow("60")).toBe(60)
    expect(parseTypedFreshGasFlow("0,5")).toBe(0.5)
    expect(parseTypedFreshGasFlow(100)).toBe(100)
    expect(parseTypedFreshGasFlow("101")).toBeNull()
    expect(parseTypedFreshGasFlow("-1")).toBeNull()
    expect(parseTypedFreshGasFlow("abc")).toBeNull()
  })
})

describe("jet ventilation range", () => {
  it("slides pressure 0-4 bar in 0.1 steps, typed to 6", () => {
    expect(JET_VENTILATION.pressure).toMatchObject({ min: 0, sliderMax: 4, step: 0.1, typedMax: 6, unit: "bar" })
    expect(parseJetPressure("2,5")).toBe(2.5)
    expect(parseJetPressure(6)).toBe(6)
    expect(parseJetPressure(6.1)).toBeNull()
  })

  it("offers manual and high-frequency rates, typed to 600 per minute", () => {
    expect(JET_VENTILATION.rate.quick).toEqual([15, 100, 150, 300])
    expect(parseJetRate("150")).toBe(150)
    expect(parseJetRate(600)).toBe(600)
    expect(parseJetRate(601)).toBeNull()
    expect(parseJetRate("12.5")).toBeNull()
    expect(parseJetRate(0)).toBeNull()
  })

  it("keeps FiO2 within 21-100%", () => {
    expect(JET_VENTILATION.fio2).toMatchObject({ min: 21, max: 100 })
  })
})
