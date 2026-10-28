import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { Controller, type Control, type UseFormSetValue } from "react-hook-form"
import { SearchTagInput } from "@/components/SearchTagInput"
import { ProcedureOperationPicker } from "@/components/ProcedureOperationPicker"
import { DispositionPicker, Field, HandoverChecklist, SectionHeader } from "@/components/postop/PostopFormSections"
import { ItemScale, ScaleTotal, SelfReportScale } from "@/components/postop/PainScales"
import { colors, withAlpha } from "@/theme/colors"
import { displayPaedBand } from "@lospor/core/risk-band-display"
import { FLACC_ITEMS, FLACC_TOTAL_MAX, NIPS_ITEMS, NIPS_TOTAL_MAX, PAED_ITEMS, PAED_TOTAL_MAX, flaccBand, nipsBand, painScaleLabel, selfReportBand, type FlaccField, type NipsField, type PaedField, painScalesFor } from "@lospor/core/postop-pain"
import type { PostopFormInput as FormInput, PostopFormData as FormData } from "@/lib/postop-form-schema"
import type { ClinicalStringKey } from "@/lib/preferences-context"

type ScoredItem = FlaccField | NipsField | PaedField
type PainItems = Partial<Record<ScoredItem | "fpsrScore" | "painScoreNRS", number | null>>
type PostopSectionKey = "vitals" | "score" | "pain" | "discharge"

