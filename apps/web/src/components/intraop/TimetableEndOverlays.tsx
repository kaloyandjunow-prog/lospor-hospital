"use client"

import { useTranslations } from "next-intl"
import { ConfirmDialog } from "@/components/intraop/ConfirmDialog"
import { EndCaseModal, type EndCaseModalProps } from "@/components/intraop/EndCaseModal"
import { PendingStopDialog } from "@/components/intraop/PendingStopDialog"
import { useIntraopUiCopy } from "@/components/intraop/ui-copy"
import type { AgentSegment, GasSettingsSegment, TimetableFluid, TimetableInfusion } from "@/types/timetable"
import type { PendingStop } from "@/components/intraop/end-drop-handlers"

type Props = {
  pendingStop: PendingStop | null
  displayNameForStop: (stop: PendingStop) => string
  timeForColumn: (column: number) => string | null
  onCancelPending: () => void
  onConfirmPending: (stop: PendingStop) => void
  deleteInfPrompt: string | null
  onCancelDelete: () => void
  onDeleteInfusion: (id: string) => void
  showEndModal: boolean
  agents: AgentSegment[]
  infusions: TimetableInfusion[]
  fluids: TimetableFluid[]
  gasSettings: GasSettingsSegment[]
  weightBasis: EndCaseModalProps["weightBasis"]
  ibw: number | null | undefined
  tbw: number | null | undefined
  afterEnd: EndCaseModalProps["afterEnd"]
  onResolveAfterEnd: EndCaseModalProps["onResolveAfterEnd"]
  onDismissEnd: () => void
  onConfirmEnd: EndCaseModalProps["onConfirm"]
}

export function TimetableEndOverlays({
  pendingStop,
  displayNameForStop,
  timeForColumn,
  onCancelPending,
  onConfirmPending,
  deleteInfPrompt,
  onCancelDelete,
  onDeleteInfusion,
  showEndModal,
  agents,
  infusions,
  fluids,
  gasSettings,
  weightBasis,
  ibw,
  tbw,
  afterEnd,
  onResolveAfterEnd,
  onDismissEnd,
  onConfirmEnd,
}: Props) {
  const t = useTranslations()
  const uiCopy = useIntraopUiCopy()
  return <>
    {pendingStop && (() => {
      const stamp = timeForColumn(pendingStop.col)
      const time = stamp ? new Date(stamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : String(pendingStop.col)
      return <PendingStopDialog title={t("intraop.timetable.stopBarConfirm", { name: displayNameForStop(pendingStop), time })} detail={t("intraop.timetable.stopBarDetail")} cancelLabel={uiCopy.cancel} confirmLabel={t("intraop.timetable.stopBarConfirmButton")} onCancel={onCancelPending} onConfirm={() => onConfirmPending(pendingStop)} />
    })()}
    {deleteInfPrompt && <ConfirmDialog title={t("intraop.timetable.deleteInfusionConfirm")} detail={t("intraop.timetable.barDraggedOffTimeline")} cancelLabel={uiCopy.cancel} confirmLabel={uiCopy.delete} onCancel={onCancelDelete} onConfirm={() => onDeleteInfusion(deleteInfPrompt)} />}
    {showEndModal && <EndCaseModal agents={agents} infusions={infusions} fluids={fluids} gasSettings={gasSettings} weightBasis={weightBasis} ibw={ibw} tbw={tbw} afterEnd={afterEnd} onResolveAfterEnd={onResolveAfterEnd} onDismiss={onDismissEnd} onConfirm={onConfirmEnd} />}
  </>
}
