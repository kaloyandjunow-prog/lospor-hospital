// Native (iOS/Android) notifications via expo-notifications. Metro resolves this
// file on device in preference to notifications.ts. Same interface as the web file.
//
// expo-notifications throws at MODULE LOAD time (not just on individual calls) when
// running inside Expo Go on SDK 53+, because remote/push notification support was
// removed from Expo Go. A top-level `import` can't be try/caught, so the module is
// loaded lazily via require() the first time it's needed, and every export degrades
// to "unsupported" if that load fails — keeps the app usable in Expo Go and only
// needs a real dev/production build for actual notification delivery.
import { Platform } from "react-native"

export type ReminderHandle = string | number | null
export type NotifPermission = "granted" | "denied" | "default" | "unsupported"
export type NotifStatus = { supported: boolean; permission: NotifPermission; reason?: string }

const CHANNEL_ID = "reminders"
const UNSUPPORTED_REASON = "Notifications aren't available in Expo Go — use a development or production build."

type NotificationsModule = typeof import("expo-notifications")

let cachedModule: NotificationsModule | null | undefined // undefined = not attempted yet

function loadModule(): NotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule
  try {
    cachedModule = require("expo-notifications") as NotificationsModule
  } catch {
    cachedModule = null
  }
  return cachedModule
}

export async function getStatus(): Promise<NotifStatus> {
  const Notifications = loadModule()
  if (!Notifications) return { supported: false, permission: "unsupported", reason: UNSUPPORTED_REASON }
  try {
    const p = await Notifications.getPermissionsAsync()
    return {
      supported: true,
      permission: p.granted ? "granted" : p.canAskAgain ? "default" : "denied",
    }
  } catch {
    return { supported: false, permission: "unsupported", reason: "Notifications need a rebuilt app — update to the latest build." }
  }
}

// Show notifications while the app is foregrounded, and create the Android channel.
// Safe to call once at startup.
export function configureForeground(): void {
  const Notifications = loadModule()
  if (!Notifications) return // Expo Go (or an old dev client) — notifications stay off
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Case reminders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      }).catch(() => {})
    }
  } catch {
    /* native module unavailable (old dev client) — notifications stay off */
  }
}

export async function ensurePermission(): Promise<boolean> {
  const Notifications = loadModule()
  if (!Notifications) return false
  try {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (!current.canAskAgain) return false
    const res = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    })
    return res.granted
  } catch {
    return false
  }
}

export async function presentNow(title: string, body: string): Promise<void> {
  const Notifications = loadModule()
  if (!Notifications) return
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  })
}

export async function scheduleRepeating(title: string, body: string, intervalMinutes: number): Promise<ReminderHandle> {
  const Notifications = loadModule()
  if (!Notifications) return null
  // iOS requires a repeating interval of at least 60s.
  const seconds = Math.max(60, Math.round(intervalMinutes * 60))
  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: true,
      channelId: CHANNEL_ID,
    },
  })
}

export async function cancelReminder(handle: ReminderHandle): Promise<void> {
  const Notifications = loadModule()
  if (!Notifications) return
  if (typeof handle === "string") {
    try { await Notifications.cancelScheduledNotificationAsync(handle) } catch { /* already gone */ }
  }
}
