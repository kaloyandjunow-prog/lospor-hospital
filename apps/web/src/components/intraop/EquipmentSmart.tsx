"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import type { EquipmentCategory } from "@lospor/core/equipment"
import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import {
  EQUIPMENT_TRACKED_LABELS,
  equipmentItemKey,
  equipmentPreparationGroups,
  equipmentPreparationStatus,
  equipmentRecordedValue,
  equipmentReferenceGroups,
  equipmentSuggestionStatus,
  type EquipmentFlagState,
  type EquipmentSuggestionStatus,
} from "@lospor/core/equipment-smart"

/**
 * Smart Equipment is intentionally not a second clinical record. The top
 * cards compare calculated suggestions with the canonical Airway/monitoring
 * state; the lower section is only a persisted preparation reference.
 */
export function EquipmentSmart({ categories, flags, airwayEntries, prepared, onFlag, onPreparedChange, onUseAirway, categoryName, labelOf, textOf }: {
  categories: readonly EquipmentCategory[]
  flags: EquipmentFlagState
  airwayEntries: readonly AirwayDeviceEntry[]
  prepared: Readonly<Record<string, boolean>>
  onFlag: (field: "urinaryCatheter" | "stomachTube") => void
  onPreparedChange: (key: string, value: boolean) => void
  onUseAirway: (device: "ORAL_ETT" | "LMA") => boolean
  categoryName: (category: string) => string
  labelOf: (label: string) => string
  textOf: (value: string) => string
}) {
  const t = useTranslations("intraop.equipmentSmart")
  const [preparationOpen, setPreparationOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [airwayActionBlocked, setAirwayActionBlocked] = useState(false)
  const record = { flags, airwayEntries }
  const allItems = categories.flatMap(category => category.items.map(item => ({ category: category.cat, item })))
  const tracked = EQUIPMENT_TRACKED_LABELS.flatMap(label => {
    const found = allItems.find(entry => entry.item.label === label)
    return found ? [found] : []
  })
  const preparationGroups = equipmentPreparationGroups(categories)
  const referenceGroups = equipmentReferenceGroups(categories)
  const matchedCount = tracked.filter(({ item }) => equipmentSuggestionStatus(item.label, item.value, record) === "matched").length

  const statusText = (status: EquipmentSuggestionStatus) => ({
    matched: t("matched"),
    recorded_incomplete: t("recordedIncomplete"),
    different: t("different"),
    not_recorded: t("notRecorded"),
    prepared: t("prepared"),
    reference: t("referenceOnly"),
  })[status]

  const statusClass = (status: EquipmentSuggestionStatus) => ({
    matched: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
    recorded_incomplete: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    different: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300",
    not_recorded: "border-slate-200 bg-slate-50 text-slate-600 dark:border-[#333] dark:bg-[#191d25] dark:text-slate-400",
    prepared: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
    reference: "border-slate-200 bg-slate-50 text-slate-600 dark:border-[#333] dark:bg-[#191d25] dark:text-slate-400",
  })[status]
  const actualText = (value: string | null) => value == null ? null : value === "Documented" ? t("documented") : value.replace(" cuffed", ` ${t("cuffedValue")}`).replace(" uncuffed", ` ${t("uncuffedValue")}`)
  const recordAirway = (device: "ORAL_ETT" | "LMA") => {
    setAirwayActionBlocked(onUseAirway(device) === false)
  }

  function trackedAction(label: string, status: EquipmentSuggestionStatus) {
    if (label === "ETT size" && status === "not_recorded") return <button type="button" data-testid="equipment-record-ETT-size" onClick={() => recordAirway("ORAL_ETT")} className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30">{t("recordInAirway")}</button>
    if (label === "LMA size" && status === "not_recorded") return <button type="button" data-testid="equipment-record-LMA-size" onClick={() => recordAirway("LMA")} className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30">{t("recordInAirway")}</button>
    if ((label === "Urinary catheter" || label === "NGT") && status === "not_recorded") return <button type="button" data-testid={`equipment-record-${label}`} onClick={() => onFlag(label === "NGT" ? "stomachTube" : "urinaryCatheter")} className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30">{t("markInPlace")}</button>
    if ((label === "Urinary catheter" || label === "NGT") && status === "recorded_incomplete") return <button type="button" data-testid={`equipment-remove-${label}`} onClick={() => onFlag(label === "NGT" ? "stomachTube" : "urinaryCatheter")} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-[#444] dark:text-slate-400 dark:hover:bg-[#222]">{t("removeFromRecord")}</button>
    return null
  }

  return (
    <div className="space-y-4 p-3" data-testid="equipment-smart">
      <section data-testid="equipment-recorded">
        <div className="mb-2 flex items-end justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t("suggestedRecorded")}</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("suggestedRecordedHint")}</p></div><span data-testid="equipment-summary" className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{matchedCount}/{tracked.length} {t("matchedShort")}</span></div>
        {airwayActionBlocked ? <p data-testid="equipment-airway-action-blocked" className="mb-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">{t("airwayActionBlocked")}</p> : null}
        <div className="space-y-2">{tracked.map(({ item }) => {
          const status = equipmentSuggestionStatus(item.label, item.value, record)
          const actual = equipmentRecordedValue(item.label, record)
          return <div key={item.label} data-testid={`equipment-tracked-${item.label}`} className={`rounded-xl border p-3 ${statusClass(status)}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold">{labelOf(item.label)}</p><span className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{statusText(status)}</span></div>{trackedAction(item.label, status)}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-current/10 pt-2"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{t("suggested")}</p><p className="mt-0.5 break-words text-sm font-semibold">{textOf(item.value)}</p></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{t("actual")}</p><p className="mt-0.5 break-words text-sm font-semibold">{actualText(actual) ?? t("notRecorded")}</p></div></div>
            {status === "recorded_incomplete" ? <p className="mt-2 text-xs opacity-75">{t("detailsMissing")}</p> : null}{status === "different" ? <p className="mt-2 text-xs opacity-75">{t("differentHint")}</p> : null}
          </div>
        })}</div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#333]" data-testid="equipment-preparation">
        <button type="button" data-testid="equipment-preparation-toggle" onClick={() => setPreparationOpen(open => !open)} aria-expanded={preparationOpen} className="flex min-h-14 w-full items-center gap-3 px-3 text-left hover:bg-slate-50 dark:hover:bg-[#1b1f28]"><span className="flex-1"><span className="block text-sm font-extrabold text-slate-800 dark:text-slate-100">{t("preparation")}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{t("preparationHint")}</span></span><span className="text-slate-400">{preparationOpen ? "▾" : "▸"}</span></button>
        {preparationOpen ? <div className="border-t border-slate-200 p-3 dark:border-[#333]">{preparationGroups.map(group => <div key={group.cat} className="mb-4 last:mb-0" data-testid={`equipment-preparation-group-${group.cat}`}><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{categoryName(group.cat)}</p><div className="space-y-1.5">{group.items.map(item => { const key = equipmentItemKey(group.cat, item.label); const on = equipmentPreparationStatus(group.cat, item.label, prepared) === "prepared"; return <button key={item.label} type="button" aria-pressed={on} data-testid={`equipment-preparation-${item.label}`} onClick={() => onPreparedChange(key, !on)} className={`flex w-full items-start gap-3 rounded-lg border p-2.5 text-left ${on ? "border-blue-400 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" : "border-slate-200 dark:border-[#333]"}`}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-xs font-bold ${on ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 dark:border-[#555]"}`}>{on ? "✓" : ""}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{labelOf(item.label)}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{textOf(item.value)}</span></span></button> })}</div></div>)}</div> : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#333]" data-testid="equipment-reference">
        <button type="button" onClick={() => setReferenceOpen(open => !open)} aria-expanded={referenceOpen} className="flex min-h-12 w-full items-center gap-3 px-3 text-left hover:bg-slate-50 dark:hover:bg-[#1b1f28]"><span className="flex-1"><span className="block text-sm font-bold text-slate-700 dark:text-slate-200">{t("clinicalReference")}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{t("clinicalReferenceHint")}</span></span><span className="text-slate-400">{referenceOpen ? "▾" : "▸"}</span></button>
        {referenceOpen ? <div className="space-y-3 border-t border-slate-200 p-3 dark:border-[#333]">{referenceGroups.map(group => <div key={group.cat} data-testid={`equipment-reference-group-${group.cat}`}><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{categoryName(group.cat)}</p><div className="space-y-1">{group.items.map(item => <div key={item.label} className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-[#2a2a2a]"><span className="text-xs text-slate-500 dark:text-slate-400">{labelOf(item.label)}</span><span className="text-right text-xs font-semibold text-slate-700 dark:text-slate-300">{textOf(item.value)}{item.note ? <span className="block text-[10px] font-normal text-slate-400 dark:text-slate-500">{textOf(item.note)}</span> : null}</span></div>)}</div></div>)}</div> : null}
      </section>
    </div>
  )
}
