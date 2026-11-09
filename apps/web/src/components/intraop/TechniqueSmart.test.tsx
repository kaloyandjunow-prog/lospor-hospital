// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import type { TechniqueSide } from "@lospor/core/technique-smart"
import type { TechniqueNode } from "@/components/TechniqueTree"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))
vi.mock("@/lib/clinical-display", () => ({
  displayClinicalCode: (_axis: string, code: string) => ({
    GENERAL: "General Anaesthesia",
    GENERAL_INHALATION: "General Anaesthesia · Inhalational",
    GENERAL_BALANCED: "General Anaesthesia · Balanced (inhaled + IV)",
    BLOCK_TAP: "Regional Anaesthesia · TAP block",
  }[code] ?? code),
}))

import { TechniqueSmart } from "./TechniqueSmart"

const tree = [
  { v: "GENERAL", label: "General Anaesthesia", children: [{ v: "GENERAL_INHALATION", label: "Inhalational" }, { v: "GENERAL_TIVA", label: "TIVA" }, { v: "GENERAL_BALANCED", label: "Balanced (inhaled + IV)" }] },
  { v: "REGIONAL", label: "Regional Anaesthesia", children: [{ v: "PERIPHERAL", label: "Peripheral nerve block", children: [{ v: "BLOCK_FEMORAL", label: "Femoral nerve" }, { v: "BLOCK_ADDUCTOR", label: "Adductor canal (saphenous)" }, { v: "BLOCK_TAP", label: "TAP block" }] }] },
  { v: "OTHER", label: "Other…" },
] as TechniqueNode[]

function setup(overrides: Partial<Parameters<typeof TechniqueSmart>[0]> = {}) {
  const onChange = vi.fn<(techniques: string[], sides: Record<string, TechniqueSide>, added: string[]) => void>()
  render(<TechniqueSmart techniques={["GENERAL_BALANCED"]} sides={{}} onChange={onChange} tree={tree} planned={[]} recents={[]} {...overrides} />)
  return { onChange }
}

