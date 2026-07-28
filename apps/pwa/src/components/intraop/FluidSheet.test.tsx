import React from "react"
import { describe, expect, it, vi } from "vitest"

// expo-haptics (pulled in via FeedbackPressable → hapticTick) needs the RN
// runtime; the tests only care about press handlers, so stub it out.
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))

import { pressByText, render } from "@/test/render"
import { FluidSheet } from "./FluidSheet"
import { AgentSheet } from "./AgentSheet"
import { PreferencesProvider } from "@/lib/preferences-context"
import { AuthProvider } from "@/lib/auth-context"

function renderWithPreferences(element: React.ReactElement) {
  return render(
    <AuthProvider>
      <PreferencesProvider>{element}</PreferencesProvider>
    </AuthProvider>,
  )
}

// Pins the library-driven autofill behavior: selecting a fluid/agent must
// prefill the entry with the option library's first quick value (and the
// fluid's default concentration) — the "tired anesthesiologist" fast path.

// cat values must be the option library's real group names — FluidSheet
// renders fluids under a fixed section list and exact-matches the group.
const FLUIDS = [
  { name: "HES", cat: "Colloids", color: "#f59e0b" },
  { name: "Ringer", cat: "Crystalloids", color: "#22d3ee" },
]

describe("FluidSheet autofill on select", () => {
  it("prefills volume with the library's first quick value and the default concentration", () => {
    const setFlFluid = vi.fn()
    const setFlVol = vi.fn()
    const setFlConcentration = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={FLUIDS}
        flFluid={null}
        setFlFluid={setFlFluid}
        flVol="500"
        setFlVol={setFlVol}
        onConfirm={() => {}}
        quickVolumes={{ HES: [250, 500, 1000, 1500] }}
        concentrations={{ HES: ["6%", "10%"] }}
        defaultConcentrations={{ HES: "6%" }}
        flConcentration={undefined}
        setFlConcentration={setFlConcentration}
      />,
    )

    pressByText(tree, "HES")

    expect(setFlFluid).toHaveBeenCalledWith(FLUIDS[0])
    expect(setFlVol).toHaveBeenCalledWith("250")
    expect(setFlConcentration).toHaveBeenCalledWith("6%")
  })

  it("falls back to sensible defaults when the library has no quick values", () => {
    const setFlVol = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={FLUIDS}
        flFluid={null}
        setFlFluid={() => {}}
        flVol="500"
        setFlVol={setFlVol}
        onConfirm={() => {}}
        quickVolumes={{}}
      />,
    )

    pressByText(tree, "Ringer")

    expect(setFlVol).toHaveBeenCalledWith("250")
  })
})

describe("AgentSheet autofill on select", () => {
  it("prefills the agent percent with the library's first quick value", () => {
    const setAgPick = vi.fn()
    const setAgPercent = vi.fn()
    const tree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[{ name: "Sevoflurane", color: "#a855f7" }]}
        agPick={null}
        setAgPick={setAgPick}
        activeAgent={null}
        onConfirm={() => {}}
        quickPercents={{ Sevoflurane: [1, 2, 2.5, 3, 8] }}
        agPercent={null}
        setAgPercent={setAgPercent}
      />,
    )

    pressByText(tree, "Sevoflurane")

    expect(setAgPick).toHaveBeenCalledWith({ name: "Sevoflurane", color: "#a855f7" })
    expect(setAgPercent).toHaveBeenCalledWith(1)
  })
})
