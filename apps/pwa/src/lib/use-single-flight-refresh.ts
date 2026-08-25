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
    input.intervalMs,
    input.refreshOnForeground,
  ])
}
