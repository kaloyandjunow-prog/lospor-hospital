"use client"

import { useTranslations } from "next-intl"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { ReactNode } from "react"
import type { IndicatorConfig, IndicatorsReport, Share, Spread, Tally } from "@lospor/core/indicators"

export type IndicatorResponse = {
  period: { from: string; to: string }
  pending: number
  config: IndicatorConfig
  filters: { theatres: { id: string; name: string }[]; anaesthesiologists: { id: string; name: string }[]; procedures: string[] }
  report: IndicatorsReport
}
export type IndicatorFilters = { from: string; to: string; theatre: string; assignee: string; mode: string; asa: string; procedure: string }
type Translate = ReturnType<typeof useTranslations<"indicators">>

export function percent(value: number): string { return `${Math.round(value * 100)} %` }
export function share(value: Share, t: Translate): string { return value.share == null ? t("fewer") : `${percent(value.share)} (${value.count}/${value.of})` }
export function spread(value: Spread, unit: string, t: Translate): string { return value.median == null ? t("fewer") : `${value.median}${unit ? ` ${unit}` : ""} (${value.q1}–${value.q3})` }

const AGENT_BG: Record<string, string> = { sevoflurane: "Севофлуран", desflurane: "Десфлуран", isoflurane: "Изофлуран" }
export function agentName(key: string, lang: "en" | "bg"): string { return lang === "bg" ? AGENT_BG[key] ?? key : key.charAt(0).toUpperCase() + key.slice(1) }

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={`indicators-${id}`} data-testid={`indicators-${id}`} className="space-y-3"><h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-[#2e2e2e] pb-1">{title}</h2>{children}</section>
}
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] p-3 min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{title}</p>{children}</div>
}
export function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] p-3 min-w-0"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">{value}</p>{sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}</div>
}
export function TallyList({ rows, label }: { rows: Tally[]; label: (key: string) => string }) {
  const t = useTranslations("indicators")
  if (!rows.length) return <p className="text-sm text-slate-400">—</p>
  const max = Math.max(1, ...rows.map(row => row.count ?? 0))
  return <ul className="space-y-1">{rows.map(row => <li key={row.key} className="text-sm"><div className="flex justify-between gap-2"><span className="truncate">{label(row.key)}</span><span className="tabular-nums text-slate-500">{row.count ?? t("fewer")}</span></div>{row.count != null && <div className="h-1 rounded bg-blue-500/70 dark:bg-blue-400/60" style={{ width: `${(row.count / max) * 100}%` }} />}</li>)}</ul>
}
export function SpreadList({ rows, unit, t }: { rows: { key: string; label: string; spread: Spread }[]; unit: string; t: Translate }) {
  if (!rows.length) return <p className="text-sm text-slate-400">—</p>
  return <ul className="space-y-1 text-sm">{rows.map(row => <li key={row.key} className="flex justify-between gap-2"><span className="truncate">{row.label} <span className="text-slate-400">n={row.spread.n}</span></span><span className="tabular-nums text-slate-500 shrink-0">{spread(row.spread, unit, t)}</span></li>)}</ul>
}
export function TallyChart({ rows }: { rows: Tally[] }) {
  const data = rows.map(row => ({ key: row.key.replace(/^\d{4}-/, ""), count: row.count ?? 0 }))
  return <div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}><CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} /><XAxis dataKey="key" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip cursor={{ fillOpacity: 0.08 }} /><Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
}
function HeatmapRow({ label, values, max }: { label: string; values: (number | null)[]; max: number }) {
  return <><span className="pr-1 text-right leading-4">{label}</span>{values.map((value, hour) => <span key={hour} title={value == null ? "<5" : String(value)} className="h-4 rounded-sm" style={{ background: value ? `rgba(59,130,246,${0.15 + 0.85 * (value / max)})` : value === null ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.08)" }} />)}</>
}
export function Heatmap({ cells, locale }: { cells: (number | null)[][]; locale: string }) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const days = order.map(day => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + day))))
  const max = Math.max(1, ...cells.flat().map(value => value ?? 0))
  return <div className="overflow-x-auto"><div className="grid gap-px text-[9px] text-slate-400" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0.9rem, 1fr))" }}><span />{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="text-center">{hour % 3 === 0 ? hour : ""}</span>)}{order.map((day, row) => <HeatmapRow key={day} label={days[row]} values={cells[day]} max={max} />)}</div></div>
}
export function FilterBar({ filters, set, data, onClear }: { filters: IndicatorFilters; set: (key: keyof IndicatorFilters) => (value: string) => void; data: IndicatorResponse | null; onClear: () => void }) {
  const t = useTranslations("indicators")
  const input = "rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1a1a1a] px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200"
  const changed = filters.theatre || filters.assignee || filters.mode || filters.asa || filters.procedure
  return <div className="flex flex-wrap items-end gap-2" data-testid="indicators-filters"><label className="text-xs text-slate-500">{t("from")}<input type="date" value={filters.from} max={filters.to} onChange={event => set("from")(event.target.value)} className={`block ${input}`} /></label><label className="text-xs text-slate-500">{t("to")}<input type="date" value={filters.to} min={filters.from} onChange={event => set("to")(event.target.value)} className={`block ${input}`} /></label>{(data?.filters.theatres.length ?? 0) > 0 && <select aria-label={t("theatre")} value={filters.theatre} onChange={event => set("theatre")(event.target.value)} className={input}><option value="">{t("allTheatres")}</option>{data!.filters.theatres.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="none">{t("noTheatre")}</option></select>}<select aria-label={t("clinician")} data-testid="indicators-filter-assignee" value={filters.assignee} onChange={event => set("assignee")(event.target.value)} className={input}><option value="">{t("allAnaesthesiologists")}</option>{data?.filters.anaesthesiologists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label={t("byMode")} value={filters.mode} onChange={event => set("mode")(event.target.value)} className={input}><option value="">{t("allModes")}</option><option value="ADULT">{t("adults")}</option><option value="PEDIATRIC">{t("pediatric")}</option></select><select aria-label={t("asa")} value={filters.asa} onChange={event => set("asa")(event.target.value)} className={input}><option value="">{t("allAsa")}</option>{["I", "II", "III", "IV", "V", "VI"].map(value => <option key={value} value={value}>ASA {value}</option>)}</select>{(data?.filters.procedures.length ?? 0) > 0 && <select aria-label={t("durationByProcedure")} value={filters.procedure} onChange={event => set("procedure")(event.target.value)} className={`${input} max-w-[14rem]`}><option value="">{t("allProcedures")}</option>{data!.filters.procedures.map(item => <option key={item} value={item}>{item}</option>)}</select>}{changed && <button type="button" onClick={onClear} className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1.5">{t("clear")}</button>}</div>
}
