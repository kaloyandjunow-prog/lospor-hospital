import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, getByText, pressByText } from "@/test/render"
import { IntraopUndoBar } from "./IntraopUndoBar"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    tc: (key: string) => ({
      ubItemAdded: "{text} добавено",
      ubItemRemoved: "{text} — премахнато",
      ubItemPlanned: "{text} — планирано за {time}",
      ubUndo: "Отмени",
      ubDismiss: "Скрий",
    } as Record<string, string>)[key] ?? key,
  }),
}))

// Found testing Hospital 1.5.0: a removed event offered no Undo.
describe("IntraopUndoBar after a delete", () => {
  it("says the entry was removed and offers Undo and Hide", () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()
    const tree = render(<IntraopUndoBar text="Интубация" removed onUndo={onUndo} onDismiss={onDismiss} />)
    expect(getByText(tree, "Интубация — премахнато")).toBeTruthy()
    pressByText(tree, "Отмени")
    pressByText(tree, "Скрий")
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("still says added after an add", () => {
    const tree = render(<IntraopUndoBar text="Интубация" onUndo={() => {}} onDismiss={() => {}} />)
    expect(getByText(tree, "Интубация добавено")).toBeTruthy()
  })
})
