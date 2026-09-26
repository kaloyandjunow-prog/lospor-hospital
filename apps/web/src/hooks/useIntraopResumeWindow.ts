"use client"

import { useEffect, useRef, useState, type MutableRefObject } from "react"
import { toast } from "sonner"
import { INTRAOP_RESUME_WINDOW_MS, INTRAOP_RESUME_WINDOW_SECONDS } from "@lospor/core/intraop-engine"
import type { TimetableData } from "@/types/timetable"

function clockLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/**
 * The time after End case during which the case can be resumed. It counts from
 * the saved end, so a case reopened after it ended still offers Resume for
 * what is left of the window (9.12.1); before, only the page that pressed End
 * case ever did.
 */
export function useIntraopResumeWindow(endedAt: string | null | undefined) {
  const endedAtRef = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)
  const [resumeUntilLabel, setResumeUntilLabel] = useState("")

  /** Opens the window at `ended` (End case pressed here, or the saved end). */
  const startWindow = (ended: Date) => {
    endedAtRef.current = ended
    const left = Math.floor((ended.getTime() + INTRAOP_RESUME_WINDOW_MS - Date.now()) / 1000)
    if (left <= 0) return
    setResumeUntilLabel(clockLabel(new Date(ended.getTime() + INTRAOP_RESUME_WINDOW_MS)))
    setResumeSecsLeft(Math.min(left, INTRAOP_RESUME_WINDOW_SECONDS))
  }

  /** Resumed: the next End case opens a fresh window. */
  const clearWindow = () => {
    endedAtRef.current = null
  }

  // Reopened after End case.
  useEffect(() => {
    if (!endedAt || endedAtRef.current) return
    const ended = new Date(endedAt)
    if (Number.isNaN(ended.getTime())) return
    endedAtRef.current = ended
    const left = Math.floor((ended.getTime() + INTRAOP_RESUME_WINDOW_MS - Date.now()) / 1000)
    if (left <= 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResumeUntilLabel(clockLabel(new Date(ended.getTime() + INTRAOP_RESUME_WINDOW_MS)))
    setResumeSecsLeft(left)
  }, [endedAt])

  // Countdown: every second while the window is open.
  const active = resumeSecsLeft > 0
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      if (!endedAtRef.current) return
      const elapsed = Math.floor((Date.now() - endedAtRef.current.getTime()) / 1000)
      setResumeSecsLeft(Math.max(0, INTRAOP_RESUME_WINDOW_SECONDS - elapsed))
    }, 1000)
    return () => clearInterval(id)
  }, [active])

  return { resumeSecsLeft, resumeUntilLabel, startWindow, clearWindow }
}

/** After Resume, offer to take back the stops End case made (1.4.9). */
export function offerRemoveEndCaseStops(
  dataRef: MutableRefObject<TimetableData>,
  onChangeRef: MutableRefObject<(data: TimetableData) => void>,
  t: (key: string, values?: Record<string, number>) => string,
) {
  const d = dataRef.current
  const count = [...d.infusions, ...d.fluids, ...d.agents, ...(d.gasSettings ?? [])].filter(item => item.endCaseStop).length
  if (count === 0) return
  toast(t("intraop.timelineRules.resumeRemoveStopsTitle"), {
    description: t("intraop.timelineRules.resumeRemoveStopsMessage", { count }),
    duration: 30_000,
    action: {
      label: t("intraop.timelineRules.resumeRemoveStops"),
      onClick: () => {
        const current = dataRef.current
        const unstop = <S extends { endCaseStop?: boolean; stopped?: boolean }>(item: S): S =>
          item.endCaseStop ? { ...item, stopped: false, endCaseStop: undefined } : item
        onChangeRef.current({
          ...current,
          infusions: current.infusions.map(unstop),
          fluids: current.fluids.map(unstop),
          agents: current.agents.map(unstop),
          gasSettings: (current.gasSettings ?? []).map(unstop),
        })
      },
    },
  })
}
