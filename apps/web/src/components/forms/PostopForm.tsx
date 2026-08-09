"use client"

import { useForm, Controller, type Resolver } from "react-hook-form"
import { useEffect, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations, useLocale } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Save } from "lucide-react"
import { NumberStepper } from "@/components/NumberStepper"
import { ConvertedStepper } from "@/components/ConvertedStepper"
import { useOptionLibrary, useRange } from "@/hooks/useOptionLibrary"
import { displayOption } from "@/lib/clinical-display"
import {
  aldreteBand,
  aldreteTotal as calculateAldreteTotal,
  normalizeHandoverCodes,
  type HandoverGroup as CoreHandoverGroup,
} from "@lospor/core/postop"
import { recommendPediatricPainScale } from "@lospor/core/pediatric"

const schema = z.object({
  aldreteActivity:      z.coerce.number().min(0).max(2).optional(),
  aldreteRespiration:   z.coerce.number().min(0).max(2).optional(),
  aldreteCirculation:   z.coerce.number().min(0).max(2).optional(),
  aldreteConsciousness: z.coerce.number().min(0).max(2).optional(),
  aldreteSpO2:          z.coerce.number().min(0).max(2).optional(),
  recoveryBpSystolic:  z.coerce.number().optional(),
  recoveryBpDiastolic: z.coerce.number().optional(),
  recoveryHeartRate:   z.coerce.number().optional(),
  recoverySpO2:        z.coerce.number().optional(),
  painScoreNRS:       z.coerce.number().min(0).max(10).optional(),
  pediatricPainScale: z.enum(["FLACC", "FPS_R", "NRS"]).optional(),
  pediatricPainScore: z.coerce.number().min(0).max(10).optional(),
  paedScore:          z.coerce.number().min(0).max(20).optional(),
  ponv:               z.boolean().default(false),
  temperatureCelsius: z.coerce.number().optional(),
  recoveryBpUnobtainable:          z.boolean().default(false),
  recoveryHeartRateUnobtainable:   z.boolean().default(false),
  recoverySpO2Unobtainable:        z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition:      z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes: z.string().optional(),
  handoverItems:    z.array(z.string()).default([]),
})

export type PostopData = z.infer<typeof schema>


function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base text-slate-700 dark:text-slate-200">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

type AldreteKey = "aldreteActivity" | "aldreteRespiration" | "aldreteCirculation" | "aldreteConsciousness" | "aldreteSpO2"

const SCORE_COLORS = [
  "bg-red-500 border-red-500 text-white dark:bg-red-700 dark:border-red-600",
  "bg-amber-500 border-amber-500 text-white dark:bg-amber-700 dark:border-amber-600",
  "bg-green-500 border-green-500 text-white dark:bg-green-700 dark:border-green-600",
]
const UNSELECTED = "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"

export type HandoverGroup = Omit<CoreHandoverGroup, "id">

export const normaliseHandoverCodes = normalizeHandoverCodes

