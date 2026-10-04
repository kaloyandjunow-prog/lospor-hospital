import React from "react"
import { describe, expect, it, vi } from "vitest"

const { notifyMock, prefs } = vi.hoisted(() => ({ notifyMock: vi.fn(), prefs: { language: "en" } }))

vi.mock("@/lib/notify", () => ({ notify: notifyMock }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: prefs.language }),
}))

import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan } from "@lospor/core/ehr-import-review"
import { render } from "@/test/render"
import { EhrImportPanel } from "./EhrImportPanel"
import { HB, panel, pressable, rowFor, tap, texts } from "@/test/ehr-import-panel"

/**
 * The panel's job is to make the unsafe states unreachable, so that is what
 * these hold. Everything it renders is a decision Core already made — which is
 * how this screen and the web one stay in step — and the tests below check the
 * component honours those decisions rather than re-deriving them.
 *
 * This file ships to native and to the PWA, the two clients with no conflict
 * UI. A review they could skip past would be a value written with nobody told.
 */

describe("what the clinician already wrote stays on screen", () => {
  it("shows their value beside the proposal and does not tick it", () => {
    const tree = panel({ weightKg: 80 }, { current: { weightKg: 75 } })

    expect(rowFor(tree, "80").props.accessibilityState.checked).toBe(false)
    expect(texts(tree).join(" ")).toContain("75")
  })

  it("lets them take the hospital's value with a deliberate tap", () => {
    const onAccept = vi.fn()
    const tree = panel({ weightKg: 80 }, { current: { weightKg: 75 } }, { onAccept })

    tap(rowFor(tree, "80"))
    tap(pressable(tree, t => t.startsWith("ehrAccept")))

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
    const tree = panel(twoHaemoglobins)
    const shown = texts(tree).join(" ")

    expect(shown).toContain(`${HB} 89 g/L`)
    expect(shown).not.toContain(`${HB} 120 g/L`)
    expect(shown).toContain("1 ehrEarlierResults")
  })

  it("reveals it when the count is tapped, because a falling trend matters", () => {
    const tree = panel(twoHaemoglobins)

    tap(pressable(tree, t => t.includes("ehrEarlierResults")))

    expect(texts(tree).join(" ")).toContain(`${HB} 120 g/L`)
  })
})

