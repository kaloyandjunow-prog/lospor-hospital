import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import type { TechniqueSide } from "@lospor/core/technique-smart"

const setTechniqueScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: "en", techniqueScreen: "smart", setTechniqueScreen }),
}))

import { render } from "@/test/render"
import { TechniqueScreenCard } from "@/components/settings/TechniqueScreenCard"
import { TechniqueSmart } from "./TechniqueSmart"

type Node = { v: string; label: string; isOther?: boolean; children?: Node[] }
const tree: Node[] = [
  { v: "GENERAL", label: "General Anaesthesia", children: [{ v: "GENERAL_INHALATION", label: "Inhalational" }, { v: "GENERAL_TIVA", label: "TIVA" }, { v: "GENERAL_BALANCED", label: "Balanced (inhaled + IV)" }] },
  { v: "REGIONAL", label: "Regional Anaesthesia", children: [{ v: "PERIPHERAL", label: "Peripheral nerve block", children: [{ v: "BLOCK_FEMORAL", label: "Femoral nerve" }, { v: "BLOCK_ADDUCTOR", label: "Adductor canal (saphenous)" }, { v: "BLOCK_TAP", label: "TAP block" }] }] },
  { v: "OTHER", label: "Other…", isOther: true },
]
const names = new Map<string, string>()
;(function walk(nodes: readonly Node[]) { for (const node of nodes) { names.set(node.v, node.label); if (node.children) walk(node.children) } })(tree)
const label = (code: string) => ({
  GENERAL_BALANCED: "General Anaesthesia · Balanced (inhaled + IV)",
  BLOCK_TAP: "Regional Anaesthesia · TAP block",
}[code] ?? names.get(code) ?? code)

const byId = (t: ReturnType<typeof render>, id: string) => t.root.findAll(node => node.props?.testID === id)[0]
const present = (t: ReturnType<typeof render>, id: string) => byId(t, id) !== undefined
const press = (t: ReturnType<typeof render>, id: string) => act(() => { byId(t, id)!.props.onPress() })
const type = (t: ReturnType<typeof render>, id: string, text: string) => act(() => { byId(t, id)!.props.onChangeText(text) })

function setup(over: Partial<Parameters<typeof TechniqueSmart>[0]> = {}) {
  const onChange = vi.fn<(techniques: string[], sides: Record<string, TechniqueSide>, added: string[]) => void>()
  const tr = render(<TechniqueSmart techniques={["GENERAL_BALANCED"]} sides={{}} onChange={onChange} tree={tree} label={label} color={() => "#3b82f6"} planned={[]} recents={[]} {...over} />)
  return { tr, onChange }
}

