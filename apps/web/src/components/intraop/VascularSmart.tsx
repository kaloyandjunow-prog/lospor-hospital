"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import { VASCULAR_CATALOG_LEAVES, vascularChoices, vascularTypeOfSite, suggestedArterialGauge, suggestedPeripheralGauge, type VascularPatient, type VascularType } from "@lospor/core/vascular-smart"
import { VascularSmartPanel, type VascularClinicalEvent, type VascularSmartRequest } from "./VascularSmartPanel"

/**
 * The Vascular access tab, Smart selection (10.2.0): what is in place first (who placed each line,
 * and Failed on the line itself), then the kinds of access the technique leads with as big cards,
 * the rest behind "More types", and one panel that opens under them. A line is added here, or from
 * the timeline when the event is charted. The choices, the suggested sizes and the saving are
 * Core's (vascular-smart).
 */
export function VascularSmart({
  lines, onChange, onEvent, onAtomicSave, patient, techniques, startedAt, now, timeZone, siteLabel, timeOf,
}: {
  lines: readonly VascularLine[]
  onChange: (next: VascularLine[]) => void
  onEvent?: (event: VascularClinicalEvent) => void
  onAtomicSave?: (next: VascularLine[], event: VascularClinicalEvent) => void
  patient: VascularPatient
  techniques: readonly string[]
  startedAt: string | null
  now: () => string
  timeZone: string | null
  siteLabel: (code: string) => string
  timeOf: (iso: string) => string
}) {
  const t = useTranslations("intraop.vascularSmart")
  const [request, setRequest] = useState<VascularSmartRequest | null>(null)
  const [showOther, setShowOther] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const choices = vascularChoices(techniques)
  const working = lines.filter(line => !line.failed)
  const ordered = lines.map((line, index) => ({ line, index })).sort((a, b) => Number(!!a.line.failed) - Number(!!b.line.failed) || b.index - a.index)

  const typeName = (type: VascularType, site?: string) => type === "CENTRAL" ? (site?.startsWith("PICC") ? t("picc") : t("central")) : t(type === "PERIPHERAL" ? "peripheral" : "arterial")
  const toggleType = (type: VascularType) => {
    const selected = request?.type === type && request.replacesIndex == null && !request.ward
    setRequest(selected ? null : { type, source: "tab" })
  }
  const selectCatalogSite = (site: typeof VASCULAR_CATALOG_LEAVES[number]) => {
    const selected = request?.site === site.code && request.replacesIndex == null && !request.ward
    setRequest(selected ? null : { type: site.type, centralType: site.centralType, site: site.code, source: "tab" })
  }
  const card = (type: VascularType) => {
    const hint = type === "PERIPHERAL" ? `${suggestedPeripheralGauge(patient)}G` : type === "ARTERIAL" ? `${suggestedArterialGauge(patient)}G` : ""
    return (
      <button key={type} type="button" data-testid={`vascular-smart-card-${type}`} aria-pressed={request?.type === type && !request.ward && request.replacesIndex == null}
        onClick={() => toggleType(type)}
        className={`min-h-[76px] rounded-2xl border-2 px-2 py-2 text-center font-semibold transition-all ${request?.type === type && request.replacesIndex == null && !request.ward
          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 dark:border-[#333] hover:border-violet-400"}`}>
        <span className="block text-base">{typeName(type)}</span>
        {hint && <span className="block text-xs font-normal text-slate-500">{hint} {t("suggested")}</span>}
      </button>
    )
  }

  const panel = request ? (
    <VascularSmartPanel key={`${request.type}-${request.site ?? ""}-${request.replacesIndex ?? ""}-${request.ward ? "w" : ""}`} request={request} lines={lines} patient={patient}
      startedAt={startedAt} now={now} timeZone={timeZone} siteLabel={siteLabel}
      onSave={(next, event) => {
        setRequest(null)
        if (event && onAtomicSave) onAtomicSave(next, event)
        else { onChange(next); if (event) onEvent?.(event) }
      }} onClose={() => setRequest(null)} />
  ) : null

  return (
    <div className="space-y-4" data-testid="vascular-smart">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("inPlace")}{working.length > 0 ? ` · ${working.length}` : ""}</p>
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 dark:border-[#333] p-3 text-sm text-slate-500" data-testid="vascular-smart-empty">{t("none")}</p>
        ) : ordered.map(({ line, index }) => {
          const type = vascularTypeOfSite(line.site) ?? "PERIPHERAL"
          const detail = [line.depthCm ? `${line.depthCm} cm` : null, line.lumens ? t("lumenCount", { count: line.lumens }) : null, type === "PERIPHERAL" ? null : siteLabel(line.site)].filter(Boolean).join(" · ")
          return (
            <div key={`${line.id ?? line.site}-${index}`} data-testid={`vascular-smart-line-${index}`}
              className={`flex items-center gap-2 rounded-xl border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#171717] px-3 py-2 ${line.failed ? "opacity-70 border-dashed" : ""}`}>
              <span className={`inline-block w-3.5 h-3.5 rounded-full border-[3px] ${line.failed ? "bg-red-500 border-red-500" : line.preexisting ? "border-amber-500" : "bg-violet-600 border-violet-600"}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${line.failed ? "line-through" : ""}`}>
                  {line.size ? `${line.size}${line.sizeUnit ?? ""} ` : ""}{typeName(type, line.site)}
                  <span className={`ml-2 text-[11px] font-semibold rounded-full px-2 py-0.5 no-underline ${line.failed ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300" : line.preexisting ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"}`}>
                    {line.failed ? `${t("failed")}${line.failedAt ? ` ${timeOf(line.failedAt)}` : ""}` : line.preexisting ? t("alreadyInPlace") : t("placedHere")}
                  </span>
                </p>
                {detail && <p className="text-xs text-slate-500">{detail}</p>}
              </div>
              <span className="font-mono text-xs text-slate-500">{line.preexisting && !line.insertedAt ? t("arrivedShort") : line.insertedAt ? timeOf(line.insertedAt) : ""}</span>
              {!line.failed && (
                <button type="button" data-testid={`vascular-smart-fail-${index}`} className="text-xs px-3 py-1 rounded-full border border-slate-300 dark:border-slate-600 hover:border-violet-500"
                  onClick={() => setRequest({ type, centralType: line.site.startsWith("PICC") ? "PICC" : "CVK", source: "tab", replacesIndex: index })}>{t("failedButton")}</button>
              )}
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("addAccess")}</p>
        <div className="grid grid-cols-3 gap-2">{choices.main.map(card)}</div>
        {request && !request.ward && choices.main.includes(request.type) ? panel : null}
        <div className="flex flex-wrap gap-2 items-center">
          {choices.other.length > 0 && (showOther
            ? choices.other.map(type => (
              <button key={type} type="button" data-testid={`vascular-smart-other-${type}`} onClick={() => toggleType(type)}
                className="px-3 py-1.5 rounded-lg border-2 border-slate-200 dark:border-[#333] text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-violet-400">{typeName(type)}</button>
            ))
            : <button type="button" data-testid="vascular-smart-more" onClick={() => setShowOther(true)} className="text-sm text-violet-600 dark:text-violet-300 font-semibold px-2 py-1">{t("moreTypes")}</button>)}
          <button type="button" data-testid="vascular-smart-catalog" aria-expanded={showCatalog} onClick={() => setShowCatalog(value => !value)}
            className="text-sm text-violet-600 dark:text-violet-300 font-semibold px-2 py-1">
            {showCatalog ? t("hideAllSites") : t("allSites")}
          </button>
          <button type="button" data-testid="vascular-smart-ward" onClick={() => setRequest(request?.ward ? null : { type: "PERIPHERAL", source: "tab", ward: true })}
            className="px-3 py-1.5 rounded-lg border-2 border-dashed border-amber-400 text-sm font-semibold text-amber-600 dark:text-amber-300">{typeName("PERIPHERAL")} · {t("alreadyOnArrival")}</button>
        </div>
        {showCatalog && (
          <div data-testid="vascular-smart-catalog-list" className="rounded-xl border border-slate-200 dark:border-[#333] p-3 space-y-3">
            {(["PERIPHERAL", "ARTERIAL", "CENTRAL"] as const).map(group => {
              const sites = VASCULAR_CATALOG_LEAVES.filter(site => site.group === group)
              return (
                <div key={group} className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{typeName(group)}</p>
                  <div className="flex flex-wrap gap-2">
                    {sites.map(site => (
                      <button key={site.code} type="button" data-testid={`vascular-smart-catalog-${site.code}`} aria-pressed={request?.site === site.code}
                        onClick={() => selectCatalogSite(site)} className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold ${request?.site === site.code
                          ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
                          : "border-slate-200 dark:border-[#333] text-slate-600 dark:text-slate-300 hover:border-violet-400"}`}>
                        {siteLabel(site.code)}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {request && (request.ward || !choices.main.includes(request.type)) && (
        panel
      )}
    </div>
  )
}
