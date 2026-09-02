// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan, type EhrReviewInput } from "@lospor/core/ehr-import-review"
import { EhrImportReview } from "./EhrImportReview"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

/**
 * These deliberately mirror `EhrImportPanel.test.tsx` in lospor-mobile, case for
 * case. The two screens render the same Core plan and must reach the same
 * answer; the last time a clinical calculation lived separately in web and
 * mobile they drifted and a running infusion read 0 mL on one of them. A review
 * that accepted different things depending on the screen would be that failure
 * with worse consequences, and only a paired test catches it.
 */

function review(
  fields: Record<string, unknown>,
  rest: Partial<Omit<EhrReviewInput, "canonical">> = {},
  handlers: Partial<{
    onAccept: (patch: Record<string, unknown>, appliedKeys: string[]) => void
    onDecline: (itemKey: string) => void
    onRequestModeChange: () => void
  }> = {},
) {
  const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields })
  const current = rest.current ?? {}
  const plan = buildEhrReviewPlan({ canonical, current, ...rest })
  return render(
    <EhrImportReview
      plan={plan}
      current={current}
      currentClinicalMode={rest.currentClinicalMode}
      labelFor={field => field}
      onAccept={handlers.onAccept ?? (() => {})}
      onDecline={handlers.onDecline ?? (() => {})}
      onRequestModeChange={handlers.onRequestModeChange}
      onClose={() => {}}
    />,
  )
}

function boxes(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox") as HTMLInputElement[]
}

function acceptButton(): HTMLElement {
  return screen.getByRole("button", { name: /^accept/ })
}

describe("an age needing a mode change cannot be accepted here", () => {
  it("leaves it unticked and refuses the tick", () => {
    review({ ageYears: 7 }, { currentClinicalMode: "ADULT" })
    const box = boxes()[0]

    expect(box.checked).toBe(false)
    expect(box.disabled).toBe(true)
    fireEvent.click(box)
    expect((boxes()[0]).checked).toBe(false)
  })

  it("explains why, rather than silently disabling a control", () => {
    review({ ageYears: 7 }, { currentClinicalMode: "ADULT" })

    expect(screen.getByText("modeBlockedTitle")).toBeTruthy()
    expect(screen.getByText(/modeBlockedMsg/)).toBeTruthy()
  })

  it("still shows the age the hospital sent", () => {
    review({ ageYears: 7 }, { currentClinicalMode: "ADULT" })
    expect(screen.getByText("7")).toBeTruthy()
  })

  it("offers a way to the mode control instead of being a dead end", () => {
    // Telling someone to switch mode without a route to the switch is the loop
    // this guards. It matters most on mobile, where the review covers the
    // screen entirely, but a long preop form can bury the toggle here too.
    const onRequestModeChange = vi.fn()
    review({ ageYears: 7 }, { currentClinicalMode: "ADULT" }, { onRequestModeChange })

    fireEvent.click(screen.getByRole("button", { name: "goToMode" }))

    expect(onRequestModeChange).toHaveBeenCalled()
  })

  it("writes the paediatric pair once the mode has been switched", () => {
    // The server's preciseAge reads only ageValue/ageUnit, so an age accepted
    // as ageYears alone would save and leave the field blank.
    const onAccept = vi.fn()
    review({ ageYears: 7 }, { currentClinicalMode: "PEDIATRIC" }, { onAccept })

    fireEvent.click(acceptButton())

    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ ageValue: 7, ageUnit: "YEARS" }),
      ["ageYears"],
    )
  })
})

describe("what the clinician already wrote stays on screen", () => {
  it("shows their value beside the proposal and does not tick it", () => {
    review({ weightKg: 80 }, { current: { weightKg: 75 } })

    expect(boxes()[0].checked).toBe(false)
    expect(screen.getByText("75")).toBeTruthy()
    expect(screen.getByText("conflictNote")).toBeTruthy()
  })

  it("lets them take the hospital's value with a deliberate tick", () => {
    const onAccept = vi.fn()
    review({ weightKg: 80 }, { current: { weightKg: 75 } }, { onAccept })

    fireEvent.click(boxes()[0])
    fireEvent.click(acceptButton())

    expect(onAccept).toHaveBeenCalledWith({ weightKg: 80 }, ["weightKg"])
  })
})

describe("older results stay out of the way until asked for", () => {
  const twoHaemoglobins = {
    labResults: [
      { test: "Hb", value: "120", takenAt: "2026-08-29T08:00:00Z" },
      { test: "Hb", value: "89", takenAt: "2026-09-01T08:00:00Z" },
    ],
  }

  it("shows the newest and collapses the earlier one behind a count", () => {
    review(twoHaemoglobins)

    expect(screen.getByText("Hb 89")).toBeTruthy()
    expect(screen.queryByText("Hb 120")).toBeNull()
    expect(screen.getByRole("button", { name: /earlierResults/ })).toBeTruthy()
  })

  it("reveals it on demand, because a falling trend matters", () => {
    review(twoHaemoglobins)

    fireEvent.click(screen.getByRole("button", { name: /earlierResults/ }))

    expect(screen.getByText("Hb 120")).toBeTruthy()
  })
})

describe("an undated result says so", () => {
  it("labels it and leaves it unticked", () => {
    // Beside dated results it would otherwise read as current, and a
    // preoperative haemoglobin is only worth anything if you know its age.
    review({ labResults: [{ test: "Hb", value: "89" }] })

    expect(screen.getByText("undated")).toBeTruthy()
    expect(boxes()[0].checked).toBe(false)
  })

  it("shows the draw date when there is one", () => {
    review({ labResults: [{ test: "Hb", value: "89", takenAt: "2026-09-01T08:00:00Z" }] })

    expect(screen.getByText(/2026-09-01/)).toBeTruthy()
    expect(boxes()[0].checked).toBe(true)
  })

  it("can still be taken, once the clinician has read that it is undated", () => {
    const onAccept = vi.fn()
    review({ labResults: [{ test: "Hb", value: "89" }] }, {}, { onAccept })

    fireEvent.click(boxes()[0])
    fireEvent.click(acceptButton())

    expect(onAccept).toHaveBeenCalledWith(
      { labResults: [expect.objectContaining({ test: "Hb", takenAt: null })] },
      [expect.any(String)],
    )
  })
})

describe("nothing is written without a deliberate act", () => {
  it("offers only what Core preselected", () => {
    const onAccept = vi.fn()
    review({ weightKg: 80, heightCm: 175 }, { current: { weightKg: 75 } }, { onAccept })

    fireEvent.click(acceptButton())

    // The conflicting weight is left behind; only the empty height goes.
    expect(onAccept).toHaveBeenCalledWith({ heightCm: 175 }, ["heightCm"])
  })

  it("cannot be accepted when nothing is ticked", () => {
    review({ weightKg: 80 }, { current: { weightKg: 75 } })

    expect((acceptButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it("says there is nothing to review rather than showing an empty list", () => {
    review({ weightKg: 75 }, { current: { weightKg: 75 } })

    expect(screen.getByText("nothingToReview")).toBeTruthy()
  })

  it("reports a refusal so it is never offered again", () => {
    const onDecline = vi.fn()
    review({ diagnoses: [{ code: "K35", label: "Acute appendicitis" }] }, {}, { onDecline })

    fireEvent.click(screen.getByRole("button", { name: "decline" }))

    expect(onDecline).toHaveBeenCalledWith("diagnoses|k35")
  })
})
