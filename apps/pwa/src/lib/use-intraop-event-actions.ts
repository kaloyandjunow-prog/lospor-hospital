import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import { useState, type Dispatch, type SetStateAction } from "react"

import { actionSheet, confirmAction } from "@/lib/notify"
import { formatTs } from "@/lib/intraop-format"
import { applyIntraopEventEdit, intraopEventEditDraft } from "@/lib/intraop-event-edit"
import { buildIntraopEventActions, repeatDrugEventPayload } from "@/lib/intraop-event-actions"
import { dispatchRowQuickAdd, slotIsoTimestamp, type RowQuickAddAction } from "@/lib/intraop-row-quick-add"
import type { LogEvent } from "@/lib/intraop-log-event"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import { isTourniquetLabel, tourniquetSheet } from "@/lib/tourniquet-sheet"

type EventLabel = (ev: LogEvent) => { text: string }

type UseIntraopEventActionsArgs = {
  log: LogEvent[]
  save: SaveIntraopEvent
  syncLog: (newLog: LogEvent[]) => Promise<boolean>
  removeEvent: (ev: LogEvent, sync?: boolean) => Promise<void>
  eventLabel: EventLabel
  cancelLabel: string
  chartStart: Date
  openVitals: (mode: "full" | "bp", ts: string) => void
  openDrug: (ts: string) => void
  openInfusion: (ts: string) => void
  openFluid: (ts: string) => void
  openAgent: (ts: string) => void
  openGasSettings: (ts: string) => void
  openLabs: (ts: string) => void
  setSlotTs: Dispatch<SetStateAction<Date | null>>
  slotTs: Date | null
  setSlotOpen: Dispatch<SetStateAction<boolean>>
}

export function useIntraopEventActions({
  log,
  save,
  syncLog,
  removeEvent,
  eventLabel,
  cancelLabel,
  chartStart,
  openVitals,
  openDrug,
  openInfusion,
  openFluid,
  openAgent,
  openGasSettings,
  openLabs,
  setSlotTs,
  slotTs,
  setSlotOpen,
}: UseIntraopEventActionsArgs) {
  const { tc } = usePreferences()
  const [editOpen, setEditOpen] = useState(false)
  const [editEv, setEditEv] = useState<LogEvent | null>(null)
  const [editDose, setEditDose] = useState("")
  const [editTime, setEditTime] = useState("")


  function eventActions(ev: LogEvent) {
    const openEdit = () => {
      const draft = intraopEventEditDraft(ev)
      setEditEv(ev)
      setEditDose(draft.dose)
      setEditTime(draft.time)
      setEditOpen(true)
    }
    const actions = buildIntraopEventActions({
      event: ev,
      cancelLabel,
      repeatDrug: () => save(repeatDrugEventPayload(ev)),
      editEvent: openEdit,
      deleteEvent: () => removeEvent(ev),
      labels: {
        repeatDose: tc("repeatDose"),
        editDoseAndTime: tc("editDoseAndTime"),
        editTimeOnly: tc("editTimeOnly"),
        deleteLabel: tc("deleteLabel"),
      },
    })
    actionSheet(eventLabel(ev).text, formatTs(ev.ts), actions)
  }

  function confirmEdit() {
    if (!editEv) return
    const newLog = applyIntraopEventEdit(log, editEv.id, editTime, editDose)
    syncLog(newLog)
    setEditOpen(false)
    setEditEv(null)
  }

  function promptDelete(ev: LogEvent) {
    void confirmAction(
      tc("deleteEventTitle"),
      formatMessage(tc("removeEventQuestion"), { name: eventLabel(ev).text }),
      { destructive: true, confirmLabel: tc("deleteLabel"), cancelLabel },
    )
      .then(ok => {
        if (ok) removeEvent(ev)
      })
  }

  function openRowQuickAdd(col: number, action: RowQuickAddAction) {
    dispatchRowQuickAdd(chartStart, col, action, {
      openVitals,
      openDrug,
      openInfusion,
      openFluid,
      openAgent,
      openGasSettings,
      openLabs,
      openEvent: date => {
        setSlotTs(date)
        setSlotOpen(true)
      },
    })
  }

  function openSlotEvent(ev: { label: string; color: string }, isComplication = false, suggestion?: string) {
    const ts = slotIsoTimestamp(slotTs)
    // A complication is one timed entry (10.1.0): on the timeline at the time
    // tapped, and in the complications list and the event log from that same
    // entry. Before 10.1.0 it went to the list only, without a time.
    if (isComplication) {
      void save({ type: "complication", label: ev.label, color: "#ef4444", complicationSource: "timeline" }, ts ?? undefined)
      setSlotOpen(false)
      return
    }
    // 10.2.0: a tourniquet asks where on the body first.
    if (ts && isTourniquetLabel(ev.label)) {
      tourniquetSheet.open({ ts, label: ev.label, color: ev.color })
      setSlotOpen(false)
      return
    }
    save({ type: "clinical_event", label: ev.label, color: ev.color, ...(suggestion ? { suggestion } : {}) }, ts ?? undefined)
    setSlotOpen(false)
  }

  return {
    editOpen,
    setEditOpen,
    editEv,
    setEditEv,
    editDose,
    setEditDose,
    editTime,
    setEditTime,
    eventActions,
    confirmEdit,
    promptDelete,
    openRowQuickAdd,
    openSlotEvent,
  }
}
