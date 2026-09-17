// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import enMessages from "../../../messages/en.json"
import { VITAL_ROW_DEFS } from "./TimetableVitalsChart"
import { TimetableVitalsRows } from "./TimetableVitalsRows"

const inputRefs = { current: new Map<string, HTMLInputElement>() }

function renderRow(key: "bis" | "systolic", value: number, draft: string) {
  const row = VITAL_ROW_DEFS.find(candidate => candidate.key === key)
  if (!row) throw new Error(`Missing vital row ${key}`)
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TimetableVitalsRows
        rows={[row]}
        vitals={[{ [key]: value }]}
        rowCols={[0]}
        colCount={1}
        colW={90}
        labelWidth={90}
        rowLabelClass=""
        cellClass=""
        emptyLabel="Empty"
        isFirstRow
        inputRefs={inputRefs}
        drafts={{ [`0-${key}`]: draft }}
        activeCell={`0-${key}`}
        onFocusCell={vi.fn()}
        onBlurCell={vi.fn()}
        setVital={vi.fn()}
        lastVitalBefore={() => undefined}
        onOpenStepper={vi.fn()}
      />
    </NextIntlClientProvider>,
  )
}

describe("TimetableVitalsRows feedback", () => {
  it("keeps a hard-invalid BIS draft visible with field-adjacent error semantics", () => {
    renderRow("bis", 50, "101")
    const input = screen.getByRole("spinbutton") as HTMLInputElement
    expect(input.value).toBe("101")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toBe("BIS must be a whole number from 0 to 100.")
  })

  it("shows a warning-range pressure as non-blocking feedback", () => {
    renderRow("systolic", 301, "301")
    expect(screen.getByText("Unusually high systolic pressure (>300 mmHg). Verify the reading.")).toBeTruthy()
    expect(screen.getByRole("spinbutton").getAttribute("aria-invalid")).toBeNull()
  })
})
