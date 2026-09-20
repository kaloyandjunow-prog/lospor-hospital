import "fake-indexeddb/auto"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { Platform } from "react-native"
import {
  clearAllLocalCaseDrafts,
  deleteLocalCaseDraft,
  getAllLocalCaseDrafts,
  loadLocalCaseDraft,
  loadLocalPatientReference,
  localDraftCanBeWritten,
  makeLocalCaseId,
  saveLocalCaseDraft,
  type LocalDraftOwner,
} from "./local-case-store"

const ownerA: LocalDraftOwner = { userId: "clinician-a", institutionId: "hospital-1" }
const ownerB: LocalDraftOwner = { userId: "clinician-b", institutionId: "hospital-1" }
const transferredOwner: LocalDraftOwner = { userId: "clinician-a", institutionId: "hospital-2" }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function database(): Promise<IDBDatabase> {
  return requestResult(indexedDB.open("lospor", 2))
}

async function storedRecord(storeName: string, id: string): Promise<unknown> {
  const transaction = (await database()).transaction(storeName, "readonly")
  return requestResult(transaction.objectStore(storeName).get(id))
}

async function allStoredRecords(storeName: string): Promise<unknown[]> {
  const transaction = (await database()).transaction(storeName, "readonly")
  return requestResult(transaction.objectStore(storeName).getAll())
}

describe("web local case drafts", () => {
  beforeEach(async () => {
    Platform.OS = "web"
    await clearAllLocalCaseDrafts()
  })

  afterAll(() => { Platform.OS = "ios" })

  it("stores no raw patient number in the draft store and only ciphertext in the reference store", async () => {
    const localId = makeLocalCaseId()
    const sentinel = "HOSP-WEB-RAW-SENTINEL-887711"
    expect(await saveLocalCaseDraft({
      localId,
      owner: ownerA,
      patientNumber: sentinel,
      formValues: { diagnosis: "Appendicitis", report: "x".repeat(10_000) },
    })).toBe(true)

    const rawDraft = await storedRecord("case-drafts", localId)
    const rawReference = await storedRecord("patient-references", localId)
    expect(JSON.stringify(rawDraft)).not.toContain(sentinel)
    expect(JSON.stringify(rawDraft)).not.toContain("patientNumber")
    expect(JSON.stringify(rawReference)).not.toContain(sentinel)
    expect(rawReference).toMatchObject({ localId, version: 1 })
    expect(await loadLocalPatientReference(localId, ownerA)).toBe(sentinel)
  })

  it("uses one durable owner key when first drafts are saved concurrently", async () => {
    const first = makeLocalCaseId()
    const second = makeLocalCaseId()
    await expect(Promise.all([
      saveLocalCaseDraft({
        localId: first, owner: ownerA, patientNumber: "HOSP-CONCURRENT-A", formValues: { ageYears: 40 },
      }),
      saveLocalCaseDraft({
        localId: second, owner: ownerA, patientNumber: "HOSP-CONCURRENT-B", formValues: { ageYears: 41 },
      }),
    ])).resolves.toEqual([true, true])

    expect(await loadLocalPatientReference(first, ownerA)).toBe("HOSP-CONCURRENT-A")
    expect(await loadLocalPatientReference(second, ownerA)).toBe("HOSP-CONCURRENT-B")
    expect(await allStoredRecords("patient-reference-keys")).toHaveLength(1)
  })

  it("prevents another account from listing, opening, decrypting, deleting, flushing, or taking ownership", async () => {
    const localId = makeLocalCaseId()
    await saveLocalCaseDraft({
      localId,
      owner: ownerA,
      patientNumber: "HOSP-A-ONLY",
      formValues: { ageYears: 47 },
    })

    expect(await getAllLocalCaseDrafts(ownerB)).toEqual([])
    expect(await getAllLocalCaseDrafts(transferredOwner)).toEqual([])
    expect(await loadLocalCaseDraft(localId, ownerB)).toBeNull()
    expect(await loadLocalPatientReference(localId, ownerB)).toBeNull()
    expect(await loadLocalPatientReference(localId, transferredOwner)).toBeNull()
    await deleteLocalCaseDraft(localId, ownerB)
    expect(await loadLocalPatientReference(localId, ownerA)).toBe("HOSP-A-ONLY")
    expect(await saveLocalCaseDraft({
      localId,
      owner: ownerB,
      patientNumber: "HOSP-B",
      formValues: { ageYears: 48 },
    })).toBe(false)
  })

  it("quarantines and retains a legacy unowned draft", async () => {
    const localId = "local_legacy_unowned"
    const db = await database()
    const transaction = db.transaction("case-drafts", "readwrite")
    transaction.objectStore("case-drafts").put({
      localId,
      formValues: { ageYears: 70 },
      createdAt: "2026-01-01T00:00:00.000Z",
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })

    expect(await getAllLocalCaseDrafts(ownerA)).toEqual([])
    expect(await loadLocalCaseDraft(localId, ownerA)).toBeNull()
    await deleteLocalCaseDraft(localId, ownerA)
    expect(await storedRecord("case-drafts", localId)).toMatchObject({ localId })
    expect(await saveLocalCaseDraft({
      localId,
      owner: ownerA,
      patientNumber: "HOSP-NEW",
      formValues: { ageYears: 70 },
    })).toBe(false)
  })

  it("retains review metadata while removing the protected reference after server linking", async () => {
    const localId = makeLocalCaseId()
    await saveLocalCaseDraft({
      localId, owner: ownerA, patientNumber: "HOSP-LINK", formValues: { ageYears: 47 },
    })
    expect(await saveLocalCaseDraft({
      localId,
      owner: ownerA,
      serverCaseId: "server-case-1",
      formValues: { ageYears: 47 },
      syncReview: { rejectedFields: ["preop.ageYears"] },
    })).toBe(true)
    expect(await loadLocalPatientReference(localId, ownerA)).toBeNull()
    expect(await storedRecord("patient-references", localId)).toBeUndefined()
  })

  it("removes departed owner encryption keys during explicit device-cache clearing", async () => {
    await saveLocalCaseDraft({
      localId: makeLocalCaseId(), owner: ownerA, patientNumber: "HOSP-CLEAR", formValues: { ageYears: 40 },
    })
    expect(await allStoredRecords("patient-reference-keys")).toHaveLength(1)
    await clearAllLocalCaseDrafts()
    expect(await allStoredRecords("patient-reference-keys")).toEqual([])
  })
})

