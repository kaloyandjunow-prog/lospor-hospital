"use client"

import { PENDING_EVENTS_INDEX_KEY } from "@lospor/core/sync"

import {
  autosaveManager,
  onEventJournalChange,
} from "./autosave-manager"
import { idbKV } from "./kv-idb"

export const eventOutbox = autosaveManager.pendingEvents
export const onEventOutboxChange = onEventJournalChange

export async function eventOutboxCount(): Promise<number> {
  const raw = await idbKV.get(PENDING_EVENTS_INDEX_KEY).catch(() => null)
  if (!raw) return 0
  try {
    const ids = JSON.parse(raw) as string[]
    let total = 0
    for (const id of ids) total += (await eventOutbox.loadPending(id).catch(() => [])).length
    return total + await autosaveManager.eventMutations.total()
  } catch {
    return autosaveManager.eventMutations.total().catch(() => 0)
  }
}
