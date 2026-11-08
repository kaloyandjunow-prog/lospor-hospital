import { useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { ENERGY_KNOB_SKINS, type EnergyKnobSkin } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { Card, SettingsRow } from "@/components/ui"
import { EnergyKnobView } from "@/components/intraop/EnergyKnobView"
import { colors } from "@/theme/colors"

const LABEL = { A: "knobA", B: "knobB", C: "knobC" } as const

/**
 * The shock knob's look (10.2.0), per profile: three live previews that can
 * be turned; the one picked is what the shock sheet shows.
 */
export function EnergyKnobSkinCard() {
  const { tc, energyKnobSkin, setEnergyKnobSkin } = usePreferences()
  const [energies, setEnergies] = useState<Record<EnergyKnobSkin, number>>({ A: 150, B: 150, C: 150 })
  return (
    <Card>
      <SettingsRow label={tc("knobTitle")} subtitle={tc("knobDesc")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around", gap: 8, paddingVertical: 8 }}>
        {ENERGY_KNOB_SKINS.map(skin => {
          const picked = energyKnobSkin === skin
          return (
            <View key={skin} style={{ alignItems: "center", gap: 4 }}>
              <EnergyKnobView skin={skin} energy={energies[skin]} size={104} testID={`knob-preview-${skin}`} label={tc(LABEL[skin])}
                onChange={value => setEnergies(prev => ({ ...prev, [skin]: value }))} />
              <Text style={{ color: colors.textPrimary, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{energies[skin]} J</Text>
              <TouchableOpacity testID={`knob-pick-${skin}`} accessibilityState={{ selected: picked }} onPress={() => { void setEnergyKnobSkin(skin) }}
                style={{ minHeight: 40, paddingHorizontal: 10, borderRadius: 10, justifyContent: "center", borderWidth: 1,
                  borderColor: picked ? colors.primary : colors.border, backgroundColor: picked ? colors.primarySoft : "transparent" }}>
                <Text style={{ color: picked ? colors.primary : colors.textSecondary, fontWeight: "700", fontSize: 12 }}>{tc(LABEL[skin])}</Text>
              </TouchableOpacity>
            </View>
          )
        })}
      </View>
    </Card>
  )
}
