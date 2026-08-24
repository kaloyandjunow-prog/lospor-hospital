"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale } from "next-intl"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import type {
  ClinicalPresetDto,
  ClinicalPresetRule,
  ClinicalPresetScope,
  ClinicalRuleMode,
  ClinicalRulePayload,
  ClinicalRulesWorkbenchDto,
  PediatricDrugProfileRulePayload,
} from "@lospor/core/clinical-rules"
import {
  AdultClinicalRuleEditor,
} from "@/components/clinical-rules/AdultClinicalRuleEditor"
import {
  ClinicalRuleEditor,
  type ClinicalRuleDrugOption,
  type ClinicalRuleFluidOption,
  type ClinicalRuleInfusionOption,
} from "@/components/clinical-rules/ClinicalRuleEditor"
import { PediatricDrugProfileSetEditor } from "@/components/clinical-rules/PediatricDrugProfileSetEditor"
import { clinicalRuleEditorCopy } from "@/components/clinical-rules/editor-copy"
import { CLINICAL_RULES_PAGE_COPY as COPY } from "@/components/clinical-rules/page-copy"
import {
  useRulesetConfirmation,
  type ClinicalPresetWithEvidence,
} from "@/components/clinical-rules/RulesetConfirmation"
import {
  isEquipmentRule,
  pediatricEditorPayload,
  presetBelongsToContext,
  presetVisibleInContext,
} from "@/lib/clinical-preset-scope"

const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100"

type ActiveEditorState = {
  initial: ClinicalRulePayload | null
  existingRuleKey: string | null
  pediatricDrugRules?: ClinicalPresetRule[]
}

type EditorState = ActiveEditorState | null

type WorkbenchManagement = {
  activeScope: ClinicalPresetScope
  defaultScope: ClinicalPresetScope
  allowedScopes: ClinicalPresetScope[]
  ownerInstitutionId: string | null
  ownerInstitutionName: string | null
}

type WorkbenchData = Omit<ClinicalRulesWorkbenchDto, "presets"> & {
  management?: WorkbenchManagement
  presets: ClinicalPresetWithEvidence[]
}

