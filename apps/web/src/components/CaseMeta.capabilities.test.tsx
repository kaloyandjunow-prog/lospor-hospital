// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "../../messages/en.json"
import { CaseMeta } from "./CaseMeta"

function renderMeta(props: Partial<Parameters<typeof CaseMeta>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CaseMeta caseId="case-1" caseCode="AB-1234" {...props} />
    </NextIntlClientProvider>,
  )
}

describe("CaseMeta — notes are a write", () => {
  it("saves an edit for the current assignee", () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response))
    vi.stubGlobal("fetch", fetchMock)
    vi.useFakeTimers()

    renderMeta({ canWrite: true })
    fireEvent.click(screen.getByRole("button", { name: /Notes/ }))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "line placed" } })
    vi.advanceTimersByTime(1_000)

    expect(fetchMock).toHaveBeenCalledWith("/api/cases/case-1", expect.objectContaining({ method: "PATCH" }))
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("offers nothing at all when the case is read-only and has no notes", () => {
    renderMeta({ canWrite: false })

    expect(screen.queryByRole("button", { name: /Notes/ })).toBeNull()
    expect(screen.getByText("AB-1234")).toBeTruthy()
  })

  it("still shows existing notes to a creator who handed the case on, unedited", () => {
    renderMeta({ canWrite: false, initialNotes: "handover note" })

    fireEvent.click(screen.getByRole("button", { name: /Notes/ }))
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textarea.value).toBe("handover note")
    expect(textarea.readOnly).toBe(true)
  })

  it("defaults to read-only when no capability is passed", () => {
    renderMeta({ initialNotes: "handover note" })

    fireEvent.click(screen.getByRole("button", { name: /Notes/ }))
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).readOnly).toBe(true)
  })
})

describe("CaseMeta — what the case header names (10.0.0)", () => {
  it("labels a cancelled procedure with its reason", () => {
    renderMeta({ cancelled: { reason: "No theatre time or staff" } })
    expect(screen.getByTestId("case-cancelled").textContent).toBe("Procedure cancelled · No theatre time or staff")
  })

  it("labels it even without a reason, and says nothing on an ordinary case", () => {
    renderMeta({ cancelled: { reason: null } })
    expect(screen.getByTestId("case-cancelled").textContent).toBe("Procedure cancelled")
  })

  it("names the operating theatre when the case has one", () => {
    renderMeta({ theatreName: "Theatre 3" })
    expect(screen.getByText("Theatre 3")).toBeTruthy()
    expect(screen.queryByTestId("case-cancelled")).toBeNull()
  })
})
