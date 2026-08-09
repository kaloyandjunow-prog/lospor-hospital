import { View, Text, TouchableOpacity, TextInput } from "react-native"

import { Sheet } from "@/components/intraop/Sheet"
import { VitalStepper } from "@/components/VitalStepper"
import {
  calculatedFluidVolumeMl,
  FLUID_RATE_SLIDER,
  fluidEntryModeOf,
} from "@/lib/fluid-entry"
import type { ActiveFluid } from "@/lib/intraop-log-event"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

export function FluidEndSheet({
  visible,
  onClose,
  target,
  customAmount,
  setCustomAmount,
  onConfirm,
  newRate,
  setNewRate,
  onChangeRate,
}: {
  visible: boolean
  onClose: () => void
  target: ActiveFluid | null
  customAmount: string
  setCustomAmount: (value: string) => void
  onConfirm: (administeredVolumeMl?: number) => void
  newRate: string
  setNewRate: (rate: string) => void
  onChangeRate: () => void
}) {
  const { tc, language } = usePreferences()
  const fluidLabel = (name: string) => displayClinicalCode("option:INTRAOP_FLUID", name, language, { label: name })
  const rateMode = target ? fluidEntryModeOf(target) === "RATE" : false
  const changedRate = !!target && Number(newRate) > 0 && newRate !== target.rate

  return (
    <Sheet visible={visible} onClose={onClose} title={target ? `${tc("trEndFluid")}: ${fluidLabel(target.name)}` : tc("trEndFluid")}>
      {target ? (
        <View style={{ gap:10 }}>
          {rateMode ? (
            <View style={{ gap:10, marginBottom:6 }}>
              <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase" }}>
                Rate
              </Text>
              <VitalStepper
                value={newRate ? Number(newRate) : undefined}
                onChange={value => setNewRate(value == null ? "" : String(value))}
                min={FLUID_RATE_SLIDER.min}
                max={FLUID_RATE_SLIDER.max}
                manualMax={Number.MAX_SAFE_INTEGER}
                step={FLUID_RATE_SLIDER.step}
                unit="mL/h"
                placeholder="Rate"
              />
              <TouchableOpacity
                testID="fluid-change-rate"
                onPress={onChangeRate}
                disabled={!changedRate}
                style={{ backgroundColor:changedRate ? "#0891b2" : "#1c1c1c", borderRadius:10, padding:12, alignItems:"center" }}
              >
                <Text style={{ color:"#fff", fontWeight:"700" }}>Change rate</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            testID="fluid-stop-default"
            onPress={() => onConfirm()}
            style={{ backgroundColor:"#0f2a1a", borderRadius:12, padding:16, alignItems:"center",
              borderWidth:1, borderColor:"#22c55e" }}
          >
            <Text style={{ color:"#86efac", fontWeight:"700", fontSize:15 }}>
              {rateMode
                ? `Stop · calculated ${calculatedFluidVolumeMl(target)} mL`
                : `Full bag (${target.bagVolumeMl ?? target.volume} mL)`}
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection:"row", gap:8, alignItems:"center" }}>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                fontSize:18, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
              placeholder="Actual mL given"
              placeholderTextColor="#475569"
              keyboardType="number-pad"
              value={customAmount}
              onChangeText={setCustomAmount}
            />
            <TouchableOpacity
              testID="fluid-stop-actual"
              onPress={() => onConfirm(Number(customAmount))}
              disabled={!customAmount || !Number.isFinite(Number(customAmount)) || Number(customAmount) < 0}
              style={{ backgroundColor:customAmount ? "#22c55e" : "#1c1c1c", borderRadius:10,
                padding:14, borderWidth:1, borderColor:"#22c55e44" }}
            >
              <Text style={{ color:"#fff", fontWeight:"700" }}>Use actual</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}