describe("Smart selection, the Technique tab on the phone (10.2.0)", () => {
  it("moves a searched TCI technique into Used in the controlled parent flow", () => {
    function Controlled() {
      const [selected, setSelected] = React.useState<string[]>([])
      return <TechniqueSmart techniques={selected} sides={{}} onChange={(next, _sides) => setSelected(next)} tree={tree} label={label} color={() => "#3b82f6"} planned={[]} recents={[]} />
    }
    const tr = render(<Controlled />)
    type(tr, "technique-search", "TCI")
    press(tr, "technique-hit-GENERAL_TCI")
    expect(present(tr, "technique-chip-GENERAL_TCI")).toBe(true)
  })

  it("shows what is in use with its path, and removes one in a tap", () => {
    const { tr, onChange } = setup()
    expect(present(tr, "technique-chip-GENERAL_BALANCED")).toBe(true)
    press(tr, "technique-remove-GENERAL_BALANCED")
    expect(onChange).toHaveBeenCalledWith([], {}, [])
  })

  it("finds a technique by search and shows where it sits", () => {
    const { tr, onChange } = setup()
    type(tr, "technique-search", "fem")
    expect(present(tr, "technique-hit-BLOCK_FEMORAL")).toBe(true)
    press(tr, "technique-hit-BLOCK_FEMORAL")
    expect(onChange).toHaveBeenCalledWith(["GENERAL_BALANCED", "BLOCK_FEMORAL"], {}, ["BLOCK_FEMORAL"])
  })

  it("says so when nothing matches", () => {
    const { tr } = setup()
    type(tr, "technique-search", "zzzz")
    expect(tr.root.findAll(node => node.props?.children === "tchNoMatch").length).toBeGreaterThan(0)
  })

  it("asks for the side of a block, saves it with the list, and clears it when tapped again", () => {
    const { tr, onChange } = setup({ techniques: ["GENERAL_BALANCED", "BLOCK_ADDUCTOR"] })
    expect(present(tr, "technique-side-GENERAL_BALANCED-LEFT")).toBe(false)
    press(tr, "technique-side-BLOCK_ADDUCTOR-LEFT")
    expect(onChange).toHaveBeenLastCalledWith(["GENERAL_BALANCED", "BLOCK_ADDUCTOR"], { BLOCK_ADDUCTOR: "LEFT" }, [])
    const again = setup({ techniques: ["BLOCK_ADDUCTOR"], sides: { BLOCK_ADDUCTOR: "LEFT" } })
    press(again.tr, "technique-side-BLOCK_ADDUCTOR-LEFT")
    expect(again.onChange).toHaveBeenLastCalledWith(["BLOCK_ADDUCTOR"], {}, [])
  })

  it("the unilateral spinal takes a side, and removing a technique removes its side", () => {
    const { tr, onChange } = setup({ techniques: ["SPINAL_UNILATERAL", "BLOCK_TAP"], sides: { SPINAL_UNILATERAL: "RIGHT", BLOCK_TAP: "BOTH" } })
    expect(present(tr, "technique-side-SPINAL_UNILATERAL-RIGHT")).toBe(true)
    press(tr, "technique-remove-BLOCK_TAP")
    expect(onChange).toHaveBeenCalledWith(["SPINAL_UNILATERAL"], { SPINAL_UNILATERAL: "RIGHT" }, [])
  })

  it("offers the preop plan and takes all of it in one tap", () => {
    const { tr, onChange } = setup({ planned: ["GENERAL_TIVA", "BLOCK_ADDUCTOR", "GENERAL_BALANCED"] })
    expect(present(tr, "technique-plan")).toBe(true)
    press(tr, "technique-use-plan")
    expect(onChange).toHaveBeenCalledWith(["GENERAL_BALANCED", "GENERAL_TIVA", "BLOCK_ADDUCTOR"], {}, ["GENERAL_TIVA", "BLOCK_ADDUCTOR"])
  })

  it("hides the plan once everything in it is chosen", () => {
    const { tr } = setup({ planned: ["GENERAL_BALANCED"] })
    expect(present(tr, "technique-plan")).toBe(false)
  })

  it("shows the usual techniques and adds one in a tap", () => {
    const { tr, onChange } = setup({ recents: ["SPINAL_SINGLE_LUMBAR", "BLOCK_TAP"] })
    press(tr, "technique-recent-BLOCK_TAP")
    expect(onChange).toHaveBeenCalledWith(["GENERAL_BALANCED", "BLOCK_TAP"], {}, ["BLOCK_TAP"])
  })

  it("keeps usual-technique pills to the leaf name because the breadcrumb has the path", () => {
    const { tr } = setup({ recents: ["GENERAL_BALANCED"] })
    const pill = byId(tr, "technique-recent-GENERAL_BALANCED")
    expect(pill.findAll(node => node.props?.children === "Balanced (inhaled + IV)").length).toBeGreaterThan(0)
    expect(pill.findAll(node => node.props?.children === "General Anaesthesia · Balanced (inhaled + IV)").length).toBe(0)
  })

  it("keeps browse groups to their local label when the full path is available to assistive technology", () => {
    const tr = render(<TechniqueSmart techniques={[]} sides={{}} onChange={vi.fn()} tree={tree}
      label={code => `Full path for ${code}`} color={() => "#3b82f6"} planned={[]} recents={[]} />)
    expect(tr.root.findAll(node => node.props?.children === "General Anaesthesia").length).toBeGreaterThan(0)
    expect(tr.root.findAll(node => node.props?.children === "Full path for GENERAL").length).toBe(0)
  })

  it("opens the full list in place under a group and picks a leaf", () => {
    const { tr, onChange } = setup({ techniques: [] })
    expect(present(tr, "technique-leaf-GENERAL_TIVA")).toBe(false)
    press(tr, "technique-node-GENERAL")
    press(tr, "technique-leaf-GENERAL_TIVA")
    expect(onChange).toHaveBeenCalledWith(["GENERAL_TIVA"], {}, ["GENERAL_TIVA"])
  })

  it("adds a free-text technique from Other", () => {
    const { tr, onChange } = setup({ techniques: [] })
    type(tr, "technique-other", "Hypnosis")
    act(() => { byId(tr, "technique-other")!.props.onSubmitEditing() })
    expect(onChange).toHaveBeenCalledWith(["OTHER:Hypnosis"], {}, [])
  })
})

describe("the Technique tab setting on the phone", () => {
  it("offers Smart selection and Legacy and saves the one picked", () => {
    const tr = render(<TechniqueScreenCard />)
    expect(present(tr, "technique-screen-smart")).toBe(true)
    act(() => { byId(tr, "technique-screen-legacy")!.props.onPress() })
    expect(setTechniqueScreen).toHaveBeenCalledWith("legacy")
  })
})
