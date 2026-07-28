import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

type FluidOption = { name: string; cat: string; color: string }

export function FluidSheet({
  visible, onClose, fluidList, flFluid, setFlFluid, flVol, setFlVol, onConfirm,
  quickVolumes = {}, routes = {}, flRoute, setFlRoute,
  concentrations = {}, defaultConcentrations = {}, flConcentration, setFlConcentration,
}: {
  visible: boolean
  onClose: () => void
  fluidList: FluidOption[]
  flFluid: FluidOption | null
  setFlFluid: (f: FluidOption) => void
  flVol: string
  setFlVol: (v: string) => void
  onConfirm: () => void
  quickVolumes?: Record<string, number[]>
  routes?: Record<string, string[]>
  flRoute?: string
  setFlRoute?: (r: string) => void
  concentrations?: Record<string, string[]>
  defaultConcentrations?: Record<string, string>
  flConcentration?: string
  setFlConcentration?: (c: string | undefined) => void
}) {
  const { tc, language } = usePreferences()
  const fluidLabel = (name: string) => displayClinicalCode("option:INTRAOP_FLUID", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })

  const selectFluid = (fluid: FluidOption) => {
    setFlFluid(fluid)
    const preset = (quickVolumes[fluid.name] ?? [250, 500, 1000])[0]
    setFlVol(String(preset ?? 500))
    // Apply the library's default concentration (e.g. HES 10%) on select.
    setFlConcentration?.(defaultConcentrations[fluid.name])
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={`${tc("dsAdd")} ${tc("trRowFluid")}`}>
      {flFluid && (
        <View style={{ marginBottom:16 }}>
          <DoseSelector
            color={flFluid.color}
            quickValues={quickVolumes[flFluid.name] ?? [250, 500, 1000]}
            value={flVol} onValueChange={setFlVol}
            min={0} max={2000} step={50}
            valuePlaceholder="Volume" unitSuffix="mL"
            routes={routes[flFluid.name]} route={flRoute} onRouteChange={setFlRoute}
            concentrationOptions={concentrations[flFluid.name]}
            concentration={flConcentration} onConcentrationChange={setFlConcentration}
            confirmLabel={`${tc("dsAdd")} ${fluidLabel(flFluid.name)} ${flVol} mL`}
            onConfirm={onConfirm} confirmDisabled={!flVol}
          />
        </View>
      )}
      {(["Crystalloids","Colloids","Blood products","Other"] as const).map(cat => (
        <View key={cat} style={{ marginBottom:14 }}>
          <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
            letterSpacing:1, marginBottom:8 }}>{groupLabel(cat)}</Text>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
            {fluidList.filter(f => f.cat === cat).map(f => (
              <TouchableOpacity key={f.name} onPress={() => selectFluid(f)}
                style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                  backgroundColor: flFluid?.name===f.name ? f.color : f.color+"1a",
                  borderWidth:1, borderColor:f.color+"55" }}>
                <Text style={{ color: flFluid?.name===f.name ? "#fff" : f.color, fontSize:12, fontWeight:"600" }}>
                  {fluidLabel(f.name)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </Sheet>
  )
}
