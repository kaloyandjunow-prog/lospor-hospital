import { useEffect, useRef } from "react"
import { AppState, Platform } from "react-native"
import { createSingleFlightPoller } from "@lospor/core/sync"

export function useSingleFlightRefresh(
  refresh: () => void | Promise<void>,
  input: {
    enabled: boolean
    intervalMs: number
    refreshOnForeground: boolean
    identity?: string
    /**
     * Poll once as soon as this becomes enabled, instead of waiting for the
     * first full intervalMs. Off by default: most callers refresh state that
     * was just fetched a moment ago on the same mount, and an immediate
     * duplicate poll would be pure waste for them.
     */
    immediate?: boolean
  },
) {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!input.enabled) return

    const poller = createSingleFlightPoller({
      intervalMs: input.intervalMs,
      poll: async () => { await refreshRef.current() },
      isActive: () => AppState.currentState === "active",
      scheduler: {
        schedule: (callback, delayMs) => setTimeout(callback, delayMs),
        cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    })
    poller.start()
    // start() always waits a full intervalMs before its first poll. A caller
    // that opts in here has state worth checking right away (e.g. clinical
    // work queued while this was disabled), not a reason to wait.
    if (input.immediate) void poller.trigger()

    const subscription = AppState.addEventListener("change", state => {
      if (input.refreshOnForeground && state === "active") void poller.trigger()
    })

    // The web AppState shim only tracks document visibility, not network
    // reachability -- reconnecting in the same foregrounded tab fires neither
    // a "change" event nor an immediate poll, leaving offline clinical work
    // queued for up to intervalMs. The browser's own connectivity event
    // covers exactly that gap.
    const handleOnline = () => void poller.trigger()
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("online", handleOnline)
    }

    return () => {
      poller.stop()
      subscription.remove()
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline)
      }
    }
  }, [
    input.enabled,
    input.identity,
    input.immediate,
    input.intervalMs,
    input.refreshOnForeground,
  ])
}