export function PostopForm({ onSubmit, onBack, submitting, onAutoSave, defaultValues, rejectedFields, clinicalMode = "ADULT", pediatricAgeYears }: {
  onSubmit: (data: PostopData) => void
  onBack: () => void
  submitting?: boolean
  onAutoSave?: (data: PostopData) => void
  initialComplicationsText?: string
  defaultValues?: Partial<PostopData>
  /** Values the server refused, keyed by field, shown beside the field itself. */
  rejectedFields?: Map<string, string>
  clinicalMode?: "ADULT" | "PEDIATRIC"
  pediatricAgeYears?: number | null
}) {
  const t      = useTranslations()
  const locale = useLocale()
  const isPediatric = clinicalMode === "PEDIATRIC"
  const [canSelfReport, setCanSelfReport] = useState((pediatricAgeYears ?? 0) >= 4)
  const [canUseNumbers, setCanUseNumbers] = useState((pediatricAgeYears ?? 0) >= 8)

  const { options: dispositionOptions } = useOptionLibrary("DISPOSITION")
  const { options: handoverOptions }    = useOptionLibrary("HANDOVER_ITEM")
  const HANDOVER_GROUPS: HandoverGroup[] = handoverOptions
    .filter(o => !o.parentId)
    .map(group => ({
      group: displayOption("HANDOVER_ITEM", group, locale),
      items: handoverOptions.filter(o => o.parentId === group.id).map(item => ({
        code: item.value,
        label: displayOption("HANDOVER_ITEM", item, locale),
      })),
    }))
  const recoveryBpSystolicRange  = useRange("BP_SYSTOLIC_RANGE")
  const recoveryBpDiastolicRange = useRange("BP_DIASTOLIC_RANGE")
  const recoveryHeartRateRange   = useRange("HEART_RATE_RANGE")
  const recoverySpo2Range        = useRange("SPO2_RANGE")
  const recoveryTemperatureRange = useRange("TEMPERATURE_RANGE")
  const painNrsRange             = useRange("PAIN_NRS_RANGE")
  const { register, handleSubmit, control, watch, setValue, getValues } = useForm<PostopData>({
    // Same zod-v4/react-hook-form resolver-typing friction as IntraopForm.tsx/PreopForm.tsx
    resolver: zodResolver(schema) as Resolver<PostopData>,
    defaultValues: {
      ponv: false,
      handoverItems: [],
      // Recovery observations start unset. They used to be pre-filled with
      // random values in normal adult ranges, and this form autosaved on mount,
      // so simply opening it recorded a blood pressure, pulse, saturation and
      // temperature that nobody had taken.
      ...Object.fromEntries(Object.entries(defaultValues ?? {}).filter(([, v]) => v !== undefined && v !== null)),
      ...(defaultValues?.handoverItems ? { handoverItems: normaliseHandoverCodes(defaultValues.handoverItems) } : {}),
    },
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const allValues = watch()
  const allValuesKey = JSON.stringify(allValues)
  // Skip the first run: this effect fires on mount, so without the guard simply
  // opening the form scheduled a save of whatever the defaults happened to be.
  // Autosave should record what the clinician entered, never the act of looking.
  const postopMountedRef = useRef(false)
  useEffect(() => {
    if (!onAutoSave) return
    if (!postopMountedRef.current) { postopMountedRef.current = true; return }
    const timer = setTimeout(() => onAutoSave(getValues()), 1500)
    return () => clearTimeout(timer)
  }, [allValuesKey, getValues, onAutoSave])

  const aldreteVals = watch(["aldreteActivity","aldreteRespiration","aldreteCirculation","aldreteConsciousness","aldreteSpO2"])
  const aldreteTotal = calculateAldreteTotal({
    aldreteActivity: aldreteVals[0],
    aldreteRespiration: aldreteVals[1],
    aldreteCirculation: aldreteVals[2],
    aldreteConsciousness: aldreteVals[3],
    aldreteSpO2: aldreteVals[4],
  })
  // Null until every component is assessed; a partial score has no total, and
  // colouring it "destructive" would read as a sick patient rather than an
  // unfinished form.
  const aldreteStatus = aldreteTotal == null ? null : aldreteBand(aldreteTotal)
  const aldreteColor = aldreteStatus === null
    ? "outline"
    : aldreteStatus === "ready"
    ? "default"
    : aldreteStatus === "observe" ? "secondary" : "destructive"
  const disposition   = watch("disposition")
  const handoverItems = watch("handoverItems") ?? []
  const [recoveryBpUTO, recoveryHeartRateUTO, recoverySpo2UTO, recoveryTemperatureUTO] =
    watch(["recoveryBpUnobtainable", "recoveryHeartRateUnobtainable", "recoverySpO2Unobtainable", "recoveryTemperatureUnobtainable"])
  const painRecommendation = recommendPediatricPainScale({
    ageYears: pediatricAgeYears ?? 0,
    canSelfReport,
    canUseNumbers,
  })

  useEffect(() => {
    if (disposition === "WARD" || disposition === "PACU") return
    if (handoverItems.length) setValue("handoverItems", [], { shouldDirty: true })
    if (getValues("dispositionNotes")) setValue("dispositionNotes", "", { shouldDirty: true })
  }, [disposition, getValues, handoverItems.length, setValue])

  const ALDRETE_CRITERIA: { key: AldreteKey; labelKey: string; scoreKeys: string[] }[] = [
    { key: "aldreteActivity",      labelKey: "postop.activity",      scoreKeys: ["postop.aldrete.activity0",      "postop.aldrete.activity1",      "postop.aldrete.activity2"] },
    { key: "aldreteRespiration",   labelKey: "postop.respiration",   scoreKeys: ["postop.aldrete.respiration0",   "postop.aldrete.respiration1",   "postop.aldrete.respiration2"] },
    { key: "aldreteCirculation",   labelKey: "postop.circulation",   scoreKeys: ["postop.aldrete.circulation0",   "postop.aldrete.circulation1",   "postop.aldrete.circulation2"] },
    { key: "aldreteConsciousness", labelKey: "postop.consciousness", scoreKeys: ["postop.aldrete.consciousness0", "postop.aldrete.consciousness1", "postop.aldrete.consciousness2"] },
    { key: "aldreteSpO2",          labelKey: "postop.spO2",          scoreKeys: ["postop.aldrete.spO20",          "postop.aldrete.spO21",          "postop.aldrete.spO22"] },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* Modified Aldrete Score */}
      <div data-tour="postop-aldrete">
      <SectionCard title={t("postop.aldreteSection")}>
        <div className="space-y-5">
          {ALDRETE_CRITERIA.map(({ key, labelKey, scoreKeys }) => (
            <Controller key={key} name={key} control={control} render={({ field }) => (
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t(labelKey)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {scoreKeys.map((sk, i) => {
                    const selected = Number(field.value) === i
                    return (
                      <button key={i} type="button"
                        onClick={() => field.onChange(selected ? undefined : i)}
                        className={`rounded-xl border-2 p-2.5 text-center transition-all ${selected ? SCORE_COLORS[i] + " scale-105 shadow-sm" : UNSELECTED}`}>
                        <div className="text-xl font-bold leading-none">{i}</div>
                        <div className="text-[10px] mt-1 leading-tight opacity-90">{String(t(sk)).replace(/^\d+\s*[—–-]\s*/, '')}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )} />
          ))}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-[#2a2a2a]">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{t("postop.aldreteTotal")}:</span>
            {/* An unscored patient has no total, and no verdict either. This
                rendered a bare " / 10" with "keep monitoring" beside it, which
                reads as an assessment that was never made. */}
            <Badge variant={aldreteColor} className="text-base px-3 py-1" data-testid="aldrete-total">
              {aldreteTotal ?? "—"} / 10
            </Badge>
            {aldreteStatus === "ready" && <span className="text-sm text-green-600 dark:text-green-400">{t("postop.aldreteReady")}</span>}
            {aldreteStatus !== null && aldreteStatus !== "ready" && <span className="text-sm text-amber-600 dark:text-amber-400">{t("postop.aldreteMonitor")}</span>}
          </div>
        </div>
      </SectionCard>
      </div>{/* /postop-aldrete */}

      {/* Recovery */}
      <div data-tour="postop-recovery">
      <SectionCard title={t("postop.recoverySection")}>
        {/* Recovery vitals — SBP / DBP / HR / SpO₂ / Temperature (mirrors preop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* BP */}
          <div className="space-y-2 sm:col-span-2">
            {/* Recovery observations are all numeric, so one summary above them
                reaches every field the server can refuse without threading a
                note through each control. */}
            {rejectedFields && rejectedFields.size > 0 && (
              <p className="text-red-500 text-xs mb-2" role="status">
                {[...rejectedFields.values()].join(" · ")}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.bloodPressure")}</Label>
              <button type="button"
                onClick={() => { const next = !recoveryBpUTO; setValue("recoveryBpUnobtainable", next); if (next) { setValue("recoveryBpSystolic", undefined); setValue("recoveryBpDiastolic", undefined) } }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoveryBpUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoveryBpUTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 text-center mb-1">{t("preop.systolic")}</p>
                  <Controller name="recoveryBpSystolic" control={control} render={({ field }) => (
                    <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 20 : recoveryBpSystolicRange.min} max={recoveryBpSystolicRange.max} step={recoveryBpSystolicRange.step} showSlider />
                  )} />
                </div>
                <span className="text-2xl font-light text-slate-300 mt-4">/</span>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 text-center mb-1">{t("preop.diastolic")}</p>
                  <Controller name="recoveryBpDiastolic" control={control} render={({ field }) => (
                    <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 10 : recoveryBpDiastolicRange.min} max={recoveryBpDiastolicRange.max} step={recoveryBpDiastolicRange.step} showSlider />
                  )} />
                </div>
              </div>
            )}
          </div>

          {/* Heart rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.heartRate")}</Label>
              <button type="button"
                onClick={() => { const next = !recoveryHeartRateUTO; setValue("recoveryHeartRateUnobtainable", next); if (next) setValue("recoveryHeartRate", undefined) }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoveryHeartRateUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoveryHeartRateUTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <Controller name="recoveryHeartRate" control={control} render={({ field }) => (
                <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 10 : recoveryHeartRateRange.min} max={recoveryHeartRateRange.max} step={recoveryHeartRateRange.step} unit="bpm" showSlider />
              )} />
            )}
          </div>

          {/* SpO₂ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.spO2")}</Label>
              <button type="button"
                onClick={() => { const next = !recoverySpo2UTO; setValue("recoverySpO2Unobtainable", next); if (next) setValue("recoverySpO2", undefined) }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoverySpo2UTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoverySpo2UTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <Controller name="recoverySpO2" control={control} render={({ field }) => (
                <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 20 : recoverySpo2Range.min} max={recoverySpo2Range.max} step={recoverySpo2Range.step} unit="%" showSlider />
              )} />
            )}
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("postop.temperatureC")}</Label>
              <button type="button"
                onClick={() => { const next = !recoveryTemperatureUTO; setValue("recoveryTemperatureUnobtainable", next); if (next) setValue("temperatureCelsius", undefined) }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${recoveryTemperatureUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {recoveryTemperatureUTO ? (
              <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
            ) : (
              <Controller name="temperatureCelsius" control={control} render={({ field }) => (
                <ConvertedStepper measurement="temperature" canonicalValue={field.value} onCanonicalChange={field.onChange} canonicalMin={isPediatric ? 25 : recoveryTemperatureRange.min} canonicalMax={recoveryTemperatureRange.max} canonicalStep={recoveryTemperatureRange.step} showSlider />
              )} />
            )}
          </div>

          {isPediatric ? (
            <div className="space-y-4 sm:col-span-2 border-t border-slate-100 pt-4 dark:border-[#2a2a2a]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pediatric.postopPain")}</p>
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                  {t("pediatric.recommendedPainScale", { scale: painRecommendation.scale.replace("_", "-") })}
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={canSelfReport}
                    onCheckedChange={value => {
                      const next = value === true
                      setCanSelfReport(next)
                      if (!next) setCanUseNumbers(false)
                    }}
                  />
                  {t("pediatric.canSelfReport")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={canUseNumbers}
                    disabled={!canSelfReport}
                    onCheckedChange={value => setCanUseNumbers(value === true)}
                  />
                  {t("pediatric.canUseNumbers")}
                </label>
              </div>
              <Controller name="pediatricPainScale" control={control} render={({ field }) => (
                <div className="grid grid-cols-3 gap-2">
                  {(["FLACC", "FPS_R", "NRS"] as const).map(scale => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => field.onChange(scale)}
                      className={`min-h-10 border-2 px-2 py-2 text-sm font-semibold ${
                        field.value === scale
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-200 text-slate-600 dark:border-[#3a3a3a] dark:text-slate-300"
                      }`}
                    >
                      {scale.replace("_", "-")}
                    </button>
                  ))}
                </div>
              )} />
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pediatric.painScore")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    {...register("pediatricPainScore")}
                    className="flex-1 h-2 rounded-lg appearance-none bg-slate-200 dark:bg-[#333] accent-blue-600 cursor-pointer"
                  />
                  <span className="text-sm font-bold w-6 text-center text-slate-700 dark:text-slate-200">{watch("pediatricPainScore") ?? 0}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pediatric.paedScore")}</Label>
                <Controller name="paedScore" control={control} render={({ field }) => (
                  <NumberStepper value={field.value} onChange={field.onChange} min={0} max={20} step={1} showSlider />
                )} />
                <p className="text-xs text-slate-400">{t("pediatric.paedOptional")}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("postop.painNRS")}</Label>
              <div className="flex items-center gap-2">
                <input type="range" min={painNrsRange.min} max={painNrsRange.max} step={painNrsRange.step}
                  {...register("painScoreNRS")}
                  className="flex-1 h-2 rounded-lg appearance-none bg-slate-200 dark:bg-[#333] accent-blue-600 cursor-pointer" />
                <span className="text-sm font-bold w-6 text-center text-slate-700 dark:text-slate-200">{watch("painScoreNRS") ?? 0}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Controller name="ponv" control={control} render={({ field }) => (
            <Checkbox id="ponv" checked={!!field.value} onCheckedChange={v => field.onChange(v === true)} />
          )} />
          <Label htmlFor="ponv" className="font-normal cursor-pointer">{t("postop.ponv")}</Label>
        </div>
      </SectionCard>
      </div>{/* /postop-recovery */}

      {/* Disposition */}
      <div data-tour="postop-disposition">
      <SectionCard title={t("postop.dispositionSection")}>
        <div className="space-y-1">
          <Label>{t("postop.dispatchTo")}</Label>
          <Controller name="disposition" control={control} render={({ field }) => (
            <div className="flex gap-3">
              {dispositionOptions.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => {
                    const next = field.value === opt.value ? undefined : opt.value
                    field.onChange(next)
                    if (next !== "WARD" && next !== "PACU") {
                      setValue("handoverItems", [], { shouldDirty: true })
                      setValue("dispositionNotes", "", { shouldDirty: true })
                    }
                  }}
                  className={`flex-1 rounded-lg border-2 py-3 font-semibold text-sm transition-all ${
                    field.value === opt.value
                      ? opt.color + " scale-105 shadow-sm"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  {displayOption("DISPOSITION", opt, locale)}
                </button>
              ))}
            </div>
          )} />
        </div>

        {/* Handover checklist — WARD or PACU only */}
        {(disposition === "WARD" || disposition === "PACU") && (
          <div data-tour="postop-handover" className="space-y-4 pt-2 border-t border-slate-100 dark:border-[#2a2a2a]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{locale === "bg" ? "Указания при предаване" : "Handover instructions"}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {HANDOVER_GROUPS.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">{group}</p>
                  <div className="space-y-1.5">
                    {items.map(({ code, label }) => {
                      const checked = handoverItems.includes(code)
                      return (
                        <label key={code} className="flex items-start gap-2 cursor-pointer group">
                          <Checkbox
                            id={code}
                            checked={checked}
                            onCheckedChange={v => {
                              setValue("handoverItems", v
                                ? [...handoverItems, code]
                                : handoverItems.filter(c => c !== code)
                              )
                            }}
                            className="mt-0.5 shrink-0"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-300 leading-snug group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
                            {label}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(disposition === "WARD" || disposition === "PACU") && (
        <div className="space-y-1">
          <Label>{t("postop.handoverNotes")}</Label>
          <Textarea
              placeholder={t("postop.handoverNotesPlaceholder")}
            rows={3}
            {...register("dispositionNotes")}
          />
        </div>
        )}
      </SectionCard>
      </div>{/* /postop-disposition */}

      <div className="flex justify-between">
        <Button type="button" variant="outline" size="lg" className="gap-2" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button type="submit" size="lg" className="gap-2 bg-green-600 hover:bg-green-700" disabled={submitting} data-tour="postop-submit">
          <Save className="h-4 w-4" />
          {submitting ? t("common.saving") : t("postop.saveCase")}
        </Button>
      </div>
    </form>
  )
}
