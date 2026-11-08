"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import {
  addVascularLine,
  defaultVascularSite,
  resolveVascularTime,
  suggestedArterialGauge,
  suggestedPeripheralGauge,
  vascularClinicalEvent,
  vascularAsks,
  type VascularPatient,
  type VascularTimeChoice,
  type VascularType,
} from "@lospor/core/vascular-smart"
import { instantFromLocalTime, localTimeOf } from "@lospor/core/intraop-time"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"

/**
 * The one panel Smart selection adds a line with (10.2.0): who placed it, its size (a peripheral
 * cannula from 14G to 26G, each with its colour), for a central line its type, site, lumens and
 * depth, and when. It opens under the Vascular access tab, and from the timeline when IV line in,
 * Art line in, CVC in or PICC is charted, with that time already set. What it offers and how it
 * saves is Core's (vascular-smart), so the phone cannot drift from it.
 */

export type VascularSmartRequest = {
  type: VascularType
  centralType?: "CVK" | "PICC"
  /** A site selected from the complete catalogue, before the detail panel opens. */
  site?: string
  /** The time the timeline event stands for, when opened from the timeline. */
  at?: string | null
  source: "tab" | "timeline"
  eventId?: string
  eventLabel?: string
  /** Already in place on arrival: the origin starts on "ward". */
  ward?: boolean
  /** The line being replaced (its place in the list): Failed on a line. */
  replacesIndex?: number | null
}

export type VascularClinicalEvent = { id?: string; label: string; ts: string; intraopPatch?: Record<string, unknown> }

