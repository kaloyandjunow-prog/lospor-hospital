"use client"

import { DATE_WHEEL, clampCalendarDate, daysInMonth, type CalendarDate } from "@lospor/core/time-entry"
import { Wheel } from "./Wheel"

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const YEARS = Array.from({ length: DATE_WHEEL.maxYear - DATE_WHEEL.minYear + 1 }, (_, i) => DATE_WHEEL.minYear + i)
const two = (value: number) => String(value).padStart(2, "0")

/**
 * The one way to enter a date on the web (10.8.0): day, month and year wheels
 * (day 1-31 following the month, month 1-12, year 2000-2100), looping.
 */
export function DateWheel({ value, onChange, labels }: {
  value: CalendarDate
  onChange: (value: CalendarDate) => void
  labels: { day: string; month: string; year: string }
}) {
  const days = Array.from({ length: daysInMonth(value.year, value.month) }, (_, i) => i + 1)
  const set = (patch: Partial<CalendarDate>) => onChange(clampCalendarDate({ ...value, ...patch }))
  return (
    <div className="flex items-center gap-1">
      <Wheel values={days} value={value.day} format={two} label={labels.day} testId="date-wheel-day" onChange={day => set({ day })} />
      <span className="text-xl font-bold text-slate-500">.</span>
      <Wheel values={MONTHS} value={value.month} format={two} label={labels.month} testId="date-wheel-month" onChange={month => set({ month })} />
      <span className="text-xl font-bold text-slate-500">.</span>
      <Wheel values={YEARS} value={value.year} label={labels.year} testId="date-wheel-year" onChange={year => set({ year })} />
    </div>
  )
}
