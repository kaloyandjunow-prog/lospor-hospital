import { Platform, Vibration } from "react-native"
import * as Haptics from "expo-haptics"

// Web: use navigator.vibrate() (Android Chrome only — iOS Safari has no vibration API).
// Android native: Vibration.vibrate() hits the vibrator directly and is reliable.
// iOS native: expo-haptics produces precise named haptic patterns.

function webVibrate(ms: number) {
  try { navigator?.vibrate?.(ms) } catch { /* not supported */ }
}

export function hapticTick() {
  if (Platform.OS === "web") { webVibrate(8); return }
  if (Platform.OS === "android") {
    Vibration.vibrate(8)
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }
}

export function hapticConfirm() {
  if (Platform.OS === "web") { webVibrate(16); return }
  if (Platform.OS === "android") {
    Vibration.vibrate(16)
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  }
}

export function hapticKey() {
  if (Platform.OS === "web") { webVibrate(6); return }
  if (Platform.OS === "android") {
    Vibration.vibrate(6)
  } else {
    Haptics.selectionAsync().catch(() => {})
  }
}
