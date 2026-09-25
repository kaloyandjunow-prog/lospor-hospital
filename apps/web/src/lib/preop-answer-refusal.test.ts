import { afterEach, describe, expect, it, vi } from "vitest"
import en from "../../messages/en.json"
import bg from "../../messages/bg.json"
import { AutosaveHttpError, classifyError } from "./autosave-manager"
import { isServerRefusal } from "./server-refusal"
import { readPreopAnswerRefusal } from "./preop-answer-refusal"
import { fetchMissingRequiredPreop, missingRequiredPreopLabels } from "./preop-required"

/**
 * Hospital 1.4.7: a refused preop answer came back as a bare 400 neither client
 * recognised, so it was replayed forever while the screen said it was queued.
 */
describe("a refused preop answer", () => {
  const body = {
    error: "UNKNOWN_NOT_ALLOWED",
    code: "PREOP_ANSWER_REFUSED",
    reason: "UNKNOWN_NOT_ALLOWED",
    field: "smoking",
    blockedKeys: ["smoking"],
  }

  it("is a blocked save naming the fields to revisit", () => {
    const issue = readPreopAnswerRefusal(body)
    expect(issue).toMatchObject({ code: "PREOP_ANSWER_REFUSED", field: "smoking", blockedKeys: ["smoking"] })
    expect(classifyError(new AutosaveHttpError(400, undefined, issue ?? undefined))).toMatchObject({
      kind: "http",
      status: 400,
      blocked: { blockedKeys: ["smoking"] },
    })
  })

  it("ignores bodies that are not preop refusals", () => {
    expect(readPreopAnswerRefusal({ error: "Invalid request" })).toBeNull()
    expect(readPreopAnswerRefusal(null)).toBeNull()
  })

  it("is labelled refused, while offline, timeout and 5xx stay queued", () => {
    expect(isServerRefusal({ kind: "http", status: 400 })).toBe(true)
    expect(isServerRefusal({ kind: "http", status: 408 })).toBe(false)
    expect(isServerRefusal({ kind: "http", status: 429 })).toBe(false)
    expect(isServerRefusal({ kind: "http", status: 500 })).toBe(false)
    expect(isServerRefusal({ kind: "network" })).toBe(false)
    expect(isServerRefusal(undefined)).toBe(false)
  })

  it.each([["English", en], ["Bulgarian", bg]] as const)("has %s copy for the new save messages", (_name, catalogue) => {
    const casePart = (catalogue as unknown as { case: Record<string, string> }).case
    for (const key of ["blockedPreopAnswer", "saveRefused", "preopRequiredMissing"]) {
      expect(casePart[key]).toBeTruthy()
    }
    expect(casePart.preopRequiredMissing).toContain("{questions}")
  })
})

describe("the continue-to-intraop required-question gate", () => {
  afterEach(() => vi.unstubAllGlobals())

  const missing = [{ stableKey: "BASE_SMOKING", labelEn: "Smoking", labelBg: "Тютюнопушене", fields: ["smoking"] }]

  it("reads what the case says is still unanswered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ preopRequiredMissing: missing }))))
    await expect(fetchMissingRequiredPreop("case-1")).resolves.toEqual(missing)
  })

  it("never blocks on a read that fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline") }))
    await expect(fetchMissingRequiredPreop("case-1")).resolves.toEqual([])
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })))
    await expect(fetchMissingRequiredPreop("case-1")).resolves.toEqual([])
  })

  it("names the questions in the clinician's language", () => {
    expect(missingRequiredPreopLabels(missing, "bg")).toBe("Тютюнопушене")
    expect(missingRequiredPreopLabels(missing, "en")).toBe("Smoking")
  })
})
