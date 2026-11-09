"use client"

import { useEffect, useRef, useState } from "react"
import type { LogEvent } from "@lospor/core/intraop-types"

/** The event a death in theatre is charted as (10.2.0). */
export const DEATH_EVENT_LABEL = "Death (exitus letalis)"

/**
 * A death charted on this screen (10.2.0): the postop destination becomes
 * Deceased (onDeath) and End case is offered as its own prompt. A death
 * already on the case when the screen opened asks nothing, and a screen
 * watching another screen's case writes nothing.
 */
export function useDeathPrompt(
  log: readonly LogEvent[] | undefined,
  canAnswer: boolean,
  onDeath?: () => void,
): [boolean, (open: boolean) => void] {
  const [prompt, setPrompt] = useState(false)
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!log || !canAnswer) return
    const deaths = log.filter(event => event.type === "clinical_event" && event.label === DEATH_EVENT_LABEL)
    if (seen.current == null) { seen.current = new Set(deaths.map(event => event.id)); return }
    const known = seen.current
    const fresh = deaths.find(event => !known.has(event.id))
    for (const event of deaths) known.add(event.id)
    if (fresh) { onDeath?.(); setPrompt(true) }
  }, [log, canAnswer, onDeath])
  return [prompt, setPrompt]
}
