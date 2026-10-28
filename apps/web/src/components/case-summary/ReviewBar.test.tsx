// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "../../../messages/en.json"
import { LABELS } from "./labels"
import { ReviewBar } from "./ReviewBar"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

function renderBar(status: "DRAFT" | "IN_PROGRESS" | "COMPLETE" | "CANCELLED", canWrite = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ReviewBar
        caseId="case-1" status={status} canWrite={canWrite} awaitingReviewAt={null}
        finalizedAtMs={status === "COMPLETE" ? Date.now() : null} now={Date.now()} labels={LABELS.en}
        readinessCase={{ clinicalMode: "ADULT", preop: null, intraop: null, postop: null }}
        onFinalized={() => {}} onUnfinalized={() => {}}
      />
    </NextIntlClientProvider>,
  )
}
const editLinks = (container: HTMLElement) => container.querySelectorAll('a[href*="/cases/new?continue=case-1"]')

describe("the status bar above the case summary", () => {
  it("offers edits and closing on an open case", () => {
    const { container } = renderBar("IN_PROGRESS")
    // The three edit links, and the readiness panel's ways to each missing field.
    expect(editLinks(container).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole("button", { name: /Close Now/ })).toBeTruthy()
    expect(container.querySelector('a[href="/cases/case-1/print"]')).toBeNull()
  })

  it("says a cancelled procedure is cancelled, and offers only its printout (10.0.0)", () => {
    const { container } = renderBar("CANCELLED")
    expect(screen.getByText("Procedure cancelled")).toBeTruthy()
    expect(screen.queryByText("Draft")).toBeNull()
    expect(editLinks(container)).toHaveLength(0)
    expect(screen.queryByRole("button", { name: /Close Now/ })).toBeNull()
    expect(container.querySelector('a[href="/cases/case-1/print"]')).toBeTruthy()
  })

  it("prints a finished case too, and edits nothing", () => {
    const { container } = renderBar("COMPLETE")
    expect(editLinks(container)).toHaveLength(0)
    expect(container.querySelector('a[href="/cases/case-1/print"]')).toBeTruthy()
  })
})
