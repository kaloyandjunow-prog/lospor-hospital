import { describe, expect, it } from "vitest"
import {
  BLOCKED_SAVE_DOMAIN_CODES,
  BLOCKED_SAVE_FIELD_LABELS,
  BLOCKED_SAVE_PII_REASONS,
} from "@lospor/core/blocked-save-copy"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import en from "../../messages/en.json"
import bg from "../../messages/bg.json"
import { blockedSaveMessage } from "./blocked-save-message"

/**
 * Which kind of refusal it is is core's, and tested there. This app's part is
 * the copy, and the way it fails is silent: a key with no entry renders as the
 * key, so a clinician is told their save was refused by
 * "case.piiLikelyName".
 */

function lookup(catalogue: unknown, key: string): string | undefined {
  const found = key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    catalogue,
  )
  return typeof found === "string" ? found : undefined
}

function translate(catalogue: unknown) {
  return (key: string, values?: Record<string, string>) => {
    const template = lookup(catalogue, key)
    if (template === undefined) throw new Error(`no copy for ${key}`)
    return Object.entries(values ?? {}).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, value),
      template,
    )
  }
}

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
  const catalogues = [["English", en], ["Bulgarian", bg]] as const

  it.each(catalogues)("has %s copy for every kind of refusal", (_name, catalogue) => {
    const say = translate(catalogue)
    for (const code of BLOCKED_SAVE_DOMAIN_CODES) {
      expect(blockedSaveMessage(issue({ code }), say)).not.toBe("")
    }
    for (const reason of BLOCKED_SAVE_PII_REASONS) {
      expect(blockedSaveMessage(issue({ reason }), say)).not.toBe("")
    }
  })

  /**
   * The wire names core maps onto its labels, so a label gaining a new spelling
   * is covered too. Each has to reach real copy in both languages.
   */
  it.each(catalogues)("names every field in %s", (_name, catalogue) => {
    const say = translate(catalogue)
    const named = BLOCKED_SAVE_FIELD_LABELS.map(label => blockedSaveMessage(
      issue({ field: label === "procedure" ? "plannedProcedure" : label }),
      say,
    ))
    expect(named.every(text => text.length > 0 && !text.includes("{field}"))).toBe(true)
  })

  it("says an age refusal is about the age, not about privacy", () => {
    const message = blockedSaveMessage(
      issue({ code: "PEDIATRIC_MODE_REQUIRED" }),
      translate(en),
    )
    expect(message).toBe(lookup(en, "pediatric.switchRequired"))
  })

  it("shows an unrecognised field by its wire name rather than a blank", () => {
    expect(blockedSaveMessage(issue({ field: "surgicalApproach" }), translate(en)))
      .toContain("surgicalApproach")
  })
})
