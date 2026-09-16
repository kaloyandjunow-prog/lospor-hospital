import type { LogEvent } from "@/lib/intraop-log-event"
import { serializeIntraopEventForServer } from "@/lib/pending-intraop-events"

export type PlannedEventMutation =
  | { kind: "event.upsert"; eventId: string; event: Record<string, unknown> }
  | { kind: "event.delete"; eventId: string }

function sameEvent(a: LogEvent, b: LogEvent): boolean {
  return JSON.stringify(serializeIntraopEventForServer(a)) === JSON.stringify(serializeIntraopEventForServer(b))
}

export function planEventMutations(previousLog: LogEvent[], nextLog: LogEvent[]): PlannedEventMutation[] {
  const previousById = new Map(previousLog.map(event => [event.id, event]))
  const nextById = new Map(nextLog.map(event => [event.id, event]))
  const mutations: PlannedEventMutation[] = []

  for (const event of nextLog) {
    const previous = previousById.get(event.id)
    if (previous && sameEvent(previous, event)) continue
    mutations.push({
      kind: "event.upsert",
      eventId: event.id,
      event: serializeIntraopEventForServer(event) as Record<string, unknown>,
    })
  }
  for (const event of previousLog) {
    if (!nextById.has(event.id)) mutations.push({ kind: "event.delete", eventId: event.id })
  }
  return mutations
}
