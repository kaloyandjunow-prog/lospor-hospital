"use client"

import { Controller, type Control, type UseFormSetValue } from "react-hook-form"
import { useTranslations } from "next-intl"
import { Label } from "@/components/ui/label"
import { NumberStepper } from "@/components/NumberStepper"
import { ConvertedStepper } from "@/components/ConvertedStepper"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import type { RangeSpec } from "@/hooks/useOptionLibrary"
import type { PostopData } from "@/components/forms/postopSchema"

type NumericRange = Pick<RangeSpec, "min" | "max" | "step">

export function RecoveryVitals({
  control,
  setValue,
  isPediatric,
  rejectedFields,
  unobtainable,
  ranges,
}: {
  control: Control<PostopData>
  setValue: UseFormSetValue<PostopData>
  isPediatric: boolean
  rejectedFields?: Map<string, string>
  unobtainable: { bp: boolean; heartRate: boolean; spo2: boolean; temperature: boolean }
  ranges: {
    bpSystolic: NumericRange
    bpDiastolic: NumericRange
    heartRate: NumericRange
    spo2: NumericRange
    temperature: NumericRange
  }
}) {
  const t = useTranslations()
  const { bp: bpUTO, heartRate: heartRateUTO, spo2: spo2UTO, temperature: temperatureUTO } = unobtainable

  return (
    <div id="postop-sec-vitals" data-tour="postop-recovery" className="scroll-mt-28">
      <SectionCard title={t("postop.section.vitals")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2 sm:col-span-2">
            {rejectedFields && rejectedFields.size > 0 && (
              <p className="text-red-500 text-xs mb-2" role="status">
                {[...rejectedFields.values()].join(" · ")}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.bloodPressure")}</Label>
              <button type="button" onClick={() => { const next = !bpUTO; setValue("recoveryBpUnobtainable", next); if (next) { setValue("recoveryBpSystolic", undefined); setValue("recoveryBpDiastolic", undefined) } }} className={`text-xs px-2.5 py-1 rounded-full border transition-all ${bpUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {bpUTO ? <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p> : (
              <div className="flex items-center gap-3">
                <div className="flex-1"><p className="text-xs text-slate-400 text-center mb-1">{t("preop.systolic")}</p><Controller name="recoveryBpSystolic" control={control} render={({ field }) => <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 20 : ranges.bpSystolic.min} max={ranges.bpSystolic.max} step={ranges.bpSystolic.step} showSlider />} /></div>
                <span className="text-2xl font-light text-slate-300 mt-4">/</span>
                <div className="flex-1"><p className="text-xs text-slate-400 text-center mb-1">{t("preop.diastolic")}</p><Controller name="recoveryBpDiastolic" control={control} render={({ field }) => <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 10 : ranges.bpDiastolic.min} max={ranges.bpDiastolic.max} step={ranges.bpDiastolic.step} showSlider />} /></div>
              </div>
            )}
          </div>

          {[
            { name: "recoveryHeartRate" as const, toggle: "recoveryHeartRateUnobtainable" as const, label: "preop.heartRate", unit: "bpm", value: heartRateUTO, range: ranges.heartRate, min: isPediatric ? 10 : ranges.heartRate.min },
            { name: "recoverySpO2" as const, toggle: "recoverySpO2Unobtainable" as const, label: "preop.spO2", unit: "%", value: spo2UTO, range: ranges.spo2, min: isPediatric ? 20 : ranges.spo2.min },
          ].map(field => (
            <div key={field.name} className="space-y-2">
              <div className="flex items-center justify-between"><Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(field.label)}</Label><button type="button" onClick={() => { const next = !field.value; setValue(field.toggle, next); if (next) setValue(field.name, undefined) }} className={`text-xs px-2.5 py-1 rounded-full border transition-all ${field.value ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>{t("preop.unableToObtain")}</button></div>
              {field.value ? <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p> : <Controller name={field.name} control={control} render={({ field: input }) => <NumberStepper value={input.value} onChange={input.onChange} min={field.min} max={field.range.max} step={field.range.step} unit={field.unit} showSlider />} />}
            </div>
          ))}

          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("postop.temperatureC")}</Label><button type="button" onClick={() => { const next = !temperatureUTO; setValue("recoveryTemperatureUnobtainable", next); if (next) setValue("temperatureCelsius", undefined) }} className={`text-xs px-2.5 py-1 rounded-full border transition-all ${temperatureUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>{t("preop.unableToObtain")}</button></div>
            {temperatureUTO ? <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p> : <Controller name="temperatureCelsius" control={control} render={({ field }) => <ConvertedStepper measurement="temperature" canonicalValue={field.value} onCanonicalChange={field.onChange} canonicalMin={isPediatric ? 25 : ranges.temperature.min} canonicalMax={ranges.temperature.max} canonicalStep={ranges.temperature.step} showSlider />} />}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
