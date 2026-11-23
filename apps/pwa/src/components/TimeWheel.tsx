import { useEffect, useRef, useState } from "react"
import { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native"
import { formatClockTime, parseTypedTime, typedTimeProgress } from "@lospor/core/time-entry"
import { useShade } from "@/theme/colors"

/**
 * One looping wheel column (10.8.0), the same as the web's: values repeat
 * above and below so the end leads back to the start; it snaps, and the
 * centred value is the chosen one. Each row is a 44 px target.
 */
const ITEM = 44
const REPEATS = 5

export function WheelColumn({ values, value, onChange, format, label, testID }: {
  values: number[]
  value: number
  onChange: (value: number) => void
  format?: (value: number) => string
  label: string
  testID?: string
}) {
  const shade = useShade()
  const ref = useRef<ScrollViewInstance | null>(null)
  const count = values.length
  const middle = Math.floor(REPEATS / 2) * count
  const index = Math.max(0, values.indexOf(value))

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.scrollTo({ y: (middle + index) * ITEM, animated: false }), 0)
    return () => clearTimeout(timer)
  }, [index, middle])

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const position = Math.round(event.nativeEvent.contentOffset.y / ITEM)
    const next = values[((position % count) + count) % count]
    ref.current?.scrollTo({ y: (middle + values.indexOf(next)) * ITEM, animated: false })
    if (next !== value) onChange(next)
  }

  return (
    <View style={{ height: ITEM * 5, width: 76 }} accessibilityLabel={label} testID={testID}>
      <View pointerEvents="none" style={{ position: "absolute", left: 4, right: 4, top: ITEM * 2, height: ITEM, borderRadius: 10, borderWidth: 1, borderColor: shade("#334155"), backgroundColor: shade("#ffffff10") }} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        onMomentumScrollEnd={settle}
        onScrollEndDrag={event => { if (!event.nativeEvent.velocity?.y) settle(event) }}
        contentContainerStyle={{ paddingVertical: ITEM * 2 }}
      >
        {Array.from({ length: REPEATS * count }, (_, i) => values[i % count]).map((item, i) => (
          <TouchableOpacity key={i} onPress={() => onChange(item)} style={{ height: ITEM, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: item === value ? "800" : "500", color: item === value ? shade("#f8fafc") : shade("#64748b") }}>
              {format ? format(item) : item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const two = (value: number) => String(value).padStart(2, "0")

/**
 * The one time entry of the PWA (10.8.0): hours 00-23 and minutes 00-59, looping,
 * and typing above them -- 1024 becomes 10:24 -- as on the web.
 */
export function TimeWheel({ hour, minute, onChange, labels }: {
  hour: number
  minute: number
  onChange: (value: { hour: number; minute: number }) => void
  labels: { hours: string; minutes: string; typed?: string }
}) {
  const shade = useShade()
  const [typed, setTyped] = useState("")
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
    <TextInput
      testID="time-wheel-typed"
      accessibilityLabel={labels.typed ?? labels.hours}
      keyboardType="number-pad"
      selectTextOnFocus
      value={typed ? typedTimeProgress(typed) : formatClockTime({ hour, minute })}
      onFocus={() => setTyped("")}
      onBlur={() => setTyped("")}
      onChangeText={value => {
        const digits = value.replace(/\D/g, "").slice(0, 4)
        setTyped(digits)
        const parsed = digits.length >= 3 ? parseTypedTime(digits) : null
        if (parsed) onChange(parsed)
      }}
      style={{ minHeight: 44, width: 128, borderRadius: 10, borderWidth: 1, borderColor: shade("#334155"), color: shade("#f8fafc"), fontSize: 20, fontWeight: "700", textAlign: "center", fontVariant: ["tabular-nums"] }}
    />
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <WheelColumn values={HOURS} value={hour} format={two} label={labels.hours} testID="time-wheel-hours" onChange={next => onChange({ hour: next, minute })} />
      <Text style={{ color: shade("#94a3b8"), fontSize: 24, fontWeight: "800" }}>:</Text>
      <WheelColumn values={MINUTES} value={minute} format={two} label={labels.minutes} testID="time-wheel-minutes" onChange={next => onChange({ hour, minute: next })} />
    </View>
    </View>
  )
}

/**
 * A time field that opens the wheel (10.8.0): the PWA's start and end of
 * anaesthesia, as the web's. Opens on the field's time, or on now when empty.
 */
export function TimeWheelField({ value, placeholder, onCommit, labels, testID }: {
  value: string
  placeholder: string
  onCommit: (hhmm: string) => void
  labels: { hours: string; minutes: string; typed?: string; cancel: string; confirm: string }
  testID?: string
}) {
  const shade = useShade()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ hour: 0, minute: 0 })
  const start = () => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value)
    const now = new Date()
    setDraft(match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: now.getHours(), minute: now.getMinutes() })
    setOpen(true)
  }
  return (
    <>
      <TouchableOpacity testID={testID} onPress={start} accessibilityRole="button"
        style={{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: shade("#2a3a4a"), backgroundColor: shade("#111111"), alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"], color: value ? shade("#f8fafc") : shade("#475569") }}>{value || placeholder}</Text>
      </TouchableOpacity>
      {open ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: shade("#000000") + "88", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
            <Pressable style={{ backgroundColor: shade("#0f172a"), borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }} onPress={() => {}}>
              <TimeWheel hour={draft.hour} minute={draft.minute} onChange={setDraft} labels={labels} />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity onPress={() => setOpen(false)} style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: shade("#334155"), alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: shade("#cbd5e1"), fontWeight: "700", fontSize: 15 }}>{labels.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={testID ? `${testID}-ok` : undefined} onPress={() => { onCommit(formatClockTime(draft)); setOpen(false) }}
                  style={{ flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: shade("#2563eb"), alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: shade("#ffffff"), fontWeight: "800", fontSize: 15 }}>{labels.confirm}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  )
}
