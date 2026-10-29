"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { displayClinicalCode } from "@/lib/clinical-display"
import { READINESS_COPY } from "@/components/case-summary/readiness-labels"
import { cancellationReasonLabel } from "@lospor/core/case-cancellation"
import { Section, Panel, Figure, TallyList, SpreadList, TallyChart, Heatmap, FilterBar, agentName, share, spread, percent, type IndicatorResponse as Response, type IndicatorFilters as Filters } from "@/components/indicators/IndicatorWidgets"

/**
 * The unit indicators (10.0.0): aggregate figures over the department's
 * cases, for every user in it. Figures on fewer than five cases read "<5".
 */
const DAY = 86_400_000
const isoDay = (date: Date) => date.toISOString().slice(0, 10)
const defaultFilters = (): Filters => ({ from: isoDay(new Date(Date.now() - 89 * DAY)), to: isoDay(new Date()), theatre: "", assignee: "", mode: "", asa: "", procedure: "" })

export function IndicatorsScreen() {
  const t = useTranslations("indicators")
  const locale = useLocale()
  const lang = locale === "bg" ? "bg" : "en"
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    return params.toString()
  }, [filters])

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/indicators?${query}`, { signal, cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json() as Response)
      setFailed(false)
    } catch (error) {
      if ((error as Error).name !== "AbortError") setFailed(true)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    // Fetch-on-change with a loading flag — the standard data-fetching effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  // Cases still being worked out: ask again shortly, until none are left.
  useEffect(() => {
    if (!data?.pending || loading) return
    const controller = new AbortController()
    const timer = setTimeout(() => void load(controller.signal), 1500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [data, loading, load])

  const set = (key: keyof Filters) => (value: string) => setFilters(previous => ({ ...previous, [key]: value }))
  const report = data?.report
  const bandLabel = (key: string) => {
    const band = data?.config.hypotensionBands.find(item => item.key === key)
    return band ? (lang === "bg" ? band.labelBg : band.labelEn) : key
  }

  return (
    <div className="space-y-6" data-testid="indicators">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
        <p className="text-xs text-slate-500 mt-0.5">{t("spreadLegend")}</p>
      </div>

      <FilterBar filters={filters} set={set} data={data} onClear={() => setFilters(defaultFilters())} />

      {failed && <p className="text-sm text-red-600 dark:text-red-400">{t("failed")}</p>}
      {loading && !report && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}</p>}
      {data && data.pending > 0 && <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("pending", { count: data.pending })}</p>}

      {report && (report.cases === 0 ? <p className="text-sm text-slate-500">{t("none")}</p> : (
        <>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300" data-testid="indicators-cases">{t("cases", { count: report.cases })}</p>

          <Section id="activity" title={t("s_activity")}>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Weeks read as bars up to half a year; past that, months. */}
              {report.activity.byWeek.length > 26
                ? <Panel title={t("byMonth")}><TallyChart rows={report.activity.byMonth} /></Panel>
                : <Panel title={t("byWeek")}><TallyChart rows={report.activity.byWeek} /></Panel>}
              <Panel title={t("heatmap")}><Heatmap cells={report.activity.heatmap} locale={locale} /></Panel>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Figure label={t("cancelled")} value={share(report.activity.cancelled, t)} />
              <Panel title={t("cancellationReasons")}><TallyList rows={report.activity.cancellationReasons} label={key => cancellationReasonLabel(key, locale) ?? key} /></Panel>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Panel title={t("byMode")}><TallyList rows={report.activity.byMode} label={key => displayClinicalCode("clinicalMode", key, locale, { label: key })} /></Panel>
              <Panel title={t("byTechnique")}><TallyList rows={report.activity.byTechnique} label={key => displayClinicalCode("option:TECHNIQUE", key, locale, { label: key })} /></Panel>
              <Panel title={t("byTheatre")}>
                <ul className="space-y-1 text-sm">
                  {report.activity.byTheatre.map(row => (
                    <li key={row.id ?? "none"} className="flex justify-between gap-2">
                      <span className="truncate">{row.name ?? t("noTheatre")}</span>
                      <span className="tabular-nums text-slate-500">{row.cases ?? t("fewer")}{row.hours != null ? ` · ${row.hours} ${t("hours")}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </Section>

          <Section id="time" title={t("s_time")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Figure label={t("duration")} value={spread(report.time.duration, t("minutes"), t)} />
              <Figure label={t("turnover")} value={spread(report.time.turnover, t("minutes"), t)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title={t("durationByProcedure")}>
                <SpreadList rows={report.time.durationByProcedure.map(row => ({ key: row.procedure, label: row.procedure, spread: row.duration }))} unit={t("minutes")} t={t} />
              </Panel>
              {report.time.turnoverByTheatre.length > 0 && (
                <Panel title={`${t("turnover")} · ${t("byTheatre")}`}>
                  <SpreadList rows={report.time.turnoverByTheatre.map(row => ({ key: row.id, label: row.name ?? row.id, spread: row.turnover }))} unit={t("minutes")} t={t} />
                </Panel>
              )}
            </div>
          </Section>

          <Section id="case-mix" title={t("s_caseMix")}>
            <div className="grid gap-4 md:grid-cols-4">
              <Panel title={t("ageBands")}><TallyList rows={report.caseMix.ageBands} label={bandLabel} /></Panel>
              <Panel title={t("asa")}><TallyList rows={report.caseMix.asa} label={key => `ASA ${key}`} /></Panel>
              <Panel title={t("apfel")}><TallyList rows={report.caseMix.apfel} label={key => `Apfel ${key}`} /></Panel>
              <Figure label={t("pediatric")} value={share(report.caseMix.pediatric, t)} />
            </div>
          </Section>

          <Section id="airway" title={t("s_airway")}>
            <div className="grid gap-4 md:grid-cols-4">
              <Panel title={t("devices")}><TallyList rows={report.airway.devices} label={key => displayClinicalCode("option:AIRWAY_MANAGEMENT", key, locale, { label: key })} /></Panel>
              <Figure label={t("videoLaryngoscope")} value={share(report.airway.videoLaryngoscope, t)} />
              <Figure label={t("cormackLehane")} value={share(report.airway.cormackLehane3or4, t)} />
              <Figure label={t("airwayComplications")} value={share(report.airway.airwayComplications, t)} />
            </div>
          </Section>

          <Section id="drugs" title={t("s_drugs")}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label={t("morphine")} value={spread(report.drugs.morphineMg, "mg", t)} sub={`${t("morphinePerKg")}: ${spread(report.drugs.morphineMgPerKg, "mg/kg", t)}`} />
              <Figure label={t("opioidCases")} value={share(report.drugs.opioidCases, t)} />
              <Figure label={t("neuraxialOpioid")} value={share(report.drugs.neuraxialOpioid, t)} />
              <Figure label={t("ponvProphylaxis")} value={share(report.drugs.ponvProphylaxisHighRisk, t)} />
              <Figure label={t("sugammadex")} value={share(report.drugs.sugammadex, t)} />
              <Figure label={t("neostigmine")} value={share(report.drugs.neostigmine, t)} />
              <Figure label={t("tiva")} value={share(report.drugs.tiva, t)} />
              <Figure label={t("volatile")} value={share(report.drugs.volatile, t)} />
            </div>
            <Panel title={t("byClinician")}>
              <table className="w-full text-sm" data-testid="indicators-clinicians">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">{t("clinician")}</th><th className="py-1 text-right">n</th><th className="py-1 text-right">mg</th><th className="py-1 text-right">mg/kg</th></tr></thead>
                <tbody>
                  {report.drugs.byClinician.map(row => (
                    <tr key={row.letter} className={`border-t border-slate-100 dark:border-[#2a2a2a] ${row.isMe ? "font-semibold text-blue-700 dark:text-blue-300" : ""}`}>
                      <td className="py-1.5">{row.name ? `${row.name}${row.isMe ? ` (${t("you")})` : ""}` : t("colleague", { letter: row.letter })}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.cases}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.morphineMg.median ?? t("fewer")}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.morphineMgPerKg.median ?? t("fewer")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">{t("morphineNote")}</p>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title={t("topDrugs")}><TallyList rows={report.drugs.topDrugs} label={key => displayClinicalCode("option:INTRAOP_DRUG", key, locale, { label: key })} /></Panel>
              <Panel title={t("topInfusions")}><TallyList rows={report.drugs.topInfusions} label={key => displayClinicalCode("option:INTRAOP_INFUSION", key, locale, { label: key })} /></Panel>
            </div>
          </Section>

          <Section id="environment" title={t("s_environment")}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label={t("totalCo2e")} value={report.environment.totalKgCo2e == null ? t("fewer") : `${report.environment.totalKgCo2e} kg CO₂e`} sub={t("casesWithEstimate", { count: report.environment.casesWithEstimate })} />
              <Figure label={t("co2ePerCase")} value={spread(report.environment.kgCo2ePerCase, "kg CO₂e", t)} />
              <Figure label={t("desflurane")} value={share(report.environment.desflurane, t)} />
              <Figure label={t("nitrousOxide")} value={share(report.environment.nitrousOxide, t)} />
            </div>
            <Panel title={t("agents")}><TallyList rows={report.environment.agents} label={key => agentName(key, lang)} /></Panel>
            <p className="text-xs text-slate-500">{t("co2eNote")}</p>
          </Section>

          <Section id="fluids" title={t("s_fluids")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Figure label={t("crystalloid")} value={spread(report.fluids.crystalloidMlPerKgH, "mL/kg/h", t)} />
              <Figure label={t("transfused")} value={share(report.fluids.transfused, t)} />
            </div>
          </Section>

          <Section id="events" title={t("s_events")}>
            <Panel title={t("hypotension")}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="indicators-hypotension">
                  <thead><tr className="text-left text-xs text-slate-500">
                    <th className="py-1 pr-2">{t("band")}</th><th className="py-1 pr-2">{t("threshold")}</th><th className="py-1 pr-2 text-right">n</th>
                    <th className="py-1 pr-2 text-right">{t("withHypotension")}</th><th className="py-1 pr-2 text-right">{t("minutesPerCase")}</th>
                    <th className="py-1 pr-2 text-right">{t("totalMinutes")}</th><th className="py-1 text-right">{t("shareOfTime")}</th>
                  </tr></thead>
                  <tbody>
                    {report.intraopEvents.hypotension.map(row => {
                      const band = data.config.hypotensionBands.find(item => item.key === row.band)
                      const threshold = [band?.mapBelow != null ? `MAP < ${band.mapBelow}` : null, band?.sbpBelow != null ? `SBP < ${band.sbpBelow}` : null].filter(Boolean).join(" · ") || "—"
                      return (
                        <tr key={row.band} className="border-t border-slate-100 dark:border-[#2a2a2a]">
                          <td className="py-1.5 pr-2">{bandLabel(row.band)}</td>
                          <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500">{threshold}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{row.cases}</td>
                          {/* A band with no cases has nothing withheld: a dash, not "<5". */}
                          <td className="py-1.5 pr-2 text-right tabular-nums">{row.cases === 0 ? "—" : share(row.withHypotension, t)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{row.cases === 0 ? "—" : spread(row.minutes, t("minutes"), t)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{row.cases === 0 ? "—" : row.totalMinutes ?? t("fewer")}</td>
                          <td className="py-1.5 text-right tabular-nums">{row.cases === 0 ? "—" : row.shareOfMonitoredTime == null ? t("fewer") : percent(row.shareOfMonitoredTime)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">{t("thresholdsFrom")}</p>
            </Panel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label={`${t("desaturation")} (SpO₂ < ${data.config.spo2Below} %)`} value={share(report.intraopEvents.desaturation, t)} sub={`${t("desaturationMinutes")}: ${spread(report.intraopEvents.desaturationMinutes, t("minutes"), t)}`} />
              <Figure label={`${t("hypothermia")} (< ${data.config.tempBelow} °C)`} value={share(report.intraopEvents.hypothermia, t)} />
              <Figure label={t("complicationsPer100")} value={report.intraopEvents.complicationsPer100 == null ? t("fewer") : String(report.intraopEvents.complicationsPer100)} />
              <Panel title={t("topComplications")}><TallyList rows={report.intraopEvents.topComplications} label={key => displayClinicalCode("complication", key, locale, { label: key })} /></Panel>
            </div>
          </Section>

          <Section id="recovery" title={t("s_recovery")}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label={`${t("painAbove")} (> ${data.config.painAbove})`} value={share(report.recovery.painAboveThreshold, t)}
                sub={report.recovery.painByScale.map(row => `${row.scale.replace("_", "-")}: ${share(row.aboveThreshold, t)}`).join(" · ")} />
              <Figure label={t("ponv")} value={share(report.recovery.ponv, t)} />
              <Figure label={`${t("emergenceDelirium")} (≥ ${data.config.paedAtLeast})`} value={share(report.recovery.emergenceDelirium, t)} />
              <Figure label={t("icu")} value={share(report.recovery.icu, t)}
                sub={[
                  report.recovery.aldreteScore.n > 0 ? `${t("aldreteScore")}: ${spread(report.recovery.aldreteScore, "", t)}` : null,
                  report.recovery.stewardScore.n > 0 ? `${t("stewardScore")}: ${spread(report.recovery.stewardScore, "", t)}` : null,
                ].filter(Boolean).join(" · ") || undefined} />
            </div>
            <Panel title={t("ponvByApfel")}>
              <table className="w-full text-sm" data-testid="indicators-ponv">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Apfel</th><th className="py-1 text-right">{t("observed")}</th><th className="py-1 text-right">{t("predicted")}</th></tr></thead>
                <tbody>
                  {report.recovery.ponvByApfel.map(row => (
                    <tr key={row.apfel} className="border-t border-slate-100 dark:border-[#2a2a2a]">
                      <td className="py-1.5">{row.apfel}</td>
                      <td className="py-1.5 text-right tabular-nums">{share(row.observed, t)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{percent(row.predicted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>

          <Section id="documentation" title={t("s_documentation")}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label={t("finalised")} value={share(report.documentation.finalised, t)} />
              <Figure label={t("hoursToFinalise")} value={spread(report.documentation.hoursToFinalise, "h", t)} />
              <Figure label={t("awaitingReview")} value={report.documentation.awaitingReview == null ? t("fewer") : String(report.documentation.awaitingReview)} />
              <Figure label={t("autoEnded")} value={share(report.documentation.autoEnded, t)} />
            </div>
            <Panel title={t("topMissing")}>
              <TallyList rows={report.documentation.topMissing} label={key => (READINESS_COPY[lang] as Record<string, string>)[key] ?? key} />
            </Panel>
          </Section>
        </>
      ))}
    </div>
  )
}
