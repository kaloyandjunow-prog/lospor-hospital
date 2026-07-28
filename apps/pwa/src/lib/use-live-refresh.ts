import { useSingleFlightRefresh } from "./use-single-flight-refresh"

type Options = {
  enabled?: boolean
  intervalMs?: number
  refreshOnForeground?: boolean
}

export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  options: Options = {},
) {
  const {
    enabled = true,
    intervalMs = 10_000,
    refreshOnForeground = true,
  } = options
  useSingleFlightRefresh(refresh, {
    enabled,
    intervalMs,
    refreshOnForeground,
  })
}
