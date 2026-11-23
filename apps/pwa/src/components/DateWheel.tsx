import { Text, View } from "react-native"
import { DATE_WHEEL, clampCalendarDate, daysInMonth, type CalendarDate } from "@lospor/core/time-entry"
import { useShade } from "@/theme/colors"
import { WheelColumn } from "./TimeWheel"

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const YEARS = Array.from({ length: DATE_WHEEL.maxYear - DATE_WHEEL.minYear + 1 }, (_, i) => DATE_WHEEL.minYear + i)
const two = (value: number) => String(value).padStart(2, "0")

/** The one date entry of the PWA (10.8.0): day 1-31 following the month, month 1-12, year 2000-2100. */
export function DateWheel({ value, onChange, labels }: {
  value: CalendarDate
  onChange: (value: CalendarDate) => void
  labels: { day: string; month: string; year: string }
}) {
  const shade = useShade()
  const days = Array.from({ length: daysInMonth(value.year, value.month) }, (_, i) => i + 1)
  const set = (patch: Partial<CalendarDate>) => onChange(clampCalendarDate({ ...value, ...patch }))
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 }}>
      <WheelColumn values={days} value={value.day} format={two} label={labels.day} testID="date-wheel-day" onChange={day => set({ day })} />
      <Text style={{ color: shade("#94a3b8"), fontSize: 22, fontWeight: "800" }}>.</Text>
      <WheelColumn values={MONTHS} value={value.month} format={two} label={labels.month} testID="date-wheel-month" onChange={month => set({ month })} />
      <Text style={{ color: shade("#94a3b8"), fontSize: 22, fontWeight: "800" }}>.</Text>
      <WheelColumn values={YEARS} value={value.year} label={labels.year} testID="date-wheel-year" onChange={year => set({ year })} />
    </View>
  )
}
