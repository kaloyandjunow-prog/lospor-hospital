import { describe, expect, it } from "vitest"
import {
  BLOCKED_SAVE_DOMAIN_CODES,
  BLOCKED_SAVE_PII_REASONS,
  classifyBlockedSave,
} from "./blocked-save-copy"
import type { BlockedSaveIssue } from "./sync/protocol"

function issue(over: Partial<BlockedSaveIssue> = {}): BlockedSaveIssue {
  return {
    code: "PII_BLOCKED",
    field: "diagnosis",
    reason: "likely_name",
    message: "",
    retryable: false,
    blockedKeys: [],
    ...over,
  }
}

describe("what a refused save is about", () => {
  /**
   * The whole reason this is one decision rather than a branch in each screen.
   * A clinician told their patient's age contains personal data will go looking
   * for a name in a number, and there is none to find.
   */
  it("never dresses an age or mode refusal as a privacy problem", () => {
    for (const code of BLOCKED_SAVE_DOMAIN_CODES) {
      expect(classifyBlockedSave(issue({ code }))).toEqual({ kind: "domain", code })
    }
  })

  it("names the field for every privacy reason the server sends", () => {
    for (const reason of BLOCKED_SAVE_PII_REASONS) {
      expect(classifyBlockedSave(issue({ reason }))).toEqual({
        kind: "pii",
        reason,
        label: "diagnosis",
        field: "diagnosis",
      })
    }
  })

  // The server names its own columns; the clinician saw one field. Both
  // diagnosis spellings are the box they typed in.
  it("collapses the wire names of one field onto one label", () => {
    expect(classifyBlockedSave(issue({ field: "diagnoses" })).kind).toBe("pii")
    expect(classifyBlockedSave(issue({ field: "diagnoses" })))
      .toMatchObject({ label: "diagnosis" })
    expect(classifyBlockedSave(issue({ field: "plannedProcedure" })))
      .toMatchObject({ label: "procedure" })
    expect(classifyBlockedSave(issue({ field: "procedures" })))
      .toMatchObject({ label: "procedure" })
  })

  /**
   * Web carried a label for the preoperative notes and mobile did not, so the
   * same refusal read as "notes" on one client and as a proper field name on
   * the other. It is in the shared table now, which is what stops that
   * recurring.
   */
  it("labels the preoperative notes, which only one client used to", () => {
    expect(classifyBlockedSave(issue({ field: "notes" }))).toMatchObject({ label: "notes" })
  })

  /**
   * A server ahead of this client. Showing the wire name is honest; guessing a
   * neighbouring label would tell the clinician to go and edit the wrong box.
   */
  it("shows an unknown field by its own name rather than guessing", () => {
    expect(classifyBlockedSave(issue({ field: "surgicalApproach" }))).toEqual({
      kind: "pii",
      reason: "likely_name",
      label: null,
      field: "surgicalApproach",
    })
  })

  it("falls back to generic wording for a reason it does not know", () => {
    expect(classifyBlockedSave(issue({ reason: "biometric_hash" })))
      .toMatchObject({ kind: "pii", reason: null })
  })
})
