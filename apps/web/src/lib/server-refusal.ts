import type { PatchFailure } from "@lospor/core/sync"

/**
 * The server answered "no" (a 4xx other than timeout or rate limit), as opposed
 * to the network being away. Such a save must not be shown as "saved locally,
 * will sync": it will not sync by waiting.
 */
export function isServerRefusal(failure: PatchFailure | undefined): boolean {
  return failure?.kind === "http"
    && failure.status >= 400 && failure.status < 500
    && failure.status !== 408 && failure.status !== 429
}
