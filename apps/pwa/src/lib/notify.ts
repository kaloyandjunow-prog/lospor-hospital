import { Alert, Platform } from "react-native"
import { showActionSheet, type SheetAction } from "@/lib/action-sheet-store"

// react-native-web ships an Alert whose `.alert()` is an empty no-op
// (class Alert { static alert() {} }). Any message/confirm/action menu routed
// through Alert.alert is therefore completely invisible on the PWA. These
// helpers fall back to web-native equivalents (window.alert/confirm and an
// in-app action sheet) so dialogs actually work on pwa.lospor.org.

// One-button informational message.
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(text)
    }
    return
  }
  Alert.alert(title, message)
}

export type ConfirmOptions = {
  destructive?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

// Two-button confirm. Resolves true if confirmed, false if cancelled/dismissed.
export function confirmAction(title: string, message?: string, opts: ConfirmOptions = {}): Promise<boolean> {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title
    const ok = typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(text)
      : false
    return Promise.resolve(ok)
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: opts.cancelLabel ?? "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: opts.confirmLabel ?? "OK", style: opts.destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

// Multi-action menu. On native uses the OS action sheet; on web renders the
// in-app ActionSheetHost modal (mounted in the root layout).
export function actionSheet(title: string | undefined, message: string | undefined, actions: SheetAction[]): void {
  if (Platform.OS === "web") {
    showActionSheet({ title, message, actions })
    return
  }
  Alert.alert(
    title ?? "",
    message,
    actions.map((a) => ({
      text: a.label,
      style: a.cancel ? "cancel" : a.destructive ? "destructive" : "default",
      onPress: a.onPress,
    })),
  )
}
