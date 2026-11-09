// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CaseDetail } from "@/types/case-detail"
import { RecordSheets } from "./RecordSheets"

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }))
vi.mock("@/components/case-summary/print-infusion-totals", () => ({ calcInfTotals: () => [], useInfusionWeightBasis: () => ({}) }))

afterEach(cleanup)

const log = [
  { id: "e1", ts: "2026-11-07T08:05:00.000Z", type: "clinical_event", label: "Induction" },
  { id: "d1", ts: "2026-11-07T08:10:00.000Z", type: "drug", name: "Ephedrine", dose: "10", unit: "mg", suggestion: "card:Hypotension:ephedrine" },
  { id: "c1", ts: "2026-11-07T08:08:00.000Z", endTs: "2026-11-07T08:20:00.000Z", type: "complication", label: "Hypotension" },
]
const deletedEvents = [{ id: "x1", ts: "2026-11-07T08:12:00.000Z", type: "drug", name: "Fentanyl", dose: "1000", unit: "mcg", deletedAt: "2026-11-07T08:13:00.000Z" }]

function fixture(over: Record<string, unknown> = {}, locale = "en"): { data: CaseDetail; locale: string } {
  const data = {
    id: "case-1", caseCode: "2026-0001", status: "COMPLETE",
    institution: { name: "Sofia University Hospital", city: "Sofia" },
    preop: { ageYears: 58, sex: "MALE", heightCm: 176, weightKg: 88, asaScore: "III", plannedProcedure: "Whipple" },
    intraop: { startedAt: "2026-11-07T08:00:00.000Z", timezone: "UTC", startTime: null, keyEvents: { vitals: [{ systolic: 120, diastolic: 70, heartRate: 70, spO2: 99 }], drugs: [], log }, labResults: [] },
    postop: null,
    deletedEvents,
    ...over,
  } as unknown as CaseDetail
  return { data, locale }
}

describe("the anaesthesia record", () => {
  it("is titled with the hospital, not the product, and has the three kinds of page in order", () => {
    const { data, locale } = fixture()
    render(<RecordSheets data={data} locale={locale} />)
    const first = screen.getByTestId("record-page-1")
    expect(within(first).getByText("Sofia University Hospital")).toBeTruthy()
    expect(within(first).getByText("Anaesthesia record")).toBeTruthy()
    expect(screen.queryByText("LOSPOR")).toBeNull()
    const pages = screen.getAllByTestId(/^record-page-/).map(el => el.getAttribute("data-testid"))
    expect(pages).toEqual(["record-page-1", "record-page-timetable", "record-page-end"])
  })

  it("puts the event log, then the vitals, on the first page, deleted entries struck through", () => {
    const { data, locale } = fixture()
    render(<RecordSheets data={data} locale={locale} />)
    const first = screen.getByTestId("record-page-1")
    const logTable = within(first).getByTestId("record-event-log")
    const rows = [...logTable.querySelectorAll("tbody tr")]
    expect(rows).toHaveLength(4)
    const gone = rows.filter(row => row.getAttribute("data-deleted") === "true")
    expect(gone).toHaveLength(1)
    expect(gone[0]!.textContent).toContain("Fentanyl")
    expect(gone[0]!.textContent).toContain("Deleted 08:13")
    expect(within(first).getByTestId("record-vitals")).toBeTruthy()
    expect(logTable.compareDocumentPosition(within(first).getByTestId("record-vitals")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("names the treatment card, in time order, and gives the episode what was given during it", () => {
    const { data, locale } = fixture()
    render(<RecordSheets data={data} locale={locale} />)
    expect(screen.getByTestId("record-event-log").textContent).toContain("★ Hypotension")
    const episode = screen.getByTestId("record-episode")
    expect(episode.textContent).toContain("Hypotension")
    expect(episode.textContent).toContain("Ephedrine")
  })

  it("keeps the patient's name and ID for the end, with the signatures, and says nothing of hand-writing", () => {
    const { data, locale } = fixture()
    render(<RecordSheets data={data} locale={locale} />)
    const end = screen.getByTestId("record-page-end")
    expect(within(end).getByText("Patient name")).toBeTruthy()
    expect(within(end).getByText("ID / File №")).toBeTruthy()
    expect(within(end).getByText(/Anaesthesiologist — name & signature/)).toBeTruthy()
    expect(within(screen.getByTestId("record-page-1")).queryByText("Patient name")).toBeNull()
    expect(document.body.textContent).not.toMatch(/hand-written/i)
  })

  it("leaves out the Investigations box when nothing was drawn, and keeps findings only for allergies", () => {
    const { data, locale } = fixture()
    render(<RecordSheets data={data} locale={locale} />)
    expect(screen.queryByText(/investigations/i)).toBeNull()
  })

  it("survives a case with no timetable, no log and no institution", () => {
    const { data, locale } = fixture({ institution: null, deletedEvents: undefined, intraop: { keyEvents: {} } })
    render(<RecordSheets data={data} locale={locale} />)
    expect(screen.getByTestId("record-sheets")).toBeTruthy()
    expect(within(screen.getByTestId("record-page-1")).getByText("LOSPOR")).toBeTruthy()
  })
})
