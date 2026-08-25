import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    t: (key: string) => ({
      cancel: "Cancel",
      confirm: "Confirm",
      takeOver: "Take over",
      watchingMode: "Being edited on another device — watching mode.",
      confirmTakeOver: "This will interrupt the other session. Confirm take over?",
    } as Record<string, string>)[key] ?? key,
  }),
}))

import { getByText, pressByText, queryByText, render } from "@/test/render"
import { WatchingOverlay } from "./WatchingOverlay"

describe("WatchingOverlay", () => {
  it("asks for confirmation before taking over", async () => {
    const onTakeover = vi.fn().mockResolvedValue(undefined)
    const tree = render(<WatchingOverlay onTakeover={onTakeover} />)

    expect(getByText(tree, "Take over")).toBeTruthy()

    pressByText(tree, "Take over")

    expect(getByText(tree, "This will interrupt the other session. Confirm take over?")).toBeTruthy()
    expect(queryByText(tree, "Take over")).toBeNull()

    pressByText(tree, "Confirm")

    expect(onTakeover).toHaveBeenCalledTimes(1)
  })

  it("can cancel takeover confirmation", () => {
    const onTakeover = vi.fn().mockResolvedValue(undefined)
    const tree = render(<WatchingOverlay onTakeover={onTakeover} />)

    pressByText(tree, "Take over")
    pressByText(tree, "Cancel")

    expect(queryByText(tree, "Confirm")).toBeNull()
    expect(getByText(tree, "Take over")).toBeTruthy()
    expect(onTakeover).not.toHaveBeenCalled()
  })
})
