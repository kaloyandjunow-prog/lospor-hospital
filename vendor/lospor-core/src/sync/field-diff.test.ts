import { describe, expect, it } from "vitest"
import { createSectionSnapshotStore, diffChangedFields } from "./field-diff"

describe("diffChangedFields", () => {
  it("returns only the keys whose values changed", () => {
    expect(diffChangedFields(
      { asaScore: "II", weightKg: 80, smoking: false },
      { asaScore: "III", weightKg: 80, smoking: false },
    )).toEqual({ asaScore: "III" })
  })

  it("returns null when nothing changed", () => {
    expect(diffChangedFields(
      { asaScore: "II", labs: [{ k: "hb", v: 140 }] },
      { asaScore: "II", labs: [{ k: "hb", v: 140 }] },
    )).toBeNull()
  })

  it("compares arrays and objects by content, not identity", () => {
    expect(diffChangedFields(
      { diagnoses: ["J45"], vitals: { hr: 70 } },
      { diagnoses: ["J45"], vitals: { hr: 72 } },
    )).toEqual({ vitals: { hr: 72 } })
  })

  it("includes clears to null/empty/false but treats undefined as absent", () => {
    expect(diffChangedFields(
      { notes: "text", smoking: true, spO2: 98 },
      { notes: null, smoking: false, spO2: undefined },
    )).toEqual({ notes: null, smoking: false })
  })

  it("includes newly appearing keys", () => {
    expect(diffChangedFields({}, { asaScore: "I" })).toEqual({ asaScore: "I" })
  })

  it("a key that was set before but undefined now is NOT a change (matches today's wire format)", () => {
    expect(diffChangedFields({ spO2: 98 }, {})).toBeNull()
  })

  it("nested objects with different key insertion order compare EQUAL", () => {
    expect(diffChangedFields(
      { vitals: { hr: 70, spO2: 98 }, labs: [{ v: 140, k: "hb" }] },
      { vitals: { spO2: 98, hr: 70 }, labs: [{ k: "hb", v: 140 }] },
    )).toBeNull()
  })
})

describe("createSectionSnapshotStore", () => {
  it("returns the full payload before any confirm, then diffs, then null", () => {
    const store = createSectionSnapshotStore()
    const payload = { asaScore: "II", weightKg: 80 }

    expect(store.diff("c1", "preop", payload)).toEqual(payload)

    store.confirm("c1", "preop", payload)
    expect(store.diff("c1", "preop", { asaScore: "III", weightKg: 80 })).toEqual({ asaScore: "III" })
    expect(store.diff("c1", "preop", payload)).toBeNull()
  })

  it("keys snapshots by case and section independently", () => {
    const store = createSectionSnapshotStore()
    store.confirm("c1", "preop", { a: 1 })
    expect(store.diff("c1", "postop", { a: 2 })).toEqual({ a: 2 }) // no snapshot → full
    expect(store.diff("c2", "preop", { a: 2 })).toEqual({ a: 2 })
    expect(store.diff("c1", "preop", { a: 2 })).toEqual({ a: 2 }) // diff vs snapshot
  })

  it("merges a confirmed partial patch without forgetting other fields", () => {
    const store = createSectionSnapshotStore()
    store.confirm("c1", "intraop", { position: "SUPINE", technique: "GENERAL" })
    store.merge("c1", "intraop", { position: "PRONE" })

    expect(store.diff("c1", "intraop", { position: "PRONE", technique: "GENERAL" })).toBeNull()
    expect(store.diff("c1", "intraop", { position: "PRONE", technique: "REGIONAL" }))
      .toEqual({ technique: "REGIONAL" })
  })

  it("clear(caseId) drops only that case; clear() drops everything", () => {
    const store = createSectionSnapshotStore()
    store.confirm("c1", "preop", { a: 1 })
    store.confirm("c2", "preop", { b: 2 })

    store.clear("c1")
    expect(store.diff("c1", "preop", { a: 1 })).toEqual({ a: 1 }) // full again
    expect(store.diff("c2", "preop", { b: 2 })).toBeNull()

    store.clear()
    expect(store.diff("c2", "preop", { b: 2 })).toEqual({ b: 2 })
  })
})
