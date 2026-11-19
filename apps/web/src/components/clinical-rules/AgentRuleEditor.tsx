"use client"

import { useState } from "react"
import { useLocale } from "next-intl"
import type {
  AdultDoseProfileRulePayload,
  ClinicalRulePayload,
  PediatricAgentProfileRulePayload,
} from "@lospor/core/clinical-rules"
import { useClinicalRuleUiCopy } from "./ui-copy"

type AgentRulePayload = Extract<AdultDoseProfileRulePayload, { kind: "ADULT_AGENT_PROFILE" }> | PediatricAgentProfileRulePayload

const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100"
const labelClass = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"

export function isAgentRulePayload(payload: ClinicalRulePayload | null): payload is AgentRulePayload {
  return payload?.kind === "ADULT_AGENT_PROFILE" || payload?.kind === "PEDIATRIC_AGENT_PROFILE"
}

function parseQuick(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean).map(part => Number(part.replace(",", ".")))
  return parts.length > 0 && parts.every(Number.isFinite) ? parts : null
}

/**
 * Range, step and quick buttons of an inhaled agent's concentration (% vol).
 * Only these four numbers are edited; the rule's identity is fixed.
 */
export function AgentRuleEditor({ initial, busy, onSubmit, onCancel }: {
  initial: AgentRulePayload
  busy: boolean
  onSubmit: (payload: ClinicalRulePayload) => void
  onCancel: () => void
}) {
  const copy = useClinicalRuleUiCopy()
  const bg = useLocale() === "bg"
  const profile = initial.profile
  const [min, setMin] = useState(String(profile.min))
  const [max, setMax] = useState(String(profile.max))
  const [step, setStep] = useState(String(profile.step))
  const [quick, setQuick] = useState((profile.quickValues ?? []).join(", "))
  const [error, setError] = useState("")

  function save() {
    const lo = Number(min.replace(",", "."))
    const hi = Number(max.replace(",", "."))
    const st = Number(step.replace(",", "."))
    const values = parseQuick(quick)
    if (![lo, hi, st].every(Number.isFinite) || lo < 0 || hi <= lo || st <= 0 || !values
      || values.some(value => value < lo || value > hi)) {
      setError(bg
        ? "Минимумът трябва да е под максимума, стъпката над 0, а бързите стойности — в обхвата."
        : "Minimum must be below maximum, step above 0, and the quick values inside the range.")
      return
    }
    setError("")
    onSubmit({ ...initial, profile: { ...profile, min: lo, max: hi, step: st, quickValues: values } } as ClinicalRulePayload)
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {bg && initial.labelBg ? initial.labelBg : initial.labelEn}
        <span className="ml-2 text-xs font-normal text-slate-500">{bg ? "% обемни" : "% vol"}</span>
      </p>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>{bg ? "Минимум" : "Minimum"}
          <input className={fieldClass} inputMode="decimal" value={min} onChange={event => setMin(event.target.value)} />
        </label>
        <label className={labelClass}>{bg ? "Максимум" : "Maximum"}
          <input className={fieldClass} inputMode="decimal" value={max} onChange={event => setMax(event.target.value)} />
        </label>
        <label className={labelClass}>{bg ? "Стъпка" : "Step"}
          <input className={fieldClass} inputMode="decimal" value={step} onChange={event => setStep(event.target.value)} />
        </label>
      </div>
      <label className={labelClass}>{bg ? "Бързи бутони (със запетая)" : "Quick buttons (comma separated)"}
        <input className={fieldClass} value={quick} onChange={event => setQuick(event.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">{copy.cancel}</button>
        <button type="button" disabled={busy} onClick={save} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{copy.saveRule}</button>
      </div>
    </div>
  )
}
