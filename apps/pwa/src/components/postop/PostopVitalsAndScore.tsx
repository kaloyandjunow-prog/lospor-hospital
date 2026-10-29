import { Text, TouchableOpacity, View } from "react-native"
import { Controller, type Control } from "react-hook-form"
import { VitalNumber } from "@/components/VitalStepper"
import { convertedMeasurement, type UnitPrefs } from "@/lib/use-converted-measurement"
import { colors, withAlpha } from "@/theme/colors"
import { ScoreRow, SectionHeader } from "@/components/postop/PostopFormSections"
import type { RangeSpec } from "@/lib/use-option-library"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import type { PostopFormInput as FormInput } from "@/lib/postop-form-schema"
import type { AldreteCriterion } from "@/lib/postop-aldrete-criteria"
type PostopSectionKey = "vitals" | "score" | "pain" | "discharge"

export function PostopVitalsAndScore({ control, pediatricMode, screenWidth, unitPrefs, tc, recoveryBpSystolicRange, recoveryBpDiastolicRange, recoveryHeartRateRange, recoverySpo2Range, recoveryTemperatureRange, aldreteCriteria, stewardCriteria, suggestions, markY }: {
  control: Control<FormInput>
  pediatricMode: boolean
  screenWidth: number
  unitPrefs: UnitPrefs
  tc: (key: ClinicalStringKey) => string
  recoveryBpSystolicRange?: RangeSpec
  recoveryBpDiastolicRange?: RangeSpec
  recoveryHeartRateRange?: RangeSpec
  recoverySpo2Range?: RangeSpec
  recoveryTemperatureRange?: RangeSpec
  aldreteCriteria: AldreteCriterion[]
  stewardCriteria: AldreteCriterion[]
  suggestions: Partial<Record<string, { score: number; text: string }>>
  markY: (key: PostopSectionKey) => (event: { nativeEvent: { layout: { y: number } } }) => void
}) {
  return <>
    <View onLayout={markY("vitals")}>
      <SectionHeader title={tc("recoveryVitals")} />
      <View style={{ flexDirection: screenWidth < 360 ? "column" : "row", gap: 10 }}>
        <View style={screenWidth < 360 ? undefined : { flex: 1 }}><Controller control={control} name="recoveryBpSystolic" render={({ field }) => <Controller control={control} name="recoveryBpUnobtainable" render={({ field: uto }) => <VitalNumber label={tc("sbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={pediatricMode ? 10 : recoveryBpSystolicRange?.min ?? 1} max={recoveryBpSystolicRange?.max ?? 300} step={recoveryBpSystolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} labelNotAvailable={tc("vitalNotAvailable")} />} />} /></View>
        <View style={screenWidth < 360 ? undefined : { flex: 1 }}><Controller control={control} name="recoveryBpDiastolic" render={({ field }) => <Controller control={control} name="recoveryBpUnobtainable" render={({ field: uto }) => <VitalNumber label={tc("dbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={pediatricMode ? 5 : recoveryBpDiastolicRange?.min ?? 1} max={recoveryBpDiastolicRange?.max ?? 200} step={recoveryBpDiastolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} labelNotAvailable={tc("vitalNotAvailable")} />} />} /></View>
      </View>
      <Controller control={control} name="recoveryHeartRate" render={({ field }) => <Controller control={control} name="recoveryHeartRateUnobtainable" render={({ field: uto }) => <VitalNumber label={tc("heartRateLabel")} unit="bpm" value={field.value} onChange={field.onChange} min={pediatricMode ? 10 : recoveryHeartRateRange?.min ?? 1} max={pediatricMode ? 350 : recoveryHeartRateRange?.max ?? 300} step={recoveryHeartRateRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} labelNotAvailable={tc("vitalNotAvailable")} />} />} />
      <Controller control={control} name="recoverySpO2" render={({ field }) => <Controller control={control} name="recoverySpO2Unobtainable" render={({ field: uto }) => <VitalNumber label={tc("spO2Label")} unit="%" value={field.value} onChange={field.onChange} min={recoverySpo2Range?.min ?? 0} max={recoverySpo2Range?.max ?? 100} step={recoverySpo2Range?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} labelNotAvailable={tc("vitalNotAvailable")} />} />} />
      <Controller control={control} name="temperatureCelsius" render={({ field }) => <Controller control={control} name="recoveryTemperatureUnobtainable" render={({ field: uto }) => { const cv = convertedMeasurement("temperature", unitPrefs, field.value, field.onChange, pediatricMode ? 25 : recoveryTemperatureRange?.min ?? 0, recoveryTemperatureRange?.max ?? 45, recoveryTemperatureRange?.step ?? 0.1); return <VitalNumber label={tc("temperatureLabel")} unit={cv.unit} value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision || 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} labelNotAvailable={tc("vitalNotAvailable")} /> }} />} />
    </View>
    <View onLayout={markY("score")}>
      <SectionHeader title={`${tc(pediatricMode ? "stewardScore" : "aldreteScore")} *`} />
      {(pediatricMode ? stewardCriteria : aldreteCriteria).map(criterion => {
        const suggestion = suggestions[criterion.field]
        return <View key={criterion.field} className="mb-4"><Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 8 }}>{criterion.label}<Text style={{ color: colors.danger }}> *</Text></Text><Controller control={control} name={criterion.field} render={({ field: { onChange, value } }) => <><ScoreRow label={criterion.label} value={value as number} onChange={onChange} descriptions={criterion.descriptions} suggested={suggestion?.score ?? null} />{suggestion && value !== suggestion.score ? <View testID={`suggest-${criterion.field}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}><Text style={{ flex: 1, color: colors.primary, fontSize: 12, fontWeight: "700" }}>{suggestion.text}</Text><TouchableOpacity accessibilityRole="button" onPress={() => onChange(suggestion.score)} style={{ borderWidth: 1, borderColor: withAlpha(colors.primary, "88"), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{tc("suggestUse")}</Text></TouchableOpacity></View> : null}</>} /></View>
      })}
    </View>
  </>
}
