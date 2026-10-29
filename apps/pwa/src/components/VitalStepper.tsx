import { useCallback, useMemo, useRef, useState } from "react"
import { View, Text, Pressable, Modal, PanResponder, useWindowDimensions } from "react-native"
import { hapticKey, hapticTick } from "@/lib/haptic"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import { colors, withAlpha } from "@/theme/colors"
import { HoldRepeatPressable } from "./HoldRepeatPressable"

// Shared clinical vitals stepper — identical UX to the preop exam vitals
// (web-like − / number / + with a thin slider and a custom in-app keypad).
// Extracted so postop Recovery Vitals can reuse the exact same control.

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
function roundToStep(value: number, step: number, precision: number) {
  return Number((Math.round(value / step) * step).toFixed(Math.max(precision, 2)))
}
function formatClinicalValue(value: number | undefined, precision: number) {
  if (value == null) return "-"
  // Trailing zeros dropped: 0.5, not 0.500 (a strength on a 0.025 step).
  return precision > 0 ? value.toFixed(precision).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : String(Math.round(value))
}

export function VitalStepper({ value, onChange, min, max, manualMax = max, step = 1, precision = 0, unit, placeholder = "-", disabled = false }: {
  value?: number | null
  onChange: (value: number | null) => void
  min: number
  max: number
  /** Slider/stepper ceiling stays at `max`; direct keypad entry may use a wider envelope. */
  manualMax?: number
  step?: number
  precision?: number
  unit?: string
  placeholder?: string
  disabled?: boolean
}) {
  const { t } = usePreferences()
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [keypadText, setKeypadText] = useState("")
  // A typed number outside the limits is brought to the nearest one, and says so.
  const [limitNotice, setLimitNotice] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [trackWidth, setTrackWidth] = useState(1)
  const fieldRef = useRef<View>(null)
  const trackXRef = useRef(0)
  const { height: screenHeight, width: screenWidth } = useWindowDimensions()

  const commit = useCallback((next: number | undefined) => {
    if (disabled) return
    hapticTick()
    // null, not undefined: canonicalizePreopPatch drops undefined as "not in
    // this diff" and keeps the stored reading, so a cleared vital stayed on the
    // record while the field showed empty. null is the explicit clear.
    setLimitNotice(null)
    if (next == null) { onChange(null); return }
    onChange(clampNumber(roundToStep(next, step, precision), min, max))
  }, [disabled, max, min, onChange, precision, step])

  function nudge(direction: -1 | 1) {
    commit((value ?? min) + direction * step)
  }

  const setFromPageX = useCallback((pageX: number) => {
    const ratio = clampNumber((pageX - trackXRef.current) / Math.max(1, trackWidth), 0, 1)
    commit(min + ratio * (max - min))
  }, [commit, max, min, trackWidth])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // See PreopFormWidgets: without this the intraop tab swipe one level up
    // takes the gesture mid-drag and changes tab while a value is being set.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (event) => { setFromPageX(event.nativeEvent.pageX) },
    onPanResponderMove: (_, gesture) => { setFromPageX(gesture.moveX) },
  }), [setFromPageX])

  function openKeypad() {
    if (disabled) return
    setKeypadText(value != null ? formatClinicalValue(value, precision) : "")
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setKeypadOpen(true)
    })
  }

  function closeKeypad() {
    const parsed = Number(keypadText.replace(",", "."))
    if (keypadText.trim() && Number.isFinite(parsed)) {
      hapticTick()
      const rounded = roundToStep(parsed, step, precision)
      const kept = clampNumber(rounded, min, manualMax)
      const shown = `${formatClinicalValue(kept, precision)}${unit ? ` ${unit}` : ""}`
      setLimitNotice(rounded > kept ? formatMessage(t("keypadLoweredToMax"), { value: shown }) : rounded < kept ? formatMessage(t("keypadRaisedToMin"), { value: shown }) : null)
      onChange(kept)
    }
    setKeypadOpen(false)
  }

  function pressKey(key: string) {
    hapticKey()
    if (key === "clear") { setKeypadText(""); return }
    if (key === "back") { setKeypadText((current) => current.slice(0, -1)); return }
    setKeypadText((current) => {
      if (key === "." && (precision === 0 || current.includes("."))) return current
      return `${current}${key}`.replace(/^0+(?=\d)/, "")
    })
  }

  const ratio = value == null ? 0 : (clampNumber(value, min, max) - min) / (max - min)

  const KEYPAD_MIN_W = 268
  const keypadWidth = Math.max(KEYPAD_MIN_W, anchor?.width ?? KEYPAD_MIN_W)
  const keypadLeft  = anchor
    ? keypadWidth <= (anchor.width ?? 0)
      ? anchor.x
      : Math.max(8, Math.min(anchor.x, screenWidth - keypadWidth - 8))
    : 8
  const keypadTop = anchor ? Math.max(8, Math.min(anchor.y, screenHeight - 330)) : 0

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <HoldRepeatPressable
          disabled={disabled}
          onStep={() => nudge(-1)}
          style={{ width: 44, height: 44, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.45 : 1 }}
        >
          <Text selectable={false} style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900" }}>-</Text>
        </HoldRepeatPressable>

        {/* See PreopFormWidgets: the unit lives below the field because a
            half-width field is only ~61px and "130 mmHg" needed 88. */}
        <View ref={fieldRef} collapsable={false} style={{ flex: 1 }}>
          <Pressable disabled={disabled} onPress={openKeypad} style={{ minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: colors.borderStrong, opacity: disabled ? 0.65 : 1 }}>
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

        <HoldRepeatPressable
          disabled={disabled}
          onStep={() => nudge(1)}
          style={{ width: 44, height: 44, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.45 : 1 }}
        >
          <Text selectable={false} style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900" }}>+</Text>
        </HoldRepeatPressable>
      </View>

      <View
        ref={(node) => {
          if (!node) return
          node.measureInWindow((x) => { trackXRef.current = x })
        }}
        onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        style={{ height: 28, justifyContent: "center" }}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        <View style={{ height: 5, borderRadius: 999, backgroundColor: colors.borderStrong }} />
        <View style={{ position: "absolute", left: `${ratio * 100}%`, width: 10, height: 22, marginLeft: -5, borderRadius: 5, backgroundColor: colors.textSecondary }} />
      </View>
      {limitNotice ? <Text testID="stepper-limit-notice" accessibilityRole="alert" style={{ color: colors.warning, fontSize: 12, fontWeight: "700" }}>{limitNotice}</Text> : null}

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
                      {key === "back" ? t("back") : key === "clear" ? t("keypadClear") : key}
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

