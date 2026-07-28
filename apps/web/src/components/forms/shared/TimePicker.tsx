"use client"
import React, { useRef, useEffect } from "react"

// 24h, 1-min interval time picker used across the intraop form's timing fields.
export const TimePicker = React.forwardRef<HTMLSelectElement, { value?: string; onChange: (v: string) => void }>(
  function TimePicker({ value, onChange }, ref) {
  // pendingRef tracks the latest HH:MM including rapid changes before React re-renders
  const pendingRef = useRef(value || "")
  useEffect(() => { pendingRef.current = value || "" }, [value])

  const parts = (value || ":").split(":")
  const h = parts[0] || ""
  const m = parts[1] || ""
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
  const mins  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))
  const selectClass = "flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  return (
    <div className="flex items-center gap-1">
      <select ref={ref} className={selectClass} value={h || ""} onChange={e => {
        const cur = pendingRef.current.split(":")
        const next = `${e.target.value}:${cur[1] || "00"}`
        pendingRef.current = next; onChange(next)
      }}>
        <option value="">HH</option>
        {hours.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="text-slate-500 font-bold">:</span>
      <select className={selectClass} value={m || ""} onChange={e => {
        const cur = pendingRef.current.split(":")
        const next = `${cur[0] || "00"}:${e.target.value}`
        pendingRef.current = next; onChange(next)
      }}>
        <option value="">MM</option>
        {mins.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  )
})
