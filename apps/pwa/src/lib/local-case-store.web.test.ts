import "fake-indexeddb/auto"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { Platform } from "react-native"
import {
  clearAllLocalCaseDrafts,
  deleteLocalCaseDraft,
  getAllLocalCaseDrafts,
  loadLocalCaseDraft,
  makeLocalCaseId,
  saveLocalCaseDraft,
} from "./local-case-store"

describe("PWA local case drafts", () => {
  beforeEach(async () => {
    Platform.OS = "web"
    await clearAllLocalCaseDrafts()
  })

  afterAll(() => {
    Platform.OS = "ios"
  })

  it("persists a large draft in IndexedDB", async () => {
    const localId = makeLocalCaseId()
    const formValues = {
      diagnosis: "Appendicitis",
      report: "x".repeat(10_000),
    }

    expect(await saveLocalCaseDraft(localId, formValues, "server-case-1")).toBe(true)
    expect(await loadLocalCaseDraft(localId)).toMatchObject({
      localId,
      serverCaseId: "server-case-1",
      formValues,
    })
  })

  it("lists and deletes drafts without using Expo filesystem storage", async () => {
    const first = makeLocalCaseId()
    const second = makeLocalCaseId()
    await saveLocalCaseDraft(first, { ageYears: 40 })
    await saveLocalCaseDraft(second, { ageYears: 60 })

    expect((await getAllLocalCaseDrafts()).map(draft => draft.localId).sort())
      .toEqual([first, second].sort())
    await deleteLocalCaseDraft(first)
    expect(await loadLocalCaseDraft(first)).toBeNull()
    expect(await clearAllLocalCaseDrafts()).toBe(1)
  })
})
