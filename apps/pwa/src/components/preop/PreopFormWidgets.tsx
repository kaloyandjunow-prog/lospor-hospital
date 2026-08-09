import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Modal, PanResponder, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { hapticKey, hapticTick } from "@/lib/haptic"
import { useOptionLibrary } from "@/lib/use-option-library"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { LAB_CATEGORIES, getLabOutOfRange, searchLabs, type LabTest } from "@/lib/labs"
import type { ASASuggestion } from "@/lib/preop-asa-suggestion"
import {
  getIcd10BodySystem,
  ICD10_BODY_SYSTEM_ORDER,
  type BodySystem,
} from "@lospor/core/preop"
import { metadataString } from "@lospor/core/option-contracts"
import {
  apfelRiskBand,
  rcriRiskBand,
  stopBangRiskBand,
} from "@lospor/core/risk"

function impact() {
  hapticTick()
}

const ASA_OPTS: { v: "I"|"II"|"III"|"IV"|"V"|"VI"; color: string }[] = [
  { v: "I",   color: "#22c55e" },
  { v: "II",  color: "#84cc16" },
  { v: "III", color: "#f59e0b" },
  { v: "IV",  color: "#f97316" },
  { v: "V",   color: "#ef4444" },
  { v: "VI",  color: "#64748b" },
]

