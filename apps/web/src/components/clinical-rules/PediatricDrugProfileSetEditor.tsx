"use client"

import { doseProfileEditorIssues } from "@/lib/dose-profile-validation"

import { useMemo, useState } from "react"
import { Copy, Plus, Trash2 } from "lucide-react"
import {
  DRUG_PROFILE_AVAILABILITIES,
  clinicalRuleKey,
  validateClinicalRuleCollection,
  validateClinicalRulePayload,
  type ClinicalPresetRule,
  type DrugProfileAvailability,
  type PediatricDrugPolicyRulePayload,
  type PediatricDrugProfileRulePayload,
} from "@lospor/core/clinical-rules"
import type { DoseProfile } from "@lospor/core/catalog"
import { DoseProfileEditor } from "./DoseProfileEditor"
import type { ClinicalRuleDrugOption } from "./ClinicalRuleEditor"

const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100 dark:disabled:bg-[#161616]"
const labelClass = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
const PEDIATRIC_MAX_DAYS = 18 * 365.2425

type AgeUnit = "DAYS" | "MONTHS" | "YEARS"

type EditableBand = {
  id: number
  minimumAge: string
  minimumAgeUnit: AgeUnit
  maximumAge: string
  maximumAgeUnit: AgeUnit
  minimumWeightKg: string
  minimumWeightInclusive: boolean
  maximumWeightKg: string
  maximumWeightInclusive: boolean
  availability: DrugProfileAvailability
  manualUnit: string
  profile: DoseProfile | null
}

let nextBandId = 1

function defaultProfile(): DoseProfile {
  return {
    kind: "bolus",
    mode: "dose",
    min: 0,
    max: 100,
    step: 1,
    rounding: "nearest_step",
    quickValues: [1, 2, 5, 10],
    unit: "mg",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "TBW",
  }
}

function ageFromDays(days: number): { value: string; unit: AgeUnit } {
  const years = days / 365.2425
  if (Math.abs(years - Math.round(years)) < 0.000001) {
    return { value: String(Math.round(years)), unit: "YEARS" }
  }
  const months = days / 30.436875
  if (Math.abs(months - Math.round(months)) < 0.000001) {
    return { value: String(Math.round(months)), unit: "MONTHS" }
  }
  return { value: String(Number(days.toPrecision(10))), unit: "DAYS" }
}

function ageToDays(value: string, unit: AgeUnit): number {
  const amount = Number(value.replace(",", "."))
  if (!Number.isFinite(amount)) return Number.NaN
  return amount * (unit === "YEARS" ? 365.2425 : unit === "MONTHS" ? 30.436875 : 1)
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function policyAvailability(policy: PediatricDrugPolicyRulePayload | undefined): DrugProfileAvailability {
  if (!policy) return "LOCAL"
  if (policy.disposition === "EXCLUDED") return "HIDDEN"
  return "LOCAL"
}

function editableBand(
  payload?: PediatricDrugProfileRulePayload,
  availability: DrugProfileAvailability = "LOCAL",
): EditableBand {
  const minimum = ageFromDays(payload?.minimumAgeDays ?? 0)
  const maximum = ageFromDays(payload?.maximumAgeDaysExclusive ?? PEDIATRIC_MAX_DAYS)
  return {
    id: nextBandId++,
    minimumAge: minimum.value,
    minimumAgeUnit: minimum.unit,
    maximumAge: maximum.value,
    maximumAgeUnit: maximum.unit,
    minimumWeightKg: payload?.minimumWeightKg == null ? "" : String(payload.minimumWeightKg),
    minimumWeightInclusive: payload?.minimumWeightInclusive ?? true,
    maximumWeightKg: payload?.maximumWeightKg == null ? "" : String(payload.maximumWeightKg),
    maximumWeightInclusive: payload?.maximumWeightInclusive ?? false,
    availability: payload?.availability ?? availability,
    manualUnit: payload?.manualUnit ?? payload?.profile?.unit ?? "mg",
    profile: payload?.profile ? structuredClone(payload.profile) : null,
  }
}

function availabilityTone(availability: DrugProfileAvailability): string {
  if (availability === "AUTO") return "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (availability === "MANUAL") return "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300"
  if (availability === "LOCAL") return "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  return "border-slate-500 bg-slate-500/10 text-slate-700 dark:text-slate-300"
}

export function PediatricDrugProfileSetEditor({
  rules,
  drugOptions,
  busy,
  lockIdentity,
  onSubmit,
  onCancel,
}: {
  rules: ClinicalPresetRule[]
  drugOptions: ClinicalRuleDrugOption[]
  busy: boolean
  lockIdentity: boolean
  onSubmit: (medicationKey: string, profiles: PediatricDrugProfileRulePayload[]) => void
  onCancel: () => void
}) {
  const profiles = useMemo(() => rules.flatMap(rule => (
    rule.payload.kind === "PEDIATRIC_DRUG_PROFILE" ? [rule.payload] : []
  )), [rules])
  const policy = rules.find(rule => rule.payload.kind === "PEDIATRIC_DRUG_POLICY")
    ?.payload as PediatricDrugPolicyRulePayload | undefined
  const first = profiles[0] ?? policy
  const [medicationKey, setMedicationKey] = useState(first?.medicationKey ?? "")
  const selectedOption = drugOptions.find(option => option.value === medicationKey || option.label === medicationKey)
  const [labelEn, setLabelEn] = useState(first?.labelEn ?? selectedOption?.label ?? "")
  const [labelBg, setLabelBg] = useState(first?.labelBg ?? selectedOption?.labelBg ?? "")
  const [inn, setInn] = useState(first?.inn ?? selectedOption?.inn ?? "")
  const [category, setCategory] = useState(first?.category ?? "")
  const [bands, setBands] = useState<EditableBand[]>(() => profiles.length
    ? [...profiles]
      .sort((left, right) => left.minimumAgeDays - right.minimumAgeDays)
      .map(profile => editableBand(profile))
    : [editableBand(undefined, policyAvailability(policy))])
  const [error, setError] = useState("")

  function chooseMedication(value: string) {
    const option = drugOptions.find(item => item.value === value)
    setMedicationKey(value)
    if (!option) return
    setLabelEn(option.label)
    setLabelBg(option.labelBg ?? option.label)
    setInn(option.inn ?? "")
  }

  function updateBand(id: number, update: Partial<EditableBand>) {
    setBands(current => current.map(band => band.id === id ? { ...band, ...update } : band))
  }

  function setAvailability(band: EditableBand, availability: DrugProfileAvailability) {
    updateBand(band.id, {
      availability,
      profile: (availability === "AUTO" || availability === "MANUAL") && !band.profile
        ? defaultProfile()
        : band.profile,
    })
  }

  function duplicateBand(band: EditableBand) {
    setBands(current => [...current, {
      ...band,
      id: nextBandId++,
      profile: band.profile ? structuredClone(band.profile) : null,
    }])
  }

  function buildPayload(band: EditableBand): unknown {
    return {
      kind: "PEDIATRIC_DRUG_PROFILE",
      medicationKey: medicationKey.trim(),
      labelEn: labelEn.trim(),
      labelBg: labelBg.trim() || null,
      inn: inn.trim() || null,
      category: category.trim() || null,
      availability: band.availability,
      minimumAgeDays: ageToDays(band.minimumAge, band.minimumAgeUnit),
      maximumAgeDaysExclusive: ageToDays(band.maximumAge, band.maximumAgeUnit),
      minimumWeightKg: optionalNumber(band.minimumWeightKg),
      minimumWeightInclusive: band.minimumWeightInclusive,
      maximumWeightKg: optionalNumber(band.maximumWeightKg),
      maximumWeightInclusive: band.maximumWeightInclusive,
      manualUnit: band.manualUnit.trim() || null,
      profile: band.profile,
      unit: null,
      routeUnits: {},
    }
  }

  function save() {
    const parsed = bands.map((band, index) => {
      if (band.profile && (band.availability === "AUTO" || band.availability === "MANUAL")) {
        const editorIssues = doseProfileEditorIssues(band.profile)
        if (editorIssues.length) {
          setError(`Band ${index + 1}: ${editorIssues.join(" ")}`)
          return null
        }
      }
      const result = validateClinicalRulePayload(buildPayload(band))
      if (!result.valid || result.value.kind !== "PEDIATRIC_DRUG_PROFILE") {
        setError(`Band ${index + 1}: ${result.valid ? "Invalid drug profile" : result.issues.map(issue => issue.message).join(" ")}`)
        return null
      }
      return result.value
    })
    if (parsed.some(profile => !profile)) return
    const profilesToSave = parsed.filter((profile): profile is PediatricDrugProfileRulePayload => !!profile)
    const collection = validateClinicalRuleCollection(profilesToSave.map(profile => ({
      ruleKey: clinicalRuleKey(profile),
      payload: profile,
    })))
    if (!collection.valid) {
      setError(collection.issues.map(issue => issue.message).join(" "))
      return
    }
    setError("")
    onSubmit(medicationKey.trim(), profilesToSave)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Medication
          <select disabled={lockIdentity} value={medicationKey} onChange={event => chooseMedication(event.target.value)} className={fieldClass}>
            <option value="">Select drug</option>
            {drugOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Category
          <input value={category} onChange={event => setCategory(event.target.value)} className={fieldClass} />
        </label>
        <label className={labelClass}>
          English label
          <input value={labelEn} onChange={event => setLabelEn(event.target.value)} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Bulgarian label
          <input value={labelBg ?? ""} onChange={event => setLabelBg(event.target.value)} className={fieldClass} />
        </label>
      </div>

      <div className="space-y-3">
        {bands.map((band, index) => (
          <section key={band.id} className="rounded-lg border border-slate-300 bg-white/60 p-3 dark:border-[#383838] dark:bg-[#181818]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Band {index + 1}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => duplicateBand(band)} title="Duplicate band" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#252525]"><Copy className="h-4 w-4" /></button>
                <button type="button" disabled={bands.length === 1} onClick={() => setBands(current => current.filter(item => item.id !== band.id))} title="Delete band" className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DRUG_PROFILE_AVAILABILITIES.map(availability => (
                <button
                  key={availability}
                  type="button"
                  aria-pressed={band.availability === availability}
                  onClick={() => setAvailability(band, availability)}
                  className={`rounded-md border px-2 py-2 text-xs font-bold ${band.availability === availability ? availabilityTone(availability) : "border-slate-300 text-slate-500 dark:border-[#404040]"}`}
                >
                  {availability}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelClass}>Minimum age
                <div className="flex gap-1">
                  <input value={band.minimumAge} onChange={event => updateBand(band.id, { minimumAge: event.target.value })} inputMode="decimal" className={fieldClass} />
                  <select value={band.minimumAgeUnit} onChange={event => updateBand(band.id, { minimumAgeUnit: event.target.value as AgeUnit })} className={fieldClass}>
                    <option value="DAYS">days</option><option value="MONTHS">months</option><option value="YEARS">years</option>
                  </select>
                </div>
              </label>
              <label className={labelClass}>Maximum age (exclusive)
                <div className="flex gap-1">
                  <input value={band.maximumAge} onChange={event => updateBand(band.id, { maximumAge: event.target.value })} inputMode="decimal" className={fieldClass} />
                  <select value={band.maximumAgeUnit} onChange={event => updateBand(band.id, { maximumAgeUnit: event.target.value as AgeUnit })} className={fieldClass}>
                    <option value="DAYS">days</option><option value="MONTHS">months</option><option value="YEARS">years</option>
                  </select>
                </div>
              </label>
              <label className={labelClass}>Minimum weight (optional)
                <input value={band.minimumWeightKg} onChange={event => updateBand(band.id, { minimumWeightKg: event.target.value })} inputMode="decimal" placeholder="Any" className={fieldClass} />
                <span className="flex items-center gap-2 font-normal"><input type="checkbox" checked={band.minimumWeightInclusive} onChange={event => updateBand(band.id, { minimumWeightInclusive: event.target.checked })} /> Include boundary</span>
              </label>
              <label className={labelClass}>Maximum weight (optional)
                <input value={band.maximumWeightKg} onChange={event => updateBand(band.id, { maximumWeightKg: event.target.value })} inputMode="decimal" placeholder="Any" className={fieldClass} />
                <span className="flex items-center gap-2 font-normal"><input type="checkbox" checked={band.maximumWeightInclusive} onChange={event => updateBand(band.id, { maximumWeightInclusive: event.target.checked })} /> Include boundary</span>
              </label>
            </div>

            {band.availability === "LOCAL" ? (
              <label className={`${labelClass} mt-3 max-w-sm`}>Manual entry unit
                <input value={band.manualUnit} onChange={event => updateBand(band.id, { manualUnit: event.target.value })} className={fieldClass} />
              </label>
            ) : null}

            {(band.availability === "AUTO" || band.availability === "MANUAL") && band.profile ? (
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-[#303030]">
                <DoseProfileEditor profile={band.profile} onChange={profile => updateBand(band.id, { profile })} />
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <button type="button" onClick={() => setBands(current => [...current, editableBand()])} className="inline-flex items-center gap-2 rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
        <Plus className="h-4 w-4" /> Add age/weight band
      </button>

      {error ? <p role="alert" className="text-sm font-semibold text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button>
        <button type="button" disabled={busy || !medicationKey.trim() || !labelEn.trim() || !bands.length} onClick={save} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save drug profile</button>
      </div>
    </div>
  )
}
