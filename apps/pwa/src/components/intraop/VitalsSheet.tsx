import type { RefObject } from "react"
import { Platform, Text, TextInput, View } from "react-native"
import { FeedbackPressable } from "./FeedbackPressable"
import { Sheet } from "./Sheet"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import { capabilityMessageKey, useClinicalAiCapabilities } from "@/lib/deployment-capabilities"

type Props = {
  visible: boolean
  title: string
  mode: "bp" | "full"
  scanBusy: boolean
  showEtco2: boolean
  showTemperature: boolean
  showBis: boolean
  showTofRatio: boolean
  showCvp: boolean
  etco2Unit: string
  cvpUnit: string
  temperatureUnit: string
  sysRef: RefObject<TextInput | null>
  diaRef: RefObject<TextInput | null>
  hrRef: RefObject<TextInput | null>
  spo2Ref: RefObject<TextInput | null>
  etco2Ref: RefObject<TextInput | null>
  tempRef: RefObject<TextInput | null>
  bisRef: RefObject<TextInput | null>
  tofRatioRef: RefObject<TextInput | null>
  cvpRef: RefObject<TextInput | null>
  systolic: string
  diastolic: string
  heartRate: string
  spo2: string
  etco2: string
  temperature: string
  bis: string
  tofRatio: string
  cvp: string
  onClose: () => void
  onScan: () => void
  onSystolicChange: (value: string) => void
  onDiastolicChange: (value: string) => void
  onHeartRateChange: (value: string) => void
  onSpo2Change: (value: string) => void
  onEtco2Change: (value: string) => void
  onTemperatureChange: (value: string) => void
  onBisChange: (value: string) => void
  onTofRatioChange: (value: string) => void
  onCvpChange: (value: string) => void
  onConfirm: () => void
}

