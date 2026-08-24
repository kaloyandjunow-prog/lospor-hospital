"use client"

import { useState } from "react"
import type { ClinicalPresetDto, ClinicalPresetRule } from "@lospor/core"

export type ClinicalPresetWithEvidence = ClinicalPresetDto & {
  publicationEvidence?: {
    baselinePresetId: string | null
    baselinePresetVersion: number | null
    reason: string | null
    contentSha256: string
    diffSha256: string
    exactDiff: unknown
    confirmedAt: string
  } | null
}

export type SensitiveRulesetAction = {
  kind: "publish" | "select" | "clear"
  presetId: string | null
  body: Record<string, unknown>
}

const COPY = {
  en: {
    confirmPublish: "Confirm institution publication",
    confirmUse: "Confirm institution activation",
    confirmClear: "Confirm return to inherited rules",
    explanation: "This changes shared clinical entry behavior for the department. Re-enter your own password and record why the change is being made.",
    currentPassword: "Current password",
    reason: "Clinical reason",
    reasonHint: "At least 10 characters. This reason becomes part of the immutable audit record.",
    confirm: "Confirm change",
    cancel: "Cancel",
    exactDiff: "Exact ruleset difference",
    added: "Added",
    changed: "Changed",
    removed: "Removed",
    unchanged: "Unchanged",
    contentHash: "Published content SHA-256",
    diffHash: "Difference SHA-256",
    evidence: "Immutable publication evidence",
  },
  bg: {
    confirmPublish: "Потвърди публикуването за лечебното заведение",
    confirmUse: "Потвърди активирането за лечебното заведение",
    confirmClear: "Потвърди връщането към наследените правила",
    explanation: "Това променя общото въвеждане на клинични данни за отделението. Въведете отново собствената си парола и запишете причината за промяната.",
    currentPassword: "Текуща парола",
    reason: "Клинична причина",
    reasonHint: "Поне 10 знака. Причината става част от неизменимия одитен запис.",
    confirm: "Потвърди промяната",
    cancel: "Откажи",
    exactDiff: "Точна разлика между наборите",
    added: "Добавени",
    changed: "Променени",
    removed: "Премахнати",
    unchanged: "Непроменени",
    contentHash: "SHA-256 на публикуваното съдържание",
    diffHash: "SHA-256 на разликата",
    evidence: "Неизменимо доказателство за публикуване",
  },
} as const

function comparableRule(rule: ClinicalPresetRule): string {
  return JSON.stringify({
    ruleKey: rule.ruleKey,
    ruleVersion: rule.ruleVersion,
    payload: rule.payload,
    sourceRefs: [...rule.sourceRefs].sort(),
  })
}

function previewRulesetDiff(next: ClinicalPresetDto, baseline: ClinicalPresetDto | null) {
  const before = new Map((baseline?.rules ?? []).map(rule => [rule.ruleKey, comparableRule(rule)]))
  const after = new Map(next.rules.map(rule => [rule.ruleKey, comparableRule(rule)]))
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort()
  return {
    added: keys.filter(key => !before.has(key) && after.has(key)),
    removed: keys.filter(key => before.has(key) && !after.has(key)),
    changed: keys.filter(key => before.has(key) && after.has(key) && before.get(key) !== after.get(key)),
    unchanged: keys.filter(key => before.has(key) && before.get(key) === after.get(key)),
  }
}

export function useRulesetConfirmation({
  enabled,
  presets,
  busy,
  bg,
  fieldClass,
  act,
}: {
  enabled: boolean
  presets: ClinicalPresetWithEvidence[]
  busy: boolean
  bg: boolean
  fieldClass: string
  act: (body: Record<string, unknown>) => Promise<unknown>
}) {
  const [action, setAction] = useState<SensitiveRulesetAction | null>(null)
  const [password, setPassword] = useState("")
  const [reason, setReason] = useState("")
  const copy = bg ? COPY.bg : COPY.en
  const preset = action?.presetId ? presets.find(item => item.id === action.presetId) ?? null : null
  const baseline = preset
    ? presets.find(item => item.id === preset.copiedFromPresetId)
      ?? presets.find(item => item.scope === "PLATFORM" && item.status === "PUBLISHED")
      ?? null
    : null
  const diff = preset ? previewRulesetDiff(preset, baseline) : null

  function reset() {
    setAction(null)
    setPassword("")
    setReason("")
  }

  function requestRulesetAction(next: SensitiveRulesetAction) {
    if (!enabled) {
      void act(next.body)
      return
    }
    setPassword("")
    setReason("")
    setAction(next)
  }

  async function confirm() {
    if (!action) return
    const result = await act({
      ...action.body,
      confirmation: { password, reason: reason.trim() },
    })
    if (result) reset()
  }

  const confirmationDialog = action ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="ruleset-confirmation-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-[#181818]">
        <h2 id="ruleset-confirmation-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {action.kind === "publish" ? copy.confirmPublish : action.kind === "select" ? copy.confirmUse : copy.confirmClear}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{copy.explanation}</p>
        {preset ? (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#353535]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{preset.name} v{preset.version}</p>
              <p className="text-xs text-slate-500">{copy.exactDiff}</p>
            </div>
            {diff ? (
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div><dt className="text-slate-500">{copy.added}</dt><dd className="font-bold">{diff.added.length}</dd></div>
                <div><dt className="text-slate-500">{copy.changed}</dt><dd className="font-bold">{diff.changed.length}</dd></div>
                <div><dt className="text-slate-500">{copy.removed}</dt><dd className="font-bold">{diff.removed.length}</dd></div>
                <div><dt className="text-slate-500">{copy.unchanged}</dt><dd className="font-bold">{diff.unchanged.length}</dd></div>
              </dl>
            ) : null}
            {preset.publicationEvidence ? (
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <p className="font-semibold">{copy.evidence}</p>
                <p className="break-all"><span className="font-semibold">{copy.contentHash}:</span> {preset.publicationEvidence.contentSha256}</p>
                <p className="break-all"><span className="font-semibold">{copy.diffHash}:</span> {preset.publicationEvidence.diffSha256}</p>
                <details><summary className="cursor-pointer font-semibold">{copy.exactDiff}</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-[11px] dark:bg-black/30">{JSON.stringify(preset.publicationEvidence.exactDiff, null, 2)}</pre>
                </details>
              </div>
            ) : diff ? (
              <details><summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">{copy.exactDiff}</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-[11px] dark:bg-black/30">{JSON.stringify(diff, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
        <form onSubmit={event => { event.preventDefault(); void confirm() }} className="mt-4 space-y-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.currentPassword}
            <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className={fieldClass} />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.reason}
            <textarea required minLength={10} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className={fieldClass} />
            <span className="text-xs font-normal text-slate-500">{copy.reasonHint}</span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={reset} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">{copy.cancel}</button>
            <button type="submit" disabled={busy || !password || reason.trim().length < 10} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{copy.confirm}</button>
          </div>
        </form>
      </section>
    </div>
  ) : null

  return { requestRulesetAction, confirmationDialog }
}
