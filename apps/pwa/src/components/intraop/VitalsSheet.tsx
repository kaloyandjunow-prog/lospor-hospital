import { Platform, Text, TextInput, View } from "react-native"
import { FeedbackPressable } from "./FeedbackPressable"
import { MonitorScanButton } from "./MonitorScanButton"
import { vitalFeedbackText } from "./vitals-feedback-text"
import { Sheet } from "./Sheet"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import type { IntraopVitalKey } from "@lospor/core/intraop-vitals"
import type { VitalsSheetProps } from "./VitalsSheetProps"
import { useShade } from "@/theme/shade"


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
  showIbp,
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
  ibp,
  onIbpChange,
  feedback,
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
}: VitalsSheetProps) {
  const shade = useShade()
  const { tc } = usePreferences()
  const feedbackText = (field: IntraopVitalKey) => vitalFeedbackText(feedback, field, tc as never)
  function renderFeedback(field: IntraopVitalKey) {
    const message = feedbackText(field)
    return message ? (
      <Text style={{ color: message.error ? shade("#f87171") : shade("#f59e0b"), fontSize:12, marginTop:6, lineHeight:14 }}>
        {message.text}
      </Text>
    ) : null
  }
  const hasExtendedHardError = !!(
    feedback.errors.spO2
    || feedback.errors.etco2
    || feedback.errors.temp
    || feedback.errors.bis
    || feedback.errors.tofRatio
    || feedback.errors.cvp
  )
  // BP-only entry and monitoring visibility must never hide the field that is
  // blocking Save. Reveal the extended section only while it has an error, so
  // the clinician can see and correct the exact value without changing setup.
  const showExtendedFields = mode === "full" || hasExtendedHardError
  return (
    <Sheet visible={visible} onClose={onClose} title={title} full>
      <MonitorScanButton onScan={onScan} busy={scanBusy} />
      <Text style={{ color:shade("#ef4444"), fontSize:12, fontWeight:"700", letterSpacing:1,
        textTransform:"uppercase", marginBottom:8 }}>{showIbp ? tc("vsNibp") : tc("vsBloodPressure")}</Text>
      <View style={{ flexDirection:"row", gap:10, marginBottom:18, alignItems:"flex-start" }}>
        <View style={{ flex:1, minWidth:0 }}>
          <View style={{ position: "relative" }}><TextInput
            style={{ backgroundColor:shade("#111111"), color:shade("#ef4444"), borderRadius:12,
              padding: Platform.OS === "web" ? 10 : 12,
              fontSize: Platform.OS === "web" ? 18 : 22,
              fontWeight:"700", borderWidth:1, borderColor:feedback.errors.systolic ? shade("#f87171") : shade("#ef444444"), textAlign:"center" }}
            placeholder={tc("vsSys")}
            placeholderTextColor={shade("#3e3e3e")}
            ref={sysRef}
            keyboardType="number-pad"
            value={systolic}
            onChangeText={onSystolicChange}
          />
<VitalClear value={systolic} onClear={() => onSystolicChange("")} /></View>
          {renderFeedback("systolic")}
        </View>
        <View style={{ flex:1, minWidth:0 }}>
          <View style={{ position: "relative" }}><TextInput
            style={{ backgroundColor:shade("#111111"), color:shade("#f87171"), borderRadius:12,
              padding: Platform.OS === "web" ? 10 : 12,
              fontSize: Platform.OS === "web" ? 18 : 22,
              fontWeight:"700", borderWidth:1, borderColor:feedback.errors.diastolic ? shade("#f87171") : shade("#ef444433"), textAlign:"center" }}
            placeholder={tc("vsDia")}
            placeholderTextColor={shade("#3e3e3e")}
            ref={diaRef}
            keyboardType="number-pad"
            value={diastolic}
            onChangeText={onDiastolicChange}
          />
<VitalClear value={diastolic} onClear={() => onDiastolicChange("")} /></View>
          {renderFeedback("diastolic")}
        </View>
        <View style={{ flex:1, minWidth:0 }}>
          <View style={{ position: "relative" }}><TextInput testID="vitals-nibp-map" style={{ backgroundColor:shade("#111111"), color:shade("#f87171"), borderRadius:12,
            padding: Platform.OS === "web" ? 10 : 12,
            fontSize: Platform.OS === "web" ? 18 : 22,
            fontWeight:"700", borderWidth:1, borderColor:feedback.errors.nibpMap ? shade("#f87171") : shade("#f8717144"), textAlign:"center" }}
            placeholder={tc("vsMapInlinePlaceholder")} placeholderTextColor={shade("#3e3e3e")} keyboardType="number-pad" value={ibp.nibpMap} onChangeText={value => onIbpChange("nibpMap", value)} />
<VitalClear value={ibp.nibpMap} onClear={() => onIbpChange("nibpMap", "")} /></View>
          {renderFeedback("nibpMap")}
        </View>
      </View>

      {showIbp ? (
        <View testID="vitals-ibp">
          <Text style={{ color:shade("#f97316"), fontSize:12, fontWeight:"700", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>{tc("vsIbp")}</Text>
          <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:shade("#f97316"), fontSize:12, fontWeight:"700", marginBottom:6 }}>{tc("vsSys")}</Text>
              <View style={{ position: "relative" }}><TextInput testID="vitals-ibp-systolic" style={{ backgroundColor:shade("#111111"), color:shade("#f97316"), borderRadius:10, padding: Platform.OS === "web" ? 8 : 10,
                fontSize: Platform.OS === "web" ? 16 : 20, fontWeight:"700", borderWidth:1, borderColor:feedback.errors.ibpSystolic ? shade("#f87171") : shade("#f9731644"), textAlign:"center" }}
                placeholder="-" placeholderTextColor={shade("#3e3e3e")} keyboardType="number-pad" value={ibp.ibpSystolic} onChangeText={value => onIbpChange("ibpSystolic", value)} />
<VitalClear value={ibp.ibpSystolic} onClear={() => onIbpChange("ibpSystolic", "")} /></View>
              {renderFeedback("ibpSystolic")}
            </View>
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:shade("#fb923c"), fontSize:12, fontWeight:"700", marginBottom:6 }}>{tc("vsDia")}</Text>
              <View style={{ position: "relative" }}><TextInput testID="vitals-ibp-diastolic" style={{ backgroundColor:shade("#111111"), color:shade("#fb923c"), borderRadius:10, padding: Platform.OS === "web" ? 8 : 10,
                fontSize: Platform.OS === "web" ? 16 : 20, fontWeight:"700", borderWidth:1, borderColor:feedback.errors.ibpDiastolic ? shade("#f87171") : shade("#fb923c44"), textAlign:"center" }}
                placeholder="-" placeholderTextColor={shade("#3e3e3e")} keyboardType="number-pad" value={ibp.ibpDiastolic} onChangeText={value => onIbpChange("ibpDiastolic", value)} />
<VitalClear value={ibp.ibpDiastolic} onClear={() => onIbpChange("ibpDiastolic", "")} /></View>
              {renderFeedback("ibpDiastolic")}
            </View>
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:shade("#fdba74"), fontSize:12, fontWeight:"700", marginBottom:6 }}>{tc("vsMap")}</Text>
              <View style={{ position: "relative" }}><TextInput testID="vitals-ibp-map" style={{ backgroundColor:shade("#111111"), color:shade("#fdba74"), borderRadius:10, padding: Platform.OS === "web" ? 8 : 10,
                fontSize: Platform.OS === "web" ? 16 : 20, fontWeight:"700", borderWidth:1, borderColor:feedback.errors.ibpMap ? shade("#f87171") : shade("#fdba7444"), textAlign:"center" }}
                placeholder="-" placeholderTextColor={shade("#3e3e3e")} keyboardType="number-pad" value={ibp.ibpMap} onChangeText={value => onIbpChange("ibpMap", value)} />
