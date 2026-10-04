// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan, type EhrReviewInput } from "@lospor/core/ehr-import-review"
import type { EhrUnreadSource } from "@lospor/core/ehr-import-transport"
import { EhrImportReview } from "./EhrImportReview"

const intl = vi.hoisted(() => ({ locale: "en" }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => intl.locale }))

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
    onAccept: (patch: Record<string, unknown>, appliedKeys: string[], modeChange: unknown) => void
    onDecline: (itemKey: string) => void
    onRequestModeChange: () => void
  }> = {},
  identityUnverified?: boolean,
  unreadSources?: EhrUnreadSource[],
  modeChangeAvailable?: boolean,
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
      modeChangeAvailable={modeChangeAvailable}
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

describe("an imported age switches the clinical mode (9.13.9)", () => {
  // Until 9.13.9 such an age was disabled until the clinician switched mode,
  // and the plan, built on the server from the saved mode, never released it.

  it("ticks a paediatric age in an adult case and hands over the switch", () => {
    const onAccept = vi.fn()
    review({ ageYears: 7 }, { currentClinicalMode: "ADULT" }, { onAccept })

    expect(boxes()[0].checked).toBe(true)
    expect(boxes()[0].disabled).toBe(false)
    fireEvent.click(acceptButton())

    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ ageValue: 7, ageUnit: "YEARS" }),
      ["ageYears"],
      "PEDIATRIC",
    )
  })

  it("says what the switch will clear before it happens", () => {
    review({ ageYears: 7 }, { currentClinicalMode: "ADULT" })
    expect(screen.getByText("modeSwitchToPediatric")).toBeTruthy()
  })

  it("switches a paediatric case to adult for an adult age", () => {
    const onAccept = vi.fn()
    review({ ageYears: 40 }, { currentClinicalMode: "PEDIATRIC" }, { onAccept })

    expect(screen.getByText("modeSwitchToAdult")).toBeTruthy()
    fireEvent.click(acceptButton())
    expect(onAccept).toHaveBeenCalledWith(
      { ageYears: 40, ageValue: null, ageUnit: null },
      ["ageYears"],
      "ADULT",
    )
  })

  it("drops the notice when the clinician unticks the age", () => {
    review({ ageYears: 7 }, { currentClinicalMode: "ADULT" })
    fireEvent.click(boxes()[0])
    expect(screen.queryByText("modeSwitchToPediatric")).toBeNull()
  })

  it("says nothing and switches nothing when the mode already fits", () => {
    const onAccept = vi.fn()
    review({ ageYears: 7 }, { currentClinicalMode: "PEDIATRIC" }, { onAccept })

    expect(screen.queryByRole("note")).toBeNull()
    fireEvent.click(acceptButton())
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ ageValue: 7, ageUnit: "YEARS" }),
      ["ageYears"],
      null,
    )
  })

  it("leaves the age out where the deployment has no paediatric mode", () => {
    const onAccept = vi.fn()
    review({ ageYears: 7, weightKg: 22 }, { currentClinicalMode: "ADULT" }, { onAccept }, undefined, undefined, false)

    expect(screen.getByText("modeUnavailable")).toBeTruthy()
    fireEvent.click(acceptButton())
    expect(onAccept).toHaveBeenCalledWith({ weightKg: 22 }, ["weightKg"], null)
  })

  it("still renders a pre-9.13.9 plan that holds the age back", () => {
    const onRequestModeChange = vi.fn()
    const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields: { ageYears: 7 } })
    const plan = buildEhrReviewPlan({ canonical, current: {} })
    const legacy = {
      ...plan,
      items: plan.items.map(item => ({ ...item, state: "needs-mode-decision" as const })),
      preselectedKeys: [],
    }
    render(
      <EhrImportReview
        plan={legacy}
        current={{}}
        currentClinicalMode="ADULT"
        labelFor={field => field}
        onAccept={() => {}}
        onDecline={() => {}}
        onRequestModeChange={onRequestModeChange}
        onClose={() => {}}
      />,
    )

    expect(boxes()[0].disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "goToMode" }))
    expect(onRequestModeChange).toHaveBeenCalled()
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

    expect(onAccept).toHaveBeenCalledWith({ weightKg: 80 }, ["weightKg"], null)
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

    // 08:00 UTC is 1 September in every zone a hospital runs in.
    expect(screen.getByText("takenAt 01 Sep 2026")).toBeTruthy()
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
      null,
    )
  })
})

describe("nothing is written without a deliberate act", () => {
  it("offers only what Core preselected", () => {
    const onAccept = vi.fn()
    review({ weightKg: 80, heightCm: 175 }, { current: { weightKg: 75 } }, { onAccept })

    fireEvent.click(acceptButton())

    // The conflicting weight is left behind; only the empty height goes.
    expect(onAccept).toHaveBeenCalledWith({ heightCm: 175 }, ["heightCm"], null)
  })

  it("cannot be accepted when nothing is ticked", () => {
    review({ weightKg: 80 }, { current: { weightKg: 75 } })

    expect((acceptButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it("says there is nothing to review rather than showing an empty list", () => {
    review({ weightKg: 75 }, { current: { weightKg: 75 } })

    expect(screen.getByText("nothingToReview")).toBeTruthy()
  })

  it("shows the hospital's own name beside a proposed procedure group", () => {
    const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields: { procedures: [
      { label: "Cholecystectomy", code: "30445-00" },
    ] } })
    // Set here rather than through normalize, so the screen is tested on its own.
    for (const field of canonical.fields) {
      if (field.field === "procedures") {
        (field.value as { sourceLabel?: string }[])[0].sourceLabel = "Лапароскопска холецистектомия"
      }
    }
    render(
      <EhrImportReview
        plan={buildEhrReviewPlan({ canonical, current: {} })}
        current={{}}
        labelFor={field => field}
        onAccept={() => {}}
        onDecline={() => {}}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText("Cholecystectomy")).toBeTruthy()
    expect(screen.getByText("30445-00 · Лапароскопска холецистектомия")).toBeTruthy()
  })

  it("shows an operation proposed for a hospital code, with the code the hospital sent", () => {
    const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields: { procedures: [{
      label: "Cholecystectomy", group: "Cholecystectomy", code: "0FT44ZZ", system: "ICD-10-PCS",
      description: "Resection of Gallbladder, Percutaneous Endoscopic Approach",
      imported: { code: "30445-00", system: "urn:bg:ksmp", sourceVocabulary: "KSMP", sourceLabel: "Лапароскопска холецистектомия" },
    }] } })
    render(
      <EhrImportReview
        plan={buildEhrReviewPlan({ canonical, current: {} })}
        current={{}}
        labelFor={field => field}
        onAccept={() => {}}
        onDecline={() => {}}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText("Cholecystectomy: Resection of Gallbladder, Percutaneous Endoscopic Approach [0FT44ZZ]")).toBeTruthy()
    expect(screen.getByText("30445-00 · Лапароскопска холецистектомия")).toBeTruthy()
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

describe("values in the clinician's language (1.4.13 appliance test)", () => {
  it("shows the hospital's codes as words, in the screen's language", () => {
    intl.locale = "bg"
    try {
      review({ sex: "MALE", ageUnit: "YEARS", allergies: true })
      expect(screen.getByText("Мъж")).toBeTruthy()
      expect(screen.getByText("Години")).toBeTruthy()
      expect(screen.getByText("Да")).toBeTruthy()
      expect(screen.queryByText("MALE")).toBeNull()
    } finally {
      intl.locale = "en"
    }
  })
})
