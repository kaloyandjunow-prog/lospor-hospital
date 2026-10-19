"use client"
import { useState, useRef } from "react"
import { useLocale } from "next-intl"
import { Controller, type Control, type UseFormWatch, type UseFormSetValue, type UseFormGetValues } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { TimePicker } from "@/components/forms/shared/TimePicker"
import { DayStepper } from "@/components/forms/shared/DayStepper"
import { Label } from "@/components/ui/label"
import type { IntraopFormFields, IntraopData } from "@/components/forms/IntraopForm"
import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  daysBetweenDateKeys,
  defaultEndDayOffset,
  durationMinutesBetween,
  earliestEndDateKey,
  endInstantForWallClock,
  formatDateKeyShort,
  instantFromDateKey,
  isValidTimeZone,
  localDateKey,
  monthYearOf,
  resolvedTimeZone,
  shiftDateKey,
  startInstantForWallClock,
} from "@/lib/intraop-time"
import { AIRWAY_DEVICES_WITH_SUBOPTIONS } from "@lospor/core/intraop"

type Template = {
  id: string; labelKey: string; descKey: string
  techniques: string[]
  monitoring: Partial<Record<string, boolean>>
  airwayDevices: string[]
  airwayTools?: string[]
}

const TEMPLATES: Template[] = [
  {
    id: "std-ga",
    labelKey: "intraop.timeline.templates.standardGaLabel",
    descKey: "intraop.timeline.templates.standardGaDesc",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
    airwayDevices: ["ORAL_ETT"],
  },
  {
    id: "tiva",
    labelKey: "intraop.timeline.templates.tivaLabel",
    descKey: "intraop.timeline.templates.tivaDesc",
    techniques: ["GENERAL_TIVA"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true, bis: true },
    airwayDevices: ["ORAL_ETT"],
  },
  {
    id: "spinal-cs",
    labelKey: "intraop.timeline.templates.spinalLabel",
    descKey: "intraop.timeline.templates.spinalDesc",
    techniques: ["SPINAL_SINGLE"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true },
    airwayDevices: ["FACE_MASK"],
  },
  {
    id: "paed-inhal",
    labelKey: "intraop.timeline.templates.pediatricLabel",
    descKey: "intraop.timeline.templates.pediatricDesc",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
    airwayDevices: ["FACE_MASK"],
  },
  {
    id: "awake-foi",
    labelKey: "intraop.timeline.templates.awakeFoiLabel",
    descKey: "intraop.timeline.templates.awakeFoiDesc",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true },
    airwayDevices: ["ORAL_ETT"],
    airwayTools: ["FOB", "AWAKE"],
  },
]