<VitalClear value={ibp.ibpMap} onClear={() => onIbpChange("ibpMap", "")} /></View>
              {renderFeedback("ibpMap")}
            </View>
          </View>
        </View>
      ) : null}
      {showExtendedFields && (
        <>
          <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:shade("#22c55e"), fontSize:12, fontWeight:"700", marginBottom:6 }}>{tc("vsHeartRate")}</Text>
              <View style={{ position: "relative" }}><TextInput
                style={{ backgroundColor:shade("#111111"), color:shade("#22c55e"), borderRadius:10,
                  padding: Platform.OS === "web" ? 9 : 12,
                  fontSize: Platform.OS === "web" ? 18 : 24,
                  fontWeight:"700", borderWidth:1, borderColor:shade("#22c55e33"), textAlign:"center" }}
                placeholder="-"
                placeholderTextColor={shade("#3e3e3e")}
                ref={hrRef}
                keyboardType="number-pad"
                value={heartRate}
                onChangeText={onHeartRateChange}
              />
<VitalClear value={heartRate} onClear={() => onHeartRateChange("")} /></View>
              {renderFeedback("heartRate")}
            </View>
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:shade("#06b6d4"), fontSize:12, fontWeight:"700", marginBottom:6 }}>SpO₂ %</Text>
              <View style={{ position: "relative" }}><TextInput
                style={{ backgroundColor:shade("#111111"), color:shade("#06b6d4"), borderRadius:10,
                  padding: Platform.OS === "web" ? 9 : 12,
                  fontSize: Platform.OS === "web" ? 18 : 24,
                  fontWeight:"700", borderWidth:1, borderColor:shade("#06b6d433"), textAlign:"center" }}
                placeholder="-"
                placeholderTextColor={shade("#3e3e3e")}
                ref={spo2Ref}
                keyboardType="number-pad"
                value={spo2}
                onChangeText={onSpo2Change}
              />