describe("Smart selection, the Technique section (10.2.0)", () => {
  it("moves a searched TCI technique into Used in the controlled parent flow", () => {
    function Controlled() {
      const [selected, setSelected] = React.useState<string[]>([])
      return <TechniqueSmart techniques={selected} sides={{}} onChange={(next, _sides) => setSelected(next)} tree={tree} planned={[]} recents={[]} />
    }
    render(<Controlled />)
    fireEvent.change(screen.getByTestId("technique-search"), { target: { value: "TCI" } })
    fireEvent.click(screen.getByTestId("technique-hit-GENERAL_TCI"))
    expect(screen.getByTestId("technique-chip-GENERAL_TCI")).toBeTruthy()
  })

  it("shows what is in use and removes one in a tap", () => {
    const { onChange } = setup()
    expect(screen.getByTestId("technique-chip-GENERAL_BALANCED")).toBeTruthy()
    fireEvent.click(screen.getByTestId("technique-remove-GENERAL_BALANCED"))
    expect(onChange).toHaveBeenCalledWith([], {}, [])
  })

  it("finds a technique by search and adds it", () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByTestId("technique-search"), { target: { value: "fem" } })
    fireEvent.click(screen.getByTestId("technique-hit-BLOCK_FEMORAL"))
    expect(onChange).toHaveBeenCalledWith(["GENERAL_BALANCED", "BLOCK_FEMORAL"], {}, ["BLOCK_FEMORAL"])
  })

  it("says so when nothing matches", () => {
    setup()
    fireEvent.change(screen.getByTestId("technique-search"), { target: { value: "zzzz" } })
    expect(screen.getByText("noMatch")).toBeTruthy()
  })

  it("asks for the side of a block, saves it with the list, and clears it when tapped again", () => {
    const { onChange } = setup({ techniques: ["GENERAL_BALANCED", "BLOCK_ADDUCTOR"] })
    expect(screen.queryByTestId("technique-side-GENERAL_BALANCED-LEFT")).toBeNull()
    fireEvent.click(screen.getByTestId("technique-side-BLOCK_ADDUCTOR-LEFT"))
    expect(onChange).toHaveBeenLastCalledWith(["GENERAL_BALANCED", "BLOCK_ADDUCTOR"], { BLOCK_ADDUCTOR: "LEFT" }, [])
  })

  it("clears a side that is tapped again, and the unilateral spinal takes one", () => {
    const { onChange } = setup({ techniques: ["BLOCK_ADDUCTOR", "SPINAL_UNILATERAL"], sides: { BLOCK_ADDUCTOR: "LEFT", SPINAL_UNILATERAL: "RIGHT" } })
    expect(screen.getByTestId("technique-side-SPINAL_UNILATERAL-RIGHT")).toBeTruthy()
    fireEvent.click(screen.getByTestId("technique-side-BLOCK_ADDUCTOR-LEFT"))
    expect(onChange).toHaveBeenLastCalledWith(["BLOCK_ADDUCTOR", "SPINAL_UNILATERAL"], { SPINAL_UNILATERAL: "RIGHT" }, [])
  })

  it("removing a technique removes its side", () => {
    const { onChange } = setup({ techniques: ["SPINAL_UNILATERAL", "BLOCK_TAP"], sides: { SPINAL_UNILATERAL: "RIGHT", BLOCK_TAP: "BOTH" } })
    fireEvent.click(screen.getByTestId("technique-remove-BLOCK_TAP"))
    expect(onChange).toHaveBeenCalledWith(["SPINAL_UNILATERAL"], { SPINAL_UNILATERAL: "RIGHT" }, [])
  })

  it("offers the preop plan, takes all of it in one tap, and hides it once chosen", () => {
    const { onChange } = setup({ planned: ["GENERAL_TIVA", "BLOCK_ADDUCTOR", "GENERAL_BALANCED"] })
    fireEvent.click(screen.getByTestId("technique-use-plan"))
    expect(onChange).toHaveBeenCalledWith(["GENERAL_BALANCED", "GENERAL_TIVA", "BLOCK_ADDUCTOR"], {}, ["GENERAL_TIVA", "BLOCK_ADDUCTOR"])
  })

  it("shows no plan card when everything planned is already chosen", () => {
    setup({ planned: ["GENERAL_BALANCED"] })
    expect(screen.queryByTestId("technique-plan")).toBeNull()
  })

  it("shows the usual techniques and adds one in a tap", () => {
    const { onChange } = setup({ recents: ["SPINAL_SINGLE_LUMBAR", "BLOCK_TAP"] })
    fireEvent.click(screen.getByTestId("technique-recent-BLOCK_TAP"))
    expect(onChange).toHaveBeenCalledWith(["GENERAL_BALANCED", "BLOCK_TAP"], {}, ["BLOCK_TAP"])
  })

  it("keeps usual-technique pills to the leaf name because the breadcrumb has the path", () => {
    setup({ recents: ["GENERAL_BALANCED"] })
    expect(screen.getByTestId("technique-recent-GENERAL_BALANCED").textContent).toBe("Balanced (inhaled + IV)")
  })

  it("keeps browse rows to their local label while retaining the full path for assistive technology", () => {
    setup({ techniques: [] })
    fireEvent.click(screen.getByTestId("technique-node-GENERAL"))
    expect(screen.getByTestId("technique-leaf-GENERAL_INHALATION").textContent).toBe("Inhalational")
    expect(screen.getByTestId("technique-leaf-GENERAL_INHALATION").getAttribute("aria-label")).toBe("General Anaesthesia · Inhalational")
  })

  it("opens the full list in place under a group and picks a leaf", () => {
    const { onChange } = setup({ techniques: [] })
    expect(screen.queryByTestId("technique-leaf-GENERAL_TIVA")).toBeNull()
    fireEvent.click(screen.getByTestId("technique-node-GENERAL"))
    fireEvent.click(screen.getByTestId("technique-leaf-GENERAL_TIVA"))
    expect(onChange).toHaveBeenCalledWith(["GENERAL_TIVA"], {}, ["GENERAL_TIVA"])
  })

  it("adds a free-text technique from Other", () => {
    const { onChange } = setup({ techniques: [] })
    const input = screen.getByTestId("technique-other")
    fireEvent.change(input, { target: { value: "Hypnosis" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith(["OTHER:Hypnosis"], {}, [])
  })
})
