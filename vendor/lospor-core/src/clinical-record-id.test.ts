import { describe, expect, it } from "vitest"
import { clinicalRecordId } from "./clinical-record-id"

describe("clinicalRecordId", () => {
  it("keeps the record time and produces distinct ids for concurrent records", () => {
    const first = clinicalRecordId("airway", "2026-11-05T10:00:00.000Z")
    const second = clinicalRecordId("airway", "2026-11-05T10:00:00.000Z")
    expect(first).toMatch(/^airway-[a-z0-9]+-[a-z0-9]+-/)
    expect(second).not.toBe(first)
  })
})
