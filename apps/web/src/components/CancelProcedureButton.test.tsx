// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "../../messages/en.json"
import { CancelProcedureButton, UndoCancellationButton } from "./CancelProcedureButton"

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  refresh.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

const respond = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

/** Inside a dashboard row, which is itself a link: the buttons must not reach it. */
function inRow(ui: React.ReactNode) {
  const rowClick = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div data-testid="row" onClick={() => rowClick()}>{ui}</div>
    </NextIntlClientProvider>,
  )
  return rowClick
}

describe("Procedure cancelled (10.0.0)", () => {
  it("asks for a reason, and for a note when the reason is Other", async () => {
    inRow(<CancelProcedureButton caseId="case-1" />)
    fireEvent.click(screen.getByTestId("cancel-procedure"))
    const confirm = screen.getByTestId("cancel-confirm") as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText("Other"))
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Surgeon unwell" } })
    expect(confirm.disabled).toBe(false)

    fetchMock.mockReturnValue(respond(200, { status: "CANCELLED" }))
    await act(async () => { fireEvent.click(confirm) })
    expect(fetchMock).toHaveBeenCalledWith("/api/cases/case-1/cancel", expect.objectContaining({ method: "POST" }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: "OTHER", note: "Surgeon unwell" })
    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByTestId("cancel-dialog")).toBeNull()
  })

  it("sends a listed reason without a note, and says so when anaesthesia has meanwhile started", async () => {
    inRow(<CancelProcedureButton caseId="case-1" />)
    fireEvent.click(screen.getByTestId("cancel-procedure"))
    fireEvent.click(screen.getByLabelText("No theatre time or staff"))
    fetchMock.mockReturnValue(respond(409, { error: "CANCELLATION_TOO_LATE", code: "CANCELLATION_TOO_LATE" }))
    await act(async () => { fireEvent.click(screen.getByTestId("cancel-confirm")) })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: "NO_THEATRE_TIME_OR_STAFF" })
    expect(screen.getByText(enMessages.cancellation.tooLate)).toBeTruthy()
    expect(screen.getByTestId("cancel-dialog")).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("does not open the case its row links to", () => {
    const rowClick = inRow(<CancelProcedureButton caseId="case-1" />)
    fireEvent.click(screen.getByTestId("cancel-procedure"))
    expect(rowClick).not.toHaveBeenCalled()
  })

  it("stays in place once anaesthesia has started, visibly inactive and saying why, and does nothing", () => {
    const rowClick = inRow(<CancelProcedureButton caseId="case-1" inactive />)
    const button = screen.getByTestId("cancel-procedure")
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.getAttribute("title")).toBe(enMessages.cancellation.tooLate)
    expect(button.className).toMatch(/cursor-not-allowed/)
    fireEvent.click(button)
    expect(screen.queryByTestId("cancel-dialog")).toBeNull()
    expect(rowClick).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("Undo cancellation (10.0.0)", () => {
  it("asks once more, then undoes it", async () => {
    const rowClick = inRow(<UndoCancellationButton caseId="case-1" />)
    const button = screen.getByTestId("undo-cancellation")
    fireEvent.click(button)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(button.textContent).toContain(enMessages.cancellation.undoConfirm)
    fetchMock.mockReturnValue(respond(200, { status: "DRAFT" }))
    await act(async () => { fireEvent.click(button) })
    expect(fetchMock).toHaveBeenCalledWith("/api/cases/case-1/cancel", { method: "DELETE" })
    expect(refresh).toHaveBeenCalled()
    expect(rowClick).not.toHaveBeenCalled()
  })

  it("forgets the first press after a few seconds", () => {
    vi.useFakeTimers()
    inRow(<UndoCancellationButton caseId="case-1" />)
    const button = screen.getByTestId("undo-cancellation")
    fireEvent.click(button)
    act(() => { vi.advanceTimersByTime(3_500) })
    expect(button.textContent).toContain(enMessages.cancellation.undo)
    expect(button.textContent).not.toContain(enMessages.cancellation.undoConfirm)
    vi.useRealTimers()
  })
})
