"use client"

import { Controller, type Control, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from "react-hook-form"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import { TagInput, type Tag } from "@/components/TagInput"
import { RejectionNote } from "@/components/forms/PreopFormPresentational"
import type { PreopData } from "@/components/forms/preopSchema"

type DrugSearchItem = { name: string; inn?: string; strength?: string; atcCode?: string }

/**
 * The anamnesis card of the preoperative form: allergies, family and personal
 * anaesthetic history, dentition, habits and the adult score factors, then
 * the profile questions placed in this section (`children`).
 *
 * Each baseline control is drawn only while the hospital profile asks its
 * question (`shownField`).
 */
export function PreopAnamnesisFields({
  control, register, setValue, watch, allergies, familyAnesthesiaProblems, isPediatric,
  rcriSuggested, stopBangBPSuggested, shownField, rejectionOf, children,
}: {
  control: Control<PreopData>
  register: UseFormRegister<PreopData>
  setValue: UseFormSetValue<PreopData>
  watch: UseFormWatch<PreopData>
  allergies: boolean | null | undefined
  familyAnesthesiaProblems: boolean | null | undefined
  isPediatric: boolean
  rcriSuggested: Partial<Record<string, boolean>>
  stopBangBPSuggested: boolean
  shownField: (field: string) => boolean
  rejectionOf: (key: string) => string | undefined
  children?: ReactNode
}) {
  const t = useTranslations()
  return (
    <div className="space-y-3">
      {/* Allergies */}
      {shownField("allergies") && (<>
      <div className="flex items-center gap-2">
        <Controller name="allergies" control={control} render={({ field }) => (
          <ClinicalYesNo id="allergies" value={field.value ?? null} tone="danger" onChange={(answer) => {
            field.onChange(answer)
            // Cleared on "no" and on "not asked" alike: either way the
            // recorded allergens no longer have a question behind them.
            if (answer !== true) setValue("allergyDetails", [], { shouldDirty: true })
          }} />
        )} />
        <Label htmlFor="allergies" className="font-normal cursor-pointer">{t("preop.allergies")}</Label>
      </div>
      {allergies && (
        <>
          <Controller name="allergyDetails" control={control} render={({ field }) => (
            <TagInput
              value={(field.value ?? []) as Tag[]}
              onChange={field.onChange}
              searchUrl="/api/search/drugs"
              renderSuggestion={(item: DrugSearchItem) => ({
                label: item.inn ? `${item.inn}${item.strength ? ` ${item.strength}` : ""}` : item.name,
                sub: item.name !== item.inn ? item.name : undefined,
                inn: item.inn ?? undefined,
                atcCode: item.atcCode ?? undefined,
              })}
              placeholder={t("preop.allergenSearchPlaceholder")}
            />
          )} />
          <RejectionNote msg={rejectionOf("allergyDetails")} />
        </>
      )}
      </>)}
      {shownField("latexAllergy") && (
      <div className="flex items-center gap-2">
        <Controller name="latexAllergy" control={control} render={({ field }) => (
          <ClinicalYesNo id="latexAllergy" value={field.value ?? null} onChange={field.onChange} tone="danger" />
        )} />
        <Label htmlFor="latexAllergy" className="font-normal cursor-pointer">{t("preop.latexAllergy")}</Label>
      </div>
      )}
      <Separator />
      {/* Family history */}
      {shownField("familyAnesthesiaProblems") && (<>
      <div className="flex items-center gap-2">
        <Controller name="familyAnesthesiaProblems" control={control} render={({ field }) => (
          <ClinicalYesNo id="familyAnesthesiaProblems" value={field.value ?? null} tone="danger" onChange={(answer) => {
            field.onChange(answer)
            if (answer !== true) setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
          }} />
        )} />
        <Label htmlFor="familyAnesthesiaProblems" className="font-normal cursor-pointer">{t("preop.familyAnesthesia")}</Label>
      </div>
      {familyAnesthesiaProblems && (
        <>
          <Textarea maxLength={500} placeholder={t("common.details")} {...register("familyAnesthesiaDetails")} />
          <RejectionNote msg={rejectionOf("familyAnesthesiaDetails")} />
        </>
      )}
      </>)}
      <Separator />
      {/* Personal anaesthetic history — the patient, not the family */}
      {shownField("unexplainedAnaesthesiaComplications") && (
      <div className="flex items-center gap-2">
        <Controller name="unexplainedAnaesthesiaComplications" control={control} render={({ field }) => (
          <ClinicalYesNo id="unexplainedAnaesthesiaComplications" value={field.value ?? null} tone="danger" onChange={field.onChange} />
        )} />
        <Label htmlFor="unexplainedAnaesthesiaComplications" className="font-normal cursor-pointer">{t("preop.unexplainedAnaesthesiaComplications")}</Label>
      </div>
      )}
      {shownField("malignantHyperthermiaHistory") && (
      <div className="flex items-center gap-2">
        <Controller name="malignantHyperthermiaHistory" control={control} render={({ field }) => (
          <ClinicalYesNo id="malignantHyperthermiaHistory" value={field.value ?? null} tone="danger" onChange={field.onChange} />
        )} />
        <Label htmlFor="malignantHyperthermiaHistory" className="font-normal cursor-pointer">{t("preop.malignantHyperthermiaHistory")}</Label>
      </div>
      )}
      <Separator />
      {/* Dental */}
      {shownField("dentalProsthetics") && (
      <div className="flex items-center gap-2">
        <Controller name="dentalProsthetics" control={control} render={({ field }) => (
          <ClinicalYesNo id="dentalProsthetics" value={field.value ?? null} onChange={field.onChange} />
        )} />
        <Label htmlFor="dentalProsthetics" className="font-normal cursor-pointer">{t("preop.dentalProsthetics")}</Label>
      </div>
      )}
      {shownField("looseTeeth") && (
      <div className="flex items-center gap-2">
        <Controller name="looseTeeth" control={control} render={({ field }) => (
          <ClinicalYesNo id="looseTeeth" value={field.value ?? null} onChange={field.onChange} />
        )} />
        <Label htmlFor="looseTeeth" className="font-normal cursor-pointer">{t("preop.looseTeeth")}</Label>
      </div>
      )}
      <Separator />
      {/* Habits */}
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.harmfulHabits")}</p>
      {shownField("smoking") && (
      <div className="flex items-center gap-2">
        <Controller name="smoking" control={control} render={({ field }) => (
          <ClinicalYesNo id="smoking" value={field.value ?? null} onChange={field.onChange} />
        )} />
        <Label htmlFor="smoking" className="font-normal cursor-pointer">{t("preop.smoking")}</Label>
      </div>
      )}
      {shownField("substanceAbuse") && (
      <div className="flex items-center gap-2">
        <Controller name="substanceAbuse" control={control} render={({ field }) => (
          <ClinicalYesNo id="substanceAbuse" value={field.value ?? null} onChange={field.onChange} />
        )} />
        <Label htmlFor="substanceAbuse" className="font-normal cursor-pointer">{t("preop.substanceAbuse")}</Label>
      </div>
      )}

      {!isPediatric && (<>
      <Separator />

      {/* RCRI */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.rcriTitle")}</p>
        <p className="text-xs text-slate-400">{t("preop.rcriHint")}</p>
        {([
          { id:"rcriIschemicHeart", label:"Ischaemic heart disease (history of MI, positive stress test, use of nitrates, ECG Q waves)" },
          { id:"rcriCHF",           label:"Congestive heart failure (pulmonary oedema, PND, S3, bilateral crackles, CXR redistribution)" },
          { id:"rcriCVD",           label:"Cerebrovascular disease (history of TIA or stroke)" },
          { id:"rcriInsulinDM",     label:"Insulin-dependent diabetes mellitus" },
          { id:"rcriCreatinine",    label:"Creatinine > 177 µmol/L (> 2.0 mg/dL)" },
        ] as const).filter(item => shownField(item.id)).map(item => {
          const suggested = rcriSuggested[item.id as keyof typeof rcriSuggested]
          const checked = !!watch(item.id)
          return (
            <div key={item.id} className="flex items-start gap-2">
              <Controller name={item.id} control={control} render={({ field }) => (
                <ClinicalYesNo id={item.id} value={field.value ?? null} onChange={field.onChange} className="mt-0.5" />
              )} />
              <div>
                <Label htmlFor={item.id} className="font-normal cursor-pointer leading-snug">{item.label}</Label>
                {suggested && !checked && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{t("preop.suggestedReviewConfirm")}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Separator />

      {/* APFEL */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.apfelTitle")}</p>
        <p className="text-xs text-slate-400">{t("preop.apfelHint")}</p>
        {([
          { id:"apfelPONVHistory",   label:"History of PONV or motion sickness" },
          { id:"apfelPostopOpioids", label:"Postoperative opioids planned" },
        ] as const).filter(item => shownField(item.id)).map(item => (
          <div key={item.id} className="flex items-center gap-2">
            <Controller name={item.id} control={control} render={({ field }) => (
              <ClinicalYesNo id={item.id} value={field.value ?? null} onChange={field.onChange} />
            )} />
            <Label htmlFor={item.id} className="font-normal cursor-pointer">{item.label}</Label>
          </div>
        ))}
      </div>

      <Separator />

      {/* STOP-BANG */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.stopBangTitle")}</p>
        <p className="text-xs text-slate-400">{t("preop.stopBangHint")}</p>
        {([
          { id:"stopbangSnoring",  label:"Snoring — do you snore loudly?" },
          { id:"stopbangTired",    label:"Tired — often feel tired, fatigued, or sleepy during daytime?" },
          { id:"stopbangObserved", label:"Observed — has anyone observed you stop breathing during sleep?" },
          { id:"stopbangBP",       label:"Pressure — do you have or are you being treated for high blood pressure?" },
          { id:"stopbangNeck",     label:"Neck circumference > 40 cm" },
        ] as const).filter(item => shownField(item.id)).map(item => {
          const suggested = item.id === "stopbangBP" && stopBangBPSuggested
          const checked = !!watch(item.id)
          return (
            <div key={item.id} className="flex items-start gap-2">
              <Controller name={item.id} control={control} render={({ field }) => (
                <ClinicalYesNo id={item.id} value={field.value ?? null} onChange={field.onChange} className="mt-0.5" />
              )} />
              <div>
                <Label htmlFor={item.id} className="font-normal cursor-pointer leading-snug">{item.label}</Label>
                {suggested && !checked && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{t("preop.suggestedReviewConfirm")}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </>)}
      {children}
    </div>
  )
}
