// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { LABELS } from "@/components/case-summary/labels"
import { CaseSummary } from "@/components/CaseSummary"

// The printed sheet states findings, and stays silent otherwise.
//
// It is the end of the case: it goes into the notes and it is read by people
// who were not in the room. The preoperative history questions are tri-state --
// yes, no, and never asked -- and `null` is falsy, so anything rendered on an
// else branch is printed for the unasked question too.
//
// That is not hypothetical. This sheet used to print a green "No
// difficult-airway history" box whenever the field was not true, so a case
// where nobody asked came out of the printer carrying the reassurance in the
// reassuring colour, indistinguishable from one where the anaesthetist asked
// and was told no.
//
// A documented "no" is still recorded, still in the database, and still in the
// OMOP export as a coded answer. It is only the paper that will not assert it,
// because on paper the two cannot be told apart.

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/cases/x/print",
}))

// The timetable measures itself to lay out its lanes. jsdom has no layout, so
// it reports nothing and the chart stays empty — which is what this sheet shows
// anyway for a case with no intraoperative data.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const EN = LABELS.en

const preopWith = (state: boolean | null) => ({
  ageYears: 66, sex: "FEMALE", heightCm: 160, weightKg: 74, asaScore: "II",
  difficultAirwayHistory: state,
  anticipatedDifficultAirway: state,
  malignantHyperthermiaHistory: state,
  unexplainedAnaesthesiaComplications: state,
  familyAnesthesiaProblems: state,
})

const sheet = (state: boolean | null) => {
  cleanup()
  const data = {
    id: "case-1", caseCode: "2026-0001", status: "FINALIZED",
    preop: {
      ...preopWith(state),
      diagnoses: [{ label: "Inguinal hernia" }],
      procedures: [{ label: "Open hernia repair" }],
    },
    intraop: null, postop: null,
    institution: { name: "Test Hospital" },
  }
  // initialData is the print-token path: the server already fetched the case,
  // so the component renders it without going near the network.
  const { container } = render(
    <CaseSummary caseId="case-1" mode="print" initialData={data as never} />,
  )
  const text = container.textContent ?? ""
  // Guard against the whole suite passing vacuously. Three of these assertions
  // are "does not contain", and every one of them holds trivially against a
  // loading placeholder or an empty container.
  // "Class II" comes from p.asaScore, so it proves the preop record reached the
  // sheet — not merely that something rendered.
  expect(text).toContain("Class II")
  return text
}

describe("the printed sheet prints findings, not silence", () => {
  it("prints every finding when the answers are yes", () => {
    const text = sheet(true)

    expect(text).toContain(EN.difficultAirway)
    expect(text).toContain(EN.anticipatedDifficultAirway)
    expect(text).toContain(EN.malignantHyperthermia)
    expect(text).toContain(EN.unexplainedAnaesthesiaComplications)
    expect(text).toContain(EN.familyHistory)
    // Under a heading of its own rather than trailing the allergy list, where a
    // bold red "Malignant hyperthermia history" read as an allergy entry.
    expect(text).toContain(EN.anaestheticHistory.toUpperCase())
  })

  it("says nothing about a question that was answered no", () => {
    const text = sheet(false)

    expect(text).not.toContain(EN.difficultAirway)
    expect(text).not.toContain(EN.anticipatedDifficultAirway)
    expect(text).not.toContain(EN.malignantHyperthermia)
    expect(text).not.toContain(EN.unexplainedAnaesthesiaComplications)
    expect(text).not.toContain(EN.familyHistory)
    // An empty heading would itself be a claim: that the history was taken and
    // found unremarkable.
    expect(text).not.toContain(EN.anaestheticHistory.toUpperCase())
  })

  it("prints the same sheet whether the answer was no or the question was never asked", () => {
    // The point of the rule. These two states are different in the database and
    // in the export, and the paper deliberately does not distinguish them,
    // because the only honest way to do so is to assert something about one of
    // them.
    expect(sheet(false)).toBe(sheet(null))
  })

  it("never prints a reassurance for an unasked question", () => {
    // The specific regression. Any future else-branch on these fields will fail
    // here rather than on a printed page in a patient's notes.
    const text = sheet(null).toLowerCase()

    expect(text).not.toContain("no difficult-airway history")
    expect(text).not.toContain("без анамнеза за труден дихателен път")
  })
})

