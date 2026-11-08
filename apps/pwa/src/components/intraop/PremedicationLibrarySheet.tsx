import { Text, TouchableOpacity, View } from "react-native"
import type { PremDrug } from "@/lib/intraop-types"
import type { PediatricPremedDrug } from "@/lib/pediatric-premedication-library"
import { DoseSelector } from "./DoseSelector"
import { Sheet } from "./Sheet"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import { useShade } from "@/theme/shade"

type PremedCategory = {
  category: string
  drugs: PremDrug[]
}

type Props = {
  visible: boolean
  phase: "evening" | "morning"
  categories: PremedCategory[]
  openCategory: string | null
  drug: PremDrug | null
  dose: string
  route: string
  backLabel: string
  onClose: () => void
  onToggleCategory: (category: string) => void
  onSelectDrug: (drug: PremDrug) => void
  onBackToLibrary: () => void
  onDoseChange: (value: string) => void
  onRouteChange: (value: string) => void
  onAdd: () => void
  prospectiveGuidanceEnabled: boolean
  /** True when the selected route has no governed dose suggestion. */
  manualEntryOnly?: boolean
  pediatricMode?: boolean
}

export function PremedicationLibrarySheet({
  visible,
  phase,
  categories,
  openCategory,
  drug,
  dose,
  route,
  backLabel,
  onClose,
  onToggleCategory,
  onSelectDrug,
  onBackToLibrary,
  onDoseChange,
  onRouteChange,
  onAdd,
  prospectiveGuidanceEnabled,
  manualEntryOnly,
}: Props) {
  const shade = useShade()
  const { language, tc } = usePreferences()
  const drugLabel = (name: string) => displayClinicalCode("option:PREMED_DRUG", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  const pediatricAnnotation = drug ? (drug as PediatricPremedDrug).pediatric : undefined
  const doseIsManualOnly = manualEntryOnly ?? (
    !prospectiveGuidanceEnabled
    || (!!pediatricAnnotation && pediatricAnnotation.kind !== "calculated")
  )
  const phaseLabel = tc(phase === "evening" ? "premedEvening" : "premedMorning")

  function pediatricStatus(annotation: PediatricPremedDrug["pediatric"]): string | null {
    if (!annotation || annotation.kind === "calculated") return null
    if (annotation.kind === "withheld") return tc("premedUnavailableForChild")
    if (annotation.kind === "needs-weight") return tc("premedDoseNeedsWeight")
    return tc("premedEnterDoseManually")
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={`${tc("premedLibraryTitle")} — ${phaseLabel}`} full>
      {!drug ? (
        <View>
          {categories.map(cat => {
            const open = openCategory === cat.category
            return (
              <View key={cat.category} style={{ marginBottom:6, borderRadius:10, overflow:"hidden",
                borderWidth:1, borderColor:shade("#1e2d40") }}>
                <TouchableOpacity
                  onPress={() => onToggleCategory(cat.category)}
                  style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center",
                    paddingHorizontal:14, paddingVertical:12, backgroundColor:shade("#111820") }}>
                  <Text style={{ color:shade("#cbd5e1"), fontSize:13, fontWeight:"700" }}>{groupLabel(cat.category)}</Text>
                  <Text style={{ color:shade("#64748b") }}>{open ? "⌃" : "⌄"}</Text>
                </TouchableOpacity>
                {open && (
                  <View style={{ paddingHorizontal:12, paddingBottom:10, paddingTop:4,
                    backgroundColor:shade("#0d1520"), flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                    {cat.drugs.map(item => {
                      const annotation = (item as PediatricPremedDrug).pediatric
                      const withheld = annotation?.kind === "withheld"
                      return (
                        <TouchableOpacity key={item.name}
                          disabled={withheld}
                          onPress={() => {
                            onSelectDrug(item)
                            if (!prospectiveGuidanceEnabled) onDoseChange("")
                          }}
                          style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:9,
                            opacity: withheld ? 0.55 : 1,
                            backgroundColor: withheld ? shade("#241a1a") : shade("#1e2d40"),
                            borderWidth:1, borderColor: withheld ? shade("#7c2d12") : shade("#2a3a50") }}>
                          <Text style={{ color: withheld ? shade("#fca5a5") : shade("#93c5fd"), fontSize:12, fontWeight:"700" }}>
                            {drugLabel(item.name)}
                          </Text>
                          {pediatricStatus(annotation) || prospectiveGuidanceEnabled ? (
                            <Text style={{ color: withheld ? shade("#f87171") : shade("#64748b"), fontSize:10, marginTop:2 }}>
                              {pediatricStatus(annotation) ?? `${item.dose} ${item.unit}`}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}
              </View>
            )
          })}
        </View>
      ) : (
        <View style={{ gap:14 }}>
          <TouchableOpacity onPress={onBackToLibrary}>
            <Text style={{ color:shade("#94a3b8"), fontSize:13 }}>{backLabel}</Text>
          </TouchableOpacity>
          <Text style={{ color:shade("#f8fafc"), fontSize:16, fontWeight:"700" }}>{drugLabel(drug.name)}</Text>

          <View>
            <DoseSelector
              color={shade("#3b82f6")}
              hint={prospectiveGuidanceEnabled ? drug.hint : undefined}
              value={dose}
              onValueChange={onDoseChange}
              min={drug.min}
              max={drug.max}
              step={drug.step}
              manualEntryOnly={doseIsManualOnly}
              valuePlaceholder={`${tc("dsCustomUnit")} ${drug.unit}`}
              unitSuffix={drug.unit}
              routes={drug.routes}
              route={route}
              onRouteChange={nextRoute => {
                onRouteChange(nextRoute)
                // A route change invalidates the previous dose, including the
                // manual-entry baseline used when guidance is disabled.
                onDoseChange("")
              }}
            />
            {prospectiveGuidanceEnabled && pediatricAnnotation?.kind === "calculated" && (
              <Text style={{ color:shade("#38bdf8"), fontSize:11, marginTop:4 }}>
                {pediatricAnnotation.perKg} {pediatricAnnotation.unit}/kg × {pediatricAnnotation.weightUsedKg} kg
                {pediatricAnnotation.basis === "IBW" ? ` (${tc("premedIdealWeight")})` : ""}
                {pediatricAnnotation.capped ? ` — ${tc("premedCappedAt")} ${pediatricAnnotation.cap} ${pediatricAnnotation.unit}` : ""}
              </Text>
            )}
            {pediatricAnnotation && pediatricAnnotation.kind !== "calculated" && (
              <Text style={{ color:shade("#fbbf24"), fontSize:11, marginTop:4 }}>{pediatricStatus(pediatricAnnotation)}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={onAdd}
            disabled={!dose}
            style={{ backgroundColor: dose ? shade("#1e3a5f") : shade("#111111"), borderRadius:12,
              padding:16, alignItems:"center", borderWidth:1, borderColor:shade("#3b82f6") }}>
            <Text style={{ color:shade("#93c5fd"), fontWeight:"700", fontSize:15 }}>
              {formatMessage(tc("premedAddTo"), { phase: phaseLabel.toLocaleLowerCase(language === "bg" ? "bg-BG" : "en-GB") })}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Sheet>
  )
}
