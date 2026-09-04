// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"

import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan } from "@lospor/core/ehr-import-review"
import { EhrImportOffer } from "./EhrImportOffer"

import messages from "../../messages/en.json"

/**
 * The offer is opened from two places that ask different questions: the preop
 * form asks about the whole record, the intraoperative labs sheet asks about
 * laboratory results only. Proposing a diagnosis inside a labs sheet answers a
 * question nobody asked.
 */

const HB = "Haemoglobin (Hb)"

const plan = buildEhrReviewPlan({
  canonical: normalizeEhrImport({
    identifierType: "IZ",
    identifier: "42",
    fields: {
      labResults: [{ test: HB, value: "89", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" }],
      diagnoses: [{ label: "Hypertension", code: "I10" }],
    },
  }).canonical,
  current: {},
})

function offer(onlyFields?: readonly string[]) {
  // The lookup is stubbed: this is about what the plan renders, not the fetch.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      pending: true, importId: "i1", maskedIdentifier: "4*", receivedAt: "", plan,
    }),
  })))
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EhrImportOffer
        caseId="c1"
        identifier="42"
        available
        current={{}}
        labelFor={field => field}
        onApply={vi.fn()}
        onlyFields={onlyFields}
      />
    </NextIntlClientProvider>,
  )
}

describe("scoping the offer to one surface's question", () => {
  it("shows every field when nothing is scoped", async () => {
    offer()
    expect(await screen.findByText(/Hypertension/)).toBeTruthy()
  })

  it("leaves out the fields this surface did not ask about", async () => {
    const { container } = offer(["labResults"])
    // Waits for the lookup to resolve, then reads the whole panel: the row
    // splits test, value and unit across elements, so a text matcher would be
    // asserting the markup rather than the content.
    expect(await screen.findByText(/Nothing here is in the record yet/)).toBeTruthy()
    expect(container.textContent).toContain(HB)
    expect(container.textContent).not.toContain("Hypertension")
  })
})
