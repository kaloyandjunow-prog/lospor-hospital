"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { vialDimensions, vialSvg, type DantroleneVialsView } from "@lospor/core/intraop-suggestions"

/**
 * The dantrolene vials on the MH card (10.2.0): the dose in hand, the vials to
 * open for it drawn as glass vials, how many have been opened in all. The dose
 * steps in mg/kg and the vials refill and rearrange as it moves; the mix is
 * the fewest vials from what the hospital stocks (Core). Give opens the
 * dantrolene sheet with the dose; nothing is charted here.
 */
export function DantroleneVials({ viewFor, initialPerKg, onGive, readOnly = false }: {
  /** The vials for a dose in mg/kg, from Core; null without a weight. */
  viewFor: (perKg: number) => DantroleneVialsView | null
  initialPerKg: number
  onGive: (doseMg: number, rect: DOMRect) => void
  readOnly?: boolean
}) {
  const t = useTranslations("intraop.suggestions")
  const [perKg, setPerKg] = useState(initialPerKg)
  const view = useMemo(() => viewFor(perKg), [viewFor, perKg])
  const step = (delta: number) => setPerKg(current => Math.min(10, Math.max(0.5, Math.round((current + delta) * 10) / 10)))
  if (!view) return null
  const wasteMg = Math.round((view.plan.totalMg - view.doseMg) * 10) / 10
  return (
    <div data-testid="dantrolene-vials" className="mt-2 flex max-h-[min(65vh,36rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-[#0f0f0f] p-3">
      <div data-testid="vials-scroll" className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t("vialsLess")} data-testid="vials-dec" onClick={() => step(-0.5)}
            className="w-10 h-10 shrink-0 rounded-lg border border-slate-300 dark:border-[#334155] text-lg font-bold">−</button>
          <div className="flex-1 text-center">
            <span className="text-2xl font-black tabular-nums" data-testid="vials-per-kg">{perKg.toFixed(1)}</span>
            <span className="text-xs text-slate-500"> mg/kg · </span>
            <span className="text-sm font-bold tabular-nums" data-testid="vials-dose">{view.doseMg} mg</span>
          </div>
          <button type="button" aria-label={t("vialsMore")} data-testid="vials-inc" onClick={() => step(0.5)}
            className="w-10 h-10 shrink-0 rounded-lg border border-slate-300 dark:border-[#334155] text-lg font-bold">+</button>
        </div>
        <div className="flex items-end flex-wrap gap-2 min-h-[96px] rounded-lg px-3 py-2 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-[#171717] dark:to-[#101010] border-b-[3px] border-slate-300 dark:border-[#2a2a2a]">
          {view.drawing.map((vial, index) => {
            const { w, h } = vialDimensions(vial.size)
            return (
              // eslint-disable-next-line @next/next/no-img-element -- a generated SVG, not a file
              <img key={index} data-testid="dantrolene-vial" alt={`${vial.size} mg`} width={w} height={h}
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(vialSvg(vial.size, vial.used))}`} />
            )
          })}
        </div>
        <p className="text-sm font-extrabold" data-testid="vials-plan">{view.plan.vials.map(item => `${item.count} × ${item.size} mg`).join("  +  ")}</p>
        <p className="text-xs text-slate-500" data-testid="vials-detail">
          {t("vialsCount", { count: view.plan.count })} · {t("vialsOpened", { mg: view.plan.totalMg })} · {wasteMg > 0 ? t("vialsLeft", { mg: wasteMg }) : t("vialsNoneLeft")}
        </p>
        <p className="text-xs text-slate-500" data-testid="vials-so-far">{view.openedVials > 0 ? t("vialsSoFar", { count: view.openedVials, mg: view.givenMg }) : t("vialsSoFarNone")}</p>
        <p className={`text-xs ${view.reachesNoteAt10 ? "font-bold text-amber-600 dark:text-amber-400" : "text-slate-500"}`} data-testid="vials-total">
          {view.reachesNoteAt10 ? t("vialsNote") : t("vialsTotal", { value: view.afterMgPerKg })}
        </p>
      </div>
      <div className="sticky bottom-0 mt-2 border-t border-slate-200/70 bg-slate-50 pt-2 dark:border-[#262626] dark:bg-[#0f0f0f]">
        <button type="button" disabled={readOnly} data-testid="vials-give" onClick={event => onGive(view.doseMg, event.currentTarget.getBoundingClientRect())}
          className="w-full min-h-11 rounded-xl bg-amber-500 text-amber-950 text-sm font-extrabold disabled:opacity-50">
          {t("vialsGive", { mg: view.doseMg })}
        </button>
      </div>
    </div>
  )
}
