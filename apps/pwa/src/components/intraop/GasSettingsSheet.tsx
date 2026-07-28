import { Text, TouchableOpacity, View } from "react-native"
import { VitalStepper } from "@/components/VitalStepper"
import { Sheet } from "./Sheet"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

type CarrierGas = string | null

type Props = {
  visible: boolean
  isEditing: boolean
  fgf: number
  carrierGas: CarrierGas
  fio2: number
  onClose: () => void
  onFgfChange: (value: number) => void
  onCarrierGasChange: (value: CarrierGas) => void
  onFio2Change: (value: number) => void
  onConfirm: () => void
}

const CARRIER_GAS_OPTIONS: { key: CarrierGas; label: string }[] = [
  { key: null, label: "O2 only" },
  { key: "air", label: "+ Air" },
  { key: "n2o", label: "+ N2O" },
]

export function GasSettingsSheet({
  visible,
  isEditing,
  fgf,
  carrierGas,
  fio2,
  onClose,
  onFgfChange,
  onCarrierGasChange,
  onFio2Change,
  onConfirm,
}: Props) {
  const { language } = usePreferences()

  return (
    <Sheet visible={visible} onClose={onClose} title={isEditing ? "Edit gas settings" : "Start gas settings"}>
      <View style={{ gap: 16 }}>
        <View>
          <View style={{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 }}>
            <Text style={{ color:"#94a3b8", fontSize:12, fontWeight:"700" }}>FGF</Text>
            <Text style={{ color:"#a5b4fc", fontWeight:"700" }}>{fgf} L/min</Text>
          </View>
          <VitalStepper value={fgf} onChange={v => onFgfChange(v ?? 0)} min={0} max={10} step={0.5} precision={1} unit="L/min" />
        </View>
        <View>
          <Text style={{ color:"#94a3b8", fontSize:12, fontWeight:"700", marginBottom:8 }}>Carrier gas</Text>
          <View style={{ flexDirection:"row", gap:8 }}>
            {CARRIER_GAS_OPTIONS.map(g => (
              <TouchableOpacity key={g.key ?? "o2"} onPress={() => onCarrierGasChange(g.key)}
                style={{ flex:1, paddingVertical:11, borderRadius:10, alignItems:"center", borderWidth:1.5,
                  borderColor: carrierGas === g.key ? "#6366f1" : "#1e2d40",
                  backgroundColor: carrierGas === g.key ? "#4338ca" : "#111111" }}>
                <Text style={{ color: carrierGas === g.key ? "#fff" : "#64748b", fontSize:13, fontWeight:"800" }}>{displayClinicalCode("carrierGas", g.key ?? "o2", language, { label: g.label })}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View>
          <View style={{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 }}>
            <Text style={{ color:"#94a3b8", fontSize:12, fontWeight:"700" }}>FiO2</Text>
            <Text style={{ color:"#a5b4fc", fontWeight:"700" }}>{fio2}%</Text>
          </View>
          <VitalStepper value={carrierGas == null ? 100 : fio2} onChange={v => onFio2Change(v ?? 21)} min={21} max={100} step={1} unit="%" disabled={carrierGas == null} />
        </View>
        <TouchableOpacity onPress={onConfirm}
          style={{ backgroundColor:"#6366f1", borderRadius:12, padding:16, alignItems:"center" }}>
          <Text style={{ color:"#fff", fontWeight:"700" }}>{isEditing ? "Apply" : "Start"}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}
