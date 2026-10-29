// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  aggregateIndicators,
  DEFAULT_INDICATOR_CONFIG,
  summarizeCaseIndicators,
  type CaseIndicatorInput,
  type IndicatorRow,
} from "@lospor/core/indicators"
import enMessages from "../../../messages/en.json"
import { IndicatorsScreen } from "./IndicatorsScreen"

// Charts measure their container, which jsdom does not lay out.
vi.mock("recharts", async importOriginal => {
  const actual = await importOriginal<typeof import("recharts")>()
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div> }
})

const START = Date.parse("2026-01-05T08:00:00Z")
const empty = { vitals: [], drugs: [], fluids: [], agents: [], infusions: [], gasSettings: [] }

function row(index: number, overrides: Partial<CaseIndicatorInput> = {}, rowOverrides: Partial<IndicatorRow> = {}): IndicatorRow {
  const startedAt = new Date(START + index * 7 * 86_400_000)
  const input: CaseIndicatorInput = {
    status: "COMPLETE", clinicalMode: "ADULT", startedAt, endedAt: new Date(startedAt.getTime() + 60 * 60_000), timezone: "Europe/Sofia",
    finalizedAt: new Date(startedAt.getTime() + 2 * 3600_000), autoEndedAt: null, ageDays: 50 * 365, sex: "MALE", weightKg: 80, heightCm: 180,
    asa: "II", apfel: 2, procedure: "Cholecystectomy", techniques: ["GENERAL_BALANCED"], airwayDevice: null, airwayTools: [], cormackLehane: null,
    complications: [], postop: { painNRS: 2, flaccTotal: null, nipsTotal: null, fpsrScore: null, ponv: false, paedScore: null, aldreteTotal: 9, stewardTotal: null, temperature: 36.5, disposition: "WARD" },
    timetable: empty, missing: [], ...overrides,
  }
  return { ...summarizeCaseIndicators(input, DEFAULT_INDICATOR_CONFIG), caseId: `c${index}`, theatreId: "t1", theatreName: "Theatre 1", assigneeId: "me", ...rowOverrides }
}

function response(rows: IndicatorRow[], extra: { cancellations?: string[]; pending?: number } = {}) {
  return {
    period: { from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z" },
    pending: extra.pending ?? 0,
    config: DEFAULT_INDICATOR_CONFIG,
    filters: { theatres: [{ id: "t1", name: "Theatre 1" }, { id: "t2", name: "Theatre 2" }], anaesthesiologists: [{ id: "me", name: "Dr Me" }], procedures: ["Cholecystectomy", "Hernia repair"] },
    report: aggregateIndicators(rows, { config: DEFAULT_INDICATOR_CONFIG, viewerId: "me", names: { me: "Dr Me" }, cancellations: extra.cancellations }),
  }
}

const fetchMock = vi.fn()
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function renderScreen() {
  return render(<NextIntlClientProvider locale="en" messages={enMessages}><IndicatorsScreen /></NextIntlClientProvider>)
}
const ind = enMessages.indicators

describe("the unit indicators screen (10.0.0)", () => {
  it("shows the department's figures under the screen's name, with what a spread means", async () => {
    fetchMock.mockReturnValue(ok(response(Array.from({ length: 6 }, (_, index) => row(index)))))
    renderScreen()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unit indicators")
    await waitFor(() => expect(screen.getByTestId("indicators-cases").textContent).toBe("6 cases"))
    expect(screen.getByText(ind.spreadLegend)).toBeTruthy()
    // The last 90 days, by default.
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/api\/indicators\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/)
    for (const section of ["activity", "time", "case-mix", "airway", "drugs", "environment", "fluids", "events", "recovery", "documentation"]) {
      expect(screen.getByTestId(`indicators-${section}`)).toBeTruthy()
    }
  })

  it("charts weeks for a short period and months past half a year", async () => {
    fetchMock.mockReturnValue(ok(response(Array.from({ length: 6 }, (_, index) => row(index)))))
    const { unmount } = renderScreen()
    await waitFor(() => expect(screen.getByText(ind.byWeek)).toBeTruthy())
    expect(screen.queryByText(ind.byMonth)).toBeNull()
    unmount()
    fetchMock.mockReturnValue(ok(response(Array.from({ length: 30 }, (_, index) => row(index)))))
    renderScreen()
    await waitFor(() => expect(screen.getByText(ind.byMonth)).toBeTruthy())
    expect(screen.queryByText(ind.byWeek)).toBeNull()
  })

  it("gives Aldrete and Steward each on its own scale, never one pooled score", async () => {
    const adults = Array.from({ length: 5 }, (_, index) => row(index))
    const children = Array.from({ length: 5 }, (_, index) => row(index + 5, {
      clinicalMode: "PEDIATRIC", ageDays: 5 * 365,
      postop: { painNRS: null, flaccTotal: 2, nipsTotal: null, fpsrScore: null, ponv: false, paedScore: 4, aldreteTotal: null, stewardTotal: 5, temperature: 36.6, disposition: "WARD" },
    }))
    fetchMock.mockReturnValue(ok(response([...adults, ...children])))
    renderScreen()
    await waitFor(() => expect(screen.getByText(/Aldrete \(0–10\): 9/)).toBeTruthy())
    expect(screen.getByText(/Steward \(0–6\): 5/)).toBeTruthy()
  })

  it("shows <5 for anything resting on fewer than five cases", async () => {
    fetchMock.mockReturnValue(ok(response(Array.from({ length: 3 }, (_, index) => row(index)))))
    renderScreen()
    await waitFor(() => expect(screen.getByTestId("indicators-cases").textContent).toBe("3 cases"))
    expect(screen.getAllByText(ind.fewer).length).toBeGreaterThan(5)
  })

  it("counts procedures cancelled before anaesthesia, with their reasons", async () => {
    fetchMock.mockReturnValue(ok(response(Array.from({ length: 8 }, (_, index) => row(index)), { cancellations: ["NO_THEATRE_TIME_OR_STAFF", "NO_THEATRE_TIME_OR_STAFF"] })))
    renderScreen()
    await waitFor(() => expect(screen.getByText(ind.cancelled)).toBeTruthy())
    // 2 of 10 scheduled.
    expect(screen.getByText("20 % (2/10)")).toBeTruthy()
    expect(screen.getByText("No theatre time or staff")).toBeTruthy()
  })

  it("asks again with a filter, keeps the filter's choices, and clears it", async () => {
    fetchMock.mockImplementation(() => ok(response(Array.from({ length: 6 }, (_, index) => row(index)))))
    renderScreen()
    const theatre = await screen.findByRole("combobox", { name: ind.theatre })
    fireEvent.change(theatre, { target: { value: "t2" } })
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("theatre=t2"))
    expect(screen.getByRole("option", { name: "Theatre 1" })).toBeTruthy()
    fireEvent.click(screen.getByText(ind.clear))
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).not.toContain("theatre="))
  })

  it("says so when the figures cannot be loaded", async () => {
    fetchMock.mockReturnValue(Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response))
    renderScreen()
    await waitFor(() => expect(screen.getByText(ind.failed)).toBeTruthy())
  })

  it("asks again while cases are still being worked out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockReturnValueOnce(ok(response(Array.from({ length: 6 }, (_, index) => row(index)), { pending: 4 })))
    fetchMock.mockReturnValue(ok(response(Array.from({ length: 6 }, (_, index) => row(index)))))
    renderScreen()
    await waitFor(() => expect(screen.getByText(/4 cases are still being worked out/)).toBeTruthy())
    await act(async () => { vi.advanceTimersByTime(1_600) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/still being worked out/)).toBeNull())
  })
})