describe("an undated result says so", () => {
  it("labels it and leaves it unticked", () => {
    // Beside dated results it would otherwise read as current, and a
    // preoperative haemoglobin is only worth anything if you know its age.
    const tree = panel({ labResults: [{ test: HB, value: "89", unit: "g/L" }] })

    expect(texts(tree)).toContain("ehrUndated")
    expect(rowFor(tree, `${HB} 89 g/L`).props.accessibilityState.checked).toBe(false)
  })

  it("shows the draw date when there is one", () => {
    const tree = panel({
      labResults: [{ test: HB, value: "89", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" }],
    })

    // 08:00 UTC is 1 September in every zone a hospital runs in.
    expect(texts(tree).join(" ")).toContain("ehrTakenAt 01 Sep 2026")
    expect(rowFor(tree, `${HB} 89 g/L`).props.accessibilityState.checked).toBe(true)
  })

  it("can still be taken, once the clinician has read that it is undated", () => {
    const onAccept = vi.fn()
    const tree = panel({ labResults: [{ test: HB, value: "89", unit: "g/L" }] }, {}, { onAccept })

    tap(rowFor(tree, `${HB} 89 g/L`))
    tap(pressable(tree, t => t.startsWith("ehrAccept")))

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
    const tree = panel(
      { weightKg: 80, heightCm: 175 },
      { current: { weightKg: 75 } },
      { onAccept },
    )

    tap(pressable(tree, t => t.startsWith("ehrAccept")))

    // The conflicting weight is left behind; only the empty height goes.
    expect(onAccept).toHaveBeenCalledWith({ heightCm: 175 }, ["heightCm"], null)
  })

  it("says there is nothing to review rather than showing an empty list", () => {
    const tree = panel({ weightKg: 75 }, { current: { weightKg: 75 } })

    expect(texts(tree)).toContain("ehrNothingToReview")
  })

  it("shows the hospital's own name beside a proposed procedure group", () => {
    const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields: { procedures: [
      { label: "Cholecystectomy", code: "30445-00" },
    ] } })
    // Set here rather than through normalize, so the panel is tested on its own.
    for (const field of canonical.fields) {
      if (field.field === "procedures") {
        (field.value as { sourceLabel?: string }[])[0].sourceLabel = "Лапароскопска холецистектомия"
      }
    }
    const tree = render(
      <EhrImportPanel
        plan={buildEhrReviewPlan({ canonical, current: {} })}
        current={{}}
        labelFor={field => field}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(texts(tree)).toContain("Cholecystectomy")
    expect(texts(tree)).toContain("30445-00 · Лапароскопска холецистектомия")
  })

  it("shows an operation proposed for a hospital code, with the code the hospital sent", () => {
    const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields: { procedures: [{
      label: "Cholecystectomy", group: "Cholecystectomy", code: "0FT44ZZ", system: "ICD-10-PCS",
      description: "Resection of Gallbladder, Percutaneous Endoscopic Approach",
      imported: { code: "30445-00", system: "urn:bg:ksmp", sourceVocabulary: "KSMP", sourceLabel: "Лапароскопска холецистектомия" },
    }] } })
    const tree = render(
      <EhrImportPanel
        plan={buildEhrReviewPlan({ canonical, current: {} })}
        current={{}}
        labelFor={field => field}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(texts(tree)).toContain("Cholecystectomy: Resection of Gallbladder, Percutaneous Endoscopic Approach [0FT44ZZ]")
    expect(texts(tree)).toContain("30445-00 · Лапароскопска холецистектомия")
  })

  it("reports a refusal so it is never offered again", () => {
    const onDecline = vi.fn()
    const tree = panel({ diagnoses: [{ code: "K35", label: "Acute appendicitis" }] }, {}, { onDecline })

    tap(pressable(tree, t => t === "ehrDecline"))

    expect(onDecline).toHaveBeenCalledWith("diagnoses|k35")
  })
})

/**
 * The paired case of `EhrImportReview.test.tsx` in lospor-app.
 *
 * A hospital numbers the same person several ways, and until a site says which
 * numbering its record numbers use, one clean match can belong to a different
 * one. The import still proceeds -- a site has to be able to work before it has
 * configured that -- so the only thing between a stranger's allergy list and
 * this case is the clinician reading this sentence.
 */
describe("an identity nothing could verify", () => {
  it("says so, above the values it qualifies", () => {
    const tree = panel({ allergies: ["Penicillin"] }, {}, {}, true)
    expect(texts(tree)).toContain("ehrIdentityUnverified")
  })

  it("says nothing when the match was checked against a configured system", () => {
    const tree = panel({ allergies: ["Penicillin"] })
    expect(texts(tree)).not.toContain("ehrIdentityUnverified")
  })
})

/**
 * Paired with `EhrImportReview.test.tsx` in lospor-app.
 *
 * A failed allergy fetch and a patient with no allergies produce the same
 * empty list, and the empty list reads as reassurance. This is the only thing
 * that separates them.
 */
describe("groups the hospital system could not be read for", () => {
  it("names them", () => {
    const tree = panel({ allergies: ["Penicillin"] }, {}, {}, undefined, [
      { group: "allergies", errorCode: "HTTP_503" },
    ])
    expect(texts(tree).join(" ")).toContain("ehrGroupAllergies")
  })

  it("says nothing when everything was read", () => {
    const tree = panel({ allergies: ["Penicillin"] })
    expect(texts(tree).join(" ")).not.toContain("ehrUnreadSources")
  })
})

describe("values in the clinician's language (1.4.13 appliance test)", () => {
  it("shows the hospital's codes as words, in the screen's language", () => {
    prefs.language = "bg"
    try {
      const shown = texts(panel({ sex: "MALE", ageUnit: "YEARS", allergies: true }))
      expect(shown).toEqual(expect.arrayContaining(["Мъж", "Години", "Да"]))
      expect(shown).not.toContain("MALE")
    } finally {
      prefs.language = "en"
    }
  })
})
