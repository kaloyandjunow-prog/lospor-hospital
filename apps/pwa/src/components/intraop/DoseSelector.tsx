import { useEffect, useMemo, useRef, useState } from "react"
import { View, Text, TextInput, TouchableOpacity } from "react-native"
import {
  administrationRouteLabel,
  normalizeAdministrationRoute,
} from "@lospor/core/clinical-rule-vocabulary"
import {
  CONCENTRATION_PILL_PAGE_SIZE,
  DOSE_PILL_PAGE_SIZE,
  pageOfSelection,
  presetConcentrations as corePresetConcentrations,
  selectorPage,
  selectorPageCount,
} from "@lospor/core/selector-pagination"
import { VitalStepper } from "@/components/VitalStepper"
import { usePreferences } from "@/lib/preferences-context"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import { FeedbackPressable } from "./FeedbackPressable"

// One reused dose-entry block for drugs (bolus), infusions, fluids, and agents.
// Medication quick values and the established slider/+/- controls remain visible
// by default. `operationalVolumePresets` keeps the more explicit naming used by
// fluid bag entry while preserving the original medication `quickValues` API.
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
  operationalVolumePresets?: number[]

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
  operationalVolumePresets,
  value, onValueChange, min, max, manualMax, step = 1, precision: precisionProp, valuePlaceholder = "Value", manualEntryOnly = false,
  units, unit, onUnitChange, unitSuffix,
  routes, route, onRouteChange,
  concentrationOptions, concentration, concentrationUnit, onConcentrationChange,
  customConcentration, onCustomConcentrationChange,
  formulationOptions, formulation, onFormulationChange,
  confirmLabel, onConfirm, confirmDisabled,
}: DoseSelectorProps) {
  const { language, tc } = usePreferences()
  const precision = precisionProp ?? (() => {
    const s = String(step)
    const dot = s.indexOf(".")
    return dot >= 0 ? s.length - dot - 1 : 0
  })()
  const num = parseFloat(value) || 0
  const presets = quickValues ?? operationalVolumePresets
  const medicationPresets = quickValues !== undefined
  const selectedPreset = quickValue ?? (value ? num : undefined)
  const presetKey = presets?.join("|") ?? ""
  const concentrationKey = concentrationOptions?.join("|") ?? ""
  const [presetPage, setPresetPage] = useState(0)
  const [concentrationPage, setConcentrationPage] = useState(0)
  // Paging comes from core, shared with web. This used to be derived inline
  // with the page sizes as bare 5s and 4s, and answered "1 page" for an empty
  // list where web answered "0" -- two screens paging the same clinical
  // options must not be able to disagree about what is on screen.
  const presetValues = presets ?? []
  const concentrationValues = useMemo(
    () => corePresetConcentrations(concentrationOptions),
    [concentrationOptions],
  )
  const presetPageCount = selectorPageCount(presetValues.length, DOSE_PILL_PAGE_SIZE)
  const concentrationPageCount = selectorPageCount(
    concentrationValues.length,
    CONCENTRATION_PILL_PAGE_SIZE,
  )

  // presetValues/concentrationValues are rebuilt every render, so the effects
  // below read them through a ref and key on presetKey/concentrationKey (the
  // list's actual content) instead -- otherwise a new array reference on an
  // unrelated re-render would reset the visible page every time.
  const presetValuesRef = useRef(presetValues)
  presetValuesRef.current = presetValues
  const concentrationValuesRef = useRef(concentrationValues)
  concentrationValuesRef.current = concentrationValues

  useEffect(() => {
    setPresetPage(pageOfSelection(presetValuesRef.current, DOSE_PILL_PAGE_SIZE, selectedPreset ?? null))
  }, [presetKey, selectedPreset])

  useEffect(() => {
    const selected = concentration && customConcentration === undefined ? concentration : null
    setConcentrationPage(
      pageOfSelection(concentrationValuesRef.current, CONCENTRATION_PILL_PAGE_SIZE, selected),
    )
  }, [concentration, concentrationKey, customConcentration])

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

  const visiblePresets = selectorPage(presetValues, DOSE_PILL_PAGE_SIZE, presetPage)
  const visibleConcentrations = selectorPage(
    concentrationValues,
    CONCENTRATION_PILL_PAGE_SIZE,
    concentrationPage,
  )
  const customConcentrationActive = customConcentration !== undefined
  const showConcentration = !!concentrationUnit || concentrationValues.length > 0

  function formulationLabel(value: DrugFormulation): string {
    return value.charAt(0) + value.slice(1).toLowerCase()
  }

  return (
    <View>
      {hint && <Text style={{ color, fontSize: 12, fontWeight: "600", marginBottom: 10 }}>{hint}</Text>}

      {showConcentration && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{tc("doseConcentration")}</Text>
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
                <Text style={{ color: customConcentrationActive ? "#fff" : "#0ea5e9", fontWeight: "700", fontSize: 13 }}>{tc("doseOther")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {concentrationPageCount > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                testID="concentration-page-prev"
                accessibilityRole="button"
                accessibilityLabel={tc("previousConcentrationChoices")}
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
                accessibilityLabel={tc("nextConcentrationChoices")}
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
              placeholder={tc("doseCustomConcentration")}
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
          <Text style={{ color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{tc("doseFormulation")}</Text>
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

      {presets && presets.length > 0 && (
        <View testID={medicationPresets ? "dose-selector-dose-pills" : "dose-selector-volume-presets"} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {visiblePresets.map((preset, index) => (
            <TouchableOpacity
              key={`${preset}-${presetPage * 5 + index}`}
              testID={medicationPresets ? `dose-pill-${presetPage * 5 + index}` : `volume-preset-${presetPage * 5 + index}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedPreset === preset }}
              onPress={() => onValueChange(String(preset))}
              style={{ paddingHorizontal: 22, paddingVertical: 16, borderRadius: 12,
                backgroundColor: selectedPreset === preset ? color : color + "1a", borderWidth: 1, borderColor: color }}>
              <Text style={{ color: selectedPreset === preset ? "#fff" : color, fontWeight: "700", fontSize: 18 }}>{preset}</Text>
            </TouchableOpacity>
          ))}
          </View>
          {presetPageCount > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                testID={medicationPresets ? "dose-page-prev" : "volume-preset-page-prev"}
                accessibilityRole="button"
                accessibilityLabel={medicationPresets ? tc("previousDoseChoices") : tc("previousVolumePresets")}
                accessibilityState={{ disabled: presetPage === 0 }}
                disabled={presetPage === 0}
                onPress={() => setPresetPage(page => Math.max(0, page - 1))}
              >
                <Text style={{ color: presetPage === 0 ? "#334155" : "#94a3b8", fontSize: 18 }}>{"<"}</Text>
              </TouchableOpacity>
              <Text testID={medicationPresets ? "dose-page-indicator" : "volume-preset-page-indicator"} style={{ color: "#64748b", fontSize: 10 }}>
                {presetPage + 1}/{presetPageCount}
              </Text>
              <TouchableOpacity
                testID={medicationPresets ? "dose-page-next" : "volume-preset-page-next"}
                accessibilityRole="button"
                accessibilityLabel={medicationPresets ? tc("nextDoseChoices") : tc("nextVolumePresets")}
                accessibilityState={{ disabled: presetPage >= presetPageCount - 1 }}
                disabled={presetPage >= presetPageCount - 1}
                onPress={() => setPresetPage(page => Math.min(presetPageCount - 1, page + 1))}
              >
                <Text style={{ color: presetPage >= presetPageCount - 1 ? "#334155" : "#94a3b8", fontSize: 18 }}>{">"}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}

      <View style={{ marginBottom: 14 }}>
        {manualEntryOnly ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              testID="dose-manual-input"
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
