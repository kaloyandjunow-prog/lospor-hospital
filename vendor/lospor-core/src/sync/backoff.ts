// Retry rhythm for the outbox flushers: a steady heartbeat while things are
// healthy, escalating delays while saves keep failing, and an instant reset
// when connectivity returns (online event / app foreground).

export type FlushOutcome = "ok" | "failed" | "idle"

export type BackoffPolicy = {
  /** Delay before the next attempt, given what the last attempt did. */
  nextDelay(outcome: FlushOutcome): number
  /** Connectivity returned / app foregrounded — forget the failure streak. */
  reset(): void
  /** Consecutive failures so far (diagnostics/tests). */
  readonly failureCount: number
}

export function createBackoffPolicy(opts?: {
  steadyMs?: number
  failureSteps?: number[]
}): BackoffPolicy {
  const steadyMs = opts?.steadyMs ?? 15_000
  const failureSteps = opts?.failureSteps ?? [5_000, 15_000, 60_000]
  let failures = 0

  return {
    nextDelay(outcome: FlushOutcome): number {
      if (outcome === "failed") {
        const delay = failureSteps[Math.min(failures, failureSteps.length - 1)]
        failures += 1
        return delay
      }
      failures = 0
      return steadyMs
    },
    reset(): void {
      failures = 0
    },
    get failureCount() {
      return failures
    },
  }
}
