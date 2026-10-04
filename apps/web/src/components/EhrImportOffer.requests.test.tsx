// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"

import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan } from "@lospor/core/ehr-import-review"
import { EhrImportOffer } from "./EhrImportOffer"

import messages from "../../messages/en.json"

/**
 * Asking the hospital system over the watched folder (1.5.0): the clinician's
 * lookup asks, the offer waits and checks every 15 seconds without asking
 * again, and after five minutes says it has not been answered.
 */

const plan = buildEhrReviewPlan({
  canonical: normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields: { weightKg: 72 } }).canonical,
  current: {},
})
const REQUESTED = { pending: false, requested: true, requestId: "a".repeat(32) }
const OFFER = { pending: true, importId: "i1", maskedIdentifier: "4*", receivedAt: "", plan }

function site(answers: unknown[], props: { transport?: "FOLDER" | "FHIR"; folderRequests?: boolean } = { transport: "FOLDER", folderRequests: true }) {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url)
    const body = answers.length > 1 ? answers.shift() : answers[0]
    return { status: 200, ok: true, json: async () => body }
  }))
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EhrImportOffer caseId="c1" identifier="42" available current={{}} labelFor={field => field} onApply={vi.fn()} {...props} />
    </NextIntlClientProvider>,
  )
  return urls
}
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("a watched-folder site that asks the hospital system", () => {
  it("asks on the lookup, says so, and offers what arrives at a later check", async () => {
    vi.useFakeTimers()
    const urls = site([REQUESTED, OFFER])
    await settle()
    expect(screen.getByText(messages.ehr.requested)).toBeTruthy()
    expect(urls[0]).toContain("request=1")

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(urls[1]).toContain(`requestId=${"a".repeat(32)}`)
    expect(urls[1]).not.toContain("request=1")
    // A pre-ticked value opens the review at once.
    expect(screen.queryByText(messages.ehr.requested)).toBeNull()
    expect(screen.getByText(/weightKg/)).toBeTruthy()
  })

  it("stops after five minutes and says the hospital system has not answered", async () => {
    vi.useFakeTimers()
    const urls = site([REQUESTED])
    await settle()
    // One check at a time: each re-render arms the next timer.
    for (let check = 0; check < 21; check++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    }
    expect(urls.length).toBe(21)
    expect(screen.getByText(messages.ehr.notAnswered)).toBeTruthy()
    const checks = urls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(urls.length).toBe(checks)
    // Asking again is the clinician's choice.
    expect(screen.getByText(messages.ehr.fetchPatientAgain)).toBeTruthy()
  })

  it("says the hospital holds nothing when it answered so", async () => {
    vi.useFakeTimers()
    site([REQUESTED, { pending: false }])
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(screen.getByText(messages.ehr.nothingHeld)).toBeTruthy()
  })
})

describe("a site that does not ask", () => {
  it("never asks, never waits, and offers no fetch button on a plain folder", async () => {
    vi.useFakeTimers()
    const urls = site([{ pending: false }], { transport: "FOLDER", folderRequests: false })
    await settle()
    expect(urls[0]).not.toContain("request=1")
    expect(screen.queryByText(messages.ehr.fetchPatientAgain)).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(urls.length).toBe(1)
  })

  it("keeps the FHIR button and never sends a folder request", async () => {
    const urls = site([{ pending: false }], { transport: "FHIR" })
    expect(await screen.findByText(messages.ehr.fetchPatientAgain)).toBeTruthy()
    expect(urls[0]).not.toContain("request=1")
  })
})
