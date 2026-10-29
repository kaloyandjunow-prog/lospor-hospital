"use client"

import { useForm, useWatch, Controller, type Resolver } from "react-hook-form"
import { useEffect, useMemo, useRef, useState } from "react"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { useScrollToReadiness } from "@/lib/readiness-focus"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations, useLocale } from "next-intl"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { ChevronLeft, Save } from "lucide-react"
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import { useOptionLibrary, useRange } from "@/hooks/useOptionLibrary"
import { displayOption } from "@/lib/clinical-display"
import type { PreopLayout } from "@/lib/preop-layout"
import {
  aldreteBand,
  aldreteTotal as calculateAldreteTotal,
  stewardBand,
  stewardTotal as calculateStewardTotal,
  normalizeHandoverCodes,
  suggestAldreteCirculation,
  suggestAldreteSpO2,
  type HandoverGroup as CoreHandoverGroup,
} from "@lospor/core/postop"
import {
  FLACC_ITEMS,
  FLACC_TOTAL_MAX,
  NIPS_ITEMS,
  NIPS_TOTAL_MAX,
  PAED_ITEMS,
  PAED_TOTAL_MAX,
  flaccBand,
  flaccTotal,
  nipsBand,
  nipsTotal,
  paedOffered,
  paedTotal,
  painScaleLabel,
  painScalesFor,
  painSummaryEntries,
  selfReportBand,
  type FlaccField,
  type NipsField,
  type PaedField,
} from "@lospor/core/postop-pain"
import { paedRiskBand } from "@lospor/core/risk"
import { preopSectionConfigFor, type PreopSectionConfig } from "@lospor/core/preop-orders"
import type { PediatricAgeUnit } from "@lospor/core/pediatric"
import { ItemScale, ScaleTotal, SelfReportScale } from "@/components/forms/postop/PainScales"
import { PostopSectionNav, type PostopNavSection, type PostopSectionId } from "@/components/forms/postop/PostopSectionNav"
import { CaseSidebar, type CaseStages, type SidebarPatient } from "@/components/forms/CaseSidebar"
import { broselowZone } from "@lospor/core/broselow"

import { postopSchema, type PostopData } from "@/components/forms/postopSchema"
import { TagInput, type Tag } from "@/components/TagInput"
import { ProcedureOperationPicker } from "@/components/forms/ProcedureOperationPicker"
import { procedureGroupTag } from "@lospor/core/procedure-codes"
import { RecoveryVitals } from "@/components/forms/postop/RecoveryVitals"
import { RecoveryScore, type AldreteKey } from "@/components/forms/postop/RecoveryScore"

type ProcedureSearchItem = { code: string; group?: string; description: string; domain: string }
export type { PostopData }



type ScoredItem = FlaccField | NipsField | PaedField

export type HandoverGroup = Omit<CoreHandoverGroup, "id">

export const normaliseHandoverCodes = normalizeHandoverCodes

/** The patient's age as the preoperative record holds it, for the pain scales. */
export type PostopPatientAge = { ageValue?: number | null; ageUnit?: PediatricAgeUnit | null; ageYears?: number | null }

