"use client"
import { useEffect, useRef } from "react"
import { premedicationPrefill, type PremedicationOrders } from "@lospor/core/premedication"

type Field = "premedicationEvening" | "premedicationMorning"

/**
 * The intraoperative premedication starts from what the preop visit ordered
 * while a phase is still empty (1.7.0); a phase anyone filled, or marked N/A,
 * is left alone. Each order is applied once: a phase emptied on purpose is
 * filled again only if the order itself changes. Nothing on a read-only record.
 */
export function usePremedicationPrefill({ ordered, readOnly, getValue, setValue }: {
  ordered: PremedicationOrders | null | undefined
  readOnly: boolean
  getValue: (field: Field) => string | null | undefined
  setValue: (field: Field, value: string) => void
}) {
  const evening = ordered?.DAY_BEFORE ?? null
  const morning = ordered?.MORNING ?? null
  const applied = useRef<Partial<Record<Field, string | null>>>({})
  const read = useRef(getValue)
  const write = useRef(setValue)
  useEffect(() => { read.current = getValue; write.current = setValue })
  useEffect(() => {
    if (readOnly) return
    for (const [field, order] of [["premedicationEvening", evening], ["premedicationMorning", morning]] as const) {
      if (applied.current[field] === order) continue
      applied.current[field] = order
      const next = premedicationPrefill(read.current(field), order)
      if (next) write.current(field, next)
    }
  }, [evening, morning, readOnly])
}
