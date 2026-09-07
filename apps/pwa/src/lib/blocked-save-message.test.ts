import { describe, expect, it } from "vitest"
import {
  BLOCKED_SAVE_DOMAIN_CODES,
  BLOCKED_SAVE_FIELD_LABELS,
  BLOCKED_SAVE_PII_REASONS,
} from "@lospor/core/blocked-save-copy"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import { CLINICAL_STRINGS, type ClinicalStringKey } from "@/i18n/clinical-strings"
import { blockedSaveMessage } from "./blocked-save-message"

/**
 * Which kind of refusal it is is core's, and tested there. The keys this app
 * uses are checked by the compiler; whether both languages actually carry a
 * translation for them is not, and an empty string renders as nothing at all.
 */

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

describe("what this app tells a clinician about a refused save", () => {
  const languages = [["English", "en"], ["Bulgarian", "bg"]] as const

  const say = (language: "en" | "bg") => (key: ClinicalStringKey) => {
    const text = CLINICAL_STRINGS[language][key]
    if (!text) throw new Error(`no ${language} copy for ${key}`)
    return text
  }

  it.each(languages)("has %s copy for every kind of refusal", (_name, language) => {
    for (const code of BLOCKED_SAVE_DOMAIN_CODES) {
      expect(blockedSaveMessage(issue({ code }), say(language))).not.toBe("")
    }
    for (const reason of BLOCKED_SAVE_PII_REASONS) {
      expect(blockedSaveMessage(issue({ reason }), say(language))).not.toBe("")
    }
  })

  it.each(languages)("names every field in %s", (_name, language) => {
    const named = BLOCKED_SAVE_FIELD_LABELS.map(label => blockedSaveMessage(
      issue({ field: label === "procedure" ? "plannedProcedure" : label }),
      say(language),
    ))
    expect(named.every(text => text.length > 0 && !text.includes("{field}"))).toBe(true)
  })

  /**
   * Web carried a label for the preoperative notes and this app did not, so the
   * same refusal named the field on one client and printed "notes" on the
   * other.
   */
  it("labels the preoperative notes it used to leave unnamed", () => {
    expect(blockedSaveMessage(issue({ field: "notes" }), say("en")))
      .toContain(CLINICAL_STRINGS.en.notesLabel)
  })

  it("says an age refusal is about the age, not about privacy", () => {
    expect(blockedSaveMessage(issue({ code: "PEDIATRIC_MODE_REQUIRED" }), say("en")))
      .toBe(CLINICAL_STRINGS.en.blockedPediatricModeRequired)
  })

  it("shows an unrecognised field by its wire name rather than a blank", () => {
    expect(blockedSaveMessage(issue({ field: "surgicalApproach" }), say("en")))
      .toContain("surgicalApproach")
  })
})
