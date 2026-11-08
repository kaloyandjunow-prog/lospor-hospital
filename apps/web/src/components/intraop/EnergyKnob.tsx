"use client"

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import {
  DEFIBRILLATION_KNOB_SWEEP,
  DEFIBRILLATION_MAX_J,
  DEFIBRILLATION_MIN_J,
  DEFIBRILLATION_SELECTOR_STOPS,
  clampDefibrillationEnergy,
  defibrillationEnergyAtAngle,
  defibrillationKnobAngle,
  defibrillationSelectorAngle,
  defibrillationSelectorStopAt,
} from "@lospor/core/defibrillation"
import type { EnergyKnobSkin } from "@lospor/core/clinical-preferences"

/**
 * The shock energy knob (10.2.0), in the skin each clinician picks in
 * Settings > UI: A a defibrillator knob over a ticked scale, B a metal knob
 * in a ring of lights (one per 10 J), C a defibrillator selector that snaps
 * to its marked stops. Every skin turns by finger and by mouse, and with the
 * arrow keys (±1) and Page Up / Down (±10); the ±1 / ±10 buttons beside it set
 * any 1-360 J on every skin.
 */

const START = -DEFIBRILLATION_KNOB_SWEEP / 2

function polar(cx: number, cy: number, deg: number, r: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arc(cx: number, cy: number, from: number, to: number, r: number): string {
  const [x1, y1] = polar(cx, cy, from, r)
  const [x2, y2] = polar(cx, cy, to, r)
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

export function energyKnobAngle(skin: EnergyKnobSkin, energy: number | null): number {
  if (energy == null) return START
  return skin === "C" ? defibrillationSelectorAngle(energy) : defibrillationKnobAngle(energy)
}

/** The energy a pointer at this angle sets: anywhere on A and B, the nearest stop on C. */
export function energyAtKnobAngle(skin: EnergyKnobSkin, angle: number): number {
  return skin === "C" ? defibrillationSelectorStopAt(angle) : defibrillationEnergyAtAngle(angle)
}

export function EnergyKnob({ skin, energy, onChange, label, valueText, size = 240, testId = "defib-dial" }: {
  skin: EnergyKnobSkin
  energy: number | null
  onChange: (energy: number) => void
  label: string
  valueText: string
  size?: number
  testId?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const c = size / 2
  const angle = energyKnobAngle(skin, energy)

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const dx = event.clientX - (box.left + box.width / 2)
    const dy = box.top + box.height / 2 - event.clientY
    onChange(energyAtKnobAngle(skin, Math.atan2(dx, dy) * 180 / Math.PI))
  }
  const step = (delta: number) => onChange(clampDefibrillationEnergy((energy ?? (delta > 0 ? DEFIBRILLATION_MIN_J - 1 : DEFIBRILLATION_MIN_J + 1)) + delta))
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }
    if (deltas[event.key] != null) { event.preventDefault(); step(deltas[event.key]!) }
  }

  const knob = size * 0.54
  const rotate = { transform: `rotate(${angle.toFixed(1)}deg)`, transition: dragging ? "none" : "transform 220ms cubic-bezier(.2,.9,.3,1.25)" }

  return (
    <div
      ref={ref} role="slider" tabIndex={0} data-testid={testId} data-skin={skin}
      aria-label={label} aria-valuemin={DEFIBRILLATION_MIN_J} aria-valuemax={DEFIBRILLATION_MAX_J}
      aria-valuenow={energy ?? undefined} aria-valuetext={valueText}
      className="relative touch-none cursor-grab select-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      style={{ width: size, height: size }}
      onPointerDown={event => { setDragging(true); event.currentTarget.setPointerCapture?.(event.pointerId); fromPointer(event) }}
      onPointerMove={event => { if (dragging) fromPointer(event) }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={onKey}
    >
      {skin === "A" && (
        <>
          <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
            <path d={arc(c, c, START, START + DEFIBRILLATION_KNOB_SWEEP, size * 0.33)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={8} fill="none" strokeLinecap="round" />
            {energy != null && <path d={arc(c, c, START, Math.max(START + 0.5, angle), size * 0.33)} className="stroke-amber-500" strokeWidth={8} fill="none" strokeLinecap="round" />}
            {Array.from({ length: 37 }, (_, i) => {
              const value = Math.min(1 + i * 10, 360)
              const major = i % 5 === 0 || value === 360
              const a = defibrillationKnobAngle(value)
              const [x1, y1] = polar(c, c, a, size * (major ? 0.37 : 0.38))
              const [x2, y2] = polar(c, c, a, size * 0.41)
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={major ? 2.5 : 1.5} strokeLinecap="round"
                className={energy != null && value <= energy ? "stroke-amber-400" : "stroke-slate-400 dark:stroke-slate-600"} />
            })}
            {[1, 50, 100, 150, 200, 250, 300, 360].map(value => {
              const [x, y] = polar(c, c, defibrillationKnobAngle(value), size * 0.46)
              return <text key={value} x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={700}
                className={energy != null && value <= energy ? "fill-amber-600 dark:fill-amber-300" : "fill-slate-400 dark:fill-slate-500"}>{value}</text>
            })}
          </svg>
          <div className="absolute rounded-full" style={{ left: c - knob / 2, top: c - knob / 2, width: knob, height: knob, ...rotate }}>
            <div className="absolute inset-0 rounded-full" style={{ background: "repeating-conic-gradient(#2b2b2b 0deg 5deg,#171717 5deg 10deg)", boxShadow: "0 12px 22px rgba(0,0,0,.45), inset 0 0 0 2px #333" }} />
            <div className="absolute rounded-full" style={{ inset: knob * 0.1, background: "radial-gradient(circle at 38% 30%,#4a4a4a 0%,#262626 45%,#141414 100%)" }} />
            <div className="absolute rounded bg-white" style={{ left: knob / 2 - 4, top: knob * 0.12, width: 8, height: knob * 0.25, boxShadow: "0 0 8px rgba(255,255,255,.5)" }} />
          </div>
        </>
      )}
      {skin === "B" && (
        <>
          <div className="absolute inset-[6%] rounded-full bg-slate-900" style={{ boxShadow: "inset 0 2px 10px rgba(0,0,0,.9), 0 0 0 1px #222" }} />
          {Array.from({ length: 37 }, (_, i) => {
            const value = Math.min(1 + i * 10, 360)
            const [x, y] = polar(c, c, defibrillationKnobAngle(value), size * 0.39)
            const lit = energy != null && value <= energy
            const hot = lit && energy! - value < 10
            return <span key={i} aria-hidden="true" className="absolute rounded-full" style={{
              left: x - 5, top: y - 5, width: 10, height: 10,
              background: lit ? "radial-gradient(circle at 40% 35%,#fff7cc,#fbbf24 45%,#b45309)" : "#1f1f1f",
              boxShadow: lit ? `0 0 ${hot ? "14px 4px" : "7px 1px"} rgba(251,191,36,.75)` : "inset 0 1px 2px rgba(0,0,0,.9)",
            }} />
          })}
          <div className="absolute rounded-full" style={{ left: c - knob / 2, top: c - knob / 2, width: knob, height: knob, ...rotate }}>
            <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 20deg,#9ca3af,#e5e7eb,#6b7280,#d1d5db,#4b5563,#e5e7eb,#9ca3af,#f3f4f6,#6b7280,#9ca3af)", boxShadow: "0 14px 24px rgba(0,0,0,.6), inset 0 -8px 14px rgba(0,0,0,.45)" }} />
            <div className="absolute rounded-full" style={{ inset: knob * 0.08, background: "conic-gradient(from 200deg,#a3a3a3,#e5e5e5,#737373,#d4d4d4,#525252,#e5e5e5,#a3a3a3)" }} />
            <div className="absolute rounded" style={{ left: knob / 2 - 4, top: knob * 0.12, width: 8, height: knob * 0.2, background: "#f59e0b", boxShadow: "0 0 10px #f59e0b" }} />
          </div>
        </>
      )}
      {skin === "C" && (
        <>
          <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
            {(() => {
              const r1 = size * 0.33, r2 = size * 0.485
              const [ax, ay] = polar(c, c, START - 8, r2), [bx, by] = polar(c, c, -START + 8, r2)
              const [cx2, cy2] = polar(c, c, -START + 8, r1), [dx, dy] = polar(c, c, START - 8, r1)
              return <path d={`M ${ax} ${ay} A ${r2} ${r2} 0 1 1 ${bx} ${by} L ${cx2} ${cy2} A ${r1} ${r1} 0 1 0 ${dx} ${dy} Z`}
                className="fill-amber-500 stroke-amber-700 dark:fill-[#2a2116] dark:stroke-amber-500" strokeWidth={2.5} strokeLinejoin="round" />
            })()}
            {DEFIBRILLATION_SELECTOR_STOPS.map(stop => {
              const a = defibrillationSelectorAngle(stop)
              const [x, y] = polar(c, c, a, size * 0.42)
              const selected = stop === energy
              return (
                <g key={stop}>
                  {selected && <rect x={x - 15} y={y - 9} width={30} height={18} rx={4} className="fill-white dark:fill-amber-500" />}
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={selected ? 12 : 10} fontWeight={800}
                    className={selected ? "fill-slate-900" : "fill-amber-950 dark:fill-amber-200"}>{stop}</text>
                </g>
              )
            })}
          </svg>
          <div className="absolute rounded-full bg-zinc-300 dark:bg-[#0b0b0b]" style={{ left: c - knob * 0.53, top: c - knob * 0.53, width: knob * 1.06, height: knob * 1.06, boxShadow: "inset 0 3px 8px rgba(0,0,0,.5)" }} />
          <div className="absolute rounded-full" style={{ left: c - knob / 2, top: c - knob / 2, width: knob, height: knob, ...rotate }}>
            <div className="absolute inset-0 rounded-full" style={{ background: "repeating-conic-gradient(#3f3f46 0deg 6deg,#27272a 6deg 12deg)", boxShadow: "0 14px 24px rgba(0,0,0,.55)" }} />
            <div className="absolute rounded-full" style={{ inset: knob * 0.06, background: "radial-gradient(circle at 38% 30%,#52525b,#3f3f46 55%,#27272a)" }} />
            <div className="absolute rounded-full" style={{ left: knob / 2 - knob * 0.1, top: knob * 0.06, width: knob * 0.2, height: knob * 0.88, background: "linear-gradient(90deg,#3f3f46,#71717a 50%,#3f3f46)", boxShadow: "0 4px 8px rgba(0,0,0,.35)" }} />
            <div className="absolute rounded bg-amber-500" style={{ left: knob / 2 - knob * 0.03, top: knob * 0.1, width: knob * 0.06, height: knob * 0.13 }} />
          </div>
        </>
      )}
    </div>
  )
}
