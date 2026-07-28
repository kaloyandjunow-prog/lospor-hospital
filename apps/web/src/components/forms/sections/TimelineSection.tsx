"use client"
import { useState, useRef } from "react"
import { Controller, type Control, type UseFormWatch, type UseFormSetValue, type UseFormGetValues } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { TimePicker } from "@/components/forms/shared/TimePicker"
import { Label } from "@/components/ui/label"
import type { IntraopFormFields, IntraopData } from "@/components/forms/IntraopForm"
import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  endInstantForWallClock,
  isValidTimeZone,
  resolvedTimeZone,
  startInstantForWallClock,
} from "@/lib/intraop-time"
import { AIRWAY_DEVICES_WITH_SUBOPTIONS } from "@lospor/core/intraop"

type Template = {
  id: string; label: string; desc: string
  techniques: string[]
  monitoring: Partial<Record<string, boolean>>
  airwayDevices: string[]
  airwayTools?: string[]
}

const TEMPLATES: Template[] = [
  {
    id: "std-ga",
    label: "Standard GA",
    desc: "Inhalational · Oral ETT · Full monitoring",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
    airwayDevices: ["ORAL_ETT"],
  },
  {
    id: "tiva",
    label: "TIVA",
    desc: "Propofol infusion · Oral ETT · BIS",
    techniques: ["GENERAL_TIVA"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true, bis: true },
    airwayDevices: ["ORAL_ETT"],
  },
  {
    id: "spinal-cs",
    label: "Spinal C-Section",
    desc: "Single-shot spinal · Face mask",
    techniques: ["SPINAL_SINGLE"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true },
    airwayDevices: ["FACE_MASK"],
  },
  {
    id: "paed-inhal",
    label: "Paediatric Inhalational",
    desc: "Sevoflurane induction · Face mask",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
    airwayDevices: ["FACE_MASK"],
  },
  {
    id: "awake-foi",
    label: "Awake Fiberoptic",
    desc: "FOI · Topical LA · Oral ETT",
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
  t: (key: string) => string
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
  const [showTemplates, setShowTemplates]   = useState(false)
  const [showStartPrompt, setShowStartPrompt] = useState(false)
  const [showEndPrompt, setShowEndPrompt]     = useState(false)
  const [showStartAt, setShowStartAt]         = useState(false)
  const [startAtInput, setStartAtInput]       = useState("")
  const startHourRef = useRef<HTMLSelectElement>(null)
  const endHourRef   = useRef<HTMLSelectElement>(null)

  function caseZone(): string | null {
    const saved = getValues("timezone")
    return isValidTimeZone(saved) ? saved : resolvedTimeZone()
  }

  function saveFormNow(overrides: Partial<IntraopFormFields>) {
    onAutoSave?.({ ...getValues(), ...overrides })
  }

  function applyStartInstant(instant: Date) {
    const zone = caseZone()
    const timing = zone ? buildIntraopStartTiming(instant, zone) : null
    if (!timing) return
    setValue("startTime", timing.startTime)
    setValue("startedAt", timing.startedAt)
    setValue("timezone", timing.timezone)
    setTimeErrors(e => ({ ...e, startTime: false }))
    saveFormNow(timing)
  }

  function applyStartWallClock(hhmm: string) {
    const zone = caseZone()
    const instant = zone ? startInstantForWallClock(new Date(), hhmm, zone) : null
    if (instant) applyStartInstant(instant)
  }

  function applyEndWallClock(hhmm: string, nextDay = !!getValues("endTimeNextDay")) {
    const zone = caseZone()
    const startedAt = getValues("startedAt")
    const start = startedAt ? new Date(startedAt) : null
    const instant = zone && start && !Number.isNaN(start.getTime())
      ? endInstantForWallClock(start, hhmm, zone, nextDay)
      : null
    const timing = instant && zone ? buildIntraopEndTiming(instant, zone) : null
    setValue("endTime", hhmm)
    if (timing) {
      setValue("endedAt", timing.endedAt)
      setValue("timezone", timing.timezone)
    }
    setTimeErrors(e => ({ ...e, endTime: false }))
    saveFormNow(timing ?? { endTime: hhmm })
  }

  function applyTemplate(tpl: Template) {
    const currentDevs: string[] = watch("airwayDevices") ?? []
    const currentTech: string[] = watch("techniques") ?? []
    if (currentDevs.length || currentTech.length) {
      if (!window.confirm(`Apply "${tpl.label}" template? This will overwrite existing technique and airway selections.`)) return
    }
    setValue("techniques", tpl.techniques)
    setValue("airwayDevices", tpl.airwayDevices)
    if (tpl.airwayTools) setValue("airwayTools", tpl.airwayTools)
    const MON_FIELDS = ["ecg","spO2Monitor","nbpMonitor","etco2Monitor","tempMonitor","invasiveBP","cvpMonitor","paCatheter","tee","bis","entropyMonitor","nirsMonitor","evokedPotentials","tofMonitor","bglMonitor","bloodGasMonitor","urinaryCatheter","stomachTube"] as const satisfies readonly (keyof IntraopFormFields)[]
    MON_FIELDS.forEach(f => setValue(f, tpl.monitoring[f] ?? false))
    monDefaultsAppliedRef.current = true
    const ADVANCED = ["etco2Monitor","tempMonitor","invasiveBP","cvpMonitor","paCatheter","tee","bis","entropyMonitor","nirsMonitor","evokedPotentials","tofMonitor","bglMonitor","bloodGasMonitor","urinaryCatheter","stomachTube"] as const
    if (ADVANCED.some(f => tpl.monitoring[f])) setAdvancedMonOpen(true)
    const suboptions: readonly string[] = AIRWAY_DEVICES_WITH_SUBOPTIONS
    const firstSub = tpl.airwayDevices.find(device => suboptions.includes(device))
    if (firstSub) setAirwayExpandedDevice(firstSub)
    setShowTemplates(false)
  }

  return (
    <SectionCard title="Timeline of anaesthesia and surgery">
      {/* Quick Setup */}
      <div>
        <button type="button"
          onClick={() => setShowTemplates(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors border border-slate-200 dark:border-[#333] rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1e1e1e]">
          <span className={`transition-transform text-[10px] ${showTemplates ? "rotate-90" : ""}`}>▶</span>
          Quick Setup
        </button>
        {showTemplates && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {TEMPLATES.map(tpl => (
              <button key={tpl.id} type="button"
                onClick={() => applyTemplate(tpl)}
                className="text-left rounded-lg border-2 border-slate-200 dark:border-[#333] px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 dark:hover:border-blue-600 transition-all group">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-300">{tpl.label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{tpl.desc}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>{t("intraop.date")}</Label>
          <Controller name="monthYear" control={control} render={({ field }) => {
            const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
            const currentYear = new Date().getFullYear()
            const years = Array.from({ length: 11 }, (_, i) => currentYear - i)
            const [selYear, selMonth] = field.value?.split("-") ?? ["", ""]
            return (
              <div className="flex gap-2">
                <select value={selMonth ?? ""}
                  onChange={e => field.onChange(selYear ? `${selYear}-${e.target.value}` : "")}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-[#1c1c1c] dark:border-[#3a3a3a] dark:text-slate-100">
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
                </select>
                <select value={selYear ?? ""}
                  onChange={e => field.onChange(selMonth ? `${e.target.value}-${selMonth}` : "")}
                  className="w-28 h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-[#1c1c1c] dark:border-[#3a3a3a] dark:text-slate-100">
                  <option value="">Year</option>
                  {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
            )
          }} />
        </div>
        {/* Start time + START CASE */}
        <div className="space-y-1">
          <Label className={timeErrors.startTime ? "text-red-600 dark:text-red-400" : ""}>{t("intraop.startTime")} {timeErrors.startTime && <span className="font-normal">— required</span>}</Label>
          <div className={`flex items-center gap-2 ${timeErrors.startTime ? "ring-2 ring-red-400 rounded-lg p-0.5" : ""}`}>
            <Controller name="startTime" control={control} render={({ field }) => (
              field.value
                // Once start time is set the field is locked — show as read-only badge
                ? <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] font-mono">{field.value} <span className="text-[10px] font-normal text-slate-400 ml-1">locked</span></span>
                : <TimePicker ref={startHourRef} value={field.value} onChange={applyStartWallClock} />
            )} />
            {!watch("startTime") && !watch("endTime") && (
              <button type="button"
                onClick={() => { setShowStartPrompt(v => !v); setShowEndPrompt(false) }}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-blue-400 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors whitespace-nowrap">
                Start Case
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
                  Start now
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
                  Start at…
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
                    Confirm
                  </button>
                </div>
              )}
              <button type="button"
                onClick={() => { setShowStartPrompt(false); setShowStartAt(false); setTimeout(() => startHourRef.current?.focus(), 50) }}
                className="w-full text-xs text-center text-blue-500 dark:text-blue-400 hover:underline py-0.5">
                Write manually in the field above
              </button>
            </div>
          )}
        </div>

        {/* End date + time + END CASE */}
        <div className="space-y-1">
          <Label className={timeErrors.endTime ? "text-red-600 dark:text-red-400" : ""}>{t("intraop.endTime")} {timeErrors.endTime && <span className="font-normal">— required</span>}</Label>
          <div className={`flex items-center gap-2 flex-wrap ${timeErrors.endTime ? "ring-2 ring-red-400 rounded-lg p-0.5" : ""}`}>
            {/* Crosses midnight toggle */}
            <Controller name="endTimeNextDay" control={control} render={({ field }) => (
              <button type="button"
                onClick={() => {
                  const nextDay = !field.value
                  field.onChange(nextDay)
                  const endTime = getValues("endTime")
                  if (endTime) applyEndWallClock(endTime, nextDay)
                }}
                className={`text-xs px-2 py-1 rounded border transition-colors whitespace-nowrap
                  ${field.value
                    ? "bg-amber-100 dark:bg-amber-900/30 border-amber-400 text-amber-700 dark:text-amber-300"
                    : "border-slate-200 dark:border-[#3a3a3a] text-slate-400 hover:border-slate-400"}`}>
                +1 day
              </button>
            )} />
            <Controller name="endTime" control={control} render={({ field }) => (
              <TimePicker ref={endHourRef} value={field.value} onChange={applyEndWallClock} />
            )} />
            {!watch("endTime") && (
              <button type="button"
                onClick={() => { setShowEndPrompt(v => !v); setShowStartPrompt(false) }}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-red-400 text-red-500 hover:bg-red-500 hover:text-white transition-colors whitespace-nowrap">
                End Case
              </button>
            )}
          </div>
          {!watch("endTime") && showEndPrompt && (
            <div className="mt-1 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 flex gap-2">
              <Controller name="endTime" control={control} render={({ field }) => (
                <button type="button"
                  onClick={() => {
                    const now = new Date()
                    const zone = caseZone()
                    const timing = zone ? buildIntraopEndTiming(now, zone) : null
                    const endTime = timing?.endTime ?? nowHHMM()
                    const startTime = getValues("startTime") || "00:00"
                    const [sh, sm] = startTime.split(":").map(Number)
                    const [eh, em] = endTime.split(":").map(Number)
                    const nextDay = eh * 60 + em < sh * 60 + sm
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
                  End now
                </button>
              )} />
              <button type="button"
                onClick={() => { setShowEndPrompt(false); setTimeout(() => endHourRef.current?.focus(), 50) }}
                className="flex-1 text-sm text-red-600 dark:text-red-400 font-medium px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-[#2a2a2a] hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                Write manually
              </button>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
