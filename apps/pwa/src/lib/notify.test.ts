import { describe, expect, it, vi, beforeEach } from "vitest"
import { Alert, Platform } from "react-native"
import { notify, confirmAction, actionSheet } from "./notify"
import { getActionSheetSnapshot, dismissActionSheet } from "./action-sheet-store"

const alertMock = Alert.alert as unknown as ReturnType<typeof vi.fn>
const setOS = (os: string) => { (Platform as any).OS = os }

describe("notify helpers (native paths)", () => {
  beforeEach(() => { setOS("ios"); alertMock.mockClear(); dismissActionSheet() })

  it("notify shows a native alert", () => {
    notify("Title", "Message")
    expect(alertMock).toHaveBeenCalledWith("Title", "Message")
  })

  it("confirmAction resolves true when the confirm button is pressed", async () => {
    const p = confirmAction("Delete?", "Sure?", { destructive: true, confirmLabel: "Delete" })
    const buttons = alertMock.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[]
    buttons.find(b => b.text === "Delete")!.onPress!()
    await expect(p).resolves.toBe(true)
  })

  it("confirmAction resolves false on cancel", async () => {
    const p = confirmAction("Delete?")
    const buttons = alertMock.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[]
    buttons.find(b => b.style === "cancel")!.onPress!()
    await expect(p).resolves.toBe(false)
  })

  // The web build degrades Alert to window.confirm, which has neither
  // destructive styling nor custom labels — so the PWA end-to-end suite cannot
  // see any of this. On a phone it is the whole difference between a prompt a
  // tired clinician reads and one they tap through.
  it("marks a destructive confirmation as destructive and labels both buttons", () => {
    void confirmAction("Leave this institution?", "Cases stay where they are.", {
      destructive: true,
      confirmLabel: "Leave",
      cancelLabel: "Stay",
    })
    const [title, message, buttons] = alertMock.mock.calls[0] as [
      string, string | undefined, { text: string; style?: string }[],
    ]
    expect(title).toBe("Leave this institution?")
    expect(message).toBe("Cases stay where they are.")
    expect(buttons.find(b => b.text === "Leave")?.style).toBe("destructive")
    expect(buttons.find(b => b.text === "Stay")?.style).toBe("cancel")
  })

  it("resolves false when the confirmation is dismissed rather than answered", async () => {
    // Tapping outside, or the Android back button. Neither presses a button, so
    // without this the promise would never settle and the action would hang
    // rather than being cancelled.
    const pending = confirmAction("Leave this institution?")
    const options = alertMock.mock.calls[0][3] as { onDismiss?: () => void }
    options.onDismiss!()
    await expect(pending).resolves.toBe(false)
  })

  it("actionSheet uses native Alert with mapped buttons", () => {
    const onPress = vi.fn()
    actionSheet("Menu", undefined, [{ label: "Go", onPress }, { label: "Cancel", cancel: true }])
    const [title, , buttons] = alertMock.mock.calls[0] as [string, string | undefined, { text: string; onPress?: () => void }[]]
    expect(title).toBe("Menu")
    expect(buttons.map(b => b.text)).toEqual(["Go", "Cancel"])
    buttons[0].onPress!()
    expect(onPress).toHaveBeenCalled()
  })

  it("actionSheet on web pushes to the in-app store instead of Alert", () => {
    setOS("web")
    actionSheet("WebMenu", "msg", [{ label: "X" }])
    expect(alertMock).not.toHaveBeenCalled()
    expect(getActionSheetSnapshot()?.title).toBe("WebMenu")
  })
})