function InlineRuleEditor({
  id,
  label,
  mode,
  editorCopy,
  editor,
  busy,
  drugOptions,
  fluidOptions,
  infusionOptions,
  onSubmit,
  onSubmitPediatricDrug,
  onCancel,
}: {
  id: string
  label: string
  mode: ClinicalRuleMode
  editorCopy: ReturnType<typeof clinicalRuleEditorCopy>
  editor: ActiveEditorState
  busy: boolean
  drugOptions: ClinicalRuleDrugOption[]
  fluidOptions: ClinicalRuleFluidOption[]
  infusionOptions: ClinicalRuleInfusionOption[]
  onSubmit: (payload: ClinicalRulePayload) => void
  onSubmitPediatricDrug: (
    medicationKey: string,
    profiles: PediatricDrugProfileRulePayload[],
  ) => void
  onCancel: () => void
}) {
  return (
    <section
      id={id}
      aria-label={`${editorCopy.edit} ${label}`}
      className="w-full basis-full border-l-2 border-blue-400 bg-blue-50/50 py-4 pl-3 pr-1 dark:border-blue-700 dark:bg-blue-950/10"
    >
      {mode === "PEDIATRIC" && editor.pediatricDrugRules ? (
        <PediatricDrugProfileSetEditor
          key={editor.existingRuleKey ?? "new-pediatric-drug"}
          rules={editor.pediatricDrugRules}
          drugOptions={drugOptions}
          busy={busy}
          lockIdentity={editor.pediatricDrugRules.length > 0}
          onSubmit={onSubmitPediatricDrug}
          onCancel={onCancel}
        />
      ) : mode === "ADULT" ? (
        <AdultClinicalRuleEditor
          key={`${editor.existingRuleKey ?? "new"}:${editor.initial?.kind ?? "none"}`}
          initial={editor.initial}
          busy={busy}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      ) : (
        <ClinicalRuleEditor
          key={`${editor.existingRuleKey ?? "new"}:${editor.initial?.kind ?? "none"}`}
          initial={pediatricEditorPayload(editor.initial)}
          lockIdentity={!!editor.existingRuleKey}
          drugOptions={drugOptions}
          fluidOptions={fluidOptions}
          infusionOptions={infusionOptions}
          copy={editorCopy}
          busy={busy}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
    </section>
  )
}

function scopeLabel(scope: ClinicalPresetScope, copy: typeof COPY.en | typeof COPY.bg) {
  return scope === "PLATFORM"
    ? copy.platform
    : scope === "INSTITUTION"
      ? copy.institution
      : copy.personal
}

function statusLabel(status: string, copy: typeof COPY.en | typeof COPY.bg) {
  return status === "DRAFT"
    ? copy.draft
    : status === "PUBLISHED"
      ? copy.published
      : copy.retired
}

function ruleLabel(payload: ClinicalRulePayload, bg: boolean) {
  const label = bg && payload.labelBg ? payload.labelBg : payload.labelEn
  if (
    payload.kind === "ADULT_DRUG_PROFILE"
    || payload.kind === "ADULT_INFUSION_PROFILE"
    || payload.kind === "ADULT_FLUID_PROFILE"
  ) {
    return {
      label,
      detail: `${payload.kind.replace("ADULT_", "").replace("_PROFILE", "")} · ${payload.profile.unit ?? ""} · ${payload.profile.routes.join(", ")}`,
    }
  }
  if (payload.kind === "PEDIATRIC_DRUG_PROFILE" && !payload.profile) {
    return {
      label,
      detail: `${payload.category ?? "Drug"} / ${payload.availability} / ${payload.manualUnit ?? "direct entry"}`,
    }
  }
  if (payload.kind === "PEDIATRIC_DRUG_DOSE") {
    return {
      label,
      detail: `${payload.indication} · ${payload.route} · ${payload.doseUnit}`,
    }
  }
  if (payload.kind === "PEDIATRIC_DRUG_PROFILE" && payload.profile) {
    return {
      label,
      detail: `${payload.category ?? "Drug"} · ${payload.profile.unit ?? ""} · ${payload.profile.routes.join(", ")}`,
    }
  }
  if (payload.kind === "PEDIATRIC_FLUID_PROFILE") {
    return {
      label,
      detail: `Fluid · ${payload.category ?? "Fluid"} · ${payload.profile.unit ?? ""} · ${payload.profile.routes.join(", ")}`,
    }
  }
  if (payload.kind === "PEDIATRIC_INFUSION_PROFILE") {
    const surface = payload.profile
      ? `${payload.profile.unit ?? payload.manualUnit ?? ""} · ${payload.profile.routes.join(", ")}`
      : payload.manualUnit ?? "direct entry"
    return {
      label,
      detail: `Infusion · ${payload.disposition} · ${surface}`,
    }
  }
  if (payload.kind === "PEDIATRIC_DRUG_POLICY") {
    return {
      label,
      detail: `DRUG POLICY · ${payload.disposition} · ${payload.reviewStatus}`,
    }
  }
  return { label, detail: payload.kind }
}

type VisibleRuleItem = {
  id: string
  key: string
  primary: ClinicalPresetRule
  rules: ClinicalPresetRule[]
  pediatricDrug: boolean
  /** Infusion/fluid rows collapsed across age/weight bands; children stay individually editable. */
  bandGroup: boolean
}

function pediatricDrugKey(payload: ClinicalRulePayload): string | null {
  if (
    payload.kind !== "PEDIATRIC_DRUG_PROFILE"
    && payload.kind !== "PEDIATRIC_DRUG_POLICY"
    && payload.kind !== "PEDIATRIC_DRUG_DOSE"
  ) return null
  return `DRUG:${payload.medicationKey.trim().toUpperCase()}`
}

/**
 * Infusion and fluid profiles are stored one row per age/weight band, so a single
 * product can appear a dozen times. Group them for scanning; each band keeps its own
 * rule key so it stays individually editable and deletable.
 */
function pediatricBandKey(payload: ClinicalRulePayload): string | null {
  if (
    payload.kind !== "PEDIATRIC_INFUSION_PROFILE"
    && payload.kind !== "PEDIATRIC_FLUID_PROFILE"
  ) return null
  return `${payload.kind}:${payload.itemKey.trim().toUpperCase()}`
}

/** Human-readable age band, e.g. "0–28 d", "1–12 mo", "3–18 y". */
function ageBandLabel(payload: ClinicalRulePayload): string | null {
  if (!("minimumAgeDays" in payload) || !("maximumAgeDaysExclusive" in payload)) return null
  const from = payload.minimumAgeDays
  const to = payload.maximumAgeDaysExclusive
  if (typeof from !== "number" || typeof to !== "number") return null
  const format = (days: number) => {
    if (days < 31) return `${days} d`
    if (days < 366) return `${Math.round(days / 30.4)} mo`
    return `${Math.round((days / 365.25) * 10) / 10} y`
  }
  return `${format(from)} – ${format(to)}`
}

function groupVisibleRules(
  rules: ClinicalPresetRule[],
  mode: ClinicalRuleMode,
): VisibleRuleItem[] {
  if (mode !== "PEDIATRIC") {
    return rules.map(rule => ({
      id: rule.id,
      key: rule.ruleKey,
      primary: rule,
      rules: [rule],
      pediatricDrug: false,
      bandGroup: false,
    }))
  }
  const items: VisibleRuleItem[] = []
  const drugGroups = new Map<string, ClinicalPresetRule[]>()
  const bandGroups = new Map<string, ClinicalPresetRule[]>()
  for (const rule of rules) {
    const drugKey = pediatricDrugKey(rule.payload)
    if (drugKey) {
      const group = drugGroups.get(drugKey) ?? []
      group.push(rule)
      drugGroups.set(drugKey, group)
      continue
    }
    const bandKey = pediatricBandKey(rule.payload)
    if (bandKey) {
      const group = bandGroups.get(bandKey) ?? []
      group.push(rule)
      bandGroups.set(bandKey, group)
      continue
    }
    items.push({
      id: rule.id,
      key: rule.ruleKey,
      primary: rule,
      rules: [rule],
      pediatricDrug: false,
      bandGroup: false,
    })
  }
  for (const [drugKey, group] of drugGroups) {
    const primary = group.find(rule => rule.payload.kind === "PEDIATRIC_DRUG_PROFILE")
      ?? group.find(rule => rule.payload.kind === "PEDIATRIC_DRUG_POLICY")
      ?? group[0]
    if (!primary) continue
    items.push({
      id: `pediatric-drug:${drugKey}`,
      key: `PEDIATRIC_DRUG:${drugKey}`,
      primary,
      rules: group,
      pediatricDrug: true,
      bandGroup: false,
    })
  }
  for (const [bandKey, group] of bandGroups) {
    const sorted = [...group].sort((left, right) => {
      const leftFrom = "minimumAgeDays" in left.payload ? left.payload.minimumAgeDays : 0
      const rightFrom = "minimumAgeDays" in right.payload ? right.payload.minimumAgeDays : 0
      return leftFrom - rightFrom
    })
    const primary = sorted[0]
    if (!primary) continue
    // A single band behaves exactly as before — no group wrapper, no extra click.
    items.push({
      id: `pediatric-band:${bandKey}`,
      key: sorted.length > 1 ? `PEDIATRIC_BAND:${bandKey}` : primary.ruleKey,
      primary,
      rules: sorted,
      pediatricDrug: false,
      bandGroup: sorted.length > 1,
    })
  }
  return items.sort((left, right) => (
    ruleLabel(left.primary.payload, false).label.localeCompare(
      ruleLabel(right.primary.payload, false).label,
    )
  ))
}

export default function ClinicalRulesPage() {
  const locale = useLocale()
  const bg = locale.startsWith("bg")
  const copy = bg ? COPY.bg : COPY.en
  const editorCopy = clinicalRuleEditorCopy(bg)
  const [mode, setMode] = useState<ClinicalRuleMode>("ADULT")
  const [data, setData] = useState<WorkbenchData | null>(null)
  const [drugOptions, setDrugOptions] = useState<ClinicalRuleDrugOption[]>([])
  const [fluidOptions, setFluidOptions] = useState<ClinicalRuleFluidOption[]>([])
  const [infusionOptions, setInfusionOptions] = useState<ClinicalRuleInfusionOption[]>([])
  const [activeScope, setActiveScope] = useState<ClinicalPresetScope | "">("")
  const [selectedPresetId, setSelectedPresetId] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [editor, setEditor] = useState<EditorState>(null)
  const [newName, setNewName] = useState("")
  const [newKey, setNewKey] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newSourceId, setNewSourceId] = useState("")

  const load = useCallback(async (
    targetMode: ClinicalRuleMode,
    scope?: ClinicalPresetScope,
    preferredPresetId?: string,
  ) => {
    setLoading(true)
    setError("")
    try {
      const query = new URLSearchParams({ mode: targetMode })
      if (scope) query.set("scope", scope)
      const response = await fetch(`/api/clinical/rules/workbench?${query}`, {
        cache: "no-store",
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? copy.actionFailed)
      const received = body as WorkbenchData
      const next: WorkbenchData = {
        ...received,
        presets: received.presets.map(preset => ({
          ...preset,
          rules: preset.rules.filter(rule => !isEquipmentRule(rule.payload)),
        })),
      }
      setData(next)
      const actorScopes: ClinicalPresetScope[] = next.actor.role === "ADMIN"
        ? ["PLATFORM", "USER"]
        : next.actor.role === "HEAD_OF_DEPT"
          ? ["INSTITUTION", "USER"]
          : ["USER"]
      const reportedScope = next.management?.activeScope ?? actorScopes[0] ?? "USER"
      const resolvedScope = actorScopes.includes(reportedScope)
        ? reportedScope
        : actorScopes[0] ?? "USER"
      setActiveScope(resolvedScope)
      const ownerInstitutionId = next.management?.ownerInstitutionId ?? next.actor.institutionId
      const modePresets = next.presets.filter(item =>
        item.clinicalMode === targetMode
        && presetVisibleInContext(item, resolvedScope, next.actor, ownerInstitutionId),
      )
      const selection = next.selections.find(item => item.clinicalMode === targetMode)
      setSelectedPresetId(current => {
        if (preferredPresetId && modePresets.some(item => item.id === preferredPresetId)) {
          return preferredPresetId
        }
        if (modePresets.some(item => item.id === current)) return current
        return selection?.effectivePresetId
          ?? modePresets.find(item => item.status === "DRAFT")?.id
          ?? modePresets[0]?.id
          ?? ""
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.actionFailed)
    } finally {
      setLoading(false)
    }
  }, [copy.actionFailed])

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load(mode, activeScope || undefined),
      0,
    )
    return () => window.clearTimeout(timer)
  }, [activeScope, load, mode])

  useEffect(() => {
    Promise.all([
      fetch("/api/library/INTRAOP_DRUG").then(response => response.ok ? response.json() : []),
      fetch("/api/library/INTRAOP_FLUID").then(response => response.ok ? response.json() : []),
      fetch("/api/library/INTRAOP_INFUSION").then(response => response.ok ? response.json() : []),
    ])
      .then(([drugRows, fluidRows, infusionRows]: [ClinicalRuleDrugOption[], ClinicalRuleFluidOption[], ClinicalRuleInfusionOption[]]) => {
        setDrugOptions([...new Map(drugRows.map(row => [row.value, row])).values()])
        setFluidOptions([...new Map(fluidRows.map(row => [row.value, row])).values()])
        setInfusionOptions([...new Map(infusionRows.map(row => [row.value, row])).values()])
      })
      .catch(() => {
        setDrugOptions([])
        setFluidOptions([])
        setInfusionOptions([])
      })
  }, [])

  const actor = data?.actor
  const isAdmin = actor?.role === "ADMIN"
  const isHod = actor?.role === "HEAD_OF_DEPT"
  const roleAllowedScopes: ClinicalPresetScope[] = isAdmin
    ? ["PLATFORM", "USER"]
    : isHod
      ? ["INSTITUTION", "USER"]
      : ["USER"]
  const requestedScope = activeScope
    || data?.management?.defaultScope
    || roleAllowedScopes[0]
  const resolvedActiveScope: ClinicalPresetScope = roleAllowedScopes.includes(requestedScope)
    ? requestedScope
    : roleAllowedScopes[0] ?? "USER"
  const ownerInstitutionId = data?.management?.ownerInstitutionId ?? actor?.institutionId ?? null
  const allowedScopes: ClinicalPresetScope[] = data?.management?.allowedScopes
    ? data.management.allowedScopes.filter(scope => roleAllowedScopes.includes(scope))
    : roleAllowedScopes
  const modePresets = data?.presets.filter(item =>
    item.clinicalMode === mode
    && presetVisibleInContext(item, resolvedActiveScope, data.actor, ownerInstitutionId),
  ) ?? []
  const selectedPreset = modePresets.find(item => item.id === selectedPresetId) ?? null
  const selection = data?.selections.find(item => item.clinicalMode === mode) ?? null
  const { requestRulesetAction, confirmationDialog } = useRulesetConfirmation({
    enabled: resolvedActiveScope === "INSTITUTION" && isHod,
    presets: modePresets,
    busy,
    bg,
    fieldClass,
    act,
  })

  const visibleRules = (() => {
    const query = search.trim().toLowerCase()
    if (!selectedPreset) return []
    const grouped = groupVisibleRules(selectedPreset.rules, mode)
    return query
      ? grouped.filter(item => {
          const display = ruleLabel(item.primary.payload, bg)
          const keys = item.rules.map(rule => rule.ruleKey).join(" ")
          return item.key === editor?.existingRuleKey
            || `${display.label} ${display.detail} ${keys}`.toLowerCase().includes(query)
        })
      : grouped
  })()

  function canEdit(preset: ClinicalPresetDto) {
    return !!actor
      && preset.status === "DRAFT"
      && presetBelongsToContext(preset, resolvedActiveScope, actor, ownerInstitutionId)
  }

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/clinical/rules/workbench", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        // Server-side guards explain *which* field was refused; without this the
        // clinician only sees "not permitted" and cannot tell what to change.
        const detail = Array.isArray(result.issues)
          ? result.issues
            .map((issue: { message?: string }) => issue?.message)
            .filter((message: unknown): message is string => typeof message === "string" && !!message)
            .join(" ")
          : ""
        throw new Error([result.error ?? copy.actionFailed, detail].filter(Boolean).join(" — "))
      }
      const preferred = body.action === "create-ruleset" && typeof result.id === "string"
        ? result.id
        : selectedPresetId
      await load(mode, resolvedActiveScope, preferred)
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.actionFailed)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function createRuleset() {
    const result = await act({
      action: "create-ruleset",
      scope: resolvedActiveScope,
      clinicalMode: mode,
      key: newKey,
      name: newName,
      description: newDescription || null,
      copyFromPresetId: newSourceId || null,
      institutionId: resolvedActiveScope === "INSTITUTION"
        ? ownerInstitutionId
        : null,
    })
    if (result) {
      setShowCreate(false)
      setNewName("")
      setNewKey("")
      setNewDescription("")
      setEditor(null)
    }
  }

  async function saveRule(payload: ClinicalRulePayload) {
    if (!selectedPreset || !editor) return
    const result = await act({
      action: "upsert-rule",
      presetId: selectedPreset.id,
      existingRuleKey: editor.existingRuleKey,
      payload,
    })
    if (result) setEditor(null)
  }

  async function savePediatricDrugProfiles(
    medicationKey: string,
    profiles: PediatricDrugProfileRulePayload[],
  ) {
    if (!selectedPreset) return
    const result = await act({
      action: "replace-pediatric-drug-profiles",
      presetId: selectedPreset.id,
      medicationKey,
      profiles,
    })
    if (result) setEditor(null)
  }

  async function deleteRule(ruleKey: string) {
    if (!selectedPreset) return
    const result = await act({
      action: "delete-rule",
      presetId: selectedPreset.id,
      ruleKey,
    })
    if (result && editor?.existingRuleKey === ruleKey) setEditor(null)
  }

  function beginCopy() {
    const effective = modePresets.find(item => item.id === selection?.effectivePresetId)
    const source = selectedPreset ?? effective ?? modePresets.find(item => item.status === "PUBLISHED")
    setNewSourceId(source?.id ?? "")
    setNewName(source ? `${source.name} copy` : "")
    setNewKey(source ? `${source.key}_COPY` : "")
    setShowCreate(true)
  }

  if (loading && !data) {
    return <p role="status" className="py-16 text-center text-sm text-slate-500">{copy.loading}</p>
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-red-600">{error}</p>
        <button type="button" onClick={() => void load(mode)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          {copy.retry}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{copy.title}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          title={copy.retry}
          aria-label={copy.retry}
          onClick={() => void load(mode, resolvedActiveScope)}
          disabled={loading}
          className="rounded-md border border-slate-300 p-2 text-slate-600 dark:border-[#3a3a3a] dark:text-slate-300"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4 border-y border-slate-200 py-4 dark:border-[#303030]">
        <div className="inline-flex rounded-md border border-slate-300 p-1 dark:border-[#3a3a3a]">
          {(["ADULT", "PEDIATRIC"] as const).map(item => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => {
                setMode(item)
                setEditor(null)
                setSearch("")
              }}
              className={`min-w-28 rounded px-4 py-2 text-sm font-semibold ${
                mode === item
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {item === "ADULT" ? copy.adult : copy.pediatric}
            </button>
          ))}
        </div>
        {allowedScopes.length ? (
          <label className="grid min-w-64 gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {copy.editingContext}
            <select
              value={resolvedActiveScope}
              disabled={allowedScopes.length === 1}
              onChange={event => {
                setActiveScope(event.target.value as ClinicalPresetScope)
                setSelectedPresetId("")
                setEditor(null)
                setShowCreate(false)
              }}
              className={fieldClass}
            >
              {allowedScopes.map(item => (
                <option key={item} value={item}>
                  {item === "PLATFORM"
                    ? copy.globalContext
                    : item === "USER"
                      ? copy.personalContext
                      : `${data.management?.ownerInstitutionName ?? actor?.institutionName ?? copy.institution} · ${copy.institution}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <section className="space-y-2">
        <p className="text-xs font-bold uppercase text-slate-500">{copy.current}</p>
        {selection?.effectivePresetId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-blue-500 py-2 pl-4">
            <div>
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {selection.effectivePresetName} v{selection.effectiveVersion}
              </p>
              <p className="text-xs text-slate-500">
                {selection.effectiveScope ? scopeLabel(selection.effectiveScope, copy) : ""}
              </p>
            </div>
            {resolvedActiveScope === "USER" && selection.userPresetId ? (
              <button type="button" onClick={() => void act({ action: "clear-selection", scope: "USER", clinicalMode: mode })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold">
                {copy.stopUsing}
              </button>
            ) : resolvedActiveScope === "INSTITUTION" && isHod && selection.institutionPresetId ? (
              <button type="button" onClick={() => requestRulesetAction({
                kind: "clear",
                presetId: selection.institutionPresetId,
                body: { action: "clear-selection", scope: "INSTITUTION", clinicalMode: mode },
              })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold">
                {copy.stopUsing}
              </button>
            ) : null}
          </div>
        ) : <p className="text-sm text-amber-600">{copy.noCurrent}</p>}
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-5 dark:border-[#303030]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{copy.rulesets}</h2>
          <button type="button" onClick={beginCopy} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
            <Copy className="h-4 w-4" /> {copy.createCopy}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {modePresets.map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selectedPresetId === item.id}
              onClick={() => {
                setSelectedPresetId(item.id)
                setEditor(null)
              }}
              className={`shrink-0 rounded-md border px-3 py-2 text-left ${
                selectedPresetId === item.id
                  ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                  : "border-slate-300 text-slate-700 dark:border-[#3a3a3a] dark:text-slate-300"
              }`}
            >
              <span className="block text-sm font-bold">{item.name} v{item.version}</span>
              <span className="block text-xs opacity-70">
                {scopeLabel(item.scope, copy)} · {statusLabel(item.status, copy)} · {item.rules.length}
                {actor && !presetBelongsToContext(item, resolvedActiveScope, actor, ownerInstitutionId) ? ` · ${copy.inherited}` : ""}
              </span>
            </button>
          ))}
        </div>

        {showCreate ? (
          <div className="grid gap-3 border-y border-slate-200 py-4 md:grid-cols-2 dark:border-[#303030]">
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {copy.scope}
              <input
                readOnly
                value={resolvedActiveScope === "PLATFORM" ? copy.globalContext : resolvedActiveScope === "USER" ? copy.personalContext : data.management?.ownerInstitutionName ?? actor?.institutionName ?? copy.institution}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {copy.source}
              <select value={newSourceId} onChange={event => setNewSourceId(event.target.value)} className={fieldClass}>
                <option value="">{copy.empty}</option>
                {modePresets.filter(item => item.status === "PUBLISHED").map(item => (
                  <option key={item.id} value={item.id}>{item.name} v{item.version}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {copy.name}
              <input value={newName} onChange={event => setNewName(event.target.value)} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {copy.key}
              <input value={newKey} onChange={event => setNewKey(event.target.value.toUpperCase())} className={fieldClass} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">
              {copy.description}
              <textarea value={newDescription} onChange={event => setNewDescription(event.target.value)} rows={2} className={fieldClass} />
            </label>
            <div className="flex justify-end gap-2 md:col-span-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">
                {editorCopy.cancel}
              </button>
              <button type="button" disabled={busy || !newName.trim() || !newKey.trim()} onClick={() => void createRuleset()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {copy.createDraft}
              </button>
            </div>
          </div>
        ) : null}

        {selectedPreset ? (
          <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-[#303030]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">{selectedPreset.name} v{selectedPreset.version}</h3>
                <p className="text-xs text-slate-500">{selectedPreset.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPreset.status === "PUBLISHED"
                  && !!actor
                  && presetBelongsToContext(selectedPreset, resolvedActiveScope, actor, ownerInstitutionId) ? (
                  <button
                    type="button"
                    onClick={() => requestRulesetAction({
                      kind: "select",
                      presetId: selectedPreset.id,
                      body: {
                        action: "select-ruleset",
                        scope: selectedPreset.scope,
                        clinicalMode: mode,
                        presetId: selectedPreset.id,
                        institutionId: resolvedActiveScope === "INSTITUTION"
                          ? ownerInstitutionId
                          : null,
                      },
                    })}
                    className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {copy.use}
                  </button>
                ) : null}
                {canEdit(selectedPreset) ? (
                  <>
                    {mode === "PEDIATRIC" ? (
                      <>
                        <button type="button" onClick={() => setEditor({
                          initial: null,
                          existingRuleKey: null,
                          pediatricDrugRules: [],
                        })} className="inline-flex items-center gap-2 rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700">
                          <Plus className="h-4 w-4" /> {copy.addDrug}
                        </button>
                        <button type="button" onClick={() => setEditor({
                          initial: null,
                          existingRuleKey: null,
                        })} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          <Plus className="h-4 w-4" /> {copy.addFluidInfusion}
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setEditor({
                        initial: null,
                        existingRuleKey: null,
                      })} className="inline-flex items-center gap-2 rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700">
                        <Plus className="h-4 w-4" /> {copy.addRule}
                      </button>
                    )}
                    <button type="button" disabled={busy || !selectedPreset.rules.length} onClick={() => requestRulesetAction({
                      kind: "publish",
                      presetId: selectedPreset.id,
                      body: { action: "publish-ruleset", presetId: selectedPreset.id },
                    })} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {copy.publish}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {selectedPreset.status !== "DRAFT" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-xs text-amber-800 dark:text-amber-200">{copy.immutable}</p>
                <button
                  type="button"
                  onClick={beginCopy}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Copy className="h-4 w-4" /> {copy.createEditableCopy}
                </button>
              </div>
            ) : null}

            {editor?.existingRuleKey === null ? (
              <InlineRuleEditor
                id="clinical-rule-editor-new"
                label={copy.addRule}
                mode={mode}
                editorCopy={editorCopy}
                editor={editor}
                busy={busy}
                drugOptions={drugOptions}
                fluidOptions={fluidOptions}
                infusionOptions={infusionOptions}
                onSubmit={payload => void saveRule(payload)}
                onSubmitPediatricDrug={(medicationKey, profiles) => void savePediatricDrugProfiles(medicationKey, profiles)}
                onCancel={() => setEditor(null)}
              />
            ) : null}

            <label className="relative block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input aria-label={copy.search} value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.search} className={`${fieldClass} pl-9`} />
            </label>
            <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-[#303030] dark:border-[#303030]">
              {visibleRules.map(item => {
                const display = ruleLabel(item.primary.payload, bg)
                const sourceRefs = [...new Set(item.rules.flatMap(rule => rule.sourceRefs))]
                const editorId = `clinical-rule-editor-${item.id}`
                const isEditing = editor?.existingRuleKey === item.key
                return (
                  <article
                    key={item.id}
                    aria-label={display.label}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      {item.bandGroup ? (
                        <button
                          type="button"
                          aria-expanded={!!expandedGroups[item.key]}
                          onClick={() => setExpandedGroups(current => ({
                            ...current,
                            [item.key]: !current[item.key],
                          }))}
                          className="flex items-center gap-1 text-left"
                        >
                          {expandedGroups[item.key]
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                          <span className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{display.label}</span>
                        </button>
                      ) : (
                        <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{display.label}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        {display.detail}
                        {item.pediatricDrug
                          ? ` / ${copy.bandCount(item.rules.filter(rule => rule.payload.kind === "PEDIATRIC_DRUG_PROFILE").length || 1)}`
                          : item.bandGroup
                            ? ` / ${copy.bandCount(item.rules.length)}`
                            : ""}
                      </p>
                      {sourceRefs.length ? (
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                          {sourceRefs.slice(0, 4).map((sourceRef, index) =>
                            /^https:\/\//i.test(sourceRef) ? (
                              <a
                                key={sourceRef}
                                href={sourceRef}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline dark:text-blue-400"
                              >
                                {copy.sourceLabel} {index + 1}
                              </a>
                            ) : (
                              <span key={sourceRef} className="text-slate-400">
                                {sourceRef}
                              </span>
                            ),
                          )}
                          {sourceRefs.length > 4 ? (
                            <span className="text-slate-400">+{sourceRefs.length - 4}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {canEdit(selectedPreset) && !item.bandGroup ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          title={copy.edit}
                          aria-label={copy.editAria(display.label)}
                          aria-expanded={isEditing}
                          aria-controls={editorId}
                          onClick={() => setEditor(current =>
                            current?.existingRuleKey === item.key
                              ? null
                              : {
                                  initial: item.primary.payload,
                                  existingRuleKey: item.key,
                                  ...(item.pediatricDrug ? { pediatricDrugRules: item.rules } : {}),
                                },
                          )}
                          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {!item.pediatricDrug ? (
                          <button type="button" title={copy.delete} aria-label={copy.deleteAria(display.label)} onClick={() => {
                            if (window.confirm(copy.deleteConfirm)) {
                              void deleteRule(item.key)
                            }
                          }} className="rounded-md p-2 text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {isEditing && editor ? (
                      <InlineRuleEditor
                        id={editorId}
                        label={display.label}
                        mode={mode}
                        editorCopy={editorCopy}
                        editor={editor}
                        busy={busy}
                        drugOptions={drugOptions}
                        fluidOptions={fluidOptions}
                        infusionOptions={infusionOptions}
                        onSubmit={payload => void saveRule(payload)}
                        onSubmitPediatricDrug={(medicationKey, profiles) => void savePediatricDrugProfiles(medicationKey, profiles)}
                        onCancel={() => setEditor(null)}
                      />
                    ) : null}
                    {item.bandGroup && expandedGroups[item.key] ? (
                      <div className="w-full space-y-1 border-l-2 border-slate-200 pl-3 dark:border-[#303030]">
                        {item.rules.map(rule => {
                          const band = ageBandLabel(rule.payload) ?? rule.ruleKey
                          const childEditing = editor?.existingRuleKey === rule.ruleKey
                          return (
                            <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                              <p className="text-xs text-slate-600 dark:text-slate-300">{band}</p>
                              {canEdit(selectedPreset) ? (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    title={copy.edit}
                                    aria-label={copy.editAria(`${display.label} ${band}`)}
                                    aria-expanded={childEditing}
                                    onClick={() => setEditor(current =>
                                      current?.existingRuleKey === rule.ruleKey
                                        ? null
                                        : { initial: rule.payload, existingRuleKey: rule.ruleKey },
                                    )}
                                    className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title={copy.delete}
                                    aria-label={copy.deleteAria(`${display.label} ${band}`)}
                                    onClick={() => {
                                      if (window.confirm(copy.deleteConfirm)) {
                                        void deleteRule(rule.ruleKey)
                                      }
                                    }}
                                    className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : null}
                              {childEditing && editor ? (
                                <InlineRuleEditor
                                  id={`clinical-rule-editor-${rule.id}`}
                                  label={`${display.label} · ${band}`}
                                  mode={mode}
                                  editorCopy={editorCopy}
                                  editor={editor}
                                  busy={busy}
                                  drugOptions={drugOptions}
                                  fluidOptions={fluidOptions}
                                  infusionOptions={infusionOptions}
                                  onSubmit={payload => void saveRule(payload)}
                                  onSubmitPediatricDrug={(medicationKey, profiles) => void savePediatricDrugProfiles(medicationKey, profiles)}
                                  onCancel={() => setEditor(null)}
                                />
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </article>
                )
              })}
              {!visibleRules.length ? <p className="py-6 text-center text-sm text-slate-500">{copy.noRules}</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      {confirmationDialog}

    </div>
  )
}
