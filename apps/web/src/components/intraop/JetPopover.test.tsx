// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

import { JetPopover } from "./JetPopover"
import { TimetableJetLane } from "./TimetableJetLane"

const anchor = { top: 0, bottom: 10, left: 0, right: 10, width: 10 }

describe("the jet sheet (10.2.0)", () => {
  it("takes the quick rate, a typed pressure up to 6 bar and FiO2, and starts the run", () => {
    const onApply = vi.fn()
    render(<JetPopover anchor={anchor} initial={{ pressureBar: 2, rate: 150, fio2: 100 }} editing={false} onApply={onApply} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByTestId("jet-rate-300"))
    const pressure = screen.getByTestId("jet-pressure-typed")
    fireEvent.change(pressure, { target: { value: "5,5" } })
    fireEvent.blur(pressure)
    fireEvent.change(screen.getByTestId("jet-fio2"), { target: { value: "60" } })
    expect(screen.queryByTestId("jet-stop")).toBeNull()
    fireEvent.click(screen.getByTestId("jet-apply"))
    expect(onApply).toHaveBeenCalledWith({ pressureBar: 5.5, rate: 300, fio2: 60 })
  })

  it("ignores a pressure over 6 bar or a rate over 600/min, and offers Stop on a running jet", () => {
    const onApply = vi.fn()
    const onStop = vi.fn()
    render(<JetPopover anchor={anchor} initial={{ pressureBar: 2, rate: 150, fio2: 100 }} editing onApply={onApply} onStop={onStop} onDismiss={vi.fn()} />)
    const pressure = screen.getByTestId("jet-pressure-typed")
    fireEvent.change(pressure, { target: { value: "7" } })
    fireEvent.blur(pressure)
    const rate = screen.getByTestId("jet-rate-typed")
    fireEvent.change(rate, { target: { value: "601" } })
    fireEvent.blur(rate)
    fireEvent.click(screen.getByTestId("jet-apply"))
    expect(onApply).toHaveBeenCalledWith({ pressureBar: 2, rate: 150, fio2: 100 })
    fireEvent.click(screen.getByTestId("jet-stop"))
    expect(onStop).toHaveBeenCalled()
  })
})

describe("the jet lane", () => {
  it("writes the settings at the start and at each change, and opens the sheet from a cell", () => {
    const seg = { id: "jet", startCol: 1, endCol: 4, pressureBar: 2, rate: 150, fio2: 100, settingsChanges: [{ col: 3, pressureBar: 2.5, rate: 300, fio2: 80 }] }
    const onOpen = vi.fn()
    render(<TimetableJetLane labelWidth={80} rowLabelClass="" rowCols={[0, 1, 2, 3, 4, 5]} colStart={0} colEnd={6} colW={40}
      segmentAt={col => (col >= 1 && col <= 4 ? seg : null)} onOpen={onOpen} />)
    expect(screen.getByTestId("jet-cell-1").textContent).toContain("2 bar · 150/min")
    expect(screen.getByTestId("jet-cell-2").textContent).toBe("")
    expect(screen.getByTestId("jet-cell-3").textContent).toContain("2.5 bar · 300/min")
    fireEvent.click(screen.getByTestId("jet-cell-5"))
    expect(onOpen).toHaveBeenCalledWith(5, null, expect.anything())
  })
})
