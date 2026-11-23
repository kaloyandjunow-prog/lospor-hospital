"use client"

import { useState } from "react"
import { formatClockTime, parseTypedTime, typedTimeProgress, type ClockTime } from "@lospor/core/time-entry"
import { Wheel } from "./Wheel"

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const two = (value: number) => String(value).padStart(2, "0")

/**
 * The one way to enter a time on the web (10.8.0): two looping wheels, hours
 * 00-23 and minutes 00-59, and typing -- 1024 becomes 10:24. Opens on the
 * value it is given (now, or the item's own time).
 */
export function TimeWheel({ value, onChange, labels }: {
  value: ClockTime
  onChange: (value: ClockTime) => void
  labels: { hours: string; minutes: string; typed: string }
}) {
  const [typed, setTyped] = useState("")
  return (
    <div className="flex flex-col items-center gap-2">
      <input
        aria-label={labels.typed}
        data-testid="time-wheel-typed"
        inputMode="numeric"
        autoComplete="off"
        value={typed ? typedTimeProgress(typed) : formatClockTime(value)}
        onFocus={() => setTyped("")}
        onChange={event => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 4)
          setTyped(digits)
          const parsed = digits.length >= 3 ? parseTypedTime(digits) : null
          if (parsed) onChange(parsed)
        }}
        onBlur={() => setTyped("")}
        className="h-11 w-32 rounded-lg border border-slate-300 dark:border-[#4a4a4a] bg-white dark:bg-[#1f1f1f] text-center font-mono text-xl tabular-nums"
      />
      <div className="flex items-center gap-1">
        <Wheel values={HOURS} value={value.hour} format={two} label={labels.hours} testId="time-wheel-hours" onChange={hour => onChange({ ...value, hour })} />
        <span className="text-2xl font-bold text-slate-500">:</span>
        <Wheel values={MINUTES} value={value.minute} format={two} label={labels.minutes} testId="time-wheel-minutes" onChange={minute => onChange({ ...value, minute })} />
      </div>
    </div>
  )
}
