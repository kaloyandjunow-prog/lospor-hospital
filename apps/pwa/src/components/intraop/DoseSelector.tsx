import { useEffect, useMemo, useState } from "react"
import { View, Text, TextInput, TouchableOpacity } from "react-native"
import {
  administrationRouteLabel,
  normalizeAdministrationRoute,
} from "@lospor/core/clinical-rule-vocabulary"
import { VitalStepper } from "@/components/VitalStepper"
import { usePreferences } from "@/lib/preferences-context"
import type { DrugFormulation } from "@/lib/intraop-log-event"
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
  manualMax?: number
  step?: number
  precision?: number
  valuePlaceholder?: string
  manualEntryOnly?: boolean

  units?: string[]
  unit?: string
  onUnitChange?: (u: string) => void
  unitSuffix?: string

  routes?: string[]
  route?: string
  onRouteChange?: (r: string) => void

  concentrationOptions?: string[]
  concentration?: string
  concentrationUnit?: string
  onConcentrationChange?: (c: string | undefined) => void
  customConcentration?: string
  onCustomConcentrationChange?: (value: string | undefined) => void

  formulationOptions?: DrugFormulation[]
  formulation?: DrugFormulation
  onFormulationChange?: (value: DrugFormulation | undefined) => void

  // Omit both when the caller needs to combine this picker's value with
  // something else (e.g. agents also pick N2O%) behind one outer button.
  confirmLabel?: string
  onConfirm?: () => void
  confirmDisabled?: boolean
}

