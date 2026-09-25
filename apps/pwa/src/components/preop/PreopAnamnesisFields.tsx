import { Controller, type Control, type UseFormSetValue } from "react-hook-form"
import { ChecklistGroup, ChecklistRow, Field, SectionHeader, StyledInput } from "@/components/ui"
import { ClinicalYesNoRow } from "@/components/ClinicalYesNoRow"
import { SearchTagInput } from "@/components/SearchTagInput"
import type { ClinicalStringKey } from "@/i18n/clinical-strings"
import type { PreopFormInput as FormInput, PreopSection } from "@/lib/preop-form-schema"
import { colors } from "@/theme/colors"

/**
 * The anamnesis toggles and the score factors, each shown only while the
 * hospital's preop profile asks its question. Split out of the preop screen,
 * which is at its size budget.
 */
export function PreopAnamnesisFields({
  control, setValue, tc, allergies, familyAnesthesiaProblems, pediatricMode,
  rcriSuggested, stopBangBPSuggested, RCRI_HINT, sex, smoking, bmi, ageYears,
  blockedErrorFor, scrollToSection, shownField,
}: {
  control: Control<FormInput>
  setValue: UseFormSetValue<FormInput>
  tc: (key: ClinicalStringKey) => string
  allergies: boolean | null | undefined
  familyAnesthesiaProblems: boolean | null | undefined
  pediatricMode: boolean
  rcriSuggested: Record<string, boolean>
  stopBangBPSuggested: boolean
  RCRI_HINT: string
  sex: string | null | undefined
  smoking: boolean | null | undefined
  bmi: number | null
  ageYears: number | null | undefined
  blockedErrorFor: (field: string) => string | undefined
  scrollToSection: (section: PreopSection, extraOffset?: number) => void
  shownField: (field: string) => boolean
}) {
  return (
    <>
        {shownField("allergies") ? (
        <Controller control={control} name="allergies" render={({ field }) => <ClinicalYesNoRow label={tc("drugAllergy")} value={field.value ?? null} onValueChange={(value) => {
          field.onChange(value)
          if (!value) setValue("allergyDetails", [], { shouldDirty: true })
        }} activeColor={colors.danger} />} />
        ) : null}
        {allergies ? (
          <Controller control={control} name="allergyDetails" render={({ field }) => (
            <SearchTagInput kind="medication" label={tc("allergenSearch")} value={(field.value ?? []).map((item) => ({ code: item.atcCode ?? item.inn ?? item.label, label: item.label, inn: item.inn, atcCode: item.atcCode }))} onChange={(items) => field.onChange(items.map((item) => ({ label: item.label, inn: item.inn, atcCode: item.atcCode })))} endpoint="/api/search/drugs" placeholder={tc("allergenSearchPlaceholder")} onFocus={() => scrollToSection("history", 200)} error={blockedErrorFor("allergyDetails")} />
          )} />
        ) : null}
        {shownField("latexAllergy") ? <Controller control={control} name="latexAllergy" render={({ field }) => <ClinicalYesNoRow label={tc("latexAllergy")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.danger} />} /> : null}
        {shownField("familyAnesthesiaProblems") ? (
        <Controller control={control} name="familyAnesthesiaProblems" render={({ field }) => <ClinicalYesNoRow label={tc("familyAnesthesia")} value={field.value ?? null} onValueChange={(value) => {
          field.onChange(value)
          if (!value) setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
        }} activeColor={colors.warning} />} />
        ) : null}
        {familyAnesthesiaProblems ? <Field label={tc("familyAnesthesiaDetails")} error={blockedErrorFor("familyAnesthesiaDetails")}><Controller control={control} name="familyAnesthesiaDetails" render={({ field }) => <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder={tc("familyAnesthesiaHint")} />} /></Field> : null}
        {shownField("unexplainedAnaesthesiaComplications") ? <Controller control={control} name="unexplainedAnaesthesiaComplications" render={({ field }) => <ClinicalYesNoRow label={tc("unexplainedAnaesthesiaComplications")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.danger} />} /> : null}
        {shownField("malignantHyperthermiaHistory") ? <Controller control={control} name="malignantHyperthermiaHistory" render={({ field }) => <ClinicalYesNoRow label={tc("malignantHyperthermiaHistory")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.danger} />} /> : null}
        {shownField("dentalProsthetics") ? <Controller control={control} name="dentalProsthetics" render={({ field }) => <ClinicalYesNoRow label={tc("dentalProsthetics")} value={field.value ?? null} onValueChange={field.onChange} />} /> : null}
        {shownField("looseTeeth") ? <Controller control={control} name="looseTeeth" render={({ field }) => <ClinicalYesNoRow label={tc("looseTeeth")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.warning} />} /> : null}
        {shownField("smoking") ? <Controller control={control} name="smoking" render={({ field }) => <ClinicalYesNoRow label={tc("smoking")} value={field.value ?? null} onValueChange={field.onChange} />} /> : null}
        {shownField("substanceAbuse") ? <Controller control={control} name="substanceAbuse" render={({ field }) => <ClinicalYesNoRow label={tc("substanceAbuse")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.warning} />} /> : null}

        {!pediatricMode ? <>
        <SectionHeader title={tc("rcriSection")} />
        <ChecklistGroup>
          {shownField("rcriIschemicHeart") ? <Controller control={control} name="rcriIschemicHeart" render={({ field }) => <ChecklistRow label={tc("rcriIschemicHeart")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriIschemicHeart ? RCRI_HINT : undefined} />} /> : null}
          {shownField("rcriCHF") ? <Controller control={control} name="rcriCHF" render={({ field }) => <ChecklistRow label={tc("rcriCHF")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCHF ? RCRI_HINT : undefined} />} /> : null}
          {shownField("rcriCVD") ? <Controller control={control} name="rcriCVD" render={({ field }) => <ChecklistRow label={tc("rcriCVD")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCVD ? RCRI_HINT : undefined} />} /> : null}
          {shownField("rcriInsulinDM") ? <Controller control={control} name="rcriInsulinDM" render={({ field }) => <ChecklistRow label={tc("rcriInsulinDM")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriInsulinDM ? RCRI_HINT : undefined} />} /> : null}
          {shownField("rcriCreatinine") ? <Controller control={control} name="rcriCreatinine" render={({ field }) => <ChecklistRow label={tc("rcriCreatinine")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCreatinine ? RCRI_HINT : undefined} last />} /> : null}
        </ChecklistGroup>

        <SectionHeader title={tc("apfelSection")} />
        <ChecklistGroup>
          <ChecklistRow label={tc("apfelFemaleSex")} checked={sex === "FEMALE"} muted />
          {/* Answered "No" only, as the Apfel score counts it: an unanswered smoking question is not a non-smoker. */}
          <ChecklistRow label={tc("apfelNonSmoker")} checked={smoking === false} muted />
          {shownField("apfelPONVHistory") ? <Controller control={control} name="apfelPONVHistory" render={({ field }) => <ChecklistRow label={tc("apfelPONV")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} /> : null}
          {shownField("apfelPostopOpioids") ? <Controller control={control} name="apfelPostopOpioids" render={({ field }) => <ChecklistRow label={tc("apfelOpioids")} checked={!!field.value} onPress={() => field.onChange(!field.value)} last />} /> : null}
        </ChecklistGroup>

        <SectionHeader title={tc("stopbangSection")} />
        <ChecklistGroup>
          {shownField("stopbangSnoring") ? <Controller control={control} name="stopbangSnoring" render={({ field }) => <ChecklistRow label={tc("stopbangSnoring")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} /> : null}
          {shownField("stopbangTired") ? <Controller control={control} name="stopbangTired" render={({ field }) => <ChecklistRow label={tc("stopbangTired")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} /> : null}
          {shownField("stopbangObserved") ? <Controller control={control} name="stopbangObserved" render={({ field }) => <ChecklistRow label={tc("stopbangObserved")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} /> : null}
          {shownField("stopbangBP") ? <Controller control={control} name="stopbangBP" render={({ field }) => <ChecklistRow label={tc("stopbangBP")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={stopBangBPSuggested ? RCRI_HINT : undefined} />} /> : null}
          <ChecklistRow label={`${tc("stopbangBMI")}: ${bmi ? bmi.toFixed(1) : "-"}`} checked={bmi != null && bmi > 35} muted />
          <ChecklistRow label={`${tc("stopbangAge")}: ${ageYears ?? "-"}`} checked={ageYears != null && ageYears > 50} muted />
          {shownField("stopbangNeck") ? <Controller control={control} name="stopbangNeck" render={({ field }) => <ChecklistRow label={tc("stopbangNeck")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} /> : null}
          <ChecklistRow label={tc("stopbangMale")} checked={sex === "MALE"} muted last />
        </ChecklistGroup>
        </> : null}
    </>
  )
}
