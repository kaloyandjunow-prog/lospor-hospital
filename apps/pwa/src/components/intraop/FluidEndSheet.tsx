import { View, Text, TouchableOpacity, TextInput } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import type { ActiveFluid } from "@/lib/intraop-log-event"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

export function FluidEndSheet({
  visible, onClose, target, customAmount, setCustomAmount, onConfirm,
}: {
  visible: boolean
  onClose: () => void
  target: ActiveFluid | null
  customAmount: string
  setCustomAmount: (v: string) => void
  onConfirm: (label?: string) => void
}) {
  const { tc, language } = usePreferences()
  const fluidLabel = (name: string) => displayClinicalCode("option:INTRAOP_FLUID", name, language, { label: name })

  return (
    <Sheet visible={visible} onClose={onClose} title={target ? `${tc("trEndFluid")}: ${fluidLabel(target.name)}` : tc("trEndFluid")}>
      {target && (
        <View style={{ gap:10 }}>
          <TouchableOpacity onPress={() => onConfirm()}
            style={{ backgroundColor:"#0f2a1a", borderRadius:12, padding:16, alignItems:"center",
              borderWidth:1, borderColor:"#22c55e" }}>
            <Text style={{ color:"#86efac", fontWeight:"700", fontSize:15 }}>
              Full bag ({target.volume} mL)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onConfirm("partial")}
            style={{ backgroundColor:"#1c2a1a", borderRadius:12, padding:16, alignItems:"center",
              borderWidth:1, borderColor:"#22c55e44" }}>
            <Text style={{ color:"#4ade80", fontWeight:"700" }}>Partial — bag not finished</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", gap:8, alignItems:"center" }}>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                fontSize:18, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
              placeholder="Custom mL given" placeholderTextColor="#475569"
              keyboardType="number-pad" value={customAmount} onChangeText={setCustomAmount}
            />
            <TouchableOpacity onPress={() => onConfirm(customAmount + " mL")}
              disabled={!customAmount}
              style={{ backgroundColor: customAmount ? "#22c55e" : "#1c1c1c", borderRadius:10,
                padding:14, borderWidth:1, borderColor:"#22c55e44" }}>
              <Text style={{ color:"#fff", fontWeight:"700" }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Sheet>
  )
}
