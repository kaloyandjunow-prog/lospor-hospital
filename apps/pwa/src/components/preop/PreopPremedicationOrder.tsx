import { useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { premedicationEntries, type PremedicationOrders, type PremedicationPhase } from "@lospor/core/premedication"
import { PremedicationLibrarySheet } from "@/components/intraop/PremedicationLibrarySheet"
import { premedicationSheetProps } from "@/components/intraop/premedication-sheet-props"
import { displayOptionEntry } from "@/lib/clinical-display"
import { addOrReplacePremedicationEntry, formatPremedicationEntry } from "@/lib/intraop-premedication"
import { mapPremedicationCategories } from "@/lib/intraop-option-mappers"
import type { PremDrug } from "@/lib/intraop-types"
import { buildIntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { useClinicalRules } from "@/lib/pediatric-clinical-rules"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { useOptionLibrary } from "@/lib/use-option-library"
import { colors, withAlpha, useThemeRefresh } from "@/theme/colors"

type SheetPhase = "evening" | "morning"
const PHASE_OF: Record<SheetPhase, PremedicationPhase> = { evening: "DAY_BEFORE", morning: "MORNING" }

/**
 * Premedication ordered at the preop visit (1.7.0): the night before surgery
 * and its morning, from the same library sheet and doses as the intraop
 * record, which starts from this order.
 */
export function PreopPremedicationOrderSection({ value, onChange, patient, language, tc }: {
  value: PremedicationOrders
  onChange: (next: PremedicationOrders) => void
  /** The form's values: weight, height, sex and age dose a child's drugs. */
  patient: Record<string, unknown>
  language: "en" | "bg"
  tc: (key: ClinicalStringKey) => string
}) {
  useThemeRefresh()
  const mode = patient.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT"
  const preop = useMemo(() => buildIntraopPreopSummary(patient, mode), [mode, patient])
  const { options } = useOptionLibrary("PREMED_DRUG")
  const library = useMemo(() => mapPremedicationCategories(options), [options])
  const { prospectiveGuidanceEnabled } = useClinicalRules(mode, true)

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<SheetPhase>("evening")
  const [category, setCategory] = useState<string | null>(null)
  const [drug, setDrug] = useState<PremDrug | null>(null)
  const [dose, setDose] = useState("")
  const [route, setRoute] = useState("PO")

  const setPhaseText = (key: PremedicationPhase, text: string) => onChange({ ...value, [key]: text })

  function openSheet(next: SheetPhase) {
    setPhase(next)
    setCategory(null)
    setDrug(null)
    setDose("")
    setRoute("PO")
    setOpen(true)
  }

  function add() {
    if (!drug || !dose) return
    const key = PHASE_OF[phase]
    setPhaseText(key, addOrReplacePremedicationEntry(value[key] ?? "", drug.name, formatPremedicationEntry(drug, dose, route)))
    setOpen(false)
    setDrug(null)
    setCategory(null)
  }

  const sheet = premedicationSheetProps({
    open, phase, library, category, drug, dose, route,
    setOpen, setCategory, setDrug, setDose, setRoute, onAdd: add,
  }, { preop, prospectiveGuidanceEnabled, backLabel: tc("back") })

  return (
    <View testID="preop-premedication-order" style={{ gap: 18 }}>
      {(["evening", "morning"] as const).map(sheetPhase => {
        const key = PHASE_OF[sheetPhase]
        const entries = premedicationEntries(value[key])
        return (
          <View key={sheetPhase} testID={`preop-premedication-${sheetPhase}`} style={{ gap: 8 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "900" }}>
              {tc(sheetPhase === "evening" ? "premedOrderNight" : "premedOrderMorning")}
            </Text>
            {entries.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {entries.map(entry => (
                  <View key={entry} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 999, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: withAlpha(colors.primary, "55") }}>
                    <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>{displayOptionEntry("PREMED_DRUG", entry, language)}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${tc("ordersRemove")} ${entry}`}
                      testID={`preop-premedication-remove-${sheetPhase}-${entry}`}
                      hitSlop={8}
                      onPress={() => setPhaseText(key, entries.filter(item => item !== entry).join("; "))}
                    >
                      <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "900" }}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              testID={`preop-premedication-add-${sheetPhase}`}
              onPress={() => openSheet(sheetPhase)}
              style={{ alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.primary }}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>{tc("premedAddFromLibrary")}</Text>
            </Pressable>
          </View>
        )
      })}
      {open ? <PremedicationLibrarySheet {...sheet} /> : null}
    </View>
  )
}
