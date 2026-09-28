import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CompareCohorts } from "./compare-cohorts"
import { LocaleProvider } from "./locale-provider"

// The cohort comparison page (coverage review 1.4.13): each side's filters
// reach the API as that side's cohort and no other's, small counts stay
// suppressed on screen, and a failed comparison says so.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const metric = (id: string, left: number | null, right: number | null, extra: Record<string, unknown> = {}) => ({
  id,
  left: { value: left, suppressed: false },
  right: { value: right, suppressed: false },
  absoluteDifference: left != null && right != null ? right - left : null,
  relativeDifferencePercent: null,
  ...extra,
})

function page(locale: "en" | "bg" = "en") {
  return render(<LocaleProvider initialLocale={locale} authenticated={false}><CompareCohorts /></LocaleProvider>)
}

function panels() {
  return screen.getAllByRole("textbox", { name: /cohort|кохорт/i }).map(input => input.closest(".panel") as HTMLElement)
}

describe("comparing two cohorts", () => {
  it("sends each side's own filters as its cohort, finalised cases only", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ leftCount: 12, rightCount: 30, metrics: [] }),
    } as Response)
    const { container } = page()
    const [left, right] = panels()
    const dates = (panel: HTMLElement) => panel.querySelectorAll<HTMLInputElement>('input[type="date"]')
    const selects = (panel: HTMLElement) => panel.querySelectorAll<HTMLSelectElement>("select")

    fireEvent.change(dates(left)[0], { target: { value: "2026-01-01" } })
    fireEvent.change(selects(left)[0], { target: { value: "PEDIATRIC" } })
    fireEvent.change(dates(right)[1], { target: { value: "2026-06-30" } })
    fireEvent.change(selects(right)[1], { target: { value: "true" } })
    fireEvent.change(within(right).getByRole("textbox", { name: /cohort/i }), { target: { value: "Emergencies" } })
    fireEvent.click(screen.getByRole("button", { name: /compare cohorts/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe("/api/research/compare")
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.left).toEqual({ version: 1, filters: { statuses: ["COMPLETE"], finalized: { from: "2026-01-01" }, clinicalModes: ["PEDIATRIC"] } })
    expect(body.right).toEqual({ version: 1, filters: { statuses: ["COMPLETE"], finalized: { to: "2026-06-30" }, emergency: true } })
    expect(body.metrics).toEqual(expect.arrayContaining(["caseCount", "complicationRate", "fieldCompleteness"]))
    // The renamed side heads its column.
    await waitFor(() => expect(container.querySelector("thead")?.textContent).toContain("Emergencies"))
  })

  it("keeps small counts suppressed and says what is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        leftCount: 12,
        rightCount: 30,
        metrics: [
          { ...metric("complicationRate", 12.5, null, { absoluteDifference: null }), left: { value: 12.5, suppressed: false, unit: "percent" }, right: { value: 3, suppressed: true, unit: "percent" } },
          metric("meanAgeYears", 44, 51.25, { relativeDifferencePercent: 16.48 }),
          // No data is not zero: a 0 would read as a result.
          metric("meanPainScore", null, 2),
        ],
      }),
    } as Response)
    const { container } = page()
    fireEvent.click(screen.getByRole("button", { name: /compare cohorts/i }))
    await waitFor(() => expect(container.querySelectorAll("tbody tr")).toHaveLength(3))
    const [rate, age, pain] = Array.from(container.querySelectorAll("tbody tr")).map(row => Array.from(row.querySelectorAll("td")).map(cell => cell.textContent))
    // The suppressed right-hand rate is never shown as its number.
    expect(rate.slice(1)).toEqual(["12.5%", "<5", "—", "—"])
    expect(age.slice(1)).toEqual(["44", "51.3", "7.3", "16.5%"])
    expect(pain.slice(1)).toEqual(["—", "2", "—", "—"])
  })

  it("a failed comparison says so in the screen's language, and the button comes back", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)
    page("bg")
    const button = screen.getByRole("button", { name: /сравн/i })
    fireEvent.click(button)
    expect(await screen.findByText("Кохортите не могат да се сравнят.")).toBeTruthy()
    expect(button.hasAttribute("disabled")).toBe(false)
  })

  it("the button is disabled while a comparison is running", async () => {
    let finish!: (value: Response) => void
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(resolve => { finish = resolve }))
    page()
    const button = screen.getByRole("button", { name: /compare cohorts/i })
    fireEvent.click(button)
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true))
    finish({ ok: true, json: async () => ({ leftCount: 1, rightCount: 1, metrics: [] }) } as Response)
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false))
  })
})