export function DoseSelector({
  color = "#8b5cf6", hint, extraHint,
  quickValues, quickValue,
  value, onValueChange, min, max, manualMax, step = 1, precision: precisionProp, valuePlaceholder = "Value", manualEntryOnly = false,
  units, unit, onUnitChange, unitSuffix,
  routes, route, onRouteChange,
  concentrationOptions, concentration, concentrationUnit, onConcentrationChange,
  customConcentration, onCustomConcentrationChange,
  formulationOptions, formulation, onFormulationChange,
  confirmLabel, onConfirm, confirmDisabled,
}: DoseSelectorProps) {
  const { language } = usePreferences()
  const precision = precisionProp ?? (() => {
    const s = String(step)
    const dot = s.indexOf(".")
    return dot >= 0 ? s.length - dot - 1 : 0
  })()
  const num = parseFloat(value) || 0
  const selectedQuickValue = quickValue ?? (value ? num : undefined)
  const quickKey = quickValues?.join("|") ?? ""
  const concentrationKey = concentrationOptions?.join("|") ?? ""
  const [quickPage, setQuickPage] = useState(0)
  const [concentrationPage, setConcentrationPage] = useState(0)
  const quickPageCount = Math.max(1, Math.ceil((quickValues?.length ?? 0) / 5))
  const concentrationPageCount = Math.max(1, Math.ceil((concentrationOptions?.length ?? 0) / 4))

  useEffect(() => {
    const index = selectedQuickValue == null
      ? -1
      : quickValues?.findIndex(candidate => candidate === selectedQuickValue) ?? -1
    setQuickPage(index >= 0 ? Math.floor(index / 5) : 0)
  }, [quickKey, selectedQuickValue, quickValues])

  useEffect(() => {
    const index = concentration && customConcentration === undefined
      ? concentrationOptions?.indexOf(concentration) ?? -1
      : -1
    setConcentrationPage(index >= 0 ? Math.floor(index / 4) : 0)
  }, [concentration, concentrationKey, concentrationOptions, customConcentration])

  const canonicalRoutes = useMemo(() => {
    const seen = new Set<string>()
    return (routes ?? []).flatMap(rawRoute => {
      const canonical = normalizeAdministrationRoute(rawRoute)
      const value = canonical ?? rawRoute
      if (seen.has(value)) return []
      seen.add(value)
      return [{ raw: rawRoute, canonical, value }]
    })
  }, [routes])

  const visibleQuickValues = quickValues?.slice(quickPage * 5, quickPage * 5 + 5) ?? []
  const visibleConcentrations = concentrationOptions?.slice(
    concentrationPage * 4,
    concentrationPage * 4 + 4,
  ) ?? []
  const customConcentrationActive = customConcentration !== undefined
  const showConcentration = !!concentrationUnit || (concentrationOptions?.length ?? 0) > 0

  function formulationLabel(value: DrugFormulation): string {
    return value.charAt(0) + value.slice(1).toLowerCase()
  }

  return (
    <View>
      {hint && <Text style={{ color, fontSize: 12, fontWeight: "600", marginBottom: 10 }}>{hint}</Text>}

      {showConcentration && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Concentration</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {visibleConcentrations.map((c, index) => (
              <TouchableOpacity
                key={c}
                testID={`concentration-pill-${concentrationPage * 4 + index}`}
                accessibilityRole="button"
                accessibilityState={{ selected: !customConcentrationActive && concentration === c }}
                onPress={() => {
                  onCustomConcentrationChange?.(undefined)
                  onConcentrationChange?.(concentration === c && !customConcentrationActive ? undefined : c)
                }}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                  backgroundColor: !customConcentrationActive && concentration === c ? "#0ea5e9" : "#0ea5e91a", borderColor: "#0ea5e955" }}>
                <Text style={{ color: !customConcentrationActive && concentration === c ? "#fff" : "#0ea5e9", fontWeight: "700", fontSize: 13 }}>{c}</Text>
              </TouchableOpacity>
            ))}
            {onCustomConcentrationChange ? (
              <TouchableOpacity
                testID="concentration-other"
                accessibilityRole="button"
                accessibilityState={{ selected: customConcentrationActive }}
                onPress={() => onCustomConcentrationChange(customConcentrationActive ? undefined : "")}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                  backgroundColor: customConcentrationActive ? "#0ea5e9" : "#0ea5e91a", borderColor: "#0ea5e955" }}
              >
                <Text style={{ color: customConcentrationActive ? "#fff" : "#0ea5e9", fontWeight: "700", fontSize: 13 }}>Other</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {concentrationPageCount > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                testID="concentration-page-prev"
                accessibilityRole="button"
                accessibilityLabel="Previous concentration choices"
                accessibilityState={{ disabled: concentrationPage === 0 }}
                disabled={concentrationPage === 0}
                onPress={() => setConcentrationPage(page => Math.max(0, page - 1))}
              >
                <Text style={{ color: concentrationPage === 0 ? "#334155" : "#94a3b8", fontSize: 18 }}>{"<"}</Text>
              </TouchableOpacity>
              <Text testID="concentration-page-indicator" style={{ color: "#64748b", fontSize: 10 }}>
                {concentrationPage + 1}/{concentrationPageCount}
              </Text>
              <TouchableOpacity
                testID="concentration-page-next"
                accessibilityRole="button"
                accessibilityLabel="Next concentration choices"
                accessibilityState={{ disabled: concentrationPage >= concentrationPageCount - 1 }}
                disabled={concentrationPage >= concentrationPageCount - 1}
                onPress={() => setConcentrationPage(page => Math.min(concentrationPageCount - 1, page + 1))}
              >
                <Text style={{ color: concentrationPage >= concentrationPageCount - 1 ? "#334155" : "#94a3b8", fontSize: 18 }}>{">"}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {customConcentrationActive ? (
            <TextInput
              testID="concentration-custom-input"
              value={customConcentration}
              onChangeText={onCustomConcentrationChange}
              placeholder="Custom concentration"
              placeholderTextColor="#475569"
              autoFocus
              style={{ marginTop: 8, backgroundColor: "#111820", color: "#e2e8f0", borderRadius: 9,
                borderWidth: 1, borderColor: "#0ea5e955", paddingHorizontal: 11, paddingVertical: 8 }}
            />
          ) : null}
        </View>
      )}

      {formulationOptions && formulationOptions.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Formulation</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {formulationOptions.map(option => (
              <TouchableOpacity
                key={option}
                testID={`dose-formulation-${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: formulation === option }}
                onPress={() => onFormulationChange?.(formulation === option ? undefined : option)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1,
                  backgroundColor: formulation === option ? "#475569" : "transparent", borderColor: "#475569" }}
              >
                <Text style={{ color: formulation === option ? "#fff" : "#94a3b8", fontWeight: "700", fontSize: 12 }}>
                  {formulationLabel(option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {canonicalRoutes.length > 1 && (
        <View testID="dose-selector-routes" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8, marginBottom: 14 }}>
          {canonicalRoutes.map(({ raw, canonical, value: routeValue }) => {
            const selectedRoute = route ? normalizeAdministrationRoute(route) ?? route : route
            const selected = selectedRoute === routeValue
            return (
              <TouchableOpacity
                key={routeValue}
                testID={`dose-route-${routeValue}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onRouteChange?.(routeValue)}
                style={{ maxWidth: "100%", flexShrink: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1,
                  backgroundColor: selected ? "#475569" : "transparent", borderColor: "#475569" }}>
                <Text numberOfLines={2} style={{ color: selected ? "#fff" : "#94a3b8", fontWeight: "700", fontSize: 12 }}>
                  {canonical ? administrationRouteLabel(canonical, language) : raw}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {quickValues && quickValues.length > 0 && (
        <View testID="dose-selector-dose-pills" style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {visibleQuickValues.map((qv, index) => (
            <TouchableOpacity
              key={`${qv}-${quickPage * 5 + index}`}
              testID={`dose-pill-${quickPage * 5 + index}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedQuickValue === qv }}
              onPress={() => onValueChange(String(qv))}
              style={{ paddingHorizontal: 22, paddingVertical: 16, borderRadius: 12,
                backgroundColor: selectedQuickValue === qv ? color : color + "1a", borderWidth: 1, borderColor: color }}>
              <Text style={{ color: selectedQuickValue === qv ? "#fff" : color, fontWeight: "700", fontSize: 18 }}>{qv}</Text>
            </TouchableOpacity>
          ))}
          </View>
          {quickPageCount > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                testID="dose-page-prev"
                accessibilityRole="button"
                accessibilityLabel="Previous dose choices"
                accessibilityState={{ disabled: quickPage === 0 }}
                disabled={quickPage === 0}
                onPress={() => setQuickPage(page => Math.max(0, page - 1))}
              >
                <Text style={{ color: quickPage === 0 ? "#334155" : "#94a3b8", fontSize: 18 }}>{"<"}</Text>
              </TouchableOpacity>
              <Text testID="dose-page-indicator" style={{ color: "#64748b", fontSize: 10 }}>
                {quickPage + 1}/{quickPageCount}
              </Text>
              <TouchableOpacity
                testID="dose-page-next"
                accessibilityRole="button"
                accessibilityLabel="Next dose choices"
                accessibilityState={{ disabled: quickPage >= quickPageCount - 1 }}
                disabled={quickPage >= quickPageCount - 1}
                onPress={() => setQuickPage(page => Math.min(quickPageCount - 1, page + 1))}
              >
                <Text style={{ color: quickPage >= quickPageCount - 1 ? "#334155" : "#94a3b8", fontSize: 18 }}>{">"}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}

      <View style={{ marginBottom: 14 }}>
        {manualEntryOnly ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={value}
              onChangeText={onValueChange}
              keyboardType="decimal-pad"
              placeholder={valuePlaceholder}
              placeholderTextColor="#475569"
              style={{ flex: 1, backgroundColor: "#111820", color: "#e2e8f0", borderRadius: 9,
                borderWidth: 1, borderColor: "#334155", paddingHorizontal: 12, paddingVertical: 11,
                textAlign: "center", fontSize: 16, fontWeight: "700" }}
            />
            {unitSuffix ? <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "700" }}>{unitSuffix}</Text> : null}
          </View>
        ) : (
          <VitalStepper
            value={value ? num : undefined}
            onChange={v => onValueChange(v != null ? String(v) : "")}
            min={min} max={max} manualMax={manualMax} step={step} precision={precision}
            unit={unitSuffix} placeholder={valuePlaceholder}
          />
        )}
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

      {confirmLabel && onConfirm && (
        <FeedbackPressable onPress={onConfirm} disabled={confirmDisabled}
          style={{ backgroundColor: confirmDisabled ? "#1e2d40" : color, borderRadius: 14, padding: 18, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{confirmLabel}</Text>
        </FeedbackPressable>
      )}
    </View>
  )
}
