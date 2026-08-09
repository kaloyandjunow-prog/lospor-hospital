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
  pediatricMode?: boolean
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
  pediatricMode = false,
}: Props) {
  const { language } = usePreferences()

  return (
    <Sheet visible={visible} onClose={onClose} title={isEditing ? "Edit gas settings" : "Start gas settings"}>
      <View style={{ gap: 16 }}>
        {pediatricMode ? (
          <Text style={{ color:"#fbbf24", fontSize:12, lineHeight:17 }}>
            {language === "bg"
              ? "\u041d\u044f\u043c\u0430 \u043a\u043b\u0438\u043d\u0438\u0447\u043d\u043e \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0430 \u043f\u0435\u0434\u0438\u0430\u0442\u0440\u0438\u0447\u043d\u0430 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u043f\u043e \u043f\u043e\u0434\u0440\u0430\u0437\u0431\u0438\u0440\u0430\u043d\u0435. \u0412\u044a\u0432\u0435\u0434\u0435\u0442\u0435 \u0440\u044a\u0447\u043d\u043e \u0441\u0432\u0435\u0436\u0438\u044f \u0433\u0430\u0437\u043e\u0432 \u043f\u043e\u0442\u043e\u043a."
              : "No pediatric default is clinically approved. Enter the fresh-gas flow manually."}
          </Text>
        ) : null}
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
        <TouchableOpacity onPress={onConfirm} disabled={fgf <= 0}
          style={{ backgroundColor:fgf > 0 ? "#6366f1" : "#1e2d40", borderRadius:12, padding:16, alignItems:"center" }}>
          <Text style={{ color:"#fff", fontWeight:"700" }}>{isEditing ? "Apply" : "Start"}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}
