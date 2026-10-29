// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "../../messages/en.json"
import { DashboardFilters } from "./DashboardFilters"

const { push, query } = vi.hoisted(() => ({ push: vi.fn(), query: { value: "" } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(query.value),
}))

beforeEach(() => { push.mockReset(); query.value = "" })

const PEOPLE = [{ id: "u1", name: "Dr One" }, { id: "u2", name: "Dr Two" }]
const THEATRES = [{ id: "t1", name: "Theatre 1" }]

function renderFilters(theatresEnabled = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <DashboardFilters theatres={THEATRES} theatresEnabled={theatresEnabled} anaesthesiologists={PEOPLE} />
    </NextIntlClientProvider>,
  )
}

describe("the dashboard's filters (10.0.0)", () => {
  it("filters by theatre, by no theatre, and by anaesthesiologist, keeping the rest of the query but not its page size", () => {
    query.value = "scope=month&limit=100"
    renderFilters()
    fireEvent.change(screen.getByTestId("filter-theatre"), { target: { value: "t1" } })
    expect(push).toHaveBeenLastCalledWith("/dashboard?scope=month&theatre=t1")
    fireEvent.change(screen.getByTestId("filter-theatre"), { target: { value: "none" } })
    expect(push).toHaveBeenLastCalledWith("/dashboard?scope=month&theatre=none")
    fireEvent.change(screen.getByTestId("filter-assignee"), { target: { value: "u2" } })
    expect(push).toHaveBeenLastCalledWith("/dashboard?scope=month&assignee=u2")
  })

  it("offers the theatre filter only while the site uses theatres", () => {
    renderFilters(false)
    expect(screen.queryByTestId("filter-theatre")).toBeNull()
    expect(screen.getByTestId("filter-assignee")).toBeTruthy()
  })

  it("shows Clear filters only when one is set, and clears both", () => {
    renderFilters()
    expect(screen.queryByText(enMessages.dashboard.clearFilters)).toBeNull()
  })

  it("clears both filters at once", () => {
    query.value = "theatre=t1&assignee=u1&scope=today"
    renderFilters()
    fireEvent.click(screen.getByText(enMessages.dashboard.clearFilters))
    expect(push).toHaveBeenLastCalledWith("/dashboard?scope=today")
  })
})
