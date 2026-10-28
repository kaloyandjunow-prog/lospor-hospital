import { Pressable, Text, View } from "react-native"
import { Controller, useWatch, type Control, type UseFormSetValue } from "react-hook-form"
import {
  calculateColds,
  calculatePovoc,
  normalizePediatricAge,
} from "@lospor/core/pediatric"
import { ClinicalSwitchRow } from "@/components/ui"
import { PovocSection } from "@/components/preop/PovocSection"
import { PEDIATRIC_PREOP_LABELS, type PediatricPreopLabels } from "@/components/preop/pediatric-preop-labels"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { colors } from "@/theme/colors"

type Props = {
  control: Control<PreopFormInput>
  setValue: UseFormSetValue<PreopFormInput>
  tc: (key: ClinicalStringKey) => string
  language: "en" | "bg"
}

const COLDS_OPTIONS = {
  coldsCurrentSymptoms: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsOnset: ["MORE_THAN_4_WEEKS", "TWO_TO_4_WEEKS", "LESS_THAN_2_WEEKS"],
  coldsLungDisease: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsAirwayDevice: ["FACE_MASK_OR_NONE", "SUPRAGLOTTIC", "TRACHEAL_TUBE"],
  coldsSurgery: ["NON_AIRWAY", "MINOR_AIRWAY", "MAJOR_AIRWAY"],
} as const
type ColdsField = keyof typeof COLDS_OPTIONS

function ChoicePills({ value, options, onChange }: { value?: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{options.map(option => {
    const selected = value === option.value
    return <Pressable key={option.value} onPress={() => onChange(option.value)} style={{ minHeight: 38, justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{option.label}</Text></Pressable>
  })}</View>
}

function coldsOptionLabel(value: string, labels: PediatricPreopLabels): string {
  if (value === "NONE") return labels.none
  if (value === "MILD") return labels.mild
  if (value === "MODERATE_OR_SEVERE") return labels.moderateSevere
  if (value === "MORE_THAN_4_WEEKS") return labels.moreThan4Weeks
  if (value === "TWO_TO_4_WEEKS") return labels.twoTo4Weeks
  if (value === "LESS_THAN_2_WEEKS") return labels.lessThan2Weeks
  if (value === "FACE_MASK_OR_NONE") return labels.maskOrNone
  if (value === "SUPRAGLOTTIC") return labels.supraglottic
  if (value === "TRACHEAL_TUBE") return labels.trachealTube
  if (value === "NON_AIRWAY") return labels.nonAirway
  if (value === "MINOR_AIRWAY") return labels.minorAirway
  return labels.majorAirway
}

function coldsFieldLabel(field: ColdsField, labels: PediatricPreopLabels): string {
  if (field === "coldsCurrentSymptoms") return labels.currentSymptoms
  if (field === "coldsOnset") return labels.onset
  if (field === "coldsLungDisease") return labels.lungDisease
  if (field === "coldsAirwayDevice") return labels.airwayDevice
  return labels.surgery
}

export function PediatricRiskAndCalculators({ control, setValue, tc, language, isShown = () => true }: Props & { isShown?: (field: string) => boolean }) {
  const labels = PEDIATRIC_PREOP_LABELS[language]
  const [mode, ageValue, ageUnitRaw, povocSurgeryAtLeast30Minutes, povocStrabismusSurgery, povocHistory, coldsApplicable, coldsCurrentSymptoms, coldsOnset, coldsLungDisease, coldsAirwayDevice, coldsSurgery] = useWatch({ control, name: ["clinicalMode", "ageValue", "ageUnit", "povocSurgeryAtLeast30Minutes", "povocStrabismusSurgery", "povocHistory", "coldsApplicable", "coldsCurrentSymptoms", "coldsOnset", "coldsLungDisease", "coldsAirwayDevice", "coldsSurgery"] })
  const age = ageValue != null ? normalizePediatricAge({ value: ageValue, unit: ageUnitRaw ?? "YEARS" }) : null
  const povocAnsweredCount = [povocSurgeryAtLeast30Minutes, povocStrabismusSurgery, povocHistory].filter(answer => answer === true || answer === false).length
  const povoc = age && povocAnsweredCount === 3 ? calculatePovoc({ ageYears: age.approximateDays / 365.2425, surgeryMinutes: povocSurgeryAtLeast30Minutes ? 30 : 0, strabismusSurgery: !!povocStrabismusSurgery, patientOrFamilyHistory: !!povocHistory }) : null
  const colds = coldsApplicable && coldsCurrentSymptoms && coldsOnset && coldsLungDisease && coldsAirwayDevice && coldsSurgery ? calculateColds({ currentSymptoms: coldsCurrentSymptoms, onset: coldsOnset, lungDisease: coldsLungDisease, airwayDevice: coldsAirwayDevice, surgery: coldsSurgery }) : null
  if (mode !== "PEDIATRIC") return null
  const coldsValues: Partial<Record<ColdsField, string>> = { coldsCurrentSymptoms, coldsOnset, coldsLungDisease, coldsAirwayDevice, coldsSurgery }
  return <View style={{ gap: 16 }}>
    <PovocSection control={control} labels={labels} povoc={povoc} answered={povocAnsweredCount} answeredLabel={tc("preopQuestionsAnswered")} isShown={isShown} unavailableLabel={tc("preopScoreUnavailable")} />
    {isShown("coldsApplicable") ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 10 }}>
      <Controller control={control} name="coldsApplicable" render={({ field }) => <ClinicalSwitchRow label={labels.coldsApplicable} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />
      {coldsApplicable ? (Object.keys(COLDS_OPTIONS) as ColdsField[]).map(field => <View key={field} style={{ gap: 6 }}><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>{coldsFieldLabel(field, labels)}</Text><ChoicePills value={coldsValues[field]} options={COLDS_OPTIONS[field].map(value => ({ value, label: coldsOptionLabel(value, labels) }))} onChange={value => setValue(field, value as never, { shouldDirty: true })} /></View>) : null}
      {coldsApplicable ? <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "900" }}>{labels.coldsScore}: {colds?.score ?? "-"}/25</Text> : null}
    </View> : null}
  </View>
}
