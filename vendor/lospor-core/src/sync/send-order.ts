// One send order per case (9.13.0).
//
// A case's unsent intraoperative changes live in two journals: new events
// (pending-events) and edits and deletions of saved ones
// (event-mutation-journal). Each used to be sent on its own, so the server
// could receive them in a different order from the one they were made in: a
// deletion sent before the entry it deletes was refused as "not found" and
// dropped, and the entry then arrived and came back. This list records every
// change the moment it is made, and the autosave manager sends in exactly this
// order; nothing overtakes anything.
//
// The journals keep their storage keys, so changes queued on a device before
// this list existed are still sent -- first, as they are the oldest.

import type { KVAdapter } from "./protocol"
import { createSingleFlightQueue } from "./single-flight-queue"

export type SendOrderEntry =
  | { kind: "event"; id: string }
  | { kind: "mutation"; id: string }

export function sendOrderKey(caseId: string): string {
  return `lospor_case_send_order_v1_${caseId}`
}

export function sameSendOrderEntry(a: SendOrderEntry, b: SendOrderEntry): boolean {
  return a.kind === b.kind && a.id === b.id
}

export function createSendOrder(kv: KVAdapter) {
  const storage = createSingleFlightQueue()

  async function load(caseId: string): Promise<SendOrderEntry[]> {
    const raw = await kv.get(sendOrderKey(caseId))
    if (!raw) return []
    try {
      const value = JSON.parse(raw)
      return Array.isArray(value)
        ? value.filter((entry): entry is SendOrderEntry =>
            (entry?.kind === "event" || entry?.kind === "mutation") && typeof entry.id === "string")
        : []
    } catch {
      return []
    }
  }

  async function store(caseId: string, entries: SendOrderEntry[]): Promise<void> {
    if (entries.length === 0) await kv.delete(sendOrderKey(caseId))
    else await kv.set(sendOrderKey(caseId), JSON.stringify(entries))
  }

  /** Appends a change; a change already listed keeps its place. */
  function record(caseId: string, entry: SendOrderEntry): Promise<void> {
    return storage.enqueue(async () => {
      const entries = await load(caseId)
      if (!entries.some(existing => sameSendOrderEntry(existing, entry))) await store(caseId, [...entries, entry])
    })
  }

  function remove(caseId: string, match: (entry: SendOrderEntry) => boolean): Promise<void> {
    return storage.enqueue(async () => {
      await store(caseId, (await load(caseId)).filter(entry => !match(entry)))
    })
  }

  function clearCase(caseId: string): Promise<void> {
    return storage.enqueue(() => kv.delete(sendOrderKey(caseId)))
  }

  return { load, record, remove, clearCase }
}

export type SendOrder = ReturnType<typeof createSendOrder>
