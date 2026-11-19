import { Text, TouchableOpacity, View } from "react-native"
import { VitalStepper } from "@/components/VitalStepper"
import { FIO2, FRESH_GAS_FLOW, gasQuickValues, snapFreshGasFlow, stepFreshGasFlow } from "@lospor/core/gas-ranges"
import { Sheet } from "./Sheet"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

type CarrierGas = string | null

type Props = {
  visible: boolean
  isEditing: boolean
  fgf: number | null
  carrierGas: CarrierGas
  fio2: number
  onClose: () => void
  onFgfChange: (value: number | null) => void
  onCarrierGasChange: (value: CarrierGas) => void
  onFio2Change: (value: number) => void
  onConfirm: () => void
  pediatricMode?: boolean
  /** The hospital's guidance switch: the quick values are offered only with it on, and not for a child. */
  prospectiveGuidanceEnabled?: boolean
}

/** A row of quick-value buttons; the one equal to the current value is filled. */
function QuickValues({ values, current, unit, onPick, disabled = false, testID }: {
  values: readonly number[]
  current: number | null
  unit: string
  onPick: (value: number) => void
  disabled?: boolean
  testID: string
}) {
  const shade = useShade()
  if (values.length === 0) return null
  return (
    <View testID={testID} style={{ flexDirection:"row", gap:8, marginBottom:10, opacity: disabled ? 0.45 : 1 }}>
      {values.map(value => (
        <TouchableOpacity key={value} testID={`${testID}-${value}`} disabled={disabled} onPress={() => onPick(value)}
          accessibilityLabel={`${value} ${unit}`}
          style={{ flex:1, paddingVertical:9, borderRadius:10, alignItems:"center", borderWidth:1.5,
            borderColor: current === value ? shade("#6366f1") : shade("#1e2d40"),
            backgroundColor: current === value ? shade("#4338ca") : shade("#111111") }}>
          <Text style={{ color: current === value ? shade("#fff") : shade("#a5b4fc"), fontSize:13, fontWeight:"800" }}>{value}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
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
  prospectiveGuidanceEnabled = true,
}: Props) {
  const shade = useShade()
  const { language, tc } = usePreferences()
  // One set for web and phone (core): suggestions only for an adult with guidance on.
  const quick = gasQuickValues({ guidance: prospectiveGuidanceEnabled, paediatric: pediatricMode })

  return (
    <Sheet visible={visible} onClose={onClose} title={isEditing ? tc("gasEditTitle") : tc("gasStartTitle")}>
      <View style={{ gap: 16 }}>
        {pediatricMode ? (
          <Text style={{ color:shade("#fbbf24"), fontSize:12, lineHeight:17 }}>
            {tc("pediatricManualFgf")}
          </Text>
        ) : null}
        <View>
          <View style={{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 }}>
            <Text style={{ color:shade("#94a3b8"), fontSize:12, fontWeight:"700" }}>FGF</Text>
            <Text style={{ color:shade("#a5b4fc"), fontWeight:"700" }}>{fgf != null ? `${fgf} L/min` : "—"}</Text>
          </View>
          {/* 10.2.0: 0-20 L/min, 0.1 steps to 5 (low flow) and 0.5 above; typed to 100 (core gas-ranges). */}
          <VitalStepper value={fgf} onChange={onFgfChange} min={FRESH_GAS_FLOW.min} max={FRESH_GAS_FLOW.sliderMax} manualMax={FRESH_GAS_FLOW.typedMax}
            step={FRESH_GAS_FLOW.fineStep} precision={1} unit="L/min" snap={snapFreshGasFlow} stepBy={stepFreshGasFlow} />
          <QuickValues testID="gas-fgf-quick" values={quick.freshGasFlow} current={fgf} unit="L/min" onPick={onFgfChange} />
        </View>
        <View>
          <Text style={{ color:shade("#94a3b8"), fontSize:12, fontWeight:"700", marginBottom:8 }}>{tc("carrierGasLabel")}</Text>
          <View style={{ flexDirection:"row", gap:8 }}>
            {CARRIER_GAS_OPTIONS.map(g => (
              <TouchableOpacity key={g.key ?? "o2"} onPress={() => onCarrierGasChange(g.key)}
                style={{ flex:1, paddingVertical:11, paddingHorizontal:6, borderRadius:10, alignItems:"center", justifyContent:"center", borderWidth:1.5,
                  borderColor: carrierGas === g.key ? shade("#6366f1") : shade("#1e2d40"),
                  backgroundColor: carrierGas === g.key ? shade("#4338ca") : shade("#111111") }}>
                <Text style={{ color: carrierGas === g.key ? shade("#fff") : shade("#64748b"), fontSize:13, fontWeight:"800", textAlign:"center" }}>{displayClinicalCode("carrierGas", g.key ?? "o2", language, { label: g.label })}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View>
          <View style={{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 }}>
            <Text style={{ color:shade("#94a3b8"), fontSize:12, fontWeight:"700" }}>FiO2</Text>
            <Text style={{ color:shade("#a5b4fc"), fontWeight:"700" }}>{fio2}%</Text>
          </View>
          <VitalStepper value={carrierGas == null ? 100 : fio2} onChange={v => onFio2Change(v ?? FIO2.min)} min={FIO2.min} max={FIO2.max} step={FIO2.step} unit="%" disabled={carrierGas == null} />
          <QuickValues testID="gas-fio2-quick" values={quick.fio2} current={carrierGas == null ? 100 : fio2} unit="%" onPick={onFio2Change} disabled={carrierGas == null} />
        </View>
        <TouchableOpacity onPress={onConfirm}
          style={{ backgroundColor:shade("#6366f1"), borderRadius:12, padding:16, alignItems:"center" }}>
          <Text style={{ color:shade("#fff"), fontWeight:"700" }}>{isEditing ? tc("applyLabel") : tc("startLabel")}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}
