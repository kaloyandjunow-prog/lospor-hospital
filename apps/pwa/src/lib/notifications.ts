// Web / PWA notifications (default resolution; Metro picks notifications.native.ts
// on device, TypeScript resolves this file). expo-notifications does NOT support
// web, so the PWA uses the browser Notification API + the registered service worker.

export type ReminderHandle = string | number | null
export type NotifPermission = "granted" | "denied" | "default" | "unsupported"
export type NotifStatus = { supported: boolean; permission: NotifPermission; reason?: string }

function hasNotifications(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined"
}

// Why notifications might be unavailable on web — surfaced in the UI so failures
// aren't silent (the iOS case is the common one).
export async function getStatus(): Promise<NotifStatus> {
  if (typeof window === "undefined") {
    return { supported: false, permission: "unsupported", reason: "Notifications aren't available here." }
  }
  // The decisive signal: a non-secure origin (plain http:// over a LAN IP) makes the
  // browser block notifications AND service workers, even though the API may exist.
  if (window.isSecureContext === false) {
    return {
      supported: false,
      permission: "unsupported",
      reason: "This page is open over an insecure (http://) address, so the browser blocks notifications. Open it over HTTPS, or use the installed app — on a computer, http://localhost works.",
    }
  }
  if (typeof Notification === "undefined") {
    return {
      supported: false,
      permission: "unsupported",
      reason: "This browser doesn't support web notifications here. On iPhone, add LOSPOR to your Home Screen and open it from that icon.",
    }
  }
  return { supported: true, permission: Notification.permission as NotifPermission }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null
  try {
    // navigator.serviceWorker.ready never rejects and can hang if no SW activates,
    // so race it against a short timeout and fall back to a page-level Notification.
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 1500)),
    ])
  } catch {
    return null
  }
}

// Native sets a foreground handler / Android channel here; nothing to do on web.
export function configureForeground(): void {}

export async function ensurePermission(): Promise<boolean> {
  if (!hasNotifications()) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false
  try {
    const res = await Notification.requestPermission()
    return res === "granted"
  } catch {
    return false
  }
}

export async function presentNow(title: string, body: string): Promise<void> {
  if (!hasNotifications() || Notification.permission !== "granted") return
  const options: NotificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "lospor-reminder",
  }
  const reg = await registration()
  try {
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
  } catch {
    /* showNotification can reject if the SW isn't controlling the page yet */
  }
}

// The web can't schedule OS-level notifications without server push, so we fire on
// an in-app interval while the PWA is alive (the case screen is open during use).
export async function scheduleRepeating(title: string, body: string, intervalMinutes: number): Promise<ReminderHandle> {
  if (typeof window === "undefined") return null
  const ms = Math.max(1, intervalMinutes) * 60_000
  return window.setInterval(() => { void presentNow(title, body) }, ms)
}

export async function cancelReminder(handle: ReminderHandle): Promise<void> {
  if (typeof window !== "undefined" && typeof handle === "number") {
    window.clearInterval(handle)
  }
}