export function PostopPainDisposition({ control, setValue, tc, handoverNotesPlaceholder, items, painLanguage, painScales, legacyPain, flacc, nips, paed, showPainSection, showDischargeSection, showPain, showDelirium, showPonv, ponv, disposition, procedureUndetermined, showHandover, blockedDispositionMessage, markY }: {
  control: Control<FormInput>
  setValue: UseFormSetValue<FormInput>
  tc: (key: ClinicalStringKey) => string
  handoverNotesPlaceholder: string
  items: PainItems
  painLanguage: "en" | "bg"
  painScales: ReturnType<typeof painScalesFor>
  showPainSection: boolean
  showDischargeSection: boolean
  legacyPain: string | null
  flacc: number | null
  nips: number | null
  paed: number | null
  showPain: boolean
  showDelirium: boolean
  showPonv: boolean
  ponv: boolean | null | undefined
  disposition: FormData["disposition"]
  procedureUndetermined: boolean
  showHandover: boolean
  blockedDispositionMessage?: string
  markY: (key: PostopSectionKey) => (event: { nativeEvent: { layout: { y: number } } }) => void
}) {
  const setItem = (key: ScoredItem, value: number | null) => setValue(key, value, { shouldDirty: true })
  const showWard = disposition === "WARD" || disposition === "PACU"
  return <>
    {showPainSection && <View onLayout={markY("pain")}>
      {showPain && <View><SectionHeader title={tc("painTitle")} /><Text testID="pain-scales-offered" style={{ color: colors.primary, fontSize: 12, fontWeight: "700", marginBottom: 10 }}>{tc("painOffered").replace("{scales}", painScales.map(painScaleLabel).join(", "))}</Text>{legacyPain ? <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>{legacyPain}</Text> : null}
        {painScales.includes("NIPS") && <View style={{ marginBottom: 18 }}><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>NIPS</Text><ItemScale items={NIPS_ITEMS} values={items} onChange={setItem} language={painLanguage} testID="nips-scale" /><ScaleTotal label="NIPS" total={nips} max={NIPS_TOTAL_MAX} band={nips == null ? null : nipsBand(nips)} language={painLanguage} notComplete={tc("painNotComplete")} /></View>}
        {painScales.includes("FLACC") && <View style={{ marginBottom: 18 }}><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>FLACC</Text><ItemScale items={FLACC_ITEMS} values={items} onChange={setItem} language={painLanguage} testID="flacc-scale" /><ScaleTotal label="FLACC" total={flacc} max={FLACC_TOTAL_MAX} band={flacc == null ? null : flaccBand(flacc)} language={painLanguage} notComplete={tc("painNotComplete")} /></View>}
        {painScales.includes("FPS_R") && <View style={{ marginBottom: 18 }}><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 4 }}>FPS-R</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>{tc("painFaceHint")}</Text><Controller control={control} name="fpsrScore" render={({ field: { onChange, value } }) => <SelfReportScale kind="FPS_R" value={value} onChange={onChange} lowLabel={tc("painNoPain")} highLabel={tc("painVeryMuch")} />} /><ScaleTotal label="FPS-R" total={items.fpsrScore ?? null} max={10} band={items.fpsrScore == null ? null : selfReportBand(items.fpsrScore)} language={painLanguage} notComplete={tc("painNotComplete")} /></View>}
        {painScales.includes("NRS") && <Field label={tc("painNRS")}><Controller control={control} name="painScoreNRS" render={({ field: { onChange, value } }) => <SelfReportScale kind="NRS" value={value} onChange={onChange} lowLabel={tc("painNoPain")} highLabel={tc("painWorst")} />} /></Field>}
      </View>}
      {showDelirium && <View><SectionHeader title={tc("deliriumTitle")} /><Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>{tc("deliriumHint")}</Text><ItemScale items={PAED_ITEMS} values={items} onChange={setItem} language={painLanguage} testID="paed-scale" /><ScaleTotal label="PAED" total={paed} max={PAED_TOTAL_MAX} bandText={paed == null ? null : displayPaedBand(paed, painLanguage).label} language={painLanguage} notComplete={tc("painNotComplete")} /></View>}
      {showPonv && <Field label={tc("ponvLabel")}>
        <Controller control={control} name="ponv" render={({ field: { onChange, value } }) => (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([false, true] as const).map(option => {
              const selected = value === option
              const tone = option ? colors.warning : colors.success
              return <TouchableOpacity key={String(option)} testID={`ponv-${option ? "yes" : "no"}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(selected ? null : option)} style={{ flex: 1, minHeight: 48, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: selected ? tone : colors.border, backgroundColor: selected ? withAlpha(tone, "22") : colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}><Text style={{ color: selected ? tone : colors.textSecondary, fontSize: 14, fontWeight: "900" }}>{option ? tc("ponvPresent") : tc("ponvAbsent")}</Text></TouchableOpacity>
            })}
          </View>
        )} />
        {ponv == null ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>{tc("ponvNotRecorded")}</Text> : null}
      </Field>}
    </View>}
    {showDischargeSection && <View onLayout={markY("discharge")}>
      <SectionHeader title={`${tc("dispositionLabel")} *`} />
      <Field label={`${tc("performedProcedureLabel")}${procedureUndetermined ? " *" : ""}`}><Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>{procedureUndetermined ? tc("performedProcedureUndetermined") : tc("performedProcedureHint")}</Text><Controller control={control} name="performedProcedures" render={({ field }) => <><SearchTagInput kind="procedure" label={tc("performedProcedureLabel")} value={(field.value ?? []).map(item => ({ ...item, code: (item as { code?: string }).code ?? item.label }))} onChange={items => field.onChange(items)} endpoint="/api/search/procedures" placeholder={tc("procedureSearchPlaceholder")} /><ProcedureOperationPicker value={(field.value ?? []).map(item => ({ ...item, code: (item as { code?: string }).code ?? item.label }))} onChange={items => field.onChange(items)} /></>} /></Field>
      <View className="mb-4"><Controller control={control} name="disposition" render={({ field: { onChange, value } }) => <DispositionPicker value={value} onChange={next => { onChange(next); if (next !== "WARD" && next !== "PACU") { setValue("handoverItems", [], { shouldDirty: true }); setValue("dispositionNotes", "", { shouldDirty: true }) } }} wardLabel={tc("dispWard")} pacuLabel={tc("dispPACU")} icuLabel={tc("dispICU")} />} /></View>
      {showWard && (
        <Field label={tc("dispNotes")}>
          <Controller
            control={control}
            name="dispositionNotes"
            render={({ field: { onChange, value } }) => (
              <TextInput
                placeholderTextColor={colors.textMuted}
                placeholder={handoverNotesPlaceholder}
                value={value ?? ""}
                onChangeText={onChange}
                multiline
                style={{ minHeight: 92, textAlignVertical: "top", backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, borderWidth: 1, borderColor: colors.border }}
              />
            )}
          />
          {blockedDispositionMessage ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>{blockedDispositionMessage}</Text> : null}
        </Field>
      )}
      {showHandover && showWard && <><SectionHeader title={tc("handoverChecklist")} /><Controller control={control} name="handoverItems" render={({ field: { onChange, value } }) => <HandoverChecklist value={value ?? []} onChange={onChange} />} /></>}
    </View>}
  </>
}
