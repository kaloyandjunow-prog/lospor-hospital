// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CaseDetail } from "@/types/case-detail"
import { PrintPageClient } from "./PrintPageClient"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))
vi.mock("@/components/CaseSummary", () => ({
  CaseSummary: () => <div>Printable record body</div>,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("PrintPageClient", () => {
  it("offers browser printing without promising a server-generated PDF", () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)

    render(
      <PrintPageClient
        caseId="case-1"
        initialData={{ id: "case-1" } as CaseDetail}
      />,
    )

    const action = screen.getByRole("button", { name: "Print / Save as PDF" })
    expect(screen.queryByText("Download PDF")).toBeNull()
    expect(document.querySelector('a[href*="/pdf"]')).toBeNull()
    expect(screen.getByText(/does not generate or download a PDF on the server/)).toBeTruthy()

    fireEvent.click(action)
    expect(print).toHaveBeenCalledOnce()
  })
})