export function PostopForm({ onSubmit, onBack, submitting, onAutoSave, defaultValues, rejectedFields, clinicalMode = "ADULT", patientAge, preopSystolic, sectionConfigs, layoutMode = "scroll", focus = null, patient = null, stages, plannedProcedures = [], procedureUndetermined = false }: {
  /** The planned procedures, which the procedure done is filled in with (10.0.0). */
  plannedProcedures?: Tag[]
  /** The planned procedure was not yet known: the procedure done is then required. */
  procedureUndetermined?: boolean
  /** The patient's key facts and where the case is, for the case panel (sidebar layout). */
  patient?: SidebarPatient | null
  stages?: CaseStages
  onSubmit: (data: PostopData) => void
  onBack: () => void
  submitting?: boolean
  onAutoSave?: (data: PostopData) => void
  initialComplicationsText?: string
  defaultValues?: Partial<PostopData>
  /** Values the server refused, keyed by field, shown beside the field itself. */
  rejectedFields?: Map<string, string>
  clinicalMode?: "ADULT" | "PEDIATRIC"
  patientAge?: PostopPatientAge | null
  /** The preoperative systolic pressure, for the Aldrete circulation suggestion. */
  preopSystolic?: number | null
  /** The hospital's section switches, per population, from the preop profile. */
  sectionConfigs?: Partial<Record<"ADULT" | "PEDIATRIC", PreopSectionConfig>> | null
  layoutMode?: PreopLayout
  /** A part to bring into view on arrival, from a readiness "Go to" (1.5.0). */
  focus?: string | null
}) {
  const t      = useTranslations()
  useScrollToReadiness(focus)
  const locale = useLocale()
  const language = locale === "bg" ? "bg" : "en"
  const isPediatric = clinicalMode === "PEDIATRIC"
  const sectionConfig = useMemo(() => preopSectionConfigFor(sectionConfigs, clinicalMode), [sectionConfigs, clinicalMode])
  const sectionOn = (key: keyof PreopSectionConfig["sections"]) => sectionConfig.sections[key]
  const painScales = painScalesFor({ clinicalMode, ...patientAge })

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
  const { register, handleSubmit, control, setValue, getValues } = useForm<PostopData>({
    // Same zod-v4/react-hook-form resolver-typing friction as IntraopForm.tsx/PreopForm.tsx
    resolver: zodResolver(postopSchema) as Resolver<PostopData>,
    defaultValues: {
      ponv: null,
      handoverItems: [],
      // Recovery observations start unset. They used to be pre-filled with
      // random values in normal adult ranges, and this form autosaved on mount,
      // so simply opening it recorded a blood pressure, pulse, saturation and
      // temperature that nobody had taken.
      ...Object.fromEntries(Object.entries(defaultValues ?? {}).filter(([, v]) => v !== undefined && v !== null)),
      // The procedure done starts as the one planned (10.0.0): the usual case
      // needs no typing, and a different operation is a change.
      performedProcedures: defaultValues?.performedProcedures?.length ? defaultValues.performedProcedures : plannedProcedures,
      ...(defaultValues?.handoverItems ? { handoverItems: normaliseHandoverCodes(defaultValues.handoverItems) } : {}),
    },
  })

  const allValues = useWatch({ control })
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

  const aldreteVals = useWatch({ control, name: ["aldreteActivity", "aldreteRespiration", "aldreteCirculation", "aldreteConsciousness", "aldreteSpO2"] })
  const stewardVals = useWatch({ control, name: ["stewardConsciousness", "stewardAirway", "stewardMovement"] })
  // A child is scored on Steward instead of Aldrete (10.0.0); the card, its
  // total and its band all follow the case's clinical mode.
  const aldreteTotal = isPediatric
    ? calculateStewardTotal({ stewardConsciousness: stewardVals[0], stewardAirway: stewardVals[1], stewardMovement: stewardVals[2] })
    : calculateAldreteTotal({
      aldreteActivity: aldreteVals[0],
      aldreteRespiration: aldreteVals[1],
      aldreteCirculation: aldreteVals[2],
      aldreteConsciousness: aldreteVals[3],
      aldreteSpO2: aldreteVals[4],
    })
  const scoreMax = isPediatric ? 6 : 10
  // Null until every component is assessed; a partial score has no total, and
  // colouring it "destructive" would read as a sick patient rather than an
  // unfinished form.
  const aldreteStatus = aldreteTotal == null ? null : isPediatric ? stewardBand(aldreteTotal) : aldreteBand(aldreteTotal)
  const disposition   = useWatch({ control, name: "disposition" })
  const handoverItems = useWatch({ control, name: "handoverItems" }) ?? []
  const [recoveryBpUTO, recoveryHeartRateUTO, recoverySpo2UTO, recoveryTemperatureUTO] =
    useWatch({ control, name: ["recoveryBpUnobtainable", "recoveryHeartRateUnobtainable", "recoverySpO2Unobtainable", "recoveryTemperatureUnobtainable"] })

  // What the recovery observations suggest for two Aldrete items (10.0.0):
  // shown beside the item, set only when the clinician taps it.
  const [recoverySystolic, recoverySpO2] = useWatch({ control, name: ["recoveryBpSystolic", "recoverySpO2"] })
  const suggestions: Partial<Record<AldreteKey, { score: number; text: string }>> = {}
  if (!isPediatric && sectionOn("POSTOP_RECOVERY_VITALS")) {
    const spo2 = recoverySpo2UTO ? null : suggestAldreteSpO2(recoverySpO2 == null ? null : Number(recoverySpO2))
    if (spo2 != null) suggestions.aldreteSpO2 = { score: spo2, text: t("postop.suggest.spo2", { score: spo2, value: Number(recoverySpO2) }) }
    const circulation = recoveryBpUTO ? null : suggestAldreteCirculation(recoverySystolic == null ? null : Number(recoverySystolic), preopSystolic)
    if (circulation != null) {
      suggestions.aldreteCirculation = { score: circulation, text: t("postop.suggest.circulation", { score: circulation, recovery: Number(recoverySystolic), preop: preopSystolic ?? "" }) }
    }
  }

  // Pain and delirium, item by item.
  const itemValues = useWatch({ control, name: [...FLACC_ITEMS, ...NIPS_ITEMS, ...PAED_ITEMS].map(item => item.key) }) as (number | null | undefined)[]
  const items = Object.fromEntries([...FLACC_ITEMS, ...NIPS_ITEMS, ...PAED_ITEMS].map((item, index) => [item.key, itemValues[index]])) as Record<ScoredItem, number | null | undefined>
  const setItem = (key: ScoredItem, value: number | null) => setValue(key, value, { shouldDirty: true })
  const flacc = flaccTotal(items)
  const nips = nipsTotal(items)
  const paed = paedTotal(items)
  const [fpsr, nrs] = useWatch({ control, name: ["fpsrScore", "painScoreNRS"] })

  useEffect(() => {
    if (disposition === "WARD" || disposition === "PACU") return
    if (handoverItems.length) setValue("handoverItems", [], { shouldDirty: true })
    if (getValues("dispositionNotes")) setValue("dispositionNotes", "", { shouldDirty: true })
  }, [disposition, getValues, handoverItems.length, setValue])

  // ── Sections ──
  const showVitals = sectionOn("POSTOP_RECOVERY_VITALS")
  const showPain = sectionOn("POSTOP_PAIN")
  const showDelirium = paedOffered(clinicalMode) && sectionOn("POSTOP_DELIRIUM")
  const showPonv = sectionOn("POSTOP_PONV")
  const showHandover = sectionOn("POSTOP_HANDOVER")
  const scoreMissing = aldreteTotal == null
  const sections: PostopNavSection[] = [
    ...(showVitals ? [{ id: "vitals" as const, label: t("postop.section.vitals"), missing: false }] : []),
    { id: "score", label: t("postop.section.score"), missing: scoreMissing },
    ...(showPain || showDelirium || showPonv ? [{ id: "pain" as const, label: t("postop.section.pain"), missing: false }] : []),
    { id: "discharge", label: t("postop.section.discharge"), missing: !disposition },
  ]
  // Without the case panel the tabs mark a missing part as preop does: once
  // the clinician has tried to save, not before (10.0.0).
  const [attempted, setAttempted] = useState(false)
  const [activeTab, setActiveTab] = useState<PostopSectionId>(() => focus === "disposition" ? "discharge" : focus === "recovery" ? "score" : sections[0].id)
  const tabs = layoutMode === "tabs"
  const sidebar = layoutMode === "sidebar"
  const hidden = (id: PostopSectionId) => tabs && activeTab !== id ? "hidden" : ""
  const sidebarScores = [
    { label: t(isPediatric ? "postop.scoreShort.steward" : "postop.scoreShort.aldrete"), value: aldreteTotal == null ? "—" : `${aldreteTotal} / ${scoreMax}` },
    ...painSummaryEntries({
      flaccTotal: flacc, nipsTotal: nips, paedScore: paed,
      fpsrScore: fpsr == null ? null : Number(fpsr), painScoreNRS: nrs == null ? null : Number(nrs),
    }, language).map(entry => ({ label: entry.label, value: entry.value })),
  ]
  const legacyPain = defaultValues?.pediatricPainScale && defaultValues?.pediatricPainScore != null
    ? t("postop.pain.earlier", { scale: painScaleLabel(defaultValues.pediatricPainScale), score: defaultValues.pediatricPainScore })
    : null

  return (
    <form onSubmit={event => { setAttempted(true); void handleSubmit(onSubmit)(event) }} className={sidebar ? "space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-6" : "space-y-6"}>
      {sidebar ? (
        <CaseSidebar
          stages={stages ?? { current: 2 }}
          sections={sections}
          anchorPrefix="postop-sec-"
          patient={patient}
          broselow={isPediatric ? broselowZone({ clinicalMode, heightCm: patient?.heightCm ?? null, weightKg: patient?.weightKg ?? null }) : null}
          factsTitle={t("preop.sidebar.scores")}
          facts={sidebarScores}
          action={(
            <Button type="submit" disabled={submitting} className="w-full gap-2 bg-green-600 hover:bg-green-700">
              <Save className="h-4 w-4" /> {submitting ? t("common.saving") : t("postop.saveCase")}
            </Button>
          )}
          testId="postop-sidebar"
          stripTestId="postop-section-strip"
        />
      ) : (
        <PostopSectionNav layout={layoutMode} sections={attempted ? sections : sections.map(section => ({ ...section, missing: false }))} activeTab={activeTab} onTab={setActiveTab} label={t("case.steps.postop")} />
      )}

      {showVitals && <div className={hidden("vitals")}><RecoveryVitals control={control} setValue={setValue} isPediatric={isPediatric} rejectedFields={rejectedFields} unobtainable={{ bp: recoveryBpUTO, heartRate: recoveryHeartRateUTO, spo2: recoverySpo2UTO, temperature: recoveryTemperatureUTO }} ranges={{ bpSystolic: recoveryBpSystolicRange, bpDiastolic: recoveryBpDiastolicRange, heartRate: recoveryHeartRateRange, spo2: recoverySpo2Range, temperature: recoveryTemperatureRange }} /></div>}
      <div className={hidden("score")}><RecoveryScore control={control} isPediatric={isPediatric} suggestions={suggestions} total={aldreteTotal} max={scoreMax} status={aldreteStatus} /></div>

      {/* Pain, emergence delirium and PONV */}
      {(showPain || showDelirium || showPonv) && (
      <div id="postop-sec-pain" className={`scroll-mt-28 space-y-6 ${hidden("pain")}`}>
        {showPain && (
          <SectionCard title={t("postop.pain.title")}>
            <p className="text-xs text-blue-700 dark:text-blue-300" data-testid="pain-scales-offered">
              {t("postop.pain.offered", { scales: painScales.map(painScaleLabel).join(", ") })}
            </p>
            {legacyPain ? <p className="text-xs text-slate-500">{legacyPain}</p> : null}
            {painScales.includes("NIPS") && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">NIPS</p>
                <ItemScale items={NIPS_ITEMS} values={items} onChange={setItem} language={language} testId="nips-scale" />
                <ScaleTotal label="NIPS" total={nips} max={NIPS_TOTAL_MAX} band={nips == null ? null : nipsBand(nips)} language={language} />
              </div>
            )}
            {painScales.includes("FLACC") && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FLACC</p>
                <ItemScale items={FLACC_ITEMS} values={items} onChange={setItem} language={language} testId="flacc-scale" />
                <ScaleTotal label="FLACC" total={flacc} max={FLACC_TOTAL_MAX} band={flacc == null ? null : flaccBand(flacc)} language={language} />
              </div>
            )}
            {painScales.includes("FPS_R") && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FPS-R</p>
                <p className="text-xs text-slate-400">{t("postop.pain.faceHint")}</p>
                <Controller name="fpsrScore" control={control} render={({ field }) => (
                  <SelfReportScale kind="FPS_R" value={field.value == null ? null : Number(field.value)} onChange={field.onChange} />
                )} />
                <ScaleTotal label="FPS-R" total={fpsr == null ? null : Number(fpsr)} max={10} band={fpsr == null ? null : selfReportBand(Number(fpsr))} language={language} />
              </div>
            )}
            {painScales.includes("NRS") && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("postop.painNRS")}</p>
                <Controller name="painScoreNRS" control={control} render={({ field }) => (
                  <SelfReportScale kind="NRS" value={field.value == null ? null : Number(field.value)} onChange={field.onChange} />
                )} />
              </div>
            )}
          </SectionCard>
        )}

        {showDelirium && (
          <SectionCard title={t("postop.delirium.title")}>
            <p className="text-xs text-slate-400">{t("postop.delirium.hint")}</p>
            <ItemScale items={PAED_ITEMS} values={items} onChange={setItem} language={language} testId="paed-scale" />
            <ScaleTotal
              label="PAED"
              total={paed ?? (PAED_ITEMS.some(item => items[item.key] != null) ? null : defaultValues?.paedScore ?? null)}
              max={PAED_TOTAL_MAX}
              band={paed == null ? null : t(`postop.delirium.${paedRiskBand(paed).key}`)}
              language={language}
            />
          </SectionCard>
        )}

        {showPonv && (
          <SectionCard title={t("postop.ponvTitle")}>
            <Controller name="ponv" control={control} render={({ field }) => (
              <ClinicalYesNo id="ponv" label={t("postop.ponv")} value={field.value ?? null} onChange={field.onChange} />
            )} />
          </SectionCard>
        )}
      </div>
      )}

      {/* Disposition */}
      <div id="postop-sec-discharge" data-tour="postop-disposition" className={`scroll-mt-28 ${hidden("discharge")}`}>
      <SectionCard title={t("postop.dispositionSection")} readiness="disposition" required>
        {/* The procedure done (10.0.0): always on; what the export takes as performed. */}
        <div className="space-y-1" data-testid="performed-procedure">
          <Label>{t("postop.performedProcedure")}{procedureUndetermined && <span className="text-red-500"> *</span>}</Label>
          <p className="text-xs text-slate-500 dark:text-slate-400">{procedureUndetermined ? t("postop.performedProcedureUndetermined") : t("postop.performedProcedureHint")}</p>
          <Controller name="performedProcedures" control={control} render={({ field }) => (
            <div>
              <TagInput
                value={(field.value ?? []) as Tag[]}
                onChange={field.onChange}
                searchUrl="/api/search/procedures"
                renderSuggestion={(item: ProcedureSearchItem) =>
                  procedureGroupTag({ group: item.group || item.description, domain: item.domain })}
                placeholder={t("preop.procedurePlaceholder")}
              />
              <ProcedureOperationPicker value={(field.value ?? []) as Tag[]} onChange={field.onChange} />
            </div>
          )} />
        </div>
        <div className="space-y-1">
          <Label>{t("postop.dispatchTo")} <span className="text-red-500">*</span></Label>
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
        {showHandover && (disposition === "WARD" || disposition === "PACU") && (
          <div data-tour="postop-handover" className="space-y-4 pt-2 border-t border-slate-100 dark:border-[#2a2a2a]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{locale === "bg" ? "Указания при предаване" : "Handover instructions"}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {HANDOVER_GROUPS.map(({ group, items: groupItems }) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">{group}</p>
                  <div className="space-y-1.5">
                    {groupItems.map(({ code, label }) => {
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

        {showHandover && (disposition === "WARD" || disposition === "PACU") && (
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