export function VascularSmartPanel({
  request, lines, patient, startedAt, now, timeZone, siteLabel, onSave, onClose,
}: {
  request: VascularSmartRequest
  lines: readonly VascularLine[]
  patient: VascularPatient
  startedAt: string | null
  now: () => string
  timeZone: string | null
  /** A site's name in the screen's language. */
  siteLabel: (code: string) => string
  onSave: (next: VascularLine[], event?: VascularClinicalEvent) => void
  onClose: () => void
}) {
  const t = useTranslations("intraop.vascularSmart")
  const [centralType, setCentralType] = useState<"CVK" | "PICC">(request.centralType ?? "CVK")
  const asks = vascularAsks(request.type, centralType)
  const [origin, setOrigin] = useState<"here" | "ward">(request.ward ? "ward" : "here")
  const [site, setSite] = useState<string>(request.site ?? defaultVascularSite(request.type, request.centralType ?? "CVK"))
  const suggested = request.type === "PERIPHERAL" ? suggestedPeripheralGauge(patient) : request.type === "ARTERIAL" ? suggestedArterialGauge(patient) : "7"
  const [size, setSize] = useState<string>(suggested)
  const [lumens, setLumens] = useState<string>("3")
  const [depth, setDepth] = useState<string>("")
  const [choice, setChoice] = useState<VascularTimeChoice>(request.ward ? "arrived" : request.source === "timeline" ? "timeline" : request.replacesIndex != null ? "now" : "start")
  const clock = (iso: string | null | undefined) => (iso && timeZone ? localTimeOf(new Date(iso), timeZone) : null) ?? iso?.slice(11, 16) ?? ""
  const [picked, setPicked] = useState<string>(() => clock(request.at ?? now()))
  const replaced = request.replacesIndex != null ? lines[request.replacesIndex] : null
  const pickedInstant = timeZone && /^\d{1,2}:\d{2}$/.test(picked)
    ? instantFromLocalTime(new Date(startedAt ?? now()), picked, timeZone)?.toISOString() ?? null
    : null
  const timeMissing = origin === "here" && (((choice === "start" || choice === "now") && startedAt == null)
    || (choice === "timeline" && !request.at)
    || (choice === "pick" && !pickedInstant))

  function chooseOrigin(next: "here" | "ward") {
    setOrigin(next)
    setChoice(next === "ward" ? "arrived" : request.source === "timeline" ? "timeline" : "start")
  }

  function save() {
    // A timeline event must be updated atomically with its structured line.
    if (request.source === "timeline" && !request.eventId) return
    const at = resolveVascularTime(choice, { startedAt, now: now(), picked: choice === "timeline" ? request.at ?? null : pickedInstant })
    const eventLabel = at && (request.source !== "timeline" || request.eventId)
      ? vascularClinicalEvent(request.type, site) || request.eventLabel || "IV line in"
      : null
    const eventId = eventLabel ? (request.eventId ?? clinicalRecordId("vascular-event", at ?? now())) : undefined
    // A line that arrived with the patient has no time of ours; "pick" on it records the time the ward placed it.
    const next = addVascularLine(lines, {
      id: clinicalRecordId("vascular", at ?? now()), type: request.type, site,
      size, depthCm: depth, lumens: request.type === "CENTRAL" ? lumens : undefined,
      origin, insertedAt: at, replacesIndex: request.replacesIndex ?? null,
      ...(eventId ? { sourceEventId: eventId } : {}),
    })
    const event = eventLabel && eventId
      ? { id: eventId, label: eventLabel, ts: at!, intraopPatch: { vascularAccesses: next } }
      : undefined
    onSave(next, event)
  }

  const pill = (active: boolean) => `px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${active
    ? "bg-violet-600 border-violet-600 text-white"
    : "border-slate-200 dark:border-[#333] text-slate-600 dark:text-slate-300 hover:border-violet-400"}`
  const label = (text: string) => <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{text}</p>
  const typeName = request.type === "CENTRAL" ? (centralType === "PICC" ? t("picc") : t("central")) : t(request.type === "PERIPHERAL" ? "peripheral" : "arterial")
  const times: Array<[VascularTimeChoice, string]> = origin === "ward"
    ? [["arrived", t("arrived")], ["pick", t("pickWhenPlaced")]]
    : [
      ...(request.source === "timeline" ? [["timeline", t("fromTimeline", { time: clock(request.at) })] as [VascularTimeChoice, string]] : []),
      ["start", t("startOfAnaesthesia", { time: clock(startedAt) })], ["now", t("now", { time: clock(now()) })], ["pick", t("pickTime")],
    ]

  return (
    <section role="group" aria-label={typeName} data-testid="vascular-smart-panel"
      className="rounded-xl border border-violet-500/60 bg-slate-50 dark:bg-[#171717] p-3 space-y-3">
      <header className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold">{typeName}</p>
        <button type="button" onClick={onClose} aria-label={t("cancel")} className="p-1"><X className="w-4 h-4" /></button>
      </header>

      {replaced && <p className="text-xs rounded-lg bg-violet-100 dark:bg-violet-950/40 px-2 py-1.5">{t("oldStays")}</p>}

      {asks.map(ask => {
        if (ask.field === "origin") return (
          <div key="origin" className="space-y-1.5">
            {label(t("whoPlaced"))}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="vascular-smart-origin-here" className={pill(origin === "here")} onClick={() => chooseOrigin("here")}>{t("placedByUs")}</button>
              <button type="button" data-testid="vascular-smart-origin-ward" className={pill(origin === "ward")} onClick={() => chooseOrigin("ward")}>{t("alreadyInPlace")}</button>
            </div>
          </div>
        )
        if (ask.field === "centralType") return (
          <div key="centralType" className="space-y-1.5">
            {label(t("type"))}
            <div className="flex flex-wrap gap-2">
              {ask.values.map(value => (
                <button key={value} type="button" data-testid={`vascular-smart-ctype-${value}`} className={pill(centralType === value)}
                  onClick={() => { setCentralType(value); setSite(defaultVascularSite("CENTRAL", value)) }}>{value === "PICC" ? t("picc") : t("central")}</button>
              ))}
            </div>
          </div>
        )
        if (ask.field === "site") return (
          <div key="site" className="space-y-1.5">
            {label(t("site"))}
            <div className="flex flex-wrap gap-2">
              {ask.values.map(value => (
                <button key={value.code} type="button" data-testid={`vascular-smart-site-${value.code}`} className={pill(site === value.code)} onClick={() => setSite(value.code)}>{siteLabel(value.code)}</button>
              ))}
            </div>
          </div>
        )
        if (ask.field === "size") return (
          <div key="size" className="space-y-1.5">
            {label(`${t("size")} (${ask.unit})`)}
            <div className="flex flex-wrap gap-2">
              {ask.values.map(value => (
                <button key={value} type="button" data-testid={`vascular-smart-size-${value}`} className={`${pill(size === value)} inline-flex items-center gap-1.5`} onClick={() => setSize(value)}>
                  {ask.colors?.[value] && <span className="inline-block w-2.5 h-2.5 rounded-full border border-black/20" style={{ background: ask.colors[value] }} />}
                  {value}{ask.unit}
                  {suggested === value && <span className="text-[10px] font-normal opacity-80">{t("suggested")}</span>}
                </button>
              ))}
            </div>
          </div>
        )
        if (ask.field === "lumens") return (
          <div key="lumens" className="space-y-1.5">
            {label(t("lumens"))}
            <div className="flex flex-wrap gap-2">
              {ask.values.map(value => <button key={value} type="button" data-testid={`vascular-smart-lumens-${value}`} className={pill(lumens === value)} onClick={() => setLumens(value)}>{value}</button>)}
            </div>
          </div>
        )
        return (
          <div key="depth" className="space-y-1.5">
            {label(t("depth"))}
            <div className="flex flex-wrap gap-2">
              {ask.values.map(value => <button key={value} type="button" data-testid={`vascular-smart-depth-${value}`} className={pill(depth === value)} onClick={() => setDepth(depth === value ? "" : value)}>{value}</button>)}
            </div>
          </div>
        )
      })}

      <div className="space-y-1.5">
        {label(t("time"))}
        <div className="flex flex-wrap items-center gap-2">
          {times.map(([key, text]) => (
            <button key={key} type="button" data-testid={`vascular-smart-time-${key}`} className={pill(choice === key)} onClick={() => setChoice(key)}>{text}</button>
          ))}
          {choice === "pick" && (
            <input type="time" step={300} value={picked} aria-label={t("time")} data-testid="vascular-smart-time-input" onChange={event => setPicked(event.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent font-mono text-sm" />
          )}
        </div>
      </div>

      {timeMissing && <p data-testid="vascular-smart-time-missing" className="rounded-lg border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">{t("timeMissing")}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600">{t("cancel")}</button>
        <button type="button" data-testid="vascular-smart-add" onClick={save} disabled={timeMissing}
          className="text-xs px-4 py-1.5 rounded-full bg-violet-600 text-white font-semibold disabled:opacity-50">{t("add")}</button>
      </div>
    </section>
  )
}
