// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan, type EhrReviewInput } from "@lospor/core/ehr-import-review"
import type { EhrUnreadSource } from "@lospor/core/ehr-import-transport"
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

/**
 * A test name the catalogue actually holds, with its canonical unit.
 *
 * These fixtures used the shorthand "Hb" and no unit, which passed when any
 * name flowed through untouched. Core now resolves an incoming result against
 * the catalogue and refuses one it has no field for -- an unrecognised name is
 * `unsupported-test` and an unconvertible unit is `unconverted`, neither of
 * which is offered pre-ticked. That is the point of the check: a hospital's own
 * code reaches a LOSPOR field only once a site has mapped it. So the fixture
 * has to name a real test, or it exercises the refusal path rather than the
 * freshness ranking these tests are about.
 */
const HB = "Haemoglobin (Hb)"

function review(
  fields: Record<string, unknown>,
  rest: Partial<Omit<EhrReviewInput, "canonical">> = {},
  handlers: Partial<{
    onAccept: (patch: Record<string, unknown>, appliedKeys: string[]) => void
    onDecline: (itemKey: string) => void
    onRequestModeChange: () => void
  }> = {},
  identityUnverified?: boolean,
  unreadSources?: EhrUnreadSource[],
) {
  const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields })
  const current = rest.current ?? {}
  const plan = buildEhrReviewPlan({ canonical, current, ...rest })
  return render(
    <EhrImportReview
      plan={plan}
      identityUnverified={identityUnverified}
      unreadSources={unreadSources}
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
      { test: HB, value: "120", unit: "g/L", takenAt: "2026-08-29T08:00:00Z" },
      { test: HB, value: "89", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" },
    ],
  }

  it("shows the newest and collapses the earlier one behind a count", () => {
    review(twoHaemoglobins)

    expect(screen.getByText(`${HB} 89 g/L`)).toBeTruthy()
    expect(screen.queryByText(`${HB} 120 g/L`)).toBeNull()
    expect(screen.getByRole("button", { name: /earlierResults/ })).toBeTruthy()
  })

  it("reveals it on demand, because a falling trend matters", () => {
    review(twoHaemoglobins)

    fireEvent.click(screen.getByRole("button", { name: /earlierResults/ }))

    expect(screen.getByText(`${HB} 120 g/L`)).toBeTruthy()
  })
})

describe("an undated result says so", () => {
  it("labels it and leaves it unticked", () => {
    // Beside dated results it would otherwise read as current, and a
    // preoperative haemoglobin is only worth anything if you know its age.
    review({ labResults: [{ test: HB, value: "89", unit: "g/L" }] })

    expect(screen.getByText("undated")).toBeTruthy()
    expect(boxes()[0].checked).toBe(false)
  })

  it("shows the draw date when there is one", () => {
    review({ labResults: [{ test: HB, value: "89", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" }] })

    expect(screen.getByText(/2026-09-01/)).toBeTruthy()
    expect(boxes()[0].checked).toBe(true)
  })

  it("can still be taken, once the clinician has read that it is undated", () => {
    const onAccept = vi.fn()
    review({ labResults: [{ test: HB, value: "89", unit: "g/L" }] }, {}, { onAccept })

    fireEvent.click(boxes()[0])
    fireEvent.click(acceptButton())

    expect(onAccept).toHaveBeenCalledWith(
      { labResults: [expect.objectContaining({ test: HB, takenAt: null })] },
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

/**
 * The one thing on this screen that is not about a value.
 *
 * A hospital numbers the same person several ways, and until a site says
 * which numbering its record numbers use, a single clean match can belong to
 * a different one. The appliance still offers the import -- a site has to be
 * able to work before it has configured that -- so the only thing standing
 * between a stranger's allergy list and this case is the clinician reading
 * this sentence.
 */
describe("an identity nothing could verify", () => {
  it("says so, above the values it qualifies", () => {
    review({ allergies: ["Penicillin"] }, {}, {}, true)
    expect(screen.getByRole("note").textContent).toBe("identityUnverified")
  })

  it("says nothing when the match was checked against a configured system", () => {
    review({ allergies: ["Penicillin"] })
    expect(screen.queryByRole("note")).toBeNull()
  })
})

/**
 * The warning that matters more than the values.
 *
 * An allergy fetch that failed produces the same empty list as a patient with
 * no allergies -- and an empty allergy list reads as reassurance. Without
 * this the screen invites somebody to choose a drug on the strength of a
 * question nobody managed to ask.
 */
describe("groups the hospital system could not be read for", () => {
  it("names them", () => {
    review({ allergies: ["Penicillin"] }, {}, {}, undefined, [
      { group: "allergies", errorCode: "HTTP_503" },
    ])
    expect(screen.getByRole("alert").textContent).toContain("unreadSources")
  })

  it("says nothing when everything was read", () => {
    review({ allergies: ["Penicillin"] })
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
