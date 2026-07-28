"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { VitalsEntry } from "@/types/timetable"

const COL_W = 74
const LABEL_W = 96
const CHART_H = 220
const Y_MAX = 220
const GRID_VALS = [40, 80, 120, 160, 200]

export const VITAL_ROW_DEFS: {
  key:      keyof VitalsEntry
  label:    string
  unit:     string
  color:    string
  min:      number
  max:      number
  step:     number
  defaultVal: number
  monitors: string[]
}[] = [
  { key:"systolic",  label:"BP Sys",  unit:"mmHg",  color:"#ef4444", min:0,  max:300, step:1,   defaultVal:120, monitors:["nbpMonitor","invasiveBP"] },
  { key:"diastolic", label:"BP Dia",  unit:"mmHg",  color:"#ef4444", min:0,  max:200, step:1,   defaultVal:80,  monitors:["nbpMonitor","invasiveBP"] },
  { key:"heartRate", label:"HR",      unit:"bpm",   color:"#22c55e", min:0,  max:300, step:1,   defaultVal:70,  monitors:["ecg","spO2Monitor"]       },
  { key:"spO2",      label:"SpO₂",   unit:"%",     color:"#06b6d4", min:50, max:100, step:1,   defaultVal:98,  monitors:["spO2Monitor"]             },
  { key:"etco2",     label:"EtCO₂",  unit:"mmHg",  color:"#f59e0b", min:0,  max:80,  step:1,   defaultVal:35,  monitors:["etco2Monitor"]            },
  { key:"temp",      label:"Temp",    unit:"°C",    color:"#a78bfa", min:30, max:42,  step:0.1, defaultVal:36.5,monitors:["tempMonitor"]             },
  { key:"bgl",       label:"Serum/peripheral glucose", unit:"mmol/L",color:"#34d399", min:0,  max:30,  step:0.1, defaultVal:5.5, monitors:["bglMonitor"]              },
]

// ── Div-based chart ───────────────────────────────────────────────────────────
export const DivChart = memo(function DivChart({ vitals, colStart, rowColCount, activeRows }: { vitals: VitalsEntry[]; colStart: number; rowColCount: number; activeRows: typeof VITAL_ROW_DEFS }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [w, setW]    = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setW(el.offsetWidth)
    const obs = new ResizeObserver(([e]) => setW(e.contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const chartW = Math.max(0, w - LABEL_W)
  const colW   = chartW > 0 ? chartW / rowColCount : COL_W

  function dotX(localIdx: number) { return (localIdx + 0.5) * colW }
  function dotY(v: number)   { return CHART_H * (1 - v / Y_MAX) }

  function series(
    key: keyof VitalsEntry, color: string,
    opacity = 1, dashed = false,
  ) {
    const pts = vitals.slice(colStart, colStart + rowColCount).flatMap((row, localIdx) =>
      row[key] != null ? [{ localIdx, x: dotX(localIdx), y: dotY(row[key]!), val: row[key]! }] : []
    )
    return (
      <>
        {/* connecting lines */}
        {pts.slice(1).map((p, i) => {
          const prev = pts[i]
          const dx = p.x - prev.x, dy = p.y - prev.y
          const len = Math.sqrt(dx * dx + dy * dy)
          const ang = Math.atan2(dy, dx) * 180 / Math.PI
          return (
            <div key={`l${i}`}
              className="absolute pointer-events-none"
              style={{
                left:   LABEL_W + prev.x,
                top:    prev.y,
                width:  len,
                height: 1.5,
                opacity,
                transform:       `rotate(${ang}deg)`,
                transformOrigin: "left center",
                backgroundColor: dashed ? "transparent" : color,
                borderTop:       dashed ? `1.5px dashed ${color}` : undefined,
              }}
            />
          )
        })}
        {/* dots */}
        {pts.map(p => (
          <div key={`d${p.localIdx}`}
            title={String(p.val)}
            className="absolute rounded-full cursor-default z-10"
            style={{ left: LABEL_W + p.x - 3, top: p.y - 3, width: 6, height: 6, backgroundColor: color, opacity }}
          />
        ))}
      </>
    )
  }

  return (
    <div ref={containerRef}
      className="relative border-b border-slate-100 dark:border-[#2a2a2a] overflow-hidden"
      style={{ height: CHART_H }}>

      {/* grid lines */}
      {GRID_VALS.map(v => {
        const y = dotY(v)
        return (
          <div key={v}>
            <div className="absolute border-t border-slate-100 dark:border-[#282828] pointer-events-none"
                 style={{ left: LABEL_W, right: 0, top: y }} />
            <span className="absolute text-[9px] text-slate-300 dark:text-[#444] select-none"
                  style={{ right: w - LABEL_W + 4, top: y - 5 }}>{v}</span>
          </div>
        )
      })}

      {/* col separators */}
      {w > 0 && Array.from({ length: rowColCount }, (_, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-l border-slate-50 dark:border-[#222] pointer-events-none"
             style={{ left: LABEL_W + i * colW }} />
      ))}

      {/* BP pulse-pressure fill - trapezoids between consecutive sys/dia pairs */}
      {w > 0 && vitals.slice(colStart, colStart + rowColCount - 1).map((row, localIdx) => {
        const next = vitals[colStart + localIdx + 1]
        if (row.systolic == null || row.diastolic == null ||
            next?.systolic == null || next?.diastolic == null) return null
        const x1 = dotX(localIdx), x2 = dotX(localIdx + 1)
        const sy1 = dotY(row.systolic),  dy1 = dotY(row.diastolic)
        const sy2 = dotY(next.systolic), dy2 = dotY(next.diastolic)
        const top    = Math.min(sy1, sy2)
        const bottom = Math.max(dy1, dy2)
        const h      = bottom - top
        if (h <= 0) return null
        const pct = (v: number) => `${((v - top) / h * 100).toFixed(1)}%`
        return (
          <div key={localIdx} className="absolute pointer-events-none"
            style={{
              left:   LABEL_W + x1,
              top,
              width:  x2 - x1,
              height: h,
              backgroundColor: "#ef4444",
              opacity: 0.18,
              clipPath: `polygon(0% ${pct(sy1)}, 100% ${pct(sy2)}, 100% ${pct(dy2)}, 0% ${pct(dy1)})`,
            }}
          />
        )
      })}

      {w > 0 && activeRows.map(row => (
        <div key={row.key}>
          {series(row.key, row.color, row.key === "diastolic" ? 0.55 : 0.9, row.key === "diastolic")}
        </div>
      ))}
    </div>
  )
})

// ── Fluid color by category ───────────────────────────────────────────────────
