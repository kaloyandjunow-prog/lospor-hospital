import { useSingleFlightRefresh } from "./use-single-flight-refresh"

type Options = {
  enabled?: boolean
  pollIntervalMs?: number
}

/**
 * Keeps an open case aligned with edits made elsewhere. The shared Core
 * poller guarantees that slow refreshes never overlap.
 */
export function useCaseLiveUpdates(
  caseId: string | undefined,
  refresh: () => void | Promise<void>,
  options: Options = {},
) {
  const { enabled = true, pollIntervalMs = 10_000 } = options
  useSingleFlightRefresh(refresh, {
    enabled: enabled && Boolean(caseId),
    intervalMs: pollIntervalMs,
    refreshOnForeground: true,
    identity: caseId,
  })
}