/**
 * Investigations carries the anaesthetic's own results, and admits when it
 * could not carry all of them.
 *
 * The box used to hold the preoperative panel, which is the one thing on the
 * sheet the hospital already has -- it came from their laboratory and it is in
 * their record. What is not in their record is the gas taken at induction and
 * the one after transfusion.
 *
 * The page is a fixed A4 box with `overflow: hidden`, so anything past the
 * bottom edge is cut off and never printed rather than continued. Measured
 * with the real stylesheet: at 120 results the old flat list silently lost 28.
 */
const labsAt = (times: string[], perDraw: number) =>
  times.flatMap(at => Array.from({ length: perDraw }, (_, n) => ({
    test: ["pH", "pCO2", "pO2", "Base excess", "Lactate", "Glucose",
           "Haemoglobin (Hb)", "Potassium (K+)", "Sodium (Na+)",
           "Chloride", "Bicarbonate", "Creatinine"][n % 12],
    value: 20 + n, unit: "mmol/L", takenAt: at,
  })))

const investigations = (intraopLabs: unknown[], preopLabs: unknown[] = []) => {
  cleanup()
  const data = {
    id: "case-1", caseCode: "2026-0001", status: "FINALIZED",
    preop: { ageYears: 66, asaScore: "II", labResults: preopLabs },
    intraop: { startTime: "2026-09-04T07:00:00.000Z", keyEvents: { vitals: [] }, labResults: intraopLabs },
    postop: null,
    institution: { name: "Test Hospital" },
  }
  const { container } = render(
    <CaseSummary caseId="case-1" mode="print" initialData={data as never} />,
  )
  expect(container.textContent).toContain("Class II")
  return container
}

describe("the investigations box", () => {
  it("prints the results this anaesthetic produced", () => {
    const el = investigations(labsAt(["2026-09-04T07:20:00.000Z"], 6))
    expect(el.textContent).toContain("pH")
    expect(el.querySelectorAll(".lab-entry").length).toBe(6)
  })

  // The hospital's own panel is in the hospital's own record.
  it("does not reprint the preoperative panel", () => {
    const el = investigations([], labsAt(["2026-09-03T07:10:00.000Z"], 6))
    expect(el.querySelectorAll(".lab-entry").length).toBe(0)
  })

  /**
   * A gas at induction and one after transfusion are two readings of a
   * changing patient. Merged into one list they read as a single
   * contradictory set, which is why takenAt is recorded per draw.
   */
  it("keeps the draws apart and heads each with its time", () => {
    const el = investigations(labsAt([
      "2026-09-04T07:20:00.000Z", "2026-09-04T08:40:00.000Z",
    ], 4))
    const headings = [...el.querySelectorAll("p")]
      .map(p => (p.textContent ?? "").trim())
      .filter(t => /^\d\d:\d\d$/.test(t))
    expect(headings.length).toBe(2)
  })

  /**
   * The cap is 48, measured against the real stylesheet rather than chosen:
   * sixty still drew ten items past the bottom edge once the per-draw headings
   * were counted.
   */
  it("caps what it prints and says how much it left behind", () => {
    const times = Array.from({ length: 10 }, (_, n) =>
      new Date(Date.parse("2026-09-04T07:20:00.000Z") + n * 20 * 60000).toISOString())
    const el = investigations(labsAt(times, 12))

    expect(el.querySelectorAll(".lab-entry").length).toBe(48)
    // Not silent about it. A short record is fine; a short record that looks
    // complete is not.
    expect(el.textContent).toContain("+72 earlier results")
  })

  /**
   * A single panel larger than the cap used to be dropped whole, taking the
   * box from full to empty -- and the empty branch printed a dash, so the
   * sheet said no investigations were done on a patient who had ten gases.
   */
  it("shows part of an oversized draw rather than none of it", () => {
    const el = investigations(labsAt(["2026-09-04T07:20:00.000Z"], 60))
    expect(el.querySelectorAll(".lab-entry").length).toBe(48)
    expect(el.textContent).toContain("+12 earlier results")
  })
})