export function VitalsSheet({
  visible,
  title,
  mode,
  scanBusy,
  showEtco2,
  showTemperature,
  showBis,
  showTofRatio,
  showCvp,
  cvpUnit,
  etco2Unit,
  temperatureUnit,
  sysRef,
  diaRef,
  hrRef,
  spo2Ref,
  etco2Ref,
  tempRef,
  bisRef,
  tofRatioRef,
  cvpRef,
  systolic,
  diastolic,
  heartRate,
  spo2,
  etco2,
  temperature,
  bis,
  tofRatio,
  cvp,
  onClose,
  onScan,
  onSystolicChange,
  onDiastolicChange,
  onHeartRateChange,
  onSpo2Change,
  onEtco2Change,
  onTemperatureChange,
  onBisChange,
  onTofRatioChange,
  onCvpChange,
  onConfirm,
}: Props) {
  const { tc } = usePreferences()
  const clinicalAi = useClinicalAiCapabilities()
  return (
    <Sheet visible={visible} onClose={onClose} title={title} full>
      {clinicalAi.monitorOcr.enabled ? (
        <>
          <FeedbackPressable
            onPress={onScan}
            disabled={scanBusy}
            style={{ flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8,
              paddingVertical:10, paddingHorizontal:16, borderRadius:12, marginBottom:16,
              backgroundColor: scanBusy ? "#1e2d40" : "#0f2a1a",
              borderWidth:1, borderColor: scanBusy ? "#2a3a50" : "#22c55e55" }}>
            <Text style={{ color: scanBusy ? "#64748b" : "#86efac", fontSize:13, fontWeight:"700" }}>
              {scanBusy ? tc("vsReadingMonitor") : tc("vsScanMonitor")}
            </Text>
          </FeedbackPressable>
          {!scanBusy ? (
            <Text style={{ color:"#475569", fontSize:10, marginBottom:14, lineHeight:14 }}>
              {tc("vsScanPrivacyNote")}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={{ color:"#64748b", fontSize:11, marginBottom:14, lineHeight:16 }}>
          {tc(capabilityMessageKey(clinicalAi.monitorOcr.reason))}
        </Text>
      )}
      <Text style={{ color:"#ef4444", fontSize:11, fontWeight:"700", letterSpacing:1,
        textTransform:"uppercase", marginBottom:8 }}>{tc("vsBloodPressure")}</Text>
      <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
        <TextInput
          style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#ef4444", borderRadius:12,
            padding: Platform.OS === "web" ? 10 : 14,
            fontSize: Platform.OS === "web" ? 20 : 30,
            fontWeight:"700", borderWidth:1, borderColor:"#ef444444", textAlign:"center" }}
          placeholder={tc("vsSys")}
          placeholderTextColor="#3e3e3e"
          ref={sysRef}
          keyboardType="number-pad"
          value={systolic}
          onChangeText={onSystolicChange}
        />
        <Text style={{ color:"#475569", fontSize: Platform.OS === "web" ? 20 : 28, alignSelf:"center", fontWeight:"200" }}>/</Text>
        <TextInput
          style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#f87171", borderRadius:12,
            padding: Platform.OS === "web" ? 10 : 14,
            fontSize: Platform.OS === "web" ? 20 : 30,
            fontWeight:"700", borderWidth:1, borderColor:"#ef444433", textAlign:"center" }}
          placeholder={tc("vsDia")}
          placeholderTextColor="#3e3e3e"
          ref={diaRef}
          keyboardType="number-pad"
          value={diastolic}
          onChangeText={onDiastolicChange}
        />
      </View>

      {mode === "full" && (
        <>
          <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:"#22c55e", fontSize:11, fontWeight:"700", marginBottom:6 }}>{tc("vsHeartRate")}</Text>
              <TextInput
                style={{ backgroundColor:"#111111", color:"#22c55e", borderRadius:10,
                  padding: Platform.OS === "web" ? 9 : 12,
                  fontSize: Platform.OS === "web" ? 18 : 24,
                  fontWeight:"700", borderWidth:1, borderColor:"#22c55e33", textAlign:"center" }}
                placeholder="-"
                placeholderTextColor="#3e3e3e"
                ref={hrRef}
                keyboardType="number-pad"
                value={heartRate}
                onChangeText={onHeartRateChange}
              />
            </View>
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:"#06b6d4", fontSize:11, fontWeight:"700", marginBottom:6 }}>SpO₂ %</Text>
              <TextInput
                style={{ backgroundColor:"#111111", color:"#06b6d4", borderRadius:10,
                  padding: Platform.OS === "web" ? 9 : 12,
                  fontSize: Platform.OS === "web" ? 18 : 24,
                  fontWeight:"700", borderWidth:1, borderColor:"#06b6d433", textAlign:"center" }}
                placeholder="-"
                placeholderTextColor="#3e3e3e"
                ref={spo2Ref}
                keyboardType="number-pad"
                value={spo2}
                onChangeText={onSpo2Change}
              />
            </View>
          </View>

          {showEtco2 && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:"#f59e0b", fontSize:11, fontWeight:"700", marginBottom:6 }}>EtCO₂</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#f59e0b", borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:"#f59e0b33", textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor="#3e3e3e"
                  ref={etco2Ref}
                  keyboardType="decimal-pad"
                  value={etco2}
                  onChangeText={onEtco2Change}
                />
                <Text style={{ color:"#64748b", fontSize:10, marginTop:6 }}>
                  {formatMessage(tc("vsCurrentUnit"), { unit: etco2Unit })}
                </Text>
              </View>
            </View>
          )}

          {showTemperature && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:"#a78bfa", fontSize:11, fontWeight:"700", marginBottom:6 }}>{tc("vsTemp")}</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#a78bfa", borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:"#a78bfa33", textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor="#3e3e3e"
                  ref={tempRef}
                  keyboardType="decimal-pad"
                  value={temperature}
                  onChangeText={onTemperatureChange}
                />
                <Text style={{ color:"#64748b", fontSize:10, marginTop:6 }}>
                  {formatMessage(tc("vsCurrentUnit"), { unit: `°${temperatureUnit}` })}
                </Text>
              </View>
            </View>
          )}

          {showBis && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:"#e879f9", fontSize:11, fontWeight:"700", marginBottom:6 }}>BIS</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#e879f9", borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:"#e879f933", textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor="#3e3e3e"
                  ref={bisRef}
                  keyboardType="decimal-pad"
                  value={bis}
                  onChangeText={onBisChange}
                />
              </View>
            </View>
          )}

          {showTofRatio && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:"#fb923c", fontSize:11, fontWeight:"700", marginBottom:6 }}>TOF</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#fb923c", borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:"#fb923c33", textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor="#3e3e3e"
                  ref={tofRatioRef}
                  keyboardType="decimal-pad"
                  value={tofRatio}
                  onChangeText={onTofRatioChange}
                />
                <Text style={{ color:"#64748b", fontSize:10, marginTop:6 }}>{tc("tofRatioLabel")}</Text>
              </View>
            </View>
          )}

          {showCvp && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:"#38bdf8", fontSize:11, fontWeight:"700", marginBottom:6 }}>CVP</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#38bdf8", borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:"#38bdf833", textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor="#3e3e3e"
                  ref={cvpRef}
                  keyboardType="decimal-pad"
                  value={cvp}
                  onChangeText={onCvpChange}
                />
                <Text style={{ color:"#64748b", fontSize:10, marginTop:6 }}>{formatMessage(tc("vsCurrentUnit"), { unit: cvpUnit })}</Text>
              </View>
            </View>
          )}

        </>
      )}

      {mode === "bp" && (
        <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
          <View style={{ flex:1 }}>
            <Text style={{ color:"#22c55e", fontSize:11, fontWeight:"700", marginBottom:6 }}>{tc("vsHeartRate")}</Text>
            <TextInput
              style={{ backgroundColor:"#111111", color:"#22c55e", borderRadius:10,
                padding: Platform.OS === "web" ? 9 : 12,
                fontSize: Platform.OS === "web" ? 18 : 24,
                fontWeight:"700", borderWidth:1, borderColor:"#22c55e33", textAlign:"center" }}
              placeholder="-"
              placeholderTextColor="#3e3e3e"
              ref={hrRef}
              keyboardType="number-pad"
              value={heartRate}
              onChangeText={onHeartRateChange}
            />
          </View>
        </View>
      )}

      <FeedbackPressable onPress={onConfirm}
        style={{ backgroundColor:"#0f2a1a", borderRadius:14, padding:18, alignItems:"center",
          borderWidth:1, borderColor:"#22c55e" }}>
        <Text style={{ color:"#86efac", fontSize:16, fontWeight:"700" }}>{tc("vsSaveVitals")}</Text>
      </FeedbackPressable>
    </Sheet>
  )
}
