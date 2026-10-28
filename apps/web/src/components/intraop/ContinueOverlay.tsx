"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The "Continue?" offered on an empty column after a stopped agent or fluid.
 *
 * A mouse sees it on hover before clicking. A finger does not: the button is
 * invisible until hovered, so one tap recorded a new administration that
 * nobody had seen offered (10.0.0). On touch the first tap only shows it; a
 * second tap on it continues. Unconfirmed, it hides again after a few seconds.
 */
export function ContinueOverlay({ label, onContinue, testId }: {
  label: string
  onContinue: () => void
  testId?: string
}) {
  const pointerType = useRef<string>("mouse")
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      data-testid={testId}
      data-armed={armed || undefined}
      onPointerDown={e => { pointerType.current = e.pointerType }}
      onClick={e => {
        e.stopPropagation()
        const finger = pointerType.current === "touch" || pointerType.current === "pen"
        if (finger && !armed) { setArmed(true); return }
        setArmed(false)
        onContinue()
      }}
      onBlur={() => setArmed(false)}
      className={`absolute inset-0 flex items-center justify-center transition-opacity z-10 cursor-pointer ${armed ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
    >
      <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
        {label}
      </span>
    </button>
  )
}
