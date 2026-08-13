import { beforeEach, describe, expect, it } from "vitest"
import * as FileSystem from "expo-file-system/legacy"
import {
  clearAllLocalCaseDrafts,
  deleteLocalCaseDraft,
  getAllLocalCaseDrafts,
  loadLocalCaseDraft,
  loadLocalPatientReference,
  makeLocalCaseId,
  saveLocalCaseDraft,
  type LocalDraftOwner,
} from "./local-case-store"

const ownerA: LocalDraftOwner = { userId: "clinician-a", institutionId: "hospital-1" }
const ownerB: LocalDraftOwner = { userId: "clinician-b", institutionId: "hospital-1" }
const transferredOwner: LocalDraftOwner = { userId: "clinician-a", institutionId: "hospital-2" }

describe("native local case drafts", () => {
  beforeEach(async () => { await clearAllLocalCaseDrafts() })

  it("keeps the raw patient number out of generic clinical draft JSON", async () => {
    const id = makeLocalCaseId()
    const sentinel = "HOSP-RAW-SENTINEL-90817"
    expect(await saveLocalCaseDraft({
      localId: id,
      owner: ownerA,
      patientNumber: sentinel,
      formValues: { ageYears: 64, sex: "MALE" },
    })).toBe(true)

    const rawDraftJson = await FileSystem.readAsStringAsync(
      `${FileSystem.documentDirectory}case-drafts/${id}.json`,
    )
    expect(rawDraftJson).not.toContain(sentinel)
    expect(rawDraftJson).not.toContain("patientNumber")
    expect(await loadLocalPatientReference(id, ownerA)).toBe(sentinel)
    expect((await loadLocalCaseDraft(id, ownerA))?.formValues).toEqual({
      ageYears: 64,
      sex: "MALE",
    })
  })

  it("rejects raw patient numbers in formValues", async () => {
    expect(await saveLocalCaseDraft({
      localId: makeLocalCaseId(),
      owner: ownerA,
      patientNumber: "HOSP-1",
      formValues: { patientNumber: "HOSP-1", ageYears: 64 },
    })).toBe(false)
    expect(await saveLocalCaseDraft({
      localId: makeLocalCaseId(),
      owner: ownerA,
      patientNumber: "HOSP-1",
      formValues: { extension: { patientNumber: "HOSP-1" } },
    })).toBe(false)
  })

  it("round-trips a large local-only draft through file plus protected reference storage", async () => {
    const id = makeLocalCaseId()
    const formValues = {
      physicalExamReport: "x".repeat(4000),
      comorbidities: Array.from({ length: 40 }, (_, i) => ({ label: `Condition ${i}` })),
    }
    expect(JSON.stringify(formValues).length).toBeGreaterThan(2048)
    expect(await saveLocalCaseDraft({
      localId: id,
      owner: ownerA,
      patientNumber: "HOSP-2",
      formValues,
    })).toBe(true)
    expect((await loadLocalCaseDraft(id, ownerA))?.formValues).toEqual(formValues)
    expect(await loadLocalPatientReference(id, ownerA)).toBe("HOSP-2")
  })

  it("prevents another signed-in account from listing, opening, decrypting, deleting, or taking ownership", async () => {
    const id = makeLocalCaseId()
    await saveLocalCaseDraft({
      localId: id,
      owner: ownerA,
      patientNumber: "HOSP-OWNER-A",
      formValues: { ageYears: 40 },
    })

    expect(await getAllLocalCaseDrafts(ownerB)).toEqual([])
    expect(await getAllLocalCaseDrafts(transferredOwner)).toEqual([])
    expect(await loadLocalCaseDraft(id, ownerB)).toBeNull()
    expect(await loadLocalPatientReference(id, transferredOwner)).toBeNull()
    expect(await loadLocalPatientReference(id, ownerB)).toBeNull()
    await deleteLocalCaseDraft(id, ownerB)
    expect(await loadLocalCaseDraft(id, ownerA)).not.toBeNull()
    expect(await saveLocalCaseDraft({
      localId: id,
      owner: ownerB,
      patientNumber: "HOSP-OWNER-B",
      formValues: { ageYears: 41 },
    })).toBe(false)
  })

  it("retains server-linked review drafts without retaining a raw patient number", async () => {
    const id = makeLocalCaseId()
    expect(await saveLocalCaseDraft({
      localId: id,
      owner: ownerA,
      serverCaseId: "case-1",
      formValues: { ageYears: 64 },
      syncReview: { rejectedFields: ["preop.ageYears"] },
    })).toBe(true)
    expect(await loadLocalPatientReference(id, ownerA)).toBeNull()
    expect(await loadLocalCaseDraft(id, ownerA)).toMatchObject({
      serverCaseId: "case-1",
      syncReview: { rejectedFields: ["preop.ageYears"] },
    })
    expect(await saveLocalCaseDraft({
      localId: id,
      owner: ownerA,
      patientNumber: "HOSP-STALE",
      formValues: { ageYears: 65 },
    })).toBe(false)
    expect((await loadLocalCaseDraft(id, ownerA))?.serverCaseId).toBe("case-1")
  })

  it("quarantines and retains a legacy unowned filesystem draft", async () => {
    const id = "local_legacy_native"
    const directory = `${FileSystem.documentDirectory}case-drafts/`
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
    const path = `${directory}${id}.json`
    await FileSystem.writeAsStringAsync(path, JSON.stringify({
      localId: id,
      formValues: { ageYears: 70 },
      createdAt: "2026-01-01T00:00:00.000Z",
    }))

    expect(await getAllLocalCaseDrafts(ownerA)).toEqual([])
    expect(await loadLocalCaseDraft(id, ownerA)).toBeNull()
    await deleteLocalCaseDraft(id, ownerA)
    expect((await FileSystem.getInfoAsync(path)).exists).toBe(true)
    expect(await saveLocalCaseDraft({
      localId: id, owner: ownerA, patientNumber: "HOSP-NEW", formValues: { ageYears: 70 },
    })).toBe(false)
  })

  it("fails closed instead of overwriting an unreadable existing draft", async () => {
    const id = "local_unreadable_native"
    const directory = `${FileSystem.documentDirectory}case-drafts/`
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
    const path = `${directory}${id}.json`
    await FileSystem.writeAsStringAsync(path, "{not-valid-json")

    expect(await saveLocalCaseDraft({
      localId: id, owner: ownerA, patientNumber: "HOSP-NEW", formValues: { ageYears: 70 },
    })).toBe(false)
    expect(await FileSystem.readAsStringAsync(path)).toBe("{not-valid-json")
  })

  it("clears all owned and quarantined local records only on explicit cache clearing", async () => {
    await saveLocalCaseDraft({
      localId: makeLocalCaseId(), owner: ownerA, patientNumber: "HOSP-A", formValues: { n: 1 },
    })
    await saveLocalCaseDraft({
      localId: makeLocalCaseId(), owner: ownerB, patientNumber: "HOSP-B", formValues: { n: 2 },
    })
    expect(await clearAllLocalCaseDrafts()).toBe(2)
    expect(await getAllLocalCaseDrafts(ownerA)).toEqual([])
    expect(await getAllLocalCaseDrafts(ownerB)).toEqual([])
  })

  it("gives every draft a distinct id", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeLocalCaseId()))
    expect(ids.size).toBe(200)
  })
})
