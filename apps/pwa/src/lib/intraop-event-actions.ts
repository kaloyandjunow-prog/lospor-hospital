import type { SheetAction } from "./action-sheet-store"
import type { LogEvent } from "./intraop-log-event"

type BuildIntraopEventActionsInput = {
  event: LogEvent
  cancelLabel: string
  repeatDrug: () => void
  editEvent: () => void
  deleteEvent: () => void
  labels?: {
    repeatDose: string
    editDoseAndTime: string
    editTimeOnly: string
    deleteLabel: string
  }
}

export function repeatDrugEventPayload(event: LogEvent): Omit<LogEvent, "id" | "ts"> {
  return {
    type: "drug",
    name: event.name,
    dose: event.dose,
    unit: event.unit,
    category: event.category,
    color: event.color,
    ...(event.drugRoute !== undefined ? { drugRoute: event.drugRoute } : {}),
    ...(event.concentration !== undefined ? { concentration: event.concentration } : {}),
    ...(event.formulation !== undefined ? { formulation: event.formulation } : {}),
    ...(event.drugId !== undefined ? { drugId: event.drugId } : {}),
    ...(event.atcCode !== undefined ? { atcCode: event.atcCode } : {}),
    ...(event.inn !== undefined ? { inn: event.inn } : {}),
    ...(event.clinicalRuleKey !== undefined ? { clinicalRuleKey: event.clinicalRuleKey } : {}),
    ...(event.clinicalRuleVersion !== undefined ? { clinicalRuleVersion: event.clinicalRuleVersion } : {}),
    ...(event.clinicalRuleSourceIds !== undefined
      ? { clinicalRuleSourceIds: [...event.clinicalRuleSourceIds] }
      : {}),
  }
}

export function buildIntraopEventActions({
  event,
  cancelLabel,
  repeatDrug,
  editEvent,
  deleteEvent,
  labels = {
    repeatDose: "Repeat dose",
    editDoseAndTime: "Edit dose/time",
    editTimeOnly: "Edit time",
    deleteLabel: "Delete",
  },
}: BuildIntraopEventActionsInput): SheetAction[] {
  const actions: SheetAction[] = []
  if (event.type === "drug") {
    actions.push({ label: labels.repeatDose, onPress: repeatDrug })
    actions.push({ label: labels.editDoseAndTime, onPress: editEvent })
  } else {
    actions.push({ label: labels.editTimeOnly, onPress: editEvent })
  }
  actions.push({ label: labels.deleteLabel, destructive: true, onPress: deleteEvent })
  actions.push({ label: cancelLabel, cancel: true })
  return actions
}