export function AsaPicker({
  value,
  onChange,
  emergencySurgery,
  suggestion,
  labelSuggested,
  labelSuggestedReview,
  labelEmergencySuffix,
}: {
  value?: string
  onChange: (v: string) => void
  emergencySurgery: boolean
  suggestion: ASASuggestion | null
  labelSuggested: string
  labelSuggestedReview: string
  labelEmergencySuffix: string
}) {
  return (
    <View style={{ gap: 8 }}>
      {suggestion && (
        <View style={{ backgroundColor: withAlpha("#3b82f6", "15"), borderRadius: 12, borderWidth: 1, borderColor: withAlpha("#3b82f6", "40"), paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
          <Text style={{ color: "#60a5fa", fontSize: 13, fontWeight: "800" }}>
            {labelSuggested} {suggestion.cls} {labelSuggestedReview}
          </Text>
          {suggestion.reasons.map((r) => (
            <Text key={r} style={{ color: "#60a5fa", fontSize: 12, opacity: 0.85 }}>• {r}</Text>
          ))}
        </View>
      )}
      {emergencySurgery && (
        <View style={{ backgroundColor: withAlpha(colors.danger, "10"), borderRadius: 10, borderWidth: 1, borderColor: withAlpha(colors.danger, "40"), paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{labelEmergencySuffix}</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ASA_OPTS.map(({ v, color }) => {
          const selected = value === v
          const displayLabel = emergencySurgery && v !== "VI" ? `${v}E` : v
          return (
            <Pressable
              key={v}
              onPress={() => { impact(); onChange(value === v ? "" : v) }}
              style={{
                flex: 1, minWidth: 52, minHeight: 56,
                alignItems: "center", justifyContent: "center",
                borderRadius: 14, borderCurve: "continuous",
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? color : colors.border,
                backgroundColor: selected ? withAlpha(color, "22") : colors.surface,
              }}
            >
              <Text style={{ color: selected ? color : colors.textSecondary, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 }}>
                {displayLabel}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export function SegmentButton({ label, selected, onPress, flex = 1 }: { label: string; selected: boolean; onPress: () => void; flex?: number }) {
  return (
    <Pressable
      onPress={() => { impact(); onPress() }}
      style={{
        flex,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 14, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  )
}

export function SegmentedSelect<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value?: T
  onChange: (value: T) => void
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((option) => (
        <SegmentButton key={option.value} label={option.label} selected={value === option.value} onPress={() => onChange(option.value)} />
      ))}
    </View>
  )
}

export function BloodGrid({ bloodType, rhFactor, onChange }: {
  bloodType?: "A" | "B" | "AB" | "O"
  rhFactor?: "POSITIVE" | "NEGATIVE"
  onChange: (bloodType: "A" | "B" | "AB" | "O" | undefined, rhFactor: "POSITIVE" | "NEGATIVE" | undefined) => void
}) {
  const { language } = usePreferences()
  const { options: bloodGroupOptions } = useOptionLibrary("BLOOD_GROUP")
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {bloodGroupOptions.map(opt => {
        const bloodTypeValue = metadataString(opt.metadata, "bloodType")
        const rhFactorValue = metadataString(opt.metadata, "rhFactor")
        const optionBloodType =
          bloodTypeValue === "A"
          || bloodTypeValue === "B"
          || bloodTypeValue === "AB"
          || bloodTypeValue === "O"
            ? bloodTypeValue
            : undefined
        const optionRhFactor =
          rhFactorValue === "POSITIVE" || rhFactorValue === "NEGATIVE"
            ? rhFactorValue
            : undefined
        const selected =
          bloodType === optionBloodType
          && rhFactor === optionRhFactor
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              impact()
              onChange(
                selected ? undefined : optionBloodType,
                selected ? undefined : optionRhFactor,
              )
            }}
            style={{
              width: "23%",
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surface,
            }}
          >
            <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 15, fontWeight: "900" }}>{displayOption("BLOOD_GROUP", opt, language)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Risk label helpers — identical thresholds to web lib/scores.ts
export function rcriRiskLabel(s: number, tc: (k: ClinicalStringKey) => string) {
  const key = rcriRiskBand(s).key
  return tc(key === "very_low" ? "rcriVeryLow" : key === "low" ? "rcriLow" : key === "moderate" ? "rcriModerate" : "rcriHigh")
}
export function apfelRiskLabel(s: number, tc: (k: ClinicalStringKey) => string) {
  const key = apfelRiskBand(s).key
  return tc(key === "low" ? "apfelLow" : key === "moderate" ? "apfelModerate" : "apfelHigh")
}
export function stopBangRiskLabel(s: number, tc: (k: ClinicalStringKey) => string) {
  const key = stopBangRiskBand(s).key
  return tc(key === "low" ? "osaLow" : key === "intermediate" ? "osaIntermediate" : "osaHigh")
}

const BODY_SYSTEM_TC: Record<string, ClinicalStringKey> = {
  "Cardiovascular":             "sysCardiovascular",
  "Respiratory":                "sysRespiratory",
  "Neurological / Psychiatric": "sysNeuroPsychiatric",
  "Endocrine / Metabolic":      "sysEndocrineMetabolic",
  "Gastrointestinal / Hepatic": "sysGastroHepatic",
  "Renal / Urological":         "sysRenalUrological",
  "Haematological":             "sysHaematological",
  "Musculoskeletal":            "sysMusculoskeletal",
  "Neoplasms":                  "sysNeoplasms",
  "Infectious diseases":        "sysInfectious",
  "Ophthalmological / ENT":     "sysOphthalmENT",
  "Obstetric":                  "sysObstetric",
  "Congenital":                 "sysCongenital",
  "Other":                      "sysOther",
}

const SYSTEM_HEX: Record<BodySystem, string> = {
  "Cardiovascular":             "#ef4444",
  "Respiratory":                "#38bdf8",
  "Neurological / Psychiatric": "#a78bfa",
  "Endocrine / Metabolic":      "#fbbf24",
  "Gastrointestinal / Hepatic": "#f97316",
  "Renal / Urological":         "#2dd4bf",
  "Haematological":             "#fb7185",
  "Musculoskeletal":            "#84cc16",
  "Neoplasms":                  "#f472b6",
  "Infectious diseases":        "#d97706",
  "Ophthalmological / ENT":     "#22d3ee",
  "Obstetric":                  "#e879f9",
  "Congenital":                 "#818cf8",
  "Other":                      "#94a3b8",
}

function getBodySystem(code: string): BodySystem {
  return getIcd10BodySystem(code) as BodySystem
}

export function ComorbiditiesBySystem({ items, onRemove }: { items: { label: string; code?: string }[]; onRemove: (label: string) => void }) {
  const { tc } = usePreferences()
  if (items.length === 0) return null
  const grouped: Partial<Record<BodySystem, typeof items>> = {}
  for (const item of items) {
    const system = getBodySystem(item.code ?? "")
    if (!grouped[system]) grouped[system] = []
    grouped[system]!.push(item)
  }
  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      {ICD10_BODY_SYSTEM_ORDER.filter(s => grouped[s]).map(system => {
        const col = SYSTEM_HEX[system]
        const tcKey = BODY_SYSTEM_TC[system]
        return (
          <View key={system}>
            <Text style={{ color: col, fontSize: 9, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 6 }}>{tcKey ? tc(tcKey) : system}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {grouped[system]!.map(item => (
                <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: col + "18", borderWidth: 1, borderColor: col + "55" }}>
                  <Text style={{ color: col, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>{item.label}</Text>
                  <Pressable onPress={() => onRemove(item.label)} hitSlop={6}>
                    <Text style={{ color: col, fontSize: 12, fontWeight: "700", opacity: 0.7 }}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}

export function ScoreBadge({ label, score, max, riskLabel }: { label: string; score: number; max: number; riskLabel?: string }) {
  const color = score <= 1 ? colors.success : score <= 3 ? colors.warning : colors.danger
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: withAlpha(color, "66"), borderRadius: 15, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color, fontSize: 24, fontWeight: "900", marginTop: 3 }}>{score}<Text style={{ color: colors.textMuted, fontSize: 15 }}>/{max}</Text></Text>
      {!!riskLabel && (
        <Text style={{ color, fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 4, paddingHorizontal: 4 }} numberOfLines={1}>{riskLabel}</Text>
      )}
    </View>
  )
}

export function MetricBadge({ label, value, unit, tone = colors.primary }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: withAlpha(tone, "55"), borderRadius: 15, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color: tone, fontSize: 22, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] }}>
        {value}<Text style={{ color: colors.textMuted, fontSize: 12 }}> {unit}</Text>
      </Text>
    </View>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundToStep(value: number, step: number, precision: number) {
  return Number((Math.round(value / step) * step).toFixed(Math.max(precision, 2)))
}

function formatClinicalValue(value: number | undefined, precision: number) {
  if (value == null) return "-"
  return precision > 0 ? value.toFixed(precision).replace(/\.0+$/, "") : String(Math.round(value))
}

export function VitalStepper({ value, onChange, min, max, step = 1, precision = 0, unit, placeholder = "-" }: {
  value?: number
  onChange: (value: number | undefined) => void
  min: number
  max: number
  step?: number
  precision?: number
  unit?: string
  placeholder?: string
}) {
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [keypadText, setKeypadText] = useState("")
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [trackWidth, setTrackWidth] = useState(1)
  const fieldRef = useRef<View>(null)
  const trackXRef = useRef(0)
  const holdTimer = useRef<{ initial: ReturnType<typeof setTimeout> | null; repeat: ReturnType<typeof setInterval> | null }>({ initial: null, repeat: null })
  const { height: screenHeight, width: screenWidth } = useWindowDimensions()

  const commit = useCallback((next: number | undefined) => {
    hapticTick()
    if (next == null) {
      onChange(undefined)
      return
    }
    onChange(clampNumber(roundToStep(next, step, precision), min, max))
  }, [max, min, onChange, precision, step])

  const nudge = useCallback((direction: -1 | 1) => {
    commit((value ?? min) + direction * step)
  }, [commit, min, step, value])

  function startHold(direction: -1 | 1) {
    nudge(direction)
    holdTimer.current.initial = setTimeout(() => {
      holdTimer.current.repeat = setInterval(() => nudge(direction), 120)
    }, 420)
  }

  const stopHold = useCallback(() => {
    if (holdTimer.current.initial) clearTimeout(holdTimer.current.initial)
    if (holdTimer.current.repeat) clearInterval(holdTimer.current.repeat)
    holdTimer.current.initial = null
    holdTimer.current.repeat = null
  }, [])

  useEffect(() => stopHold, [stopHold])

  const setFromPageX = useCallback((pageX: number) => {
    const ratio = clampNumber((pageX - trackXRef.current) / Math.max(1, trackWidth), 0, 1)
    commit(min + ratio * (max - min))
  }, [commit, max, min, trackWidth])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Dragging a vital slider is a horizontal gesture, and so is the intraop
    // tab swipe one level up. React Native grants a termination request by
    // default, so the parent used to take the gesture mid-drag and change tab
    // while the clinician was still setting a value. Refuse to hand it over:
    // once this slider has the gesture, it keeps it until the finger lifts.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (event) => {
      setFromPageX(event.nativeEvent.pageX)
    },
    onPanResponderMove: (_, gesture) => {
      setFromPageX(gesture.moveX)
    },
  }), [setFromPageX])

  function openKeypad() {
    setKeypadText(value != null ? formatClinicalValue(value, precision) : "")
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setKeypadOpen(true)
    })
  }

  function closeKeypad() {
    const parsed = Number(keypadText.replace(",", "."))
    if (keypadText.trim() && Number.isFinite(parsed)) commit(parsed)
    setKeypadOpen(false)
  }

  function pressKey(key: string) {
    hapticKey()
    if (key === "clear") {
      setKeypadText("")
      return
    }
    if (key === "back") {
      setKeypadText((current) => current.slice(0, -1))
      return
    }
    setKeypadText((current) => {
      if (key === "." && (precision === 0 || current.includes("."))) return current
      return `${current}${key}`.replace(/^0+(?=\d)/, "")
    })
  }

  const ratio = value == null ? 0 : (clampNumber(value, min, max) - min) / (max - min)

  // Keypad should always be comfortably wide regardless of the field's actual width.
  // When the field is narrow (e.g. SBP/DBP in a 2-column row), the keypad is
  // centred on screen at a fixed width instead of inheriting the tiny field width.
  const KEYPAD_MIN_W = 268
  const keypadWidth = Math.max(KEYPAD_MIN_W, anchor?.width ?? KEYPAD_MIN_W)
  const keypadLeft  = anchor
    ? keypadWidth <= (anchor.width ?? 0)
      ? anchor.x                                              // field is wide enough — align left
      : Math.max(8, Math.min(anchor.x, screenWidth - keypadWidth - 8)) // shift left if it would overflow
    : 8
  const keypadTop = anchor ? Math.max(8, Math.min(anchor.y, screenHeight - 330)) : 0

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPressIn={() => startHold(-1)}
          onPressOut={stopHold}
          style={{ width: 44, height: 44, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900" }}>-</Text>
        </Pressable>

        {/* The unit sits below the field, not inside it. Between the two 44px
            buttons a half-width field is only ~61px wide, and "130 mmHg" needs
            88px at the old 22/13 — it truncated to "13…". Measured: even at 15px
            it still overflowed, so shrinking the type alone could not fix it.
            The number alone needs 32px at 19 and fits with room to spare. */}
        <View ref={fieldRef} collapsable={false} style={{ flex: 1 }}>
          <Pressable onPress={openKeypad} style={{ minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: colors.borderStrong }}>
            <Text numberOfLines={1} style={{ color: value == null ? colors.textMuted : colors.textPrimary, fontSize: 19, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
              {value == null ? placeholder : formatClinicalValue(value, precision)}
            </Text>
          </Pressable>
          {unit ? (
            <Text numberOfLines={1} style={{ marginTop: 4, textAlign: "center", color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
              {unit}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPressIn={() => startHold(1)}
          onPressOut={stopHold}
          style={{ width: 44, height: 44, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900" }}>+</Text>
        </Pressable>
      </View>

      <View
        ref={(node) => {
          if (!node) return
          node.measureInWindow((x) => { trackXRef.current = x })
        }}
        onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        style={{ height: 28, justifyContent: "center" }}
        {...panResponder.panHandlers}
      >
        <View style={{ height: 5, borderRadius: 999, backgroundColor: colors.borderStrong }} />
        <View style={{ position: "absolute", left: `${ratio * 100}%`, width: 10, height: 22, marginLeft: -5, borderRadius: 5, backgroundColor: colors.textSecondary }} />
      </View>

      <Modal visible={keypadOpen && anchor != null} transparent animationType="fade" onRequestClose={closeKeypad}>
        <Pressable onPress={closeKeypad} style={{ flex: 1, backgroundColor: "transparent" }}>
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{ position: "absolute", left: keypadLeft, top: keypadTop, width: keypadWidth }}
          >
            <View style={{ borderRadius: 18, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.primary, "66"), backgroundColor: colors.surface, padding: 8, boxShadow: "0 16px 34px rgba(0,0,0,0.32)" }}>
              <View style={{ minHeight: 54, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.textPrimary, "24"), backgroundColor: withAlpha(colors.textPrimary, "10"), alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Text style={{ color: keypadText ? colors.textPrimary : colors.textMuted, fontSize: 25, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                  {keypadText || "-"}{unit && keypadText ? <Text style={{ color: colors.textMuted, fontSize: 13 }}> {unit}</Text> : null}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", precision > 0 ? "." : "clear", "0", "back"].map((key) => (
                  <Pressable key={key} onPress={() => pressKey(key)} style={{ width: "31.5%", minHeight: 48, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.textPrimary, fontSize: key.length === 1 ? 21 : 13, fontWeight: "900" }}>
                      {key === "back" ? "Back" : key === "clear" ? "Clear" : key}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

export function VitalNumber({ label, unit, value, onChange, unobtainable, onToggleUnobtainable, min, max, step = 1, precision = 0, labelUnableToObtain = "Unable to obtain", required = false, error }: {
  label: string
  unit: string
  value?: number
  onChange: (value: number | undefined) => void
  unobtainable: boolean
  onToggleUnobtainable: () => void
  min: number
  max: number
  step?: number
  precision?: number
  labelUnableToObtain?: string
  required?: boolean
  error?: string
}) {
  const { tc } = usePreferences()
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {/* The label yields and truncates; the pill keeps its size. At half
            width the two together overflowed, and it was the pill that got
            clipped by the neighbouring column. */}
        <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, color: colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{label}{required && <Text style={{ color: colors.danger }}> *</Text>}</Text>
        <Pressable
          onPress={() => { impact(); onToggleUnobtainable() }}
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: unobtainable ? colors.warning : colors.border,
            backgroundColor: unobtainable ? withAlpha(colors.warning, "18") : colors.surface,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: unobtainable ? colors.warning : colors.textMuted, fontSize: 11, fontWeight: "900" }}>{labelUnableToObtain}</Text>
        </Pressable>
      </View>
      {unobtainable ? (
        <View style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: "center", paddingHorizontal: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>{tc("vitalNotAvailable")}</Text>
        </View>
      ) : (
        // No placeholder: the label is already above this row. Passing it here
        // rendered the field's own name a second time at value size, which on a
        // narrow phone overflowed into the +/- buttons.
        <VitalStepper value={value} onChange={(next) => { impact(); onChange(next) }} min={min} max={max} step={step} precision={precision} unit={unit} />
      )}
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
    </View>
  )
}

export function ManualLabPanel({ value, onChange, labelManualLabEntry = "Manual lab entry", labelHideManualLab = "Hide manual lab entry", labelSearchLabs = "Search tests..." }: { value: { test: string; value: string; unit: string }[]; onChange: (value: { test: string; value: string; unit: string }[]) => void; labelManualLabEntry?: string; labelHideManualLab?: string; labelSearchLabs?: string }) {
  const { tc, language } = usePreferences()
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const filtered = useMemo(() => query.length >= 2 ? searchLabs(query) : null, [query])

  function addTest(test: LabTest) {
    if (value.some((row) => row.test === test.name)) return
    onChange([...value, { test: test.name, value: "", unit: test.unit }])
    setQuery("")
  }

  function update(test: string, nextValue: string) {
    onChange(value.map((row) => row.test === test ? { ...row, value: nextValue } : row))
  }

  return (
    <View>
      {value.length > 0 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 12 }}>
          {value.map((row, idx) => {
            const testDef = searchLabs(row.test)[0]?.test
            const numeric = Number.parseFloat(row.value)
            const flag = testDef && Number.isFinite(numeric) ? getLabOutOfRange(testDef, numeric) : null
            return (
              <View key={row.test} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: idx < value.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: "900" }} numberOfLines={1}>{displayClinicalCode("labTest", row.test, language, { label: row.test })}</Text>
                <TextInput
                  value={row.value}
                  onChangeText={(text) => update(row.test, text)}
                  keyboardType="decimal-pad"
                  placeholder="-"
                  placeholderTextColor={colors.textMuted}
                  style={{ width: 72, color: flag ? colors.warning : colors.textPrimary, backgroundColor: colors.background, borderWidth: 1, borderColor: flag ? colors.warning : colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, textAlign: "right", fontWeight: "900" }}
                />
                <Text style={{ width: 48, color: colors.textMuted, fontSize: 11 }}>{row.unit}</Text>
                <Pressable onPress={() => onChange(value.filter((item) => item.test !== row.test))}>
                  <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "900" }}>x</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : null}

      <Pressable onPress={() => setExpanded(!expanded)} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, marginBottom: expanded ? 12 : 0 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "900" }}>{expanded ? labelHideManualLab : labelManualLabEntry}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{tc("manualLabHint")}</Text>
      </Pressable>

      {expanded ? (
        <View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={labelSearchLabs}
            placeholderTextColor={colors.textMuted}
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.textPrimary, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 }}
          />
          {filtered ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              {filtered.slice(0, 8).map((result, idx) => (
                <Pressable key={result.test.name} onPress={() => addTest(result.test)} style={{ padding: 12, borderBottomWidth: idx < Math.min(filtered.length, 8) - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>{displayClinicalCode("labTest", result.test.name, language, { label: result.test.name })}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{displayClinicalCode("labCategory", result.category.id, language, { label: result.category.label })} - {result.test.unit}</Text>
                </Pressable>
              ))}
            </View>
          ) : LAB_CATEGORIES.map((cat) => (
            <View key={cat.id} style={{ marginBottom: 8 }}>
              <Pressable onPress={() => setCategory(category === cat.id ? null : cat.id)} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "900" }}>{displayClinicalCode("labCategory", cat.id, language, { label: cat.label })}</Text>
              </Pressable>
              {category === cat.id ? cat.tests.map((test) => (
                <Pressable key={test.name} onPress={() => addTest(test)} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ color: colors.textMuted, fontWeight: "800" }}>{displayClinicalCode("labTest", test.name, language, { label: test.name })} ({test.unit})</Text>
                </Pressable>
              )) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

