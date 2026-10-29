"use client"

import { ConfirmDialog } from "@/components/intraop/ConfirmDialog"
export function PendingStopDialog({ cancelLabel, confirmLabel, detail, title, onCancel, onConfirm }: { cancelLabel: string; confirmLabel: string; detail: string; title: string; onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmDialog title={title} detail={detail} cancelLabel={cancelLabel} confirmLabel={confirmLabel} onCancel={onCancel} onConfirm={onConfirm} />
}
