"use client"

import { createPortal } from "react-dom"

/**
 * A centred confirmation for a destructive action on the chart.
 *
 * The one it exists for is deleting an infusion by dragging its bar off the
 * left edge of the timeline — an easy gesture to make by accident on a touch
 * screen, and one that would otherwise silently remove a drug from the record.
 * The dialog says what happened as well as what it is about to do, because
 * "delete this infusion?" out of nowhere is not an explanation.
 */

export type ConfirmDialogProps = {
  title: string
  detail?: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  title,
  detail,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-72 space-y-4 border border-slate-200 dark:border-[#3a3a3a]">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
