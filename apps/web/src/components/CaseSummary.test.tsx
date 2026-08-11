// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CaseDetail } from "@/types/case-detail"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import { CaseSummary } from "./CaseSummary"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

// The chart itself is not what these tests are about, and it is the one part of
// the sheet that needs real geometry. `naturalMaxCols` is mocked per-test so a
// case can be made long enough to spill onto a continuation sheet.
const naturalMaxCols = vi.fn(() => 12)
vi.mock("@/components/case-summary/PrintTimetable", () => ({
  PrintTimetable: () => <div data-testid="print-timetable" />,
  calcDrugTotals: () => [],
  calcInfTotals: () => [],
  buildDrugLog: () => [],
  naturalMaxCols: (...args: unknown[]) => naturalMaxCols(...(args as [])),
}))

function caseFixture(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: "case-1",
    caseCode: "AB-1234",
    notes: null,
    userId: "user-1",
    institutionId: "inst-1",
    status: "IN_PROGRESS",
    clinicalMode: "ADULT",
    finalizedAt: null,
    createdAt: "2026-08-01T06:00:00.000Z",
    updatedAt: "2026-08-01T06:00:00.000Z",
    institution: { name: "Test Hospital", city: "Sofia" },
    preop: {
      ageYears: 42,
      sex: "FEMALE",
      heightCm: 165,
      weightKg: 60,
      asaScore: "II",
    } as unknown as CaseDetail["preop"],
    intraop: {
      startTime: "2000-01-01T08:00:00.000Z",
      endTime: "2000-01-01T09:00:00.000Z",
      monthYear: "2026-08",
      keyEvents: { vitals: {} },
    } as unknown as CaseDetail["intraop"],
    postop: {
      aldreteTotal: null,
      aldreteActivity: null,
      aldreteRespiration: null,
      aldreteCirculation: null,
      aldreteConsciousness: null,
      aldreteSpO2: null,
      disposition: "WARD",
    } as unknown as CaseDetail["postop"],
    ...overrides,
  }
}

function aldreteTile(): HTMLElement {
  return screen.getByText("Aldrete total").closest("div") as HTMLElement
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  naturalMaxCols.mockReturnValue(12)
})

describe("CaseSummary — Aldrete banding", () => {
  it("does not band an unscored recovery as a danger score", () => {
    render(<CaseSummary caseId="case-1" initialData={caseFixture()} />)

    const tile = aldreteTile()
    expect(within(tile).getByText("— / 10")).toBeTruthy()
    // A patient nobody has scored yet is not a 0/10 emergency.
    expect(tile.className).not.toMatch(/red/)
    expect(within(tile).queryByText("Continue")).toBeNull()
  })

  it("still bands a genuinely low score as not ready", () => {
    render(<CaseSummary caseId="case-1" initialData={caseFixture({
      postop: { aldreteTotal: 4, disposition: "PACU" } as unknown as CaseDetail["postop"],
    })} />)

    const tile = aldreteTile()
    expect(within(tile).getByText("4 / 10")).toBeTruthy()
    expect(tile.className).toMatch(/red/)
    expect(within(tile).getByText("Continue")).toBeTruthy()
  })

  it("bands a full score as ready for discharge", () => {
    render(<CaseSummary caseId="case-1" initialData={caseFixture({
      postop: { aldreteTotal: 10, disposition: "WARD" } as unknown as CaseDetail["postop"],
    })} />)

    const tile = aldreteTile()
    expect(tile.className).toMatch(/green/)
    expect(within(tile).getByText("Ready for discharge")).toBeTruthy()
  })
})

describe("CaseSummary — neonatal age", () => {
  it("prints an age of 0 years on the continuation sheet header", () => {
    // 400 columns ≈ 33 h — three panels, so a continuation sheet exists and
    // renders the compact patient line.
    naturalMaxCols.mockReturnValue(400)
    render(<CaseSummary caseId="case-1" initialData={caseFixture({
      preop: { ageYears: 0, sex: "MALE" } as unknown as CaseDetail["preop"],
    })} />)

    // Control: the continuation sheet really is on the page.
    expect(screen.getByText(/identity fields on Sheet 1/)).toBeTruthy()
    expect(screen.getByText(/0y · M/)).toBeTruthy()
  })
})

describe("CaseSummary — undo window", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it("hides Unfinalize once the window expires while the page stays open", async () => {
    const finalizedAt = new Date(Date.now() - FINALIZE_UNDO_WINDOW_MS + 5_000).toISOString()
    render(<CaseSummary caseId="case-1" initialData={caseFixture({
      status: "COMPLETE",
      finalizedAt,
    })} />)

    expect(screen.getByText("Unfinalize")).toBeTruthy()

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

    expect(screen.queryByText("Unfinalize")).toBeNull()
  })
})

describe("CaseSummary — failures reach the user", () => {
  it("shows the load-failed message when the case cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))))

    render(<CaseSummary caseId="case-1" />)

    await waitFor(() => expect(screen.getByText("Failed to load case data.")).toBeTruthy())
  })

  it("shows the load-failed message when the case request errors", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "boom" }),
    })))

    render(<CaseSummary caseId="case-1" />)

    await waitFor(() => expect(screen.getByText("Failed to load case data.")).toBeTruthy())
  })

  it("tells the user when unfinalize is refused", async () => {
    const alerted = vi.fn()
    vi.stubGlobal("alert", alerted)
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "window closed" }),
    })))

    render(<CaseSummary caseId="case-1" initialData={caseFixture({
      status: "COMPLETE",
      finalizedAt: new Date().toISOString(),
    })} />)

    screen.getByText("Unfinalize").click()

    await waitFor(() => expect(alerted).toHaveBeenCalled())
  })

  it("tells the user when the unfinalize request never lands", async () => {
    const alerted = vi.fn()
    vi.stubGlobal("alert", alerted)
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))))

    render(<CaseSummary caseId="case-1" initialData={caseFixture({
      status: "COMPLETE",
      finalizedAt: new Date().toISOString(),
    })} />)

    screen.getByText("Unfinalize").click()

    await waitFor(() => expect(alerted).toHaveBeenCalled())
  })
})
