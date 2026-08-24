import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    t: (key: string) => ({
      syncSaved: "Запазено",
      syncSaving: "Запазва се…",
      syncFailed: "Синхронизирането е неуспешно",
      syncOffline: "Без връзка",
    })[key] ?? key,
  }),
}))

import { getByText, pressByText, render } from "@/test/render"
import { ActionTile, ScreenState, SyncBadge, WorkflowPill } from "./clinical-ui"

describe("clinical UI components", () => {
  it("renders screen state copy and calls the action", () => {
    const onAction = vi.fn()
    const tree = render(
      <ScreenState title="No cases" message="Start a new case." action="Create" onAction={onAction} />,
    )

    expect(getByText(tree, "No cases")).toBeTruthy()
    expect(getByText(tree, "Start a new case.")).toBeTruthy()

    pressByText(tree, "Create")

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it("fires workflow pill presses", () => {
    const onPress = vi.fn()
    const tree = render(<WorkflowPill label="Active" selected={false} onPress={onPress} />)

    pressByText(tree, "Active")

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("does not fire disabled action tile presses", () => {
    const onPress = vi.fn()
    const tree = render(<ActionTile label="Vitals" onPress={onPress} disabled />)

    pressByText(tree, "Vitals")

    expect(onPress).not.toHaveBeenCalled()
  })

  it("renders sync detail when provided", () => {
    const tree = render(<SyncBadge state="failed" detail="Queued offline" />)

    expect(getByText(tree, "Queued offline")).toBeTruthy()
  })

  it("localizes the sync state when no server detail is provided", () => {
    const tree = render(<SyncBadge state="saved" />)

    expect(getByText(tree, "Запазено")).toBeTruthy()
  })
})
