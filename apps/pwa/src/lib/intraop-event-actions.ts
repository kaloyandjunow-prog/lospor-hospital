import type { SheetAction } from "./action-sheet-store"
import type { LogEvent } from "./intraop-log-event"

type BuildIntraopEventActionsInput = {
  event: LogEvent
  cancelLabel: string
  repeatDrug: () => void
  editEvent: () => void
  deleteEvent: () => void
}

export function repeatDrugEventPayload(event: LogEvent): Omit<LogEvent, "id" | "ts"> {
  return {
    type: "drug",
    name: event.name,
    dose: event.dose,
    unit: event.unit,
    category: event.category,
    color: event.color,
  }
}

export function buildIntraopEventActions({
  event,
  cancelLabel,
  repeatDrug,
  editEvent,
  deleteEvent,
}: BuildIntraopEventActionsInput): SheetAction[] {
  const actions: SheetAction[] = []
  if (event.type === "drug") {
    actions.push({ label: "Repeat dose", onPress: repeatDrug })
    actions.push({ label: "Edit dose/time", onPress: editEvent })
  } else {
    actions.push({ label: "Edit time", onPress: editEvent })
  }
  actions.push({ label: "Delete", destructive: true, onPress: deleteEvent })
  actions.push({ label: cancelLabel, cancel: true })
  return actions
}
