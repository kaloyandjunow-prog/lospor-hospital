"use client"

import { useSyncExternalStore } from "react"
import { bulgarianNamesVersion, subscribeBulgarianNames } from "@lospor/core/display"

/**
 * Re-renders when a Bulgarian-name switch changes. A screen that keeps drug,
 * infusion, agent or fluid names in a memo adds this to its dependencies.
 */
export function useBulgarianNamesVersion(): number {
  return useSyncExternalStore(subscribeBulgarianNames, bulgarianNamesVersion, () => 0)
}