// A blank new-case form reported "the draft was not saved on this device" the
// instant it opened: saveLocalCaseDraft refuses a draft with nothing to anchor
// to, and the screen could not tell that refusal apart from a storage fault.
// Asking first is what lets it stay silent until there is something to save.
describe("whether a local draft has anything to anchor to", () => {
  beforeEach(async () => {
    Platform.OS = "web"
    await clearAllLocalCaseDrafts()
  })

  it("says no for a new case with no patient number yet", async () => {
    await expect(localDraftCanBeWritten({
      localId: makeLocalCaseId(),
      owner: ownerA,
    })).resolves.toBe(false)
  })

  it("says no for a patient number of only whitespace", async () => {
    await expect(localDraftCanBeWritten({
      localId: makeLocalCaseId(),
      owner: ownerA,
      patientNumber: "   ",
    })).resolves.toBe(false)
  })

  it("says yes once a patient number is entered", async () => {
    await expect(localDraftCanBeWritten({
      localId: makeLocalCaseId(),
      owner: ownerA,
      patientNumber: "3000",
    })).resolves.toBe(true)
  })

  it("says yes once the case exists on the server, number or not", async () => {
    await expect(localDraftCanBeWritten({
      localId: makeLocalCaseId(),
      owner: ownerA,
      serverCaseId: "case-1",
    })).resolves.toBe(true)
  })

  // Reopening a draft whose number was entered earlier: the form field may be
  // empty, but the encrypted reference is already stored, so the draft still
  // has its anchor and must keep saving.
  it("says yes when a reference was already stored for this draft", async () => {
    const localId = makeLocalCaseId()
    expect(await saveLocalCaseDraft({
      localId,
      owner: ownerA,
      formValues: { age: 40 },
      patientNumber: "3000",
    })).toBe(true)

    await expect(localDraftCanBeWritten({ localId, owner: ownerA })).resolves.toBe(true)
  })

  // The contract the screen now leans on: whenever this says no, the write
  // would have been refused anyway. If these two ever disagree, the screen is
  // back to reporting a refusal it cannot explain -- which is the whole bug.
  it("says no exactly when the write would be refused", async () => {
    const localId = makeLocalCaseId()
    const input = { localId, owner: ownerA, formValues: { age: 40 } }

    expect(await localDraftCanBeWritten({ localId, owner: ownerA })).toBe(false)
    expect(await saveLocalCaseDraft(input)).toBe(false)

    expect(await localDraftCanBeWritten({
      localId, owner: ownerA, patientNumber: "3000",
    })).toBe(true)
    expect(await saveLocalCaseDraft({ ...input, patientNumber: "3000" })).toBe(true)
  })
  // The reference belongs to whoever stored it; another clinician signing in
  // on the same device has no draft here to anchor to.
  it("says no to a different owner than the one who stored the reference", async () => {
    const localId = makeLocalCaseId()
    expect(await saveLocalCaseDraft({
      localId,
      owner: ownerA,
      formValues: { age: 40 },
      patientNumber: "3000",
    })).toBe(true)

    await expect(localDraftCanBeWritten({ localId, owner: ownerB })).resolves.toBe(false)
  })
})
