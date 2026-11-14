import React from "react"
import { act } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
const lookups = vi.hoisted(() => ({ calls: [] as unknown[][], answers: [] as unknown[] }))
vi.mock("@/lib/ehr-import", () => {
  const next = async (...args: unknown[]) => {
    lookups.calls.push(args)
    return lookups.answers.length > 1 ? lookups.answers.shift() : lookups.answers[0]
  }
  return { lookupEhrImport: next, lookupEhrImportWithoutCase: next, recordEhrDecisions: vi.fn() }
})

import { STRINGS } from "@/i18n/strings"
import { pressByText, queryByText, render } from "@/test/render"
import { EhrImportOffer, LOOKUP_PAUSE_MS } from "./EhrImportOffer"

/**
 * Asking the hospital system over the watched folder (1.5.0), on the phone:
 * the lookup asks once, the offer re-checks every 15 seconds for five minutes
 * without asking again, then says it has not been answered.
 */

const en = STRINGS.en
const REQUESTED = { status: "requested", requestId: "a".repeat(32) }

function offer(answers: unknown[], props: { transport: "FOLDER" | "FHIR"; folderRequests?: boolean }) {
  lookups.calls = []
  lookups.answers = answers
  return render(
    <EhrImportOffer caseId="c1" identifier="42" available language="en" current={{}} labelFor={field => field} onApply={vi.fn()} {...props} />,
  )
}
// The first ask waits for typing to pause.
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(LOOKUP_PAUSE_MS) })
const step = () => act(async () => { await vi.advanceTimersByTimeAsync(15_000) })

afterEach(() => { vi.useRealTimers() })

describe("a watched-folder site that asks the hospital system", () => {
  it("asks once, waits, and stops after five minutes saying it has not been answered", async () => {
    vi.useFakeTimers()
    const tree = offer([REQUESTED], { transport: "FOLDER", folderRequests: true })
    await flush()
    expect(lookups.calls[0]).toEqual(["c1", "42", "IZ", { request: true }])
    expect(queryByText(tree, en.ehrRequested)).not.toBeNull()

    await step()
    expect(lookups.calls[1]).toEqual(["c1", "42", "IZ", { requestId: "a".repeat(32) }])
    for (let check = 1; check < 20; check++) await step()
    expect(lookups.calls).toHaveLength(21)
    expect(queryByText(tree, en.ehrNotAnswered)).not.toBeNull()
    await step()
    expect(lookups.calls).toHaveLength(21)
  })

  it("says the hospital holds nothing when it answered so", async () => {
    vi.useFakeTimers()
    const tree = offer([REQUESTED, { status: "none" }], { transport: "FOLDER", folderRequests: true })
    await flush()
    await step()
    expect(queryByText(tree, en.ehrNothingHeld)).not.toBeNull()
  })
})

describe("a site that does not ask", () => {
  it("never asks, never waits and offers no fetch button on a plain folder", async () => {
    vi.useFakeTimers()
    const tree = offer([{ status: "none" }], { transport: "FOLDER", folderRequests: false })
    await flush()
    expect(lookups.calls[0]).toEqual(["c1", "42", "IZ", {}])
    expect(queryByText(tree, en.ehrFetchPatientAgain)).toBeNull()
    await step()
    expect(lookups.calls).toHaveLength(1)
  })
})

describe("looking a patient up on the phone", () => {
  it("asks once typing pauses, and a pressed look-again asks for a fresh copy", async () => {
    vi.useFakeTimers()
    lookups.calls = []
    lookups.answers = [{ status: "none" }]
    const view = (identifier: string) => (
      <EhrImportOffer caseId="c1" identifier={identifier} available language="en" transport="FHIR" current={{}} labelFor={field => field} onApply={vi.fn()} />
    )
    const tree = render(view("7"))
    for (const typed of ["71", "710", "71001"]) {
      act(() => tree.update(view(typed)))
      await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    }
    expect(lookups.calls).toHaveLength(0)
    await flush()
    expect(lookups.calls).toEqual([["c1", "71001", "IZ", {}]])

    await act(async () => { pressByText(tree, en.ehrFetchPatientAgain) })
    expect(lookups.calls[1]).toEqual(["c1", "71001", "IZ", { again: true }])
  })
})
