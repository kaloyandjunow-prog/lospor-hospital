"use client"

/* eslint-disable react-hooks/refs */
import { useEffect, useRef } from "react"
import { Minus, Plus } from "lucide-react"

interface Props {
  // null as well as undefined: a cleared clinical field is stored as null so
  // that the clear reaches the server, and every read below already treats it
  // the same way through `?? min` / `?? ""`. Widened here rather than coalesced
  // at each call site, where it would be easy to coalesce the stored value by
  // mistake and silently turn a clear back into a number.
  value: number | null | undefined
  // Emptying the field emits `null`, never `undefined`. A patch carries
  // `undefined` as "the client did not mention this field", so the server keeps
  // what it has — meaning a cleared measurement silently stayed on the record
  // and the form showed it as empty. `null` is the clear, and it survives.
  onChange: (v: number | null) => void
  min: number
  max: number
  step?: number
  stepFn?: (value: number) => number
  unit?: string
  placeholder?: string
  showSlider?: boolean
}

export function NumberStepper({ value, onChange, min, max, step = 1, stepFn, unit, placeholder = "—", showSlider = false }: Props) {
  const valueRef    = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const timerRef = useRef<{
    initial: ReturnType<typeof setTimeout> | null
    repeat:  ReturnType<typeof setInterval> | null
  }>({ initial: null, repeat: null })

  function clamp(v: number, s = step) {
    const rounded = Math.round(v / s) * s
    const fixed = parseFloat(rounded.toFixed(10))
    return Math.min(max, Math.max(min, fixed))
  }

  function increment() {
    const cur = valueRef.current ?? min
    const s = stepFn ? stepFn(cur) : step
    onChangeRef.current(clamp(cur + s, s))
  }
  function decrement() {
    const cur = valueRef.current ?? min
    const s = stepFn ? stepFn(cur) : step
    onChangeRef.current(clamp(cur - s, s))
  }

  function startHold(fn: () => void) {
    fn()
    timerRef.current.initial = setTimeout(() => {
      timerRef.current.repeat = setInterval(fn, 120)
      setTimeout(() => {
        if (!timerRef.current.repeat) return
        clearInterval(timerRef.current.repeat)
        timerRef.current.repeat = setInterval(fn, 50)
      }, 1500)
    }, 400)
  }

  function stopHold() {
    if (timerRef.current.initial) { clearTimeout(timerRef.current.initial);  timerRef.current.initial = null }
    if (timerRef.current.repeat)  { clearInterval(timerRef.current.repeat);  timerRef.current.repeat  = null }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (raw === "" || raw === "-") { onChangeRef.current(null); return }
    const n = parseFloat(raw)
    if (!isNaN(n)) onChangeRef.current(clamp(n))
  }

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    onChangeRef.current(clamp(parseFloat(e.target.value)))
  }

  const btnClass = "flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-600 dark:text-[#c0c0c0] hover:bg-slate-50 dark:hover:bg-[#333] hover:border-slate-300 active:bg-slate-100 dark:active:bg-[#3a3a3a] select-none touch-none transition-colors"

  function makeHandlers(fn: () => void) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        startHold(fn)
      },
      onPointerUp:     stopHold,
      onPointerCancel: stopHold,
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button type="button" tabIndex={-1} className={btnClass} {...makeHandlers(decrement)}>
          <Minus className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-1 flex-1">
          <input
            type="number"
            value={value ?? ""}
            onChange={handleInput}
            onFocus={e => e.target.select()}
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            className="w-full text-center text-lg font-semibold text-slate-800 bg-transparent outline-none border-b-2 border-slate-200 focus:border-blue-500 transition-colors pb-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && <span className="text-sm text-slate-400 whitespace-nowrap">{unit}</span>}
        </div>

        <button type="button" tabIndex={-1} className={btnClass} {...makeHandlers(increment)}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {showSlider && (
        <input
          type="range"
          tabIndex={-1}
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          onChange={handleSlider}
          className="w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-runnable-track]:h-[2px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-slate-200 dark:[&::-webkit-slider-runnable-track]:bg-[#3a3a3a]
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-[6px] [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-slate-400 dark:[&::-webkit-slider-thumb]:bg-[#888] [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-none
            [&::-moz-range-track]:h-[2px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-slate-200 dark:[&::-moz-range-track]:bg-[#3a3a3a]
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-[6px] [&::-moz-range-thumb]:rounded-[2px] [&::-moz-range-thumb]:bg-slate-400 dark:[&::-moz-range-thumb]:bg-[#888] [&::-moz-range-thumb]:border-0"
        />
      )}
    </div>
  )
}
