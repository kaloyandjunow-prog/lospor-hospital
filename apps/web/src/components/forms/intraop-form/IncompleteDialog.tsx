"use client"

import { createPortal } from "react-dom"

/** The "sections are incomplete / required fields missing" modal shown when Continue is pressed. */
export function IncompleteDialog({ items, canContinue, onClose, onContinue, t }: {
  items: string[] | null
  canContinue: boolean
  onClose: () => void
  onContinue: () => void
  t: (key: string) => string
}) {
  if (!items || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            {canContinue ? t("intraop.incompleteTitle") : t("intraop.requiredMissingTitle")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {canContinue ? t("intraop.incompleteDescription") : t("intraop.requiredMissingDescription")}
          </p>
        </div>
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        {canContinue && <p className="text-xs text-slate-400">{t("intraop.incompleteOptional")}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
            {t("intraop.goBack")}
          </button>
          {canContinue && (
            <button type="button" onClick={onContinue}
              className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
              {t("intraop.continueAnyway")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
