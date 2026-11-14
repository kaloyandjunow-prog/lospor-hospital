// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"

import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan } from "@lospor/core/ehr-import-review"
import { EhrImportOffer, LOOKUP_PAUSE_MS } from "./EhrImportOffer"

import messages from "../../messages/en.json"

const plan = buildEhrReviewPlan({
  canonical: normalizeEhrImport({ identifierType: "IZ", identifier: "71001", fields: { weightKg: 72 } }).canonical,
  current: {},
})
const OFFER = { pending: true, importId: "i1", maskedIdentifier: "7*", receivedAt: "", plan }

function stubFetch() {
  const urls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(String(url))
    return { status: 200, ok: true, json: async () => (String(url).includes("/ehr-import?") || String(url).includes("/ehr-import/lookup") ? OFFER : {}) }
  }))
  return urls
}
const offer = (identifier: string, onApply = vi.fn()) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <EhrImportOffer caseId="c1" identifier={identifier} transport="FHIR" available current={{}} labelFor={field => field} onApply={onApply} />
  </NextIntlClientProvider>
)

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("looking a patient up while the number is typed", () => {
  it("asks once typing pauses, not on every keystroke", async () => {
    vi.useFakeTimers()
    const urls = stubFetch()
    const view = render(offer("7"))
    for (const typed of ["71", "710", "7100", "71001"]) {
      view.rerender(offer(typed))
      await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    }
    expect(urls).toHaveLength(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(LOOKUP_PAUSE_MS) })
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain("identifier=71001")
  })
})

// Found on the appliance (2026-11-14): accepted values that were then deleted
// never came back when the clinician asked again.
describe("asking again after accepting", () => {
  it("offers an accepted value again and asks the appliance for a fresh copy", async () => {
    vi.useFakeTimers()
    const urls = stubFetch()
    render(offer("71001"))
    await act(async () => { await vi.advanceTimersByTimeAsync(LOOKUP_PAUSE_MS) })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Add selected/ })) })
    expect(screen.queryByText(/weightKg/)).toBeNull()

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: messages.ehr.fetchPatientAgain })) })
    expect(urls.at(-1)).toContain("again=1")
    expect(screen.getByText(/weightKg/)).toBeTruthy()
  })

  it("can ask again while an earlier offer still waits", async () => {
    vi.useFakeTimers()
    stubFetch()
    render(offer("71001"))
    await act(async () => { await vi.advanceTimersByTimeAsync(LOOKUP_PAUSE_MS) })
    // Closed without deciding: the offer waits behind "Review".
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "×" })) })
    expect(screen.getByRole("button", { name: messages.ehr.reviewWaiting })).toBeTruthy()
    expect(screen.getByRole("button", { name: messages.ehr.fetchPatientAgain })).toBeTruthy()
  })
})