<VitalClear value={spo2} onClear={() => onSpo2Change("")} /></View>
              {renderFeedback("spO2")}
            </View>
          </View>

          {(showEtco2 || feedback.errors.etco2) && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:shade("#f59e0b"), fontSize:12, fontWeight:"700", marginBottom:6 }}>EtCO₂</Text>
                <View style={{ position: "relative" }}><TextInput
                  style={{ backgroundColor:shade("#111111"), color:shade("#f59e0b"), borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:shade("#f59e0b33"), textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor={shade("#3e3e3e")}
                  ref={etco2Ref}
                  keyboardType="decimal-pad"
                  value={etco2}
                  onChangeText={onEtco2Change}
                />
<VitalClear value={etco2} onClear={() => onEtco2Change("")} /></View>
                <Text style={{ color:shade("#64748b"), fontSize:12, marginTop:6 }}>
                  {formatMessage(tc("vsCurrentUnit"), { unit: etco2Unit })}
                </Text>
                {renderFeedback("etco2")}
              </View>
            </View>
          )}

          {(showTemperature || feedback.errors.temp) && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:shade("#a78bfa"), fontSize:12, fontWeight:"700", marginBottom:6 }}>{tc("vsTemp")}</Text>
                <View style={{ position: "relative" }}><TextInput
                  style={{ backgroundColor:shade("#111111"), color:shade("#a78bfa"), borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:shade("#a78bfa33"), textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor={shade("#3e3e3e")}
                  ref={tempRef}
                  keyboardType="decimal-pad"
                  value={temperature}
                  onChangeText={onTemperatureChange}
                />
<VitalClear value={temperature} onClear={() => onTemperatureChange("")} /></View>
                <Text style={{ color:shade("#64748b"), fontSize:12, marginTop:6 }}>
                  {formatMessage(tc("vsCurrentUnit"), { unit: `°${temperatureUnit}` })}
                </Text>
                {renderFeedback("temp")}
              </View>
            </View>
          )}

          {(showBis || feedback.errors.bis) && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:shade("#e879f9"), fontSize:12, fontWeight:"700", marginBottom:6 }}>BIS</Text>
                <View style={{ position: "relative" }}><TextInput
                  style={{ backgroundColor:shade("#111111"), color:shade("#e879f9"), borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:shade("#e879f933"), textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor={shade("#3e3e3e")}
                  ref={bisRef}
                  keyboardType="decimal-pad"
                  value={bis}
                  onChangeText={onBisChange}
                />
<VitalClear value={bis} onClear={() => onBisChange("")} /></View>
                {renderFeedback("bis")}
              </View>
            </View>
          )}

          {(showTofRatio || feedback.errors.tofRatio) && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:shade("#fb923c"), fontSize:12, fontWeight:"700", marginBottom:6 }}>TOF</Text>
                <View style={{ position: "relative" }}><TextInput
                  style={{ backgroundColor:shade("#111111"), color:shade("#fb923c"), borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:shade("#fb923c33"), textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor={shade("#3e3e3e")}
                  ref={tofRatioRef}
                  keyboardType="decimal-pad"
                  value={tofRatio}
                  onChangeText={onTofRatioChange}
                />
<VitalClear value={tofRatio} onClear={() => onTofRatioChange("")} /></View>
                <Text style={{ color:shade("#64748b"), fontSize:12, marginTop:6 }}>{tc("vsTofRatioHint")}</Text>
                {renderFeedback("tofRatio")}
              </View>
            </View>
          )}

          {(showCvp || feedback.errors.cvp) && (
            <View style={{ flexDirection:"row", gap:10, marginBottom:14 }}>
              <View style={{ flex:1, minWidth:0 }}>
                <Text style={{ color:shade("#38bdf8"), fontSize:12, fontWeight:"700", marginBottom:6 }}>CVP</Text>
                <View style={{ position: "relative" }}><TextInput
                  style={{ backgroundColor:shade("#111111"), color:shade("#38bdf8"), borderRadius:10,
                    padding: Platform.OS === "web" ? 8 : 10,
                    fontSize: Platform.OS === "web" ? 16 : 20,
                    fontWeight:"600", borderWidth:1, borderColor:shade("#38bdf833"), textAlign:"center" }}
                  placeholder="-"
                  placeholderTextColor={shade("#3e3e3e")}
                  ref={cvpRef}
                  keyboardType="decimal-pad"
                  value={cvp}
                  onChangeText={onCvpChange}
                />
<VitalClear value={cvp} onClear={() => onCvpChange("")} /></View>
                <Text style={{ color:shade("#64748b"), fontSize:12, marginTop:6 }}>{formatMessage(tc("vsCurrentUnit"), { unit: cvpUnit })}</Text>
                {renderFeedback("cvp")}
              </View>
            </View>
          )}

        </>
      )}

      {mode === "bp" && !showExtendedFields && (
        <View style={{ flexDirection:"row", gap:10, marginBottom:18 }}>
          <View style={{ flex:1 }}>
            <Text style={{ color:shade("#22c55e"), fontSize:12, fontWeight:"700", marginBottom:6 }}>{tc("vsHeartRate")}</Text>
            <View style={{ position: "relative" }}><TextInput
              style={{ backgroundColor:shade("#111111"), color:shade("#22c55e"), borderRadius:10,
                padding: Platform.OS === "web" ? 9 : 12,
                fontSize: Platform.OS === "web" ? 18 : 24,
                fontWeight:"700", borderWidth:1, borderColor:shade("#22c55e33"), textAlign:"center" }}
              placeholder="-"
              placeholderTextColor={shade("#3e3e3e")}
              ref={hrRef}
              keyboardType="number-pad"
              value={heartRate}
              onChangeText={onHeartRateChange}
            />
<VitalClear value={heartRate} onClear={() => onHeartRateChange("")} /></View>
            {renderFeedback("heartRate")}
          </View>
        </View>
      )}

      <FeedbackPressable onPress={onConfirm} disabled={feedback.hasHardErrors}
        accessibilityState={{ disabled: feedback.hasHardErrors }}
        style={{ backgroundColor:feedback.hasHardErrors ? shade("#1e293b") : shade("#0f2a1a"), borderRadius:14, padding:18, alignItems:"center",
          borderWidth:1, borderColor:feedback.hasHardErrors ? shade("#475569") : shade("#22c55e") }}>
        <Text style={{ color:feedback.hasHardErrors ? shade("#64748b") : shade("#86efac"), fontSize:16, fontWeight:"700" }}>{tc("vsSaveVitals")}</Text>
      </FeedbackPressable>
    </Sheet>
  )
}

/** The quick clear of one vitals field (10.8.0): a 44 px target over the field's right edge. */
function VitalClear({ value, onClear }: { value: string | undefined; onClear: () => void }) {
  const shade = useShade()
  const { tc } = usePreferences()
  if (!value) return null
  return (
    <FeedbackPressable accessibilityRole="button" accessibilityLabel={tc("vsClearField")} onPress={onClear} testID="vital-clear"
      style={{ position: "absolute", right: 0, top: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center", zIndex: 2 }}>
      <Text style={{ color: shade("#94a3b8"), fontSize: 18, fontWeight: "800" }}>×</Text>
    </FeedbackPressable>
  )
}
