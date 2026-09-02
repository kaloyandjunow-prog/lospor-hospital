import React from "react"
import { act, type ReactTestInstance } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))

vi.mock("@/lib/notify", () => ({ notify: notifyMock }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key }),
}))

import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan, type EhrReviewInput } from "@lospor/core/ehr-import-review"
import { render } from "@/test/render"
import { EhrImportPanel } from "./EhrImportPanel"

/**
 * The panel's job is to make the unsafe states unreachable, so that is what
 * these hold. Everything it renders is a decision Core already made — which is
 * how this screen and the web one stay in step — and the tests below check the
 * component honours those decisions rather than re-deriving them.
 *
 * This file ships to native and to the PWA, the two clients with no conflict
 * UI. A review they could skip past would be a value written with nobody told.
 */

function panel(
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
    <EhrImportPanel
      plan={plan}
      current={current}
      currentClinicalMode={rest.currentClinicalMode}
      labelFor={field => field}
      onAccept={handlers.onAccept ?? vi.fn()}
      onDecline={handlers.onDecline ?? vi.fn()}
      onRequestModeChange={handlers.onRequestModeChange}
      onClose={vi.fn()}
    />,
  )
}

function texts(tree: ReturnType<typeof render>): string[] {
  return tree.root
    .findAll(n => String(n.type) === "Text")
    .map(n => n.children.filter(c => typeof c === "string").join(""))
    .filter(Boolean)
}

function rowFor(tree: ReturnType<typeof render>, title: string) {
  const node = tree.root.findAll(n =>
    typeof n.type !== "string"
    && n.props?.accessibilityRole === "checkbox"
    && texts({ root: n } as never).includes(title))[0]
  expect(node, `no row titled "${title}"`).toBeDefined()
  return node
}

/** Presses go through act, or the state they set never reaches the next read. */
function tap(node: ReactTestInstance) {
  expect(typeof node.props.onPress, "node is not pressable").toBe("function")
  act(() => { node.props.onPress() })
}

/** The first pressable whose own text satisfies `match`. */
function pressable(tree: ReturnType<typeof render>, match: (text: string) => boolean) {
  const node = tree.root.findAll(n =>
    typeof n.props?.onPress === "function"
    && texts({ root: n } as never).some(match))[0]
  expect(node, "no pressable matched").toBeDefined()
  return node
}

describe("an age needing a mode change cannot be accepted here", () => {
  it("does not tick it, and tapping it explains instead of selecting", () => {
    const tree = panel({ ageYears: 7 }, { currentClinicalMode: "ADULT" })
    const row = rowFor(tree, "7")

    expect(row.props.accessibilityState.checked).toBe(false)
    tap(row)
    expect(notifyMock).toHaveBeenCalledWith("ehrModeBlockedTitle", "ehrModeBlockedMsg")
    expect(rowFor(tree, "7").props.accessibilityState.checked).toBe(false)
  })

  it("still shows it, so the clinician knows the hospital sent an age", () => {
    expect(texts(panel({ ageYears: 7 }, { currentClinicalMode: "ADULT" }))).toContain("7")
  })

  it("offers a way to the mode control instead of being a dead end", () => {
    // This sheet covers the screen. Telling someone to switch mode with the
    // switch behind the sheet is a loop: close, hunt, switch, reopen.
    const onRequestModeChange = vi.fn()
    const tree = panel({ ageYears: 7 }, { currentClinicalMode: "ADULT" }, { onRequestModeChange })

    tap(pressable(tree, t => t === "ehrGoToMode"))

    expect(onRequestModeChange).toHaveBeenCalled()
  })

  it("writes the paediatric pair once the mode has been switched", () => {
    // The server's preciseAge reads only ageValue/ageUnit, so an age accepted
    // as ageYears alone would save and leave the field blank.
    const onAccept = vi.fn()
    const tree = panel({ ageYears: 7 }, { currentClinicalMode: "PEDIATRIC" }, { onAccept })

    tap(pressable(tree, t => t.startsWith("ehrAccept")))

    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ ageValue: 7, ageUnit: "YEARS" }),
      ["ageYears"],
    )
  })
})

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
    const tree = panel(twoHaemoglobins)
    const shown = texts(tree).join(" ")

    expect(shown).toContain("Hb 89")
    expect(shown).not.toContain("Hb 120")
    expect(shown).toContain("1 ehrEarlierResults")
  })

  it("reveals it when the count is tapped, because a falling trend matters", () => {
    const tree = panel(twoHaemoglobins)

    tap(pressable(tree, t => t.includes("ehrEarlierResults")))

    expect(texts(tree).join(" ")).toContain("Hb 120")
  })
})

describe("an undated result says so", () => {
  it("labels it and leaves it unticked", () => {
    // Beside dated results it would otherwise read as current, and a
    // preoperative haemoglobin is only worth anything if you know its age.
    const tree = panel({ labResults: [{ test: "Hb", value: "89" }] })

    expect(texts(tree)).toContain("ehrUndated")
    expect(rowFor(tree, "Hb 89").props.accessibilityState.checked).toBe(false)
  })

  it("shows the draw date when there is one", () => {
    const tree = panel({
      labResults: [{ test: "Hb", value: "89", takenAt: "2026-09-01T08:00:00Z" }],
    })

    expect(texts(tree).join(" ")).toContain("2026-09-01")
    expect(rowFor(tree, "Hb 89").props.accessibilityState.checked).toBe(true)
  })

  it("can still be taken, once the clinician has read that it is undated", () => {
    const onAccept = vi.fn()
    const tree = panel({ labResults: [{ test: "Hb", value: "89" }] }, {}, { onAccept })

    tap(rowFor(tree, "Hb 89"))
    tap(pressable(tree, t => t.startsWith("ehrAccept")))

    expect(onAccept).toHaveBeenCalledWith(
      { labResults: [expect.objectContaining({ test: "Hb", takenAt: null })] },
      [expect.any(String)],
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
    expect(onAccept).toHaveBeenCalledWith({ heightCm: 175 }, ["heightCm"])
  })

  it("says there is nothing to review rather than showing an empty list", () => {
    const tree = panel({ weightKg: 75 }, { current: { weightKg: 75 } })

    expect(texts(tree)).toContain("ehrNothingToReview")
  })

  it("reports a refusal so it is never offered again", () => {
    const onDecline = vi.fn()
    const tree = panel({ diagnoses: [{ code: "K35", label: "Acute appendicitis" }] }, {}, { onDecline })

    tap(pressable(tree, t => t === "ehrDecline"))

    expect(onDecline).toHaveBeenCalledWith("diagnoses|k35")
  })
})
