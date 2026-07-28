import { useEffect, useMemo, useRef, useState } from "react"
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native"
import { hapticConfirm, hapticKey, hapticTick } from "@/lib/haptic"
import { colors, withAlpha } from "@/theme/colors"

export function parseClinicalNumber(text: string): number | undefined {
  const normalised = text.trim().replace(",", ".")
  if (!normalised) return undefined
  const parsed = Number(normalised)
  return Number.isFinite(parsed) ? parsed : undefined
}

type Props = {
  label?: string
  value?: number
  onChange: (value: number | undefined) => void
  unit?: string
  min?: number
  max?: number
  step?: number
  precision?: number
  quickValues?: number[]
  placeholder?: string
  showSteppers?: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatValue(value: number | undefined, precision: number) {
  if (value == null) return ""
  return precision > 0 ? value.toFixed(precision).replace(/\.0+$/, "") : String(Math.round(value))
}

const WHEEL_ROW_HEIGHT = 42
const WHEEL_VISIBLE_ROWS = 5
const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * WHEEL_VISIBLE_ROWS + 12
const KEYPAD_HEIGHT = 336

type AnchorRect = {
  x: number
  y: number
  width: number
  height: number
}

export function ClinicalNumberInput({
  label,
  value,
  onChange,
  unit,
  min = 0,
  max = 999,
  step = 1,
  precision = 0,
  quickValues = [],
  placeholder = "-",
  showSteppers = true,
}: Props) {
  const [wheelOpen, setWheelOpen] = useState(false)
  const [entryMode, setEntryMode] = useState<"wheel" | "keypad">("wheel")
  const [keypadText, setKeypadText] = useState("")
  const [visualIndex, setVisualIndex] = useState(0)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const { height: screenHeight } = useWindowDimensions()
  const fieldRef = useRef<View>(null)
  const wheelRef = useRef<ScrollView>(null)
  const wheelIndexRef = useRef(0)
  const momentumActiveRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestOffsetRef = useRef(0)
  const dragRunRef = useRef(0)

  const wheelValues = useMemo(() => {
    const values: number[] = []
    if (unit === "kg" && step === 0.5 && max > 20) {
      for (let next = min; next <= Math.min(20, max); next += 0.5) {
        values.push(Number(next.toFixed(Math.max(precision, 2))))
      }
      for (let next = Math.max(21, Math.ceil(min)); next <= max; next += 1) {
        values.push(next)
      }
      return Array.from(new Set(values))
    }
    const count = Math.floor((max - min) / step)
    for (let i = 0; i <= count; i += 1) values.push(Number((min + i * step).toFixed(Math.max(precision, 2))))
    return values
  }, [max, min, precision, step, unit])

  const selectedIndex = useMemo(() => {
    if (value == null) return 0
    const safe = clamp(value, min, max)
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    wheelValues.forEach((candidate, index) => {
      const distance = Math.abs(candidate - safe)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    return nearestIndex
  }, [max, min, value, wheelValues])

  useEffect(() => {
    if (!wheelOpen) return
    const timeout = setTimeout(() => {
      wheelRef.current?.scrollTo({ y: wheelIndexRef.current * WHEEL_ROW_HEIGHT, animated: false })
    }, 40)
    return () => clearTimeout(timeout)
  }, [wheelOpen])

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [])

  function setNumber(next: number | undefined) {
    hapticConfirm()
    onChange(next)
  }

  function nudge(direction: -1 | 1) {
    const base = value ?? min
    setNumber(clamp(Number((base + direction * step).toFixed(Math.max(precision, 2))), min, max))
  }

  function openWheel() {
    const index = selectedIndex
    wheelIndexRef.current = index
    latestOffsetRef.current = index * WHEEL_ROW_HEIGHT
    setVisualIndex(index)
    setKeypadText(value != null ? formatValue(value, precision) : formatValue(wheelValues[index] ?? min, precision))
    setEntryMode("wheel")
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setWheelOpen(true)
    })
  }

  function previewIndex(index: number, haptic = true) {
    const safeIndex = clamp(index, 0, wheelValues.length - 1)
    if (safeIndex === wheelIndexRef.current) return
    wheelIndexRef.current = safeIndex
    setVisualIndex(safeIndex)
    if (!haptic) return
    hapticTick()
  }

  function previewValue(next: number) {
    const safe = clamp(next, min, max)
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    wheelValues.forEach((candidate, index) => {
      const distance = Math.abs(candidate - safe)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    wheelIndexRef.current = nearestIndex
    latestOffsetRef.current = nearestIndex * WHEEL_ROW_HEIGHT
    setVisualIndex(nearestIndex)
  }

  function settleWheel(offsetY = latestOffsetRef.current) {
    const clampedOffset = clamp(offsetY, 0, Math.max(0, (wheelValues.length - 1) * WHEEL_ROW_HEIGHT))
    const index = clamp(Math.round(clampedOffset / WHEEL_ROW_HEIGHT), 0, wheelValues.length - 1)
    latestOffsetRef.current = index * WHEEL_ROW_HEIGHT
    momentumActiveRef.current = false
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    previewIndex(index)
  }

  function commitAndClose() {
    const typed = entryMode === "keypad" ? parseClinicalNumber(keypadText) : undefined
    const next = typed != null ? clamp(typed, min, max) : wheelValues[wheelIndexRef.current]
    if (next != null) setNumber(next)
    momentumActiveRef.current = false
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    setWheelOpen(false)
  }

  function scheduleFallbackSettle(runId: number) {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(() => {
      if (runId !== dragRunRef.current) return
      settleWheel(latestOffsetRef.current)
    }, 180)
  }

  function pressKey(key: string) {
    hapticKey()
    if (key === "clear") {
      setKeypadText("")
      return
    }
    if (key === "back") {
      setKeypadText((current) => {
        const next = current.slice(0, -1)
        const parsed = parseClinicalNumber(next)
        if (parsed != null) previewValue(parsed)
        return next
      })
      return
    }
    setKeypadText((current) => {
      if (key === "." && (precision === 0 || current.includes("."))) return current
      const next = `${current}${key}`.replace(/^0+(?=\d)/, "")
      const parsed = parseClinicalNumber(next)
      if (parsed != null) previewValue(parsed)
      return next
    })
  }

  const pickerHeight = entryMode === "keypad" ? KEYPAD_HEIGHT : WHEEL_HEIGHT + 42
  const wheelTop = anchor ? Math.max(8, Math.min(anchor.y, screenHeight - pickerHeight - 8)) : 0

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "800" }}>{label}</Text> : null}

      {quickValues.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {quickValues.map((quick) => {
            const selected = value === quick
            return (
              <Pressable
                key={quick}
                onPress={() => setNumber(quick)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: selected ? colors.textPrimary : colors.textSecondary, fontSize: 13, fontWeight: "900" }}>
                  {formatValue(quick, precision)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {showSteppers ? (
          <Pressable
            onPress={() => nudge(-1)}
            style={{ width: 44, height: 44, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "800" }}>-</Text>
          </Pressable>
        ) : null}
        <View ref={fieldRef} collapsable={false} style={{ flex: 1 }}>
          <View style={{ opacity: wheelOpen ? 0 : 1 }}>
            <Pressable
              onPress={openWheel}
              style={{ minHeight: 48, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: withAlpha(colors.primary, "55") }}
            >
              <Text style={{ color: value == null ? colors.textMuted : colors.textPrimary, fontSize: 21, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                {value == null ? placeholder : formatValue(value, precision)}{unit ? <Text style={{ color: colors.textMuted, fontSize: 13 }}> {unit}</Text> : null}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2 }}>tap for wheel</Text>
            </Pressable>
          </View>

          <Modal visible={wheelOpen && anchor != null} transparent animationType="fade" onRequestClose={commitAndClose}>
            <Pressable onPress={commitAndClose} style={{ flex: 1, backgroundColor: "transparent" }}>
              <Pressable
                onPress={(event) => event.stopPropagation?.()}
                onStartShouldSetResponder={() => true}
                style={{
                  position: "absolute",
                  left: anchor?.x ?? 0,
                  top: wheelTop,
                  width: anchor?.width ?? "100%",
                }}
              >
            <View
              onStartShouldSetResponder={() => true}
              style={{
                borderRadius: 18,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: withAlpha(colors.primary, "66"),
                backgroundColor: colors.surface,
                padding: 6,
                boxShadow: "0 16px 34px rgba(0,0,0,0.32)",
              }}
            >
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                {(["wheel", "keypad"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setEntryMode(mode)}
                    style={{
                      flex: 1,
                      minHeight: 34,
                      borderRadius: 11,
                      borderCurve: "continuous",
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: entryMode === mode ? withAlpha(colors.primary, "88") : colors.border,
                      backgroundColor: entryMode === mode ? colors.primarySoft : colors.surfaceRaised,
                    }}
                  >
                    <Text style={{ color: entryMode === mode ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: "900" }}>
                      {mode === "wheel" ? "Wheel" : "123"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {entryMode === "wheel" ? (
              <View style={{ height: WHEEL_ROW_HEIGHT * WHEEL_VISIBLE_ROWS, overflow: "hidden", borderRadius: 14, borderCurve: "continuous" }}>
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: WHEEL_ROW_HEIGHT * 2,
                    height: WHEEL_ROW_HEIGHT,
                    borderRadius: 12,
                    borderCurve: "continuous",
                    backgroundColor: withAlpha(colors.textPrimary, "10"),
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: withAlpha(colors.textPrimary, "24"),
                    zIndex: 1,
                  }}
                />
                <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: WHEEL_ROW_HEIGHT, backgroundColor: withAlpha(colors.surface, "DD"), zIndex: 2 }} />
                <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: WHEEL_ROW_HEIGHT, backgroundColor: withAlpha(colors.surface, "DD"), zIndex: 2 }} />
                <ScrollView
                  ref={wheelRef}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  alwaysBounceVertical={false}
                  overScrollMode="never"
                  snapToInterval={WHEEL_ROW_HEIGHT}
                  decelerationRate="fast"
                  onScroll={(event) => {
                    latestOffsetRef.current = event.nativeEvent.contentOffset.y
                    previewIndex(Math.round(event.nativeEvent.contentOffset.y / WHEEL_ROW_HEIGHT))
                  }}
                  scrollEventThrottle={16}
                  onScrollBeginDrag={() => {
                    dragRunRef.current += 1
                    momentumActiveRef.current = false
                    if (settleTimerRef.current) {
                      clearTimeout(settleTimerRef.current)
                      settleTimerRef.current = null
                    }
                  }}
                  onMomentumScrollBegin={() => {
                    momentumActiveRef.current = true
                    if (settleTimerRef.current) {
                      clearTimeout(settleTimerRef.current)
                      settleTimerRef.current = null
                    }
                  }}
                  onMomentumScrollEnd={(event) => {
                    latestOffsetRef.current = event.nativeEvent.contentOffset.y
                    settleWheel()
                  }}
                  onScrollEndDrag={(event) => {
                    latestOffsetRef.current = event.nativeEvent.contentOffset.y
                    const velocityY = Math.abs(event.nativeEvent.velocity?.y ?? 0)
                    if (velocityY > 0.15 || momentumActiveRef.current) {
                      scheduleFallbackSettle(dragRunRef.current)
                      return
                    }
                    settleWheel()
                  }}
                  contentContainerStyle={{ paddingVertical: WHEEL_ROW_HEIGHT * 2 }}
                >
                  {wheelValues.map((next, index) => {
                    const distance = Math.min(2, Math.abs(index - visualIndex))
                    const selected = index === visualIndex
                    return (
                      <Pressable
                        key={`${next}-${index}`}
                        onPress={() => {
                          previewIndex(index)
                          setNumber(next)
                          wheelRef.current?.scrollTo({ y: index * WHEEL_ROW_HEIGHT, animated: true })
                          commitAndClose()
                        }}
                        style={{ height: WHEEL_ROW_HEIGHT, alignItems: "center", justifyContent: "center" }}
                      >
                        <Text
                          style={{
                            color: selected ? colors.textPrimary : colors.textSecondary,
                            fontSize: selected ? 24 : 18,
                            fontWeight: selected ? "900" : "700",
                            opacity: selected ? 1 : distance === 1 ? 0.58 : 0.24,
                            fontVariant: ["tabular-nums"],
                            transform: [{ scale: selected ? 1 : distance === 1 ? 0.9 : 0.78 }],
                          }}
                        >
                          {formatValue(next, precision)}{unit ? ` ${unit}` : ""}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <View style={{ minHeight: 54, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.textPrimary, "24"), backgroundColor: withAlpha(colors.textPrimary, "10"), alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: keypadText ? colors.textPrimary : colors.textMuted, fontSize: 25, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                      {keypadText || "-"}{unit && keypadText ? <Text style={{ color: colors.textMuted, fontSize: 13 }}> {unit}</Text> : null}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", precision > 0 ? "." : "clear", "0", "back"].map((key) => (
                      <Pressable
                        key={key}
                        onPress={() => pressKey(key)}
                        style={{
                          width: "31.5%",
                          minHeight: 48,
                          borderRadius: 14,
                          borderCurve: "continuous",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.surfaceRaised,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text style={{ color: colors.textPrimary, fontSize: key.length === 1 ? 21 : 13, fontWeight: "900" }}>
                          {key === "back" ? "Back" : key === "clear" ? "Clear" : key}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
        {showSteppers ? (
          <Pressable
            onPress={() => nudge(1)}
            style={{ width: 44, height: 44, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "800" }}>+</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
