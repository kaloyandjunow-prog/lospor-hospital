import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { mapFhirObservations } from "./ehr-fhir-observations"
import { labCodeKey, LOINC_SYSTEM } from "@lospor/core/ehr-lab-codes"

const LOCAL = "http://hospital.bg/labs"

const bundle = (...resources: unknown[]) => ({
  resourceType: "Bundle",
  entry: resources.map(resource => ({ resource })),
})

const observation = (over: Record<string, unknown> = {}) => ({
  resourceType: "Observation",
  status: "final",
  code: { coding: [{ system: LOINC_SYSTEM, code: "718-7", display: "Hemoglobin" }] },
  effectiveDateTime: "2026-09-03T07:30:00+03:00",
  valueQuantity: { value: 8.9, code: "g/dL" },
  ...over,
})

describe("a retracted result is never offered", () => {
  // The one status that is not a stale result but a result the laboratory has
  // said should never have existed. It arrives looking exactly as trustworthy
  // as the rest.
  it("skips entered-in-error and cancelled, and counts them", () => {
    const result = mapFhirObservations(bundle(
      observation({ status: "entered-in-error" }),
      observation({ status: "cancelled" }),
      observation(),
    ))

    expect(result.values).toHaveLength(1)
    expect(result.skipped.retracted).toBe(2)
  })

  it("refuses a status outside FHIR's own list rather than assuming final", () => {
    // The value set is closed, so anything else means we are reading something
    // we do not understand.
    const result = mapFhirObservations(bundle(observation({ status: "who-knows" })))

    expect(result.values).toEqual([])
    expect(result.skipped.unreadable).toBe(1)
  })

  it("takes a preliminary result, and says that it is one", () => {
    // The number the anaesthetist has at 07:30. Withholding it until the
    // laboratory finalises helps nobody; a later corrected value arrives as a
    // new result rather than overwriting it.
    const [value] = mapFhirObservations(bundle(observation({ status: "preliminary" }))).values

    expect(value).toMatchObject({ test: "Haemoglobin (Hb)", preliminary: true })
  })

  it("takes amended and corrected without marking them", () => {
    const result = mapFhirObservations(bundle(
      observation({ status: "amended" }),
      observation({ status: "corrected" }),
    ))

    expect(result.values).toHaveLength(2)
    expect(result.values.every(value => value.preliminary === undefined)).toBe(true)
  })
})

describe("a blood gas arrives as one resource with components", () => {
  // The shape that would otherwise import nothing at all, silently: a reader
  // looking only at the top-level value finds a panel header with no value.
  const gas = {
    resourceType: "Observation",
    status: "final",
    code: { coding: [{ system: LOCAL, code: "ABG" }], text: "Кръвно-газов анализ" },
    effectiveDateTime: "2026-09-03T07:30:00Z",
    component: [
      { code: { coding: [{ system: LOINC_SYSTEM, code: "2744-1" }] }, valueQuantity: { value: 7.35, code: "1" } },
      { code: { coding: [{ system: LOINC_SYSTEM, code: "2019-8" }] }, valueQuantity: { value: 5.3, code: "kPa" } },
      { code: { coding: [{ system: LOINC_SYSTEM, code: "2703-7" }] }, valueQuantity: { value: 12.6, code: "kPa" } },
    ],
  }

  it("reads every component as a result in its own right", () => {
    const { values } = mapFhirObservations(bundle(gas))

    expect(values).toHaveLength(3)
    expect(values.map(value => value.test)).toEqual(["pH", "PaCO₂", "PaO₂"])
  })

  it("gives each component the specimen's draw time, not its own absence of one", () => {
    // Otherwise a single blood gas scatters across the timeline as undated
    // fragments.
    const { values } = mapFhirObservations(bundle(gas))

    expect(values.every(value => value.takenAt === "2026-09-03T07:30:00.000Z")).toBe(true)
  })

  it("does not invent a result for a panel header that carries no value", () => {
    expect(mapFhirObservations(bundle(gas)).values.some(value => value.test === "ABG")).toBe(false)
  })

  it("still reads a parent that has a value of its own alongside components", () => {
    const { values } = mapFhirObservations(bundle({
      ...gas,
      code: { coding: [{ system: LOINC_SYSTEM, code: "718-7" }] },
      valueQuantity: { value: 120, code: "g/L" },
    }))

    expect(values).toHaveLength(4)
    expect(values[0]).toMatchObject({ test: "Haemoglobin (Hb)", value: "120" })
  })
})

