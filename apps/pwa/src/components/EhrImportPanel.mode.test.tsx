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
import { panel, pressable, rowFor, tap, texts } from "@/test/ehr-import-panel"

describe("an imported age switches the clinical mode (9.13.9)", () => {
  // Until 9.13.9 such an age was blocked until the clinician switched mode,
  // and the plan, built on the server from the saved mode, never released it.

  it("ticks a paediatric age in an adult case and hands over the switch", () => {
    const onAccept = vi.fn()
    const tree = panel({ ageYears: 7 }, { currentClinicalMode: "ADULT" }, { onAccept })

    expect(rowFor(tree, "7").props.accessibilityState.checked).toBe(true)
    tap(pressable(tree, t => t.startsWith("ehrAccept")))

    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ ageValue: 7, ageUnit: "YEARS" }),
      ["ageYears"],
      "PEDIATRIC",
    )
  })

  it("says what the switch will clear before it happens", () => {
    expect(texts(panel({ ageYears: 7 }, { currentClinicalMode: "ADULT" })))
      .toContain("ehrModeSwitchToPediatric")
  })

  it("switches a paediatric case to adult for an adult age", () => {
    const onAccept = vi.fn()
    const tree = panel({ ageYears: 40 }, { currentClinicalMode: "PEDIATRIC" }, { onAccept })

    expect(texts(tree)).toContain("ehrModeSwitchToAdult")
    tap(pressable(tree, t => t.startsWith("ehrAccept")))
    expect(onAccept).toHaveBeenCalledWith(
      { ageYears: 40, ageValue: null, ageUnit: null },
      ["ageYears"],
      "ADULT",
    )
  })

  it("drops the notice when the clinician unticks the age", () => {
    const tree = panel({ ageYears: 7 }, { currentClinicalMode: "ADULT" })
    tap(rowFor(tree, "7"))
    expect(texts(tree)).not.toContain("ehrModeSwitchToPediatric")
  })

  it("says nothing and switches nothing when the mode already fits", () => {
    const onAccept = vi.fn()
    const tree = panel({ ageYears: 7 }, { currentClinicalMode: "PEDIATRIC" }, { onAccept })

    expect(texts(tree).some(t => t.startsWith("ehrModeSwitch"))).toBe(false)
    tap(pressable(tree, t => t.startsWith("ehrAccept")))
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ ageValue: 7, ageUnit: "YEARS" }),
      ["ageYears"],
      null,
    )
  })

  it("leaves the age out where the deployment has no paediatric mode", () => {
    const onAccept = vi.fn()
    const tree = panel(
      { ageYears: 7, weightKg: 22 }, { currentClinicalMode: "ADULT" }, { onAccept },
      undefined, undefined, false,
    )

    expect(texts(tree)).toContain("ehrModeUnavailable")
    tap(pressable(tree, t => t.startsWith("ehrAccept")))
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
    const tree = render(
      <EhrImportPanel
        plan={legacy}
        current={{}}
        currentClinicalMode="ADULT"
        labelFor={field => field}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onRequestModeChange={onRequestModeChange}
        onClose={vi.fn()}
      />,
    )

    tap(rowFor(tree, "7"))
    expect(notifyMock).toHaveBeenCalledWith("ehrModeBlockedTitle", "ehrModeBlockedMsg")
    tap(pressable(tree, t => t === "ehrGoToMode"))
    expect(onRequestModeChange).toHaveBeenCalled()
  })
})