function nowHHMM() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`
}

export function TimelineSection({
  t, control, watch, setValue, getValues, onAutoSave,
  timeErrors, setTimeErrors, monDefaultsAppliedRef, setAdvancedMonOpen, setAirwayExpandedDevice,
}: {
  t: (key: string, values?: Record<string, string | number>) => string
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  getValues: UseFormGetValues<IntraopFormFields>
  onAutoSave?: (data: IntraopData) => void
  timeErrors: { startTime?: boolean; endTime?: boolean }
  setTimeErrors: (updater: (e: { startTime?: boolean; endTime?: boolean }) => { startTime?: boolean; endTime?: boolean }) => void
  monDefaultsAppliedRef: { current: boolean }
  setAdvancedMonOpen: (value: boolean) => void
  setAirwayExpandedDevice: (v: string | null) => void
}) {
  const locale = useLocale()
  const [showTemplates, setShowTemplates]   = useState(false)
  const [showStartPrompt, setShowStartPrompt] = useState(false)
  const [showEndPrompt, setShowEndPrompt]     = useState(false)
  const [showStartAt, setShowStartAt]         = useState(false)
  const [startAtInput, setStartAtInput]       = useState("")
  const startHourRef = useRef<HTMLSelectElement>(null)
  const endHourRef   = useRef<HTMLSelectElement>(null)
  // The start and end dates. Left at "Today", a typed start time keeps the
  // long-standing rule (a time ahead of now means yesterday); a stepped date
  // places the time on that date. The end date follows the start, the next
  // day when the end clock time is earlier, until the clinician steps it.
  const [startDayKey, setStartDayKey] = useState<string | null>(null)
  const [endDayTouched, setEndDayTouched] = useState(false)
  const dateLocale = locale === "bg" ? "bg" : "en"
  const formatDay = (key: string) => formatDateKeyShort(key, dateLocale) ?? key

  function caseZone(): string | null {
    const saved = getValues("timezone")
    return isValidTimeZone(saved) ? saved : resolvedTimeZone()
  }

  function saveFormNow(overrides: Partial<IntraopFormFields>) {
    onAutoSave?.({ ...getValues(), ...overrides })
  }

  const zoneNow = caseZone()
  const todayKey = (zoneNow && localDateKey(new Date(), zoneNow)) ?? new Date().toISOString().slice(0, 10)
  // Watched, not read once: the dates beside the times redraw when either changes.
  const watchedStart = watch("startedAt")
  const watchedEnd = watch("endedAt")
  const savedStart = watchedStart ? new Date(watchedStart) : null
  const savedStartKey = savedStart && zoneNow ? localDateKey(savedStart, zoneNow) : null
  const savedEnd = watchedEnd ? new Date(watchedEnd) : null
  const savedEndKey = savedEnd && zoneNow ? localDateKey(savedEnd, zoneNow) : null
  const chosenStartKey = startDayKey ?? todayKey

  function applyStartInstant(instant: Date) {
    const zone = caseZone()
    const timing = zone ? buildIntraopStartTiming(instant, zone) : null
    if (!timing || !zone) return
    // The case month is the start's month, no longer entered on its own.
    const monthYear = monthYearOf(instant, zone) ?? undefined
    setValue("startTime", timing.startTime)
    setValue("startedAt", timing.startedAt)
    setValue("timezone", timing.timezone)
    if (monthYear) setValue("monthYear", monthYear)
    setTimeErrors(e => ({ ...e, startTime: false }))
    saveFormNow({ ...timing, ...(monthYear ? { monthYear } : {}) })
  }

  function applyStartWallClock(hhmm: string) {
    const zone = caseZone()
    if (!zone) return
    const instant = chosenStartKey === todayKey
      ? startInstantForWallClock(new Date(), hhmm, zone)
      : instantFromDateKey(chosenStartKey, hhmm, zone)
    if (instant) applyStartInstant(instant)
  }

  function applyEndWallClock(hhmm: string, dayOffset?: number) {
    const zone = caseZone()
    const startedAt = getValues("startedAt")
    const start = startedAt ? new Date(startedAt) : null
    const validStart = zone && start && !Number.isNaN(start.getTime()) ? start : null
    const offset = dayOffset
      ?? (endDayTouched && savedStartKey && savedEndKey ? daysBetweenDateKeys(savedStartKey, savedEndKey) ?? 0 : null)
      ?? (validStart && zone ? defaultEndDayOffset(validStart, hhmm, zone) : 0)
    const instant = validStart && zone ? endInstantForWallClock(validStart, hhmm, zone, offset) : null
    const timing = instant && zone ? buildIntraopEndTiming(instant, zone) : null
    setValue("endTime", hhmm)
    setValue("endTimeNextDay", offset > 0)
    if (timing) {
      setValue("endedAt", timing.endedAt)
      setValue("timezone", timing.timezone)
    }
    setTimeErrors(e => ({ ...e, endTime: false }))
    saveFormNow({ ...(timing ?? { endTime: hhmm }), endTimeNextDay: offset > 0 })
  }

  function stepEndDay(key: string) {
    if (!savedStartKey) return
    const offset = daysBetweenDateKeys(savedStartKey, key)
    if (offset == null || offset < 0) return
    setEndDayTouched(true)
    const endTime = getValues("endTime")
    if (endTime) applyEndWallClock(endTime, offset)
  }

  function applyTemplate(tpl: Template) {
    const currentDevs: string[] = watch("airwayDevices") ?? []
    const currentTech: string[] = watch("techniques") ?? []
    if (currentDevs.length || currentTech.length) {
      if (!window.confirm(t("intraop.timeline.confirmTemplate", { label: t(tpl.labelKey) }))) return
    }
    setValue("techniques", tpl.techniques)
    setValue("airwayDevices", tpl.airwayDevices)
    if (tpl.airwayTools) setValue("airwayTools", tpl.airwayTools)
    const MON_FIELDS = ["ecg","spO2Monitor","nbpMonitor","etco2Monitor","tempMonitor","invasiveBP","cvpMonitor","paCatheter","tee","bis","entropyMonitor","nirsMonitor","evokedPotentials","tofMonitor","urinaryCatheter","stomachTube"] as const satisfies readonly (keyof IntraopFormFields)[]
    MON_FIELDS.forEach(f => setValue(f, tpl.monitoring[f] ?? false))
    monDefaultsAppliedRef.current = true
    const ADVANCED = ["etco2Monitor","tempMonitor","invasiveBP","cvpMonitor","paCatheter","tee","bis","entropyMonitor","nirsMonitor","evokedPotentials","tofMonitor","urinaryCatheter","stomachTube"] as const
    if (ADVANCED.some(f => tpl.monitoring[f])) setAdvancedMonOpen(true)
    const suboptions: readonly string[] = AIRWAY_DEVICES_WITH_SUBOPTIONS
    const firstSub = tpl.airwayDevices.find(device => suboptions.includes(device))
    if (firstSub) setAirwayExpandedDevice(firstSub)
    setShowTemplates(false)
  }

  return (
    <SectionCard title={t("intraop.timeline.title")}>
      {/* Quick Setup */}
      <div>
        <button type="button"
          onClick={() => setShowTemplates(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors border border-slate-200 dark:border-[#333] rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1e1e1e]">
          <span className={`transition-transform text-[10px] ${showTemplates ? "rotate-90" : ""}`}>▶</span>
          {t("intraop.timeline.quickSetup")}
        </button>
        {showTemplates && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {TEMPLATES.map(tpl => (
              <button key={tpl.id} type="button"
                onClick={() => applyTemplate(tpl)}
                className="text-left rounded-lg border-2 border-slate-200 dark:border-[#333] px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 dark:hover:border-blue-600 transition-all group">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-300">{t(tpl.labelKey)}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t(tpl.descKey)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Start date + time + START CASE */}
        <div className="space-y-1">
          <Label className={timeErrors.startTime ? "text-red-600 dark:text-red-400" : ""}>{t("intraop.startTime")} {timeErrors.startTime && <span className="font-normal">{t("intraop.timeline.required")}</span>}</Label>
          <div className={`flex items-center gap-2 ${timeErrors.startTime ? "ring-2 ring-red-400 rounded-lg p-0.5" : ""}`}>
            <Controller name="startTime" control={control} render={({ field }) => (
              field.value
                // Once start time is set the field is locked — show as read-only badge
                ? <span data-testid="intraop-start-locked" className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] font-mono">{savedStartKey ? `${formatDay(savedStartKey)} · ` : ""}{field.value} <span className="text-[10px] font-normal text-slate-400 ml-1">{t("intraop.timeline.locked")}</span></span>
                : <>
                    <DayStepper value={chosenStartKey} onChange={setStartDayKey} todayKey={todayKey} min={shiftDateKey(todayKey, -14)} max={todayKey} locale={dateLocale} label={t("intraop.timeline.startDate")} testId="intraop-start-day" />
                    <TimePicker ref={startHourRef} value={field.value} onChange={applyStartWallClock} />
                  </>
            )} />
            {!watch("startTime") && !watch("endTime") && (
              <button type="button"
                onClick={() => { setShowStartPrompt(v => !v); setShowEndPrompt(false) }}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-blue-400 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors whitespace-nowrap">
                {t("intraop.timeline.startCase")}
              </button>
            )}
          </div>
          {!watch("startTime") && !watch("endTime") && showStartPrompt && (
            <div className="mt-1 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-3 space-y-2">
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => {
                    applyStartInstant(new Date())
                    setShowStartPrompt(false)
                    setShowStartAt(false)
                  }}
                  className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors">
                  {t("intraop.timeline.startNow")}
                </button>
                <button type="button"
                  onClick={() => {
                    setShowStartAt(v => !v)
                    if (!showStartAt) setStartAtInput(nowHHMM())
                  }}
                  className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border-2 transition-colors whitespace-nowrap
                    ${showStartAt
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-indigo-400 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-600"}`}>
                  {t("intraop.timeline.startAt")}
                </button>
              </div>
              {showStartAt && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={startAtInput}
                    onChange={e => setStartAtInput(e.target.value)}
                    className="flex-1 text-sm bg-white dark:bg-[#2a2a2a] border border-indigo-300 dark:border-indigo-700 rounded-lg px-3 py-1.5 text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                  />
                  <button type="button"
                    disabled={!startAtInput}
                    onClick={() => {
                      if (!startAtInput) return
                      applyStartWallClock(startAtInput)
                      setShowStartPrompt(false)
                      setShowStartAt(false)
                    }}
                    className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white transition-colors">
                    {t("intraop.timeline.confirm")}
                  </button>
                </div>
              )}
              <button type="button"
                onClick={() => { setShowStartPrompt(false); setShowStartAt(false); setTimeout(() => startHourRef.current?.focus(), 50) }}
                className="w-full text-xs text-center text-blue-500 dark:text-blue-400 hover:underline py-0.5">
                {t("intraop.timeline.writeAbove")}
              </button>
            </div>
          )}
        </div>

        {/* End date + time + END CASE */}
        <div className="space-y-1">
          <Label className={timeErrors.endTime ? "text-red-600 dark:text-red-400" : ""}>{t("intraop.endTime")} {timeErrors.endTime && <span className="font-normal">{t("intraop.timeline.required")}</span>}</Label>
          <div className={`flex items-center gap-2 flex-wrap ${timeErrors.endTime ? "ring-2 ring-red-400 rounded-lg p-0.5" : ""}`}>
            {/* The end date: the start's, the next day when the end time is earlier. */}
            <DayStepper
              value={savedEndKey ?? savedStartKey ?? todayKey}
              onChange={stepEndDay}
              todayKey={todayKey}
              min={savedStart && zoneNow && watch("endTime") ? earliestEndDateKey(savedStart, watch("endTime")!, zoneNow) : savedStartKey}
              max={savedStartKey ? shiftDateKey(savedStartKey, 2) : null}
              locale={dateLocale}
              label={t("intraop.timeline.endDate")}
              disabled={!savedStartKey || !watch("endTime")}
              testId="intraop-end-day"
            />
            <Controller name="endTime" control={control} render={({ field }) => (
              <TimePicker ref={endHourRef} value={field.value} onChange={applyEndWallClock} />
            )} />
            {!watch("endTime") && (
              <button type="button"
                onClick={() => { setShowEndPrompt(v => !v); setShowStartPrompt(false) }}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-red-400 text-red-500 hover:bg-red-500 hover:text-white transition-colors whitespace-nowrap">
                {t("intraop.timeline.endCase")}
              </button>
            )}
          </div>
          {(durationMinutesBetween(savedStart, savedEnd) ?? 0) > 24 * 60 && (
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400" data-testid="intraop-longer-than-day">{t("intraop.timeline.longerThanDay")}</p>
          )}
          {!watch("endTime") && showEndPrompt && (
            <div className="mt-1 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 flex gap-2">
              <Controller name="endTime" control={control} render={({ field }) => (
                <button type="button"
                  onClick={() => {
                    const now = new Date()
                    const zone = caseZone()
                    const timing = zone ? buildIntraopEndTiming(now, zone) : null
                    const endTime = timing?.endTime ?? nowHHMM()
                    const endKey = zone ? localDateKey(now, zone) : null
                    const nextDay = !!savedStartKey && !!endKey && (daysBetweenDateKeys(savedStartKey, endKey) ?? 0) > 0
                    field.onChange(endTime)
                    setValue("endTimeNextDay", nextDay)
                    if (timing) {
                      setValue("endedAt", timing.endedAt)
                      setValue("timezone", timing.timezone)
                    }
                    setTimeErrors(e => ({ ...e, endTime: false }))
                    saveFormNow(timing ?? { endTime })
                    setShowEndPrompt(false)
                  }}
                  className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors">
                  {t("intraop.timeline.endNow")}
                </button>
              )} />
              <button type="button"
                onClick={() => { setShowEndPrompt(false); setTimeout(() => endHourRef.current?.focus(), 50) }}
                className="flex-1 text-sm text-red-600 dark:text-red-400 font-medium px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-[#2a2a2a] hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                {t("intraop.timeline.writeManually")}
              </button>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
