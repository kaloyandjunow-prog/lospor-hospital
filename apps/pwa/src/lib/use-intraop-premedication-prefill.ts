import { useEffect, useRef } from "react"
import { premedicationPrefill, type PremedicationOrders } from "@lospor/core/premedication"

type Phase = "evening" | "morning"

/**
 * The intraoperative premedication starts from what the preop visit ordered
 * while a phase is still empty (1.7.0); a phase anyone filled, or marked N/A,
 * is left alone. It waits for the case to load, so a phase is never filled
 * before the server's own value arrives, and writes nothing to a finalised
 * case. Each order is applied once: a phase emptied on purpose is filled again
 * only if the order itself changes. Both phases arrive in one fill, so one
 * save carries both.
 */
export function useIntraopPremedicationPrefill({ ready, readOnly, ordered, current, fill }: {
  ready: boolean
  readOnly: boolean
  ordered: PremedicationOrders | null | undefined
  current: Record<Phase, string>
  fill: (texts: Partial<Record<Phase, string>>) => void
}) {
  const evening = ordered?.DAY_BEFORE ?? null
  const morning = ordered?.MORNING ?? null
  const applied = useRef<Partial<Record<Phase, string | null>>>({})
  const latest = useRef({ current, fill })
  useEffect(() => { latest.current = { current, fill } })
  useEffect(() => {
    if (!ready || readOnly) return
    const texts: Partial<Record<Phase, string>> = {}
    for (const [phase, order] of [["evening", evening], ["morning", morning]] as const) {
      if (applied.current[phase] === order) continue
      applied.current[phase] = order
      const next = premedicationPrefill(latest.current.current[phase], order)
      if (next) texts[phase] = next
    }
    if (Object.keys(texts).length > 0) latest.current.fill(texts)
  }, [evening, morning, ready, readOnly])
}
