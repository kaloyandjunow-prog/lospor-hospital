import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { splitVitalObservations } from "./ehr-fhir-vitals"

describe("FHIR PREOP vital observations", () => {
  it("maps the six standard LOINC vitals and keeps ordinary labs", () => {
    const result = splitVitalObservations([
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: 120, code: "mm[Hg]" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: 80, code: "mm[Hg]" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] }, valueQuantity: { value: 72, code: "/min" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "9279-1" }] }, valueQuantity: { value: 16, code: "/min" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "59408-5" }] }, valueQuantity: { value: 98, code: "%" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8310-5" }] }, valueQuantity: { value: 37, code: "Cel" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "718-7" }] }, valueQuantity: { value: 140, code: "g/L" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
    ])

    expect(result.vitals).toEqual({
      bpSystolic: 120,
      bpDiastolic: 80,
      heartRate: 72,
      respiratoryRate: 16,
      spO2: 98,
      temperature: 37,
    })
    expect(result.rest).toHaveLength(1)
    expect(result.unmapped).toEqual([])
  })

  it("maps blood-pressure components and selects the newest reading", () => {
    const result = splitVitalObservations([
      {
        resourceType: "Observation",
        status: "final",
        category: [{ coding: [{ code: "vital-signs" }] }],
        code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] },
        component: [
          { code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: 118, code: "mm[Hg]" } },
          { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: 76, code: "mm[Hg]" } },
        ],
        effectiveDateTime: "2026-09-21T10:00:00Z",
      },
      { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: 124, code: "mm[Hg]" }, effectiveDateTime: "2026-09-22T10:00:00Z" },
    ])

    expect(result.vitals).toMatchObject({ bpSystolic: 124, bpDiastolic: 76 })
    expect(result.rest).toEqual([])
  })

  it("queues an unknown local vital code and resolves it after Status assigns it", () => {
    const observation = {
      resourceType: "Observation",
      status: "final",
      category: [{ coding: [{ code: "vital-signs" }] }],
      code: { coding: [{ system: "urn:hospital:hapi", code: "TA-SYS", display: "SYS" }] },
      valueQuantity: { value: 125, code: "mm[Hg]" },
    }
    const pending = splitVitalObservations([observation])
    expect(pending.unmapped).toMatchObject([{ system: "urn:hospital:hapi", code: "TA-SYS", count: 1 }])
    expect(pending.rest).toEqual([])

    const assigned = splitVitalObservations([observation], {
      "urn:hospital:hapi|TA-SYS": "bpSystolic",
    })
    expect(assigned.vitals).toEqual({ bpSystolic: 125 })
    expect(assigned.unmapped).toEqual([])
  })
})
