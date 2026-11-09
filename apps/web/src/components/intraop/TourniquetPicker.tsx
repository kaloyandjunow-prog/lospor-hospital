"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import { tourniquetBody, tourniquetSiteLabel, type BodyBand, type TourniquetSite } from "@lospor/core/tourniquet-body"
import type { TourniquetStatus } from "@lospor/core/intraop-suggestions"

/**
 * The tourniquet body picker on the web (10.2.0): Tourniquet on asks where
 * the cuff went on, Tourniquet off which one was released. The body and the
 * cuff spots are Core's (tourniquet-body), the same drawing as the phone.
 * A cuff that is on shows its time, red once past the warning.
 */
export function TourniquetPicker({ band, mode, statuses, warnAtMinutes, timeOf, locale, onSave, onCancel }: {
  band: BodyBand
  mode: "on" | "off"
  /** Each limb's tourniquet so far (Core tourniquetStatus). */
  statuses: readonly TourniquetStatus[]
  warnAtMinutes: number
  timeOf: (iso: string) => string
  locale: string
  onSave: (site: TourniquetSite) => void
  onCancel: () => void
}) {
  const t = useTranslations("intraop.tourniquet")
  const body = useMemo(() => tourniquetBody(band, 358, 480), [band])
  const [picked, setPicked] = useState<TourniquetSite | null>(null)
  const statusOf = (site: string) => statuses.find(status => status.site === site)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div role="dialog" aria-label={t(mode === "on" ? "titleOn" : "titleOff")} data-testid="tourniquet-picker"
        className="w-full max-w-[400px] rounded-2xl bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2a2a2a] shadow-2xl p-4 space-y-2"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-center">
          <p className="flex-1 text-base font-bold">{t(mode === "on" ? "titleOn" : "titleOff")}</p>
          <button type="button" onClick={onCancel} aria-label={t("cancel")} className="p-1"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500">{t(mode === "on" ? "hintOn" : "hintOff")}</p>
        <div className="relative mx-auto" style={{ width: body.width, height: body.height }}>
          <svg width={body.width} height={body.height} viewBox={`0 0 ${body.width} ${body.height}`} aria-hidden="true" className="absolute inset-0">
            {body.outlines.map((d, index) => (
              <path key={index} d={d} strokeWidth={1.6} strokeLinejoin="round" className="fill-white dark:fill-[#141414] stroke-slate-400 dark:stroke-[#aab4c3]" />
            ))}
            {body.details.map((d, index) => (
              <path key={`d${index}`} d={d} fill="none" strokeWidth={1.1} strokeLinecap="round" className="stroke-slate-300 dark:stroke-[#6b7686]" />
            ))}
            {body.spots.map(spot => {
              const status = statusOf(spot.site)
              const on = status?.running === true
              const hot = on && status.minutes >= warnAtMinutes
              const chosen = picked === spot.site
              const cls = chosen ? "fill-sky-200 stroke-sky-500 dark:fill-sky-900/60"
                : hot ? "fill-red-200 stroke-red-500 dark:fill-red-900/60"
                  : on ? "fill-amber-100 stroke-amber-500 dark:fill-amber-900/40"
                    : "fill-slate-100/40 stroke-slate-400 dark:fill-slate-700/20"
              return (
                <g key={spot.site} transform={`translate(${spot.x.toFixed(1)},${spot.y.toFixed(1)}) rotate(${spot.angle.toFixed(1)})`}>
                  <rect x={-spot.w / 2} y={-spot.h / 2} width={spot.w} height={spot.h} rx={Math.min(5, spot.h / 3)} strokeWidth={1.8}
                    strokeDasharray={on || chosen ? undefined : "4 3"} className={cls} />
                  {(on || chosen) && (
                    <>
                      <rect x={spot.outward > 0 ? spot.w / 2 - spot.w * 0.32 : -spot.w / 2} y={-spot.h / 2} width={spot.w * 0.32} height={spot.h} rx={2} className="fill-current opacity-20" />
                      <path d={`M${spot.outward * (spot.w / 2 - 1)},${-spot.h * 0.1} c${spot.outward * 10},-1 ${spot.outward * 14},-8 ${spot.outward * 15},-18`} fill="none" strokeWidth={2.2} strokeLinecap="round" className={cls} />
                    </>
                  )}
                </g>
              )
            })}
          </svg>
          <span className="absolute left-1 top-0.5 text-xs font-bold text-slate-400">{t("right")}</span>
          <span className="absolute right-1 top-0.5 text-xs font-bold text-slate-400">{t("left")}</span>
          {body.spots.map(spot => {
            const status = statusOf(spot.site)
            const running = status?.running === true
            const allowed = mode === "on" ? !running : running
            const w = Math.max(spot.w + 10, 40)
            const h = Math.max(spot.h + 10, 30)
            return (
              <button key={spot.site} type="button" aria-label={tourniquetSiteLabel(spot.site, locale)} disabled={!allowed}
                data-testid={`tourniquet-spot-${spot.site}`}
                onClick={() => setPicked(spot.site)}
                style={{ left: spot.x - w / 2, top: spot.y - h / 2, width: w, height: h, transform: `rotate(${spot.angle}deg)` }}
                className="absolute rounded-lg bg-transparent disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" />
            )
          })}
        </div>
        <ul className="space-y-1">
          {statuses.filter(status => status.site !== "unknown").map(status => {
            const hot = status.running && status.minutes >= warnAtMinutes
            return (
              <li key={status.site} className="flex items-center gap-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${!status.running ? "bg-emerald-500" : hot ? "bg-red-500" : "bg-amber-400"}`} />
                <span className="flex-1">{tourniquetSiteLabel(status.site, locale)}</span>
                <span className={`tabular-nums text-xs ${hot ? "text-red-600 font-bold" : "text-slate-500"}`}>
                  {t("since", { time: timeOf(status.since), minutes: status.minutes })}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-2 pt-1">
          <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">{picked ? tourniquetSiteLabel(picked, locale) : t("nothing")}</span>
          <button type="button" data-testid="tourniquet-save" disabled={!picked} onClick={() => picked && onSave(picked)}
            className="rounded-xl px-4 py-2 text-sm font-bold bg-amber-500 text-amber-950 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-[#262626]">
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  )
}
