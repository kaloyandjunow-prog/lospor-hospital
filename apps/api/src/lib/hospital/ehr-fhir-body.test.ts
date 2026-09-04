import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { splitBodyObservations } from "./ehr-fhir-body"

const obs = (code: string, value: unknown, extra: Record<string, unknown> = {}) => ({
  resourceType: "Observation",
  code: { coding: [{ system: "http://loinc.org", code }] },
  ...(value === undefined ? {} : { valueQuantity: value }),
  ...extra,
})

describe("splitting body measurements out of the lab stream", () => {
  it("takes height and weight out and leaves the labs alone", () => {
    // The whole reason this exists: sent through the lab reader these land in
    // labResults, where the catalogue has no entry for them, so every one is
    // refused as an unsupported test. That is why a FHIR site imported no
    // height and no weight at all.
    const { body, rest } = splitBodyObservations([
      obs("8302-2", { value: 175, code: "cm" }),
      obs("29463-7", { value: 82, code: "kg" }),
      obs("718-7", { value: 140, code: "g/L" }),
    ])
    expect(body).toMatchObject({ heightCm: 175, weightKg: 82 })
    expect(rest).toHaveLength(1)
  })

  it("converts metres, because 1.75 stored as centimetres is not an error anyone catches", () => {
    // It is a plausible-looking number that would silently halve a body surface
    // area, so the unit is read rather than assumed.
    const { body } = splitBodyObservations([obs("8302-2", { value: 1.75, code: "m" })])
    expect(body.heightCm).toBe(175)
  })

  it("converts imperial units where a server reports them", () => {
    expect(splitBodyObservations([obs("8302-2", { value: 70, code: "[in_i]" })]).body.heightCm).toBe(177.8)
    expect(splitBodyObservations([obs("29463-7", { value: 3200, code: "g" })]).body.weightKg).toBe(3.2)
  })

  it("drops a unit it does not recognise rather than guessing", () => {
    const { body } = splitBodyObservations([obs("8302-2", { value: 175, code: "furlong" })])
    expect(body.heightCm).toBeUndefined()
  })

  it("takes the newest reading when there are several", () => {
    // A patient weighed on admission and again this morning has two weights,
    // and the one to dose from is today's.
    const { body } = splitBodyObservations([
      obs("29463-7", { value: 90, code: "kg" }, { effectiveDateTime: "2026-08-01T08:00:00Z" }),
      obs("29463-7", { value: 84, code: "kg" }, { effectiveDateTime: "2026-09-03T08:00:00Z" }),
    ])
    expect(body.weightKg).toBe(84)
  })

  it("lets a dated reading beat an undated one whichever order they arrive in", () => {
    const dated = obs("29463-7", { value: 84, code: "kg" }, { effectiveDateTime: "2026-09-03T08:00:00Z" })
    const undated = obs("29463-7", { value: 90, code: "kg" })
    expect(splitBodyObservations([undated, dated]).body.weightKg).toBe(84)
    expect(splitBodyObservations([dated, undated]).body.weightKg).toBe(84)
  })
})

describe("blood group", () => {
  const group = (text: string) => ({
    resourceType: "Observation",
    code: { coding: [{ system: "http://loinc.org", code: "883-9" }] },
    valueCodeableConcept: { text },
  })

  it("reads the common ways a server writes it", () => {
    expect(splitBodyObservations([group("A positive")]).body).toMatchObject({ bloodType: "A", rhFactor: "POSITIVE" })
    expect(splitBodyObservations([group("O-")]).body).toMatchObject({ bloodType: "O", rhFactor: "NEGATIVE" })
    expect(splitBodyObservations([group("AB Rh(D) negative")]).body).toMatchObject({ bloodType: "AB", rhFactor: "NEGATIVE" })
  })

  it("does not read AB as an A", () => {
    // The ordering trap: matching A first turns every AB patient into an A,
    // which is the one blood-group error that matters most.
    expect(splitBodyObservations([group("AB positive")]).body.bloodType).toBe("AB")
  })

  it("takes the group without the rhesus when only one is stated", () => {
    const { body } = splitBodyObservations([group("B")])
    expect(body.bloodType).toBe("B")
    expect(body.rhFactor).toBeUndefined()
  })
})

describe("what is not an Observation", () => {
  it("passes other resources straight through", () => {
    const { rest } = splitBodyObservations([{ resourceType: "Condition" }])
    expect(rest).toHaveLength(1)
  })
})
