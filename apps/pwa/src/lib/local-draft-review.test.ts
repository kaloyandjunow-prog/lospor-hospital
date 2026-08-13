import { describe, expect, it } from "vitest"
import {
  localDraftSyncReview,
  localDraftReviewSummary,
  localDraftRecoveryParams,
  reviewBlockedIssue,
  reviewFieldNames,
  shouldShowLocalDraft,
} from "./local-draft-review"
import type { BlockedSaveIssue, RejectedField } from "@lospor/core/sync"

describe("local draft review metadata", () => {
  it("keeps field names and reason categories but not server prose or values", () => {
    const review = localDraftSyncReview({
      code: "PII_BLOCKED",
      field: "teamNotes",
      reason: "likely_name",
      message: "Synthetic Person was rejected",
      retryable: false,
      blockedKeys: ["teamNotes"],
    } as BlockedSaveIssue, [{ path: "preop.heightCm", message: "999 is too high" } as RejectedField])

    expect(review).toEqual({
      blocked: { field: "teamNotes", reason: "likely_name" },
      rejectedFields: ["preop.heightCm"],
    })
    expect(JSON.stringify(review)).not.toContain("Synthetic Person")
    expect(JSON.stringify(review)).not.toContain("999")
    expect(review && reviewFieldNames(review)).toEqual(["teamNotes", "heightCm"])
  })

  it("normalises unknown reason text and replaces unsafe field labels", () => {
    expect(localDraftSyncReview({ field: "notes", reason: "raw server prose" }))
      .toEqual({ blocked: { field: "notes", reason: "other" } })
    expect(localDraftSyncReview({ field: "<script>clinical value</script>", reason: "email" }))
      .toEqual({ blocked: { field: "preop", reason: "email" } })
    expect(localDraftSyncReview(undefined, [{ path: "<unsafe value>", message: "raw" } as RejectedField]))
      .toEqual({ rejectedFields: ["preop"] })
  })

  it("rebuilds only the structural blocked issue needed by the form warning", () => {
    expect(reviewBlockedIssue({
      blocked: { field: "preop.teamNotes", reason: "likely_name" },
    })).toMatchObject({
      field: "preop.teamNotes",
      reason: "likely_name",
      blockedKeys: ["teamNotes"],
    })
  })

  it("keeps server-linked review drafts visible with an actionable safe summary", () => {
    const syncReview = {
      blocked: { field: "preop.teamNotes", reason: "likely_name" as const },
      rejectedFields: ["preop.heightCm"],
    }

    expect(shouldShowLocalDraft({ serverCaseId: "server-case", syncReview })).toBe(true)
    expect(shouldShowLocalDraft({ serverCaseId: "server-case" })).toBe(false)
    expect(localDraftRecoveryParams({ localId: "local-copy", serverCaseId: "server-case" }))
      .toEqual({ continue: "server-case", localId: "local-copy" })
    expect(localDraftReviewSummary(syncReview, "en"))
      .toBe("Check: team notes, height cm · Reason: possible name, invalid value")
  })
})
