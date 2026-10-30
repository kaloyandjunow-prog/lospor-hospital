import React from "react"
import { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

import { dashboardMenuActions } from "@/lib/case-actions"
import { render } from "@/test/render"
import { DashboardCaseMenu } from "./DashboardCaseMenu"

const t = (key: string): string => ({
  assignTheatre: "Assign operating theatre",
  theatreLabel: "Operating theatre",
  theatreChangeableNote: "Can be changed until intraop starts.",
  noTheatre: "No theatre",
  cancelProcedure: "Cancel procedure",
  deleteCase: "Delete case",
  handOver: "Hand over",
  cancel: "Cancel",
  back: "Back",
}[key] ?? key)

const tc = (key: string): string => key

function textNode(tree: ReactTestRenderer, text: string) {
  return tree.root.find(node => node.children.join("") === text)
}

function pressText(tree: ReactTestRenderer, text: string) {
  let node: ReactTestInstance | null = textNode(tree, text)
  while (node && typeof node.props.onPress !== "function") node = node.parent
  if (!node) throw new Error(`No pressable ancestor found for text: ${text}`)
  act(() => node.props.onPress())
}

describe("the dashboard operating-theatre menu", () => {
  it("opens the local theatre choices for a changeable draft", () => {
    const onAssignTheatre = vi.fn()
    const props = {
      menuCase: { id: "c1", caseCode: "2026-0046", theatre: { id: null, name: null } },
      menuActions: dashboardMenuActions({ status: "DRAFT", writable: true, theatreChangeable: true }),
      caseLabel: "Tonsillectomy",
      language: "en" as const,
      t,
      tc,
      closeMenu: vi.fn(),
      actionLoading: false,
      handoverBusy: false,
      loadingColleagues: false,
      colleagues: [],
      onPrint: vi.fn(),
      onDelete: vi.fn(),
      onShowAssign: vi.fn(),
      onAssignTo: vi.fn(),
      onWithdraw: vi.fn(),
      onCancelProcedure: vi.fn(),
      onUndoCancellation: vi.fn(),
      onAssignTheatre,
      onConfirmDelete: vi.fn(),
      cancelReason: null,
      setCancelReason: vi.fn(),
      cancelNote: "",
      setCancelNote: vi.fn(),
      theatres: [{ id: "t1", name: "Theatre 1" }, { id: "t2", name: "Theatre 2" }],
    }
    function Harness() {
      const [menuMode, setMenuMode] = React.useState<"menu" | "theatre">("menu")
      const setMode = (mode: "menu" | "assign" | "theatre" | "cancel" | "confirmDelete") => {
        if (mode === "menu" || mode === "theatre") setMenuMode(mode)
      }
      return <DashboardCaseMenu {...props} menuMode={menuMode} setMenuMode={setMode} />
    }
    const tree = render(<Harness />)

    expect(textNode(tree, "Assign operating theatre…")).toBeTruthy()
    pressText(tree, "Assign operating theatre…")
    expect(textNode(tree, "Theatre 1")).toBeTruthy()
    expect(textNode(tree, "Theatre 2")).toBeTruthy()
    pressText(tree, "Theatre 2")
    expect(onAssignTheatre).toHaveBeenCalledWith("t2")
  })
})
