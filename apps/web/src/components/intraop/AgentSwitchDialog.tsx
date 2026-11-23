"use client"

import { portalHost } from "@/lib/portal-host"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"

/**
 * Another agent runs where a new one is being started (10.8.0): asked first, as on the phone. Switching is an
 * explicit choice, never implied: stop the running one at that time, run both, or think again.
 */
export function AgentSwitchDialog({ names, cancelLabel, onSwitch, onBoth, onCancel }: {
  names: string
  cancelLabel: string
  onSwitch: () => void
  onBoth: () => void
  onCancel: () => void
}) {
  const t = useTranslations("intraop.timelineRules")
  if (typeof document === "undefined") return null
  const button = "min-h-11 w-full rounded-lg border px-4 font-semibold"
  return createPortal(
    <div className="fixed inset-0 z-[66] flex items-end sm:items-center justify-center bg-black/40 p-3" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={t("agentSwitchTitle", { name: names })} data-testid="agent-switch-dialog" onClick={event => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#242424] border border-slate-200 dark:border-[#3a3a3a] shadow-xl p-4 space-y-2">
        <p className="text-sm font-bold text-slate-900 dark:text-white pb-1">{t("agentSwitchTitle", { name: names })}</p>
        <button type="button" data-testid="agent-switch-stop" className={`${button} border-blue-600 bg-blue-600 text-white`} onClick={onSwitch}>{t("agentSwitch", { name: names })}</button>
        <button type="button" data-testid="agent-switch-both" className={`${button} border-slate-300 dark:border-[#444]`} onClick={onBoth}>{t("agentRunBoth")}</button>
        <button type="button" className={`${button} border-transparent text-slate-500`} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>,
    portalHost(),
  )
}
