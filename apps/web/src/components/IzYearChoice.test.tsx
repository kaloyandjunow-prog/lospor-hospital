// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IzYearChoice } from "./IzYearChoice"
import { izYearChoiceOpen, izYearHint } from "@/lib/iz-year"

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const answer = (body: unknown) => fetchMock.mockResolvedValue({ ok: true, json: async () => body })

async function settle() {
  await act(async () => { vi.advanceTimersByTime(450) })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

describe("when the year is asked", () => {
  it("is the first 60 days in Sofia", () => {
    expect(izYearChoiceOpen(new Date("2027-01-20T08:00:00Z"))).toBe(true)
    expect(izYearChoiceOpen(new Date("2026-12-31T22:30:00Z"))).toBe(true) // 00:30 on 1 January in Sofia
    expect(izYearChoiceOpen(new Date("2027-03-02T10:00:00Z"))).toBe(false)
  })
})

describe("the ИЗ № year choice", () => {
  it("pre-sets last year when the API suggests it, and says why", async () => {
    vi.setSystemTime(new Date("2027-01-20T08:00:00Z"))
    answer({ open: true, years: [2027, 2026], suggestedYear: 2026, reason: "high-number" })
    const onChange = vi.fn()
    render(<IzYearChoice number="43233" value={undefined} onChange={onChange} locale="bg" />)
    expect(onChange).toHaveBeenLastCalledWith(2027) // until the answer arrives
    await settle()
    expect(fetchMock).toHaveBeenCalledWith("/api/hospital/iz-year?number=43233", expect.anything())
    expect(onChange).toHaveBeenLastCalledWith(2026)
    expect(screen.getByText(izYearHint({ reason: "high-number", suggestedYear: 2026 }, "bg"))).toBeTruthy()
  })

  it("keeps the clinician's pick when the answer arrives later", async () => {
    vi.setSystemTime(new Date("2027-01-20T08:00:00Z"))
    answer({ open: true, years: [2027, 2026], suggestedYear: 2026, reason: "high-number" })
    const onChange = vi.fn()
    render(<IzYearChoice number="43233" value={2027} onChange={onChange} locale="en" />)
    fireEvent.click(screen.getByTestId("iz-year-2027"))
    await settle()
    expect(onChange).toHaveBeenLastCalledWith(2027)
  })

  it("is not shown, and asks nothing, after the 60 days", () => {
    vi.setSystemTime(new Date("2027-05-10T08:00:00Z"))
    const onChange = vi.fn()
    render(<IzYearChoice number="43233" value={undefined} onChange={onChange} locale="bg" />)
    expect(screen.queryByTestId("iz-year-choice")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it("follows the server when it says the choice is closed", async () => {
    vi.setSystemTime(new Date("2027-03-01T21:00:00Z"))
    answer({ open: false, years: [2027], suggestedYear: 2027, reason: null })
    const onChange = vi.fn()
    render(<IzYearChoice number="120" value={undefined} onChange={onChange} locale="bg" />)
    await settle()
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(screen.queryByTestId("iz-year-choice")).toBeNull()
  })

  it("stays offered in a correction after the 60 days, without a suggestion", () => {
    vi.setSystemTime(new Date("2027-05-10T08:00:00Z"))
    render(<IzYearChoice anyTime number="43233" value={undefined} onChange={vi.fn()} locale="bg" />)
    expect(screen.getByTestId("iz-year-2027")).toBeTruthy()
    expect(screen.getByTestId("iz-year-2026")).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("defaults to this year when the API cannot be reached", async () => {
    vi.setSystemTime(new Date("2027-01-20T08:00:00Z"))
    fetchMock.mockRejectedValue(new Error("offline"))
    const onChange = vi.fn()
    render(<IzYearChoice number="43233" value={undefined} onChange={onChange} locale="bg" />)
    await settle()
    expect(onChange).toHaveBeenLastCalledWith(2027)
    expect(screen.getByTestId("iz-year-choice")).toBeTruthy()
  })
})
