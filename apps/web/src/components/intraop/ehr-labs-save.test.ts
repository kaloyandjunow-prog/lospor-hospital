import { describe, expect, it, vi } from "vitest"

import { ehrLabsWriter, sectionSaveKept } from "./ehr-labs-save"

const lab = { test: "Haemoglobin (Hb)", value: "118", unit: "g/L", takenAt: "2026-09-27T10:30:00.000Z" }

describe("what the intraoperative lab import writes", () => {
  it("puts the list in the form and saves the whole section with it at once", async () => {
    const setRows = vi.fn()
    const onSaveNow = vi.fn(async () => true)
    const write = ehrLabsWriter(setRows, () => ({ notes: "kept", labResults: [] }), onSaveNow)

    expect(await write([lab])).toBe(true)
    expect(setRows).toHaveBeenCalledWith([lab])
    expect(onSaveNow).toHaveBeenCalledWith({ notes: "kept", labResults: [lab] })
  })

  it("reports what the save reports, and nothing landed with nothing to save through", async () => {
    expect(await ehrLabsWriter(vi.fn(), () => ({}), async () => false)([lab])).toBe(false)
    expect(await ehrLabsWriter(vi.fn(), () => ({}), undefined)([lab])).toBe(false)
    // The page hands over the section save as it is; the writer reads its outcome.
    expect(await ehrLabsWriter(vi.fn(), () => ({}), async () => "queued")([lab])).toBe(true)
    expect(await ehrLabsWriter(vi.fn(), () => ({}), async () => "blocked")([lab])).toBe(false)
  })

  it("counts a save as kept when it reached the server or is queued, not when refused or failed", () => {
    expect(sectionSaveKept(true)).toBe(true)
    expect(sectionSaveKept("queued")).toBe(true)
    expect(sectionSaveKept("blocked")).toBe(false)
    expect(sectionSaveKept(false)).toBe(false)
    expect(sectionSaveKept(undefined)).toBe(false)
  })
})
