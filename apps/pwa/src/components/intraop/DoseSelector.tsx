import { View, Text, TouchableOpacity } from "react-native"
import { VitalStepper } from "@/components/VitalStepper"
import { FeedbackPressable } from "./FeedbackPressable"

// One reused dose-entry block for drugs (bolus), infusions, fluids, and
// agents — extracted out of DrugSheet/InfusionSheet/InfusionActionSheet/
// FluidSheet/AgentSheet, which used to each hand-roll their own near-
// duplicate quick-pill + stepper layout. Per-category rows are toggled by
// which optional props are passed, not a category switch inside this file.
//
// The −/value/+ + slider control reuses VitalStepper as-is (same component
// preop vitals use) rather than building a second slider implementation —
// it already has hold-to-repeat, a PanResponder slider, and a custom keypad.
//
// Canonical unit/range/route DATA is intentionally not addressed here —
// this is the generic shell; the canonical library is a separate, later pass.

export type DoseSelectorProps = {
  color?: string
  hint?: string
  extraHint?: string

  quickValues?: number[]
  quickValue?: number

  value: string
  onValueChange: (v: string) => void
  min: number
  max: number
  step?: number
  precision?: number
  valuePlaceholder?: string

  units?: string[]
  unit?: string
  onUnitChange?: (u: string) => void
  unitSuffix?: string

  routes?: string[]
  route?: string
  onRouteChange?: (r: string) => void

  concentrationOptions?: string[]
  concentration?: string
  onConcentrationChange?: (c: string | undefined) => void

  // Omit both when the caller needs to combine this picker's value with
  // something else (e.g. agents also pick N2O%) behind one outer button.
  confirmLabel?: string
  onConfirm?: () => void
  confirmDisabled?: boolean
}

export function DoseSelector({
  color = "#8b5cf6", hint, extraHint,
  quickValues, quickValue,
  value, onValueChange, min, max, step = 1, precision: precisionProp, valuePlaceholder = "Value",
  units, unit, onUnitChange, unitSuffix,
  routes, route, onRouteChange,
  concentrationOptions, concentration, onConcentrationChange,
  confirmLabel, onConfirm, confirmDisabled,
}: DoseSelectorProps) {
  const precision = precisionProp ?? (() => {
    const s = String(step)
    const dot = s.indexOf(".")
    return dot >= 0 ? s.length - dot - 1 : 0
  })()
  const num = parseFloat(value) || 0

  return (
    <View>
      {hint && <Text style={{ color, fontSize: 12, fontWeight: "600", marginBottom: 10 }}>{hint}</Text>}

      {concentrationOptions && concentrationOptions.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Concentration</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {concentrationOptions.map(c => (
              <TouchableOpacity key={c} onPress={() => onConcentrationChange?.(concentration === c ? undefined : c)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                  backgroundColor: concentration === c ? "#0ea5e9" : "#0ea5e91a", borderColor: "#0ea5e955" }}>
                <Text style={{ color: concentration === c ? "#fff" : "#0ea5e9", fontWeight: "700", fontSize: 13 }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {quickValues && quickValues.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {quickValues.map(qv => (
            <TouchableOpacity key={qv} onPress={() => onValueChange(String(qv))}
              style={{ paddingHorizontal: 22, paddingVertical: 16, borderRadius: 12,
                backgroundColor: (quickValue ?? num) === qv ? color : color + "1a", borderWidth: 1, borderColor: color }}>
              <Text style={{ color: (quickValue ?? num) === qv ? "#fff" : color, fontWeight: "700", fontSize: 18 }}>{qv}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ marginBottom: 14 }}>
        <VitalStepper
          value={value ? num : undefined}
          onChange={v => onValueChange(v != null ? String(v) : "")}
          min={min} max={max} step={step} precision={precision}
          unit={unitSuffix} placeholder={valuePlaceholder}
        />
      </View>

      {units && units.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {units.map(u => (
            <TouchableOpacity key={u} onPress={() => onUnitChange?.(u)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                backgroundColor: unit === u ? color : color + "1a", borderWidth: 1, borderColor: color + "55" }}>
              <Text style={{ color: unit === u ? "#fff" : color, fontWeight: "700" }}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {extraHint && <Text style={{ color: "#f59e0b", fontSize: 11, marginBottom: 14 }}>{extraHint}</Text>}

      {routes && routes.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {routes.map(r => (
            <TouchableOpacity key={r} onPress={() => onRouteChange?.(r)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1,
                backgroundColor: route === r ? "#475569" : "transparent", borderColor: "#475569" }}>
              <Text style={{ color: route === r ? "#fff" : "#94a3b8", fontWeight: "700", fontSize: 12 }}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {confirmLabel && onConfirm && (
        <FeedbackPressable onPress={onConfirm} disabled={confirmDisabled}
          style={{ backgroundColor: confirmDisabled ? "#1e2d40" : color, borderRadius: 14, padding: 18, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{confirmLabel}</Text>
        </FeedbackPressable>
      )}
    </View>
  )
}
