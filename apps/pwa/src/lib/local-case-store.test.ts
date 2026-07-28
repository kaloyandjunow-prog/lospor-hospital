import { describe, expect, it, beforeEach } from "vitest"
import {
  makeLocalCaseId, saveLocalCaseDraft, loadLocalCaseDraft,
  deleteLocalCaseDraft, getAllLocalCaseDrafts, clearAllLocalCaseDrafts,
} from "./local-case-store"

// Offline drafts used to live in SecureStore, which is backed by the Android
// keystore and only reliably holds ~2 KB per item. A filled-in preoperative
// draft is larger than that, so saving failed on Android — correctly reported
// as `false`, but the practical result was that offline drafts did not work at
// all on that platform. They are now files, which have no such ceiling.
describe("local case drafts", () => {
  beforeEach(async () => { await clearAllLocalCaseDrafts() })

  it("round-trips a draft", async () => {
    const id = makeLocalCaseId()
    expect(await saveLocalCaseDraft(id, { ageYears: 64, sex: "MALE" })).toBe(true)

    const back = await loadLocalCaseDraft(id)
    expect(back?.localId).toBe(id)
    expect(back?.formValues).toEqual({ ageYears: 64, sex: "MALE" })
    expect(back?.createdAt).toBeTruthy()
  })

  it("keeps the server case identity for a fallback draft", async () => {
    const id = makeLocalCaseId()
    expect(await saveLocalCaseDraft(id, { ageYears: 64 }, "case-1")).toBe(true)

    const back = await loadLocalCaseDraft(id)
    expect(back?.serverCaseId).toBe("case-1")
    expect(back?.formValues).toEqual({ ageYears: 64 })
  })

  it("stores a draft far larger than SecureStore's ~2 KB ceiling", async () => {
    const id = makeLocalCaseId()
    // A realistic preop payload: long free text plus many coded rows.
    const formValues = {
      physicalExamReport: "x".repeat(4000),
      comorbidities: Array.from({ length: 40 }, (_, i) => ({ label: `Condition ${i}`, code: `I${i}` })),
      currentMedications: Array.from({ length: 40 }, (_, i) => ({ label: `Drug ${i}` })),
    }
    expect(JSON.stringify(formValues).length).toBeGreaterThan(2048)

    expect(await saveLocalCaseDraft(id, formValues)).toBe(true)
    const back = await loadLocalCaseDraft(id)
    expect(back?.formValues).toEqual(formValues)
  })

  it("lists every stored draft", async () => {
    const a = makeLocalCaseId(); const b = makeLocalCaseId()
    await saveLocalCaseDraft(a, { n: 1 })
    await saveLocalCaseDraft(b, { n: 2 })

    const all = await getAllLocalCaseDrafts()
    expect(all.map(d => d.localId).sort()).toEqual([a, b].sort())
  })

  it("returns null for a draft that was never saved", async () => {
    expect(await loadLocalCaseDraft("local_missing")).toBeNull()
  })

  it("removes a draft, and removing it twice is not an error", async () => {
    const id = makeLocalCaseId()
    await saveLocalCaseDraft(id, { n: 1 })
    await deleteLocalCaseDraft(id)
    expect(await loadLocalCaseDraft(id)).toBeNull()
    await expect(deleteLocalCaseDraft(id)).resolves.toBeUndefined()
  })

  it("gives every draft a distinct id", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeLocalCaseId()))
    expect(ids.size).toBe(200)
  })

  it("clears everything and reports how many were removed", async () => {
    await saveLocalCaseDraft(makeLocalCaseId(), { n: 1 })
    await saveLocalCaseDraft(makeLocalCaseId(), { n: 2 })
    expect(await clearAllLocalCaseDrafts()).toBe(2)
    expect(await getAllLocalCaseDrafts()).toEqual([])
  })
})