export function VitalNumber({ label, unit, value, onChange, unobtainable, onToggleUnobtainable, min, max, step = 1, precision = 0, labelUnableToObtain, labelNotAvailable }: {
  label: string
  unit: string
  value?: number | null
  onChange: (value: number | null) => void
  unobtainable?: boolean
  onToggleUnobtainable?: () => void
  min: number
  max: number
  step?: number
  precision?: number
  labelUnableToObtain?: string
  labelNotAvailable?: string
}) {
  const { tc } = usePreferences()
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {/* Yields to the pill rather than pushing it out of the column. */}
        <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, color: colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{label}</Text>
        {onToggleUnobtainable && (
          <Pressable
            onPress={() => { hapticTick(); onToggleUnobtainable() }}
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: unobtainable ? colors.warning : colors.border,
              backgroundColor: unobtainable ? withAlpha(colors.warning, "18") : colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: unobtainable ? colors.warning : colors.textMuted, fontSize: 11, fontWeight: "900" }}>{labelUnableToObtain ?? tc("unableToObtain")}</Text>
          </Pressable>
        )}
      </View>
      {unobtainable ? (
        <View style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: "center", paddingHorizontal: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>{labelNotAvailable ?? tc("vitalNotAvailable")}</Text>
        </View>
      ) : (
        // No placeholder: the label is already above this row. Passing it here
        // rendered the field's own name a second time at value size, which on a
        // narrow phone overflowed into the +/- buttons.
        <VitalStepper value={value} onChange={(next) => { hapticTick(); onChange(next) }} min={min} max={max} step={step} precision={precision} unit={unit} />
      )}
    </View>
  )
}
