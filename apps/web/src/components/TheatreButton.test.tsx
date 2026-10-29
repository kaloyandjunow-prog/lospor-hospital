// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "../../messages/en.json"
import { TheatreButton } from "./TheatreButton"

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

const respond = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)
const THEATRES = [{ id: "t1", name: "Theatre 1" }, { id: "t2", name: "Theatre 2" }]

function renderButton(theatre: { id: string | null; name: string | null; changeable: boolean }) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TheatreButton caseId="case-1" theatre={theatre} theatres={THEATRES} />
    </NextIntlClientProvider>,
  )
}
const menu = () => screen.getByTestId("theatre-menu")

describe("a case's operating theatre on the dashboard (10.0.0)", () => {
  it("assigns a theatre, saying which one the row showed", async () => {
    renderButton({ id: null, name: null, changeable: true })
    expect(screen.getByTestId("theatre-button").textContent).toContain(enMessages.theatre.assign)
    fireEvent.click(screen.getByTestId("theatre-button"))
    // Nothing to clear while none is assigned.
    expect(within(menu()).queryByRole("button", { name: enMessages.theatre.none })).toBeNull()
    fetchMock.mockReturnValue(respond(200, { theatreId: "t2" }))
    await act(async () => { fireEvent.click(within(menu()).getByRole("button", { name: "Theatre 2" })) })
    expect(fetchMock).toHaveBeenCalledWith("/api/cases/case-1/theatre", expect.objectContaining({ method: "POST" }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ theatreId: "t2", expectedTheatreId: null })
    expect(screen.getByTestId("theatre-button").textContent).toContain("Theatre 2")
    expect(screen.queryByTestId("theatre-menu")).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it("clears an assigned theatre", async () => {
    renderButton({ id: "t1", name: "Theatre 1", changeable: true })
    fireEvent.click(screen.getByTestId("theatre-button"))
    fetchMock.mockReturnValue(respond(200, { theatreId: null }))
    await act(async () => { fireEvent.click(within(menu()).getByRole("button", { name: enMessages.theatre.none })) })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ theatreId: null, expectedTheatreId: "t1" })
    expect(screen.getByTestId("theatre-button").textContent).toContain(enMessages.theatre.assign)
  })

  it("when someone changed it meanwhile, shows what the case has now and who changed it, and keeps the menu open", async () => {
    renderButton({ id: null, name: null, changeable: true })
    fireEvent.click(screen.getByTestId("theatre-button"))
    fetchMock.mockReturnValue(respond(409, { error: "THEATRE_CHANGED", code: "THEATRE_CHANGED", current: { id: "t1", name: "Theatre 1" }, changedBy: "Dr Head" }))
    await act(async () => { fireEvent.click(within(menu()).getByRole("button", { name: "Theatre 2" })) })
    expect(within(menu()).getByText("Changed meanwhile to Theatre 1 by Dr Head. Choose again.")).toBeTruthy()
    expect(screen.getByTestId("theatre-button").textContent).toContain("Theatre 1")
    expect(refresh).toHaveBeenCalled()
    // The next choice is made against what the case has now.
    fetchMock.mockReturnValue(respond(200, { theatreId: "t2" }))
    await act(async () => { fireEvent.click(within(menu()).getByRole("button", { name: "Theatre 2" })) })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ theatreId: "t2", expectedTheatreId: "t1" })
  })

  it("names no one when the server does not know who changed it", async () => {
    renderButton({ id: null, name: null, changeable: true })
    fireEvent.click(screen.getByTestId("theatre-button"))
    fetchMock.mockReturnValue(respond(409, { error: "THEATRE_CHANGED", current: null, changedBy: null }))
    await act(async () => { fireEvent.click(within(menu()).getByRole("button", { name: "Theatre 1" })) })
    expect(within(menu()).getByText(`Changed meanwhile to ${enMessages.theatre.none}. Choose again.`)).toBeTruthy()
  })

  it("once intraop has started, shows the theatre and offers no change", () => {
    renderButton({ id: "t1", name: "Theatre 1", changeable: false })
    expect(screen.queryByTestId("theatre-button")).toBeNull()
    expect(screen.getByText("Theatre 1").closest("span")?.getAttribute("title")).toBe(enMessages.theatre.locked)
  })

  it("shows nothing for a started case without a theatre", () => {
    const { container } = renderButton({ id: null, name: null, changeable: false })
    expect(container.textContent).toBe("")
  })
})
