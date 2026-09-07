// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { LabResult } from "@lospor/core/labs"

import { TimetableLabsLane } from "./TimetableLabsLane"

const at = (test: string, value: string, unit = "mmol/L"): LabResult =>
  ({ test, value, unit, takenAt: "2026-06-01T09:00:00Z" })

const LABELS = { expand: "Labs", more: "more", viewAll: "View all" }

function lane(results: LabResult[], over: Partial<Parameters<typeof TimetableLabsLane>[0]> = {}) {
  const props = {
    label: "LABS", labelWidth: 90, rowLabelClass: "", rowCols: [0, 1, 2], colW: 60,
    results, draws: [], expanded: false,
    onToggleExpanded: vi.fn(), onOpenDraw: vi.fn(), onOpenAll: vi.fn(),
    labels: LABELS, ...over,
  }
  return { props, ...render(<TimetableLabsLane {...props} />) }
}

describe("what the collapsed row says", () => {
  it("shows abnormal results without needing to be opened", () => {
    // The row exists to be read while something else is happening. A case with
    // a critical potassium must not hide it behind a click.
    lane([at("Potassium (K⁺)", "2.1"), at("Sodium (Na⁺)", "140")])
    expect(screen.getByText(/Potassium/)).toBeTruthy()
    // Sodium is in range, so it is not competing for the space.
    expect(screen.queryByText(/Sodium/)).toBeNull()
  })

  it("caps at three and counts the rest", () => {
    lane([
      at("Potassium (K⁺)", "2.1"), at("Sodium (Na⁺)", "125"),
      at("Creatinine", "300", "μmol/L"), at("CRP", "90", "mg/L"),
      at("Platelets", "60", "×10⁹/L"),
    ])
    expect(screen.getByText(/\+2 more/)).toBeTruthy()
  })

  it("says nothing at all when every result is in range", () => {
    lane([at("Sodium (Na⁺)", "140")])
    expect(screen.queryByText(/more/)).toBeNull()
  })

  it("opens the full list when there is something to see", () => {
    const onOpenAll = vi.fn()
    const { container } = lane([at("Potassium (K⁺)", "2.1")], { onOpenAll })
    fireEvent.click(screen.getByText(/Potassium/).parentElement as HTMLElement)
    expect(onOpenAll).toHaveBeenCalled()
    expect(container).toBeTruthy()
  })
})

describe("expanding an empty lane", () => {
  it("offers a way to add a draw per column, like the medication lane", () => {
    const onOpenDraw = vi.fn()
    const { container } = lane([], { expanded: true, onOpenDraw })
    // One cell per column, each clickable.
    const cells = container.querySelectorAll(".group")
    expect(cells).toHaveLength(3)
    fireEvent.click(cells[1])
    expect(onOpenDraw).toHaveBeenCalledWith(1)
  })

  it("shows a count where a draw exists", () => {
    const { container } = lane([at("Potassium (K⁺)", "2.1")], {
      expanded: true,
      draws: [{ colIdx: 1, takenAt: "2026-06-01T09:00:00Z", results: [at("Potassium (K⁺)", "2.1")] }],
    })
    expect(container.textContent).toContain("1")
  })
})

describe("the arrow", () => {
  it("toggles, and says so to a screen reader", () => {
    const onToggleExpanded = vi.fn()
    lane([], { onToggleExpanded })
    const arrow = screen.getByRole("button", { name: "Labs" })
    expect(arrow.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(arrow)
    expect(onToggleExpanded).toHaveBeenCalled()
  })
})

describe("a normal panel still says something", () => {
  it("lists the first results rather than rendering an empty row", () => {
    // An empty row is ambiguous: it reads the same whether the panel was normal
    // or whether nobody has looked.
    lane([at("Sodium (Na⁺)", "140"), at("Potassium (K⁺)", "4.2")])
    expect(screen.getByText(/Sodium/)).toBeTruthy()
    expect(screen.getByText(/Potassium/)).toBeTruthy()
  })

  it("opens the draw a chip came from, not the whole list", () => {
    // The question after reading "K 2.1" is what else was on that gas.
    const onOpenDrawAt = vi.fn()
    const onOpenAll = vi.fn()
    lane([at("Potassium (K⁺)", "2.1")], { expanded: true, onOpenDrawAt, onOpenAll })
    fireEvent.click(screen.getAllByRole("button", { name: /Potassium/ })[0])
    expect(onOpenDrawAt).toHaveBeenCalledWith("2026-06-01T09:00:00Z")
    expect(onOpenAll).not.toHaveBeenCalled()
  })
})