describe("a result that is not a number is still a result", () => {
  const read = (over: Record<string, unknown>) =>
    mapFhirObservations(bundle(observation({ valueQuantity: undefined, ...over }))).values[0]

  it("keeps a coded finding", () => {
    expect(read({ valueCodeableConcept: { text: "Positive" } })).toMatchObject({ value: "Positive" })
  })

  it("keeps free text, as microbiology reports it", () => {
    expect(read({ valueString: "No growth after 48 hours" }))
      .toMatchObject({ value: "No growth after 48 hours" })
  })

  it("keeps the reason a value is absent, which is itself a finding", () => {
    // "Specimen haemolysed" is something an anaesthetist acts on, and is not
    // the same as the result being silently missing.
    expect(read({ dataAbsentReason: { text: "Specimen haemolysed" } }))
      .toMatchObject({ value: "Specimen haemolysed" })
  })

  it("keeps a comparator, because <0.01 and 0.01 are different results", () => {
    expect(read({ valueQuantity: { value: 0.01, comparator: "<", code: "ug/L" } }))
      .toMatchObject({ value: "<0.01", unit: "ug/L" })
  })

  it("keeps a titre and a range", () => {
    expect(read({ valueRatio: { numerator: { value: 1 }, denominator: { value: 160 } } }))
      .toMatchObject({ value: "1:160" })
    expect(read({ valueRange: { low: { value: 10 }, high: { value: 20 } } }))
      .toMatchObject({ value: "10–20" })
  })

  it("counts a resource with no value at all rather than inventing one", () => {
    const result = mapFhirObservations(bundle(observation({ valueQuantity: undefined })))

    expect(result.values).toEqual([])
    expect(result.skipped.noValue).toBe(1)
  })
})

describe("what the site has told us its codes mean", () => {
  it("prefers the site's own mapping over LOINC", () => {
    const siteMap = { [labCodeKey(LOCAL, "ХГБ")]: "Haemoglobin (Hb)" }
    const [value] = mapFhirObservations(
      bundle(observation({ code: { coding: [{ system: LOCAL, code: "ХГБ" }], text: "Специфичен тест 7" } })),
      { siteMap },
    ).values

    expect(value).toMatchObject({ test: "Haemoglobin (Hb)", reportedTest: "Специфичен тест 7" })
  })

  it("lists what it could not place, most frequent first", () => {
    const unknown = (code: string) => observation({ code: { coding: [{ system: LOCAL, code }] } })
    const result = mapFhirObservations(bundle(unknown("XX1"), unknown("XX1"), unknown("XX2")))

    expect(result.unmapped).toEqual([
      { system: LOCAL, code: "XX1", display: "", count: 2 },
      { system: LOCAL, code: "XX2", display: "", count: 1 },
    ])
  })

  it("imports an unplaceable result under the hospital's own name rather than dropping it", () => {
    const [value] = mapFhirObservations(
      bundle(observation({ code: { coding: [{ system: LOCAL, code: "ХГБ" }], text: "Специфичен тест 7" } })),
    ).values

    expect(value.test).toBe("Специфичен тест 7")
  })
})

describe("the time a result belongs to", () => {
  it("prefers when the specimen was taken over when it was released", () => {
    // For a send-out assay `issued` can be days after the draw. Dating by it is
    // the same error as dating by when the message arrived.
    const [value] = mapFhirObservations(bundle(observation({
      effectiveDateTime: "2026-09-01T06:00:00Z",
      issued: "2026-09-05T14:00:00Z",
    }))).values

    expect(value.takenAt).toBe("2026-09-01T06:00:00.000Z")
  })

  it("reads a period's start, and an instant", () => {
    expect(mapFhirObservations(bundle(observation({
      effectiveDateTime: undefined, effectivePeriod: { start: "2026-09-01T06:00:00Z" },
    }))).values[0].takenAt).toBe("2026-09-01T06:00:00.000Z")
    expect(mapFhirObservations(bundle(observation({
      effectiveDateTime: undefined, effectiveInstant: "2026-09-01T06:00:00Z",
    }))).values[0].takenAt).toBe("2026-09-01T06:00:00.000Z")
  })

  it("says the time is unknown rather than guessing one", () => {
    expect(mapFhirObservations(bundle(observation({ effectiveDateTime: undefined }))).values[0].takenAt)
      .toBeNull()
  })
})

describe("what it will read", () => {
  it("takes a Bundle, a bare list, or a single resource", () => {
    expect(mapFhirObservations(bundle(observation())).values).toHaveLength(1)
    expect(mapFhirObservations([observation()]).values).toHaveLength(1)
    expect(mapFhirObservations(observation()).values).toHaveLength(1)
  })

  it("ignores anything that is not an Observation", () => {
    const result = mapFhirObservations(bundle(
      { resourceType: "Patient", id: "1" },
      { resourceType: "OperationOutcome" },
      observation(),
    ))

    expect(result.values).toHaveLength(1)
  })

  it("survives nonsense without throwing", () => {
    for (const payload of [null, undefined, 42, "", {}, { entry: [null] }]) {
      expect(mapFhirObservations(payload).values).toEqual([])
    }
  })
})
