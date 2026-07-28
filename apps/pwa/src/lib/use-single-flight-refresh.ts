import { useEffect, useRef } from "react"
import { AppState } from "react-native"
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

    return () => {
      poller.stop()
      subscription.remove()
    }
  }, [
    input.enabled,
    input.identity,
    input.intervalMs,
    input.refreshOnForeground,
  ])
}
