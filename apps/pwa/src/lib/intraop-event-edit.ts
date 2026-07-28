import type { LogEvent } from "./intraop-log-event"
import { formatTs } from "./intraop-format"

export function intraopEventEditDraft(event: LogEvent): { dose: string; time: string } {
  return {
    dose: event.type === "drug" ? (event.dose ?? "") : "",
    time: formatTs(event.ts),
  }
}

export function applyIntraopEventEdit(
  log: LogEvent[],
  eventId: string,
  editTime: string,
  editDose: string,
): LogEvent[] {
  return log.map(event => {
    if (event.id !== eventId) return event
    const [hours, minutes] = editTime.split(":").map(Number)
    const nextTs = new Date(event.ts)
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      nextTs.setHours(hours)
      nextTs.setMinutes(minutes)
    }
    return {
      ...event,
      ...(event.type === "drug" ? { dose: editDose } : {}),
      ts: nextTs.toISOString(),
    }
  })
}
