"use client"

import { doseProfileEditorIssues } from "@/lib/dose-profile-validation"

import { useState } from "react"
import {
  canonicalDoseProfileMetadata,
} from "@lospor/core/clinical-rule-vocabulary"
import {
  DRUG_PROFILE_AVAILABILITIES,
  type AdultDoseProfileRuleKind,
  type AdultDoseProfileRulePayload,
  type ClinicalRulePayload,
  type DrugProfileAvailability,
} from "@lospor/core/clinical-rules"
import {
  parseDoseProfile,
  type DoseProfile,
} from "@lospor/core/catalog"
import {
  DoseProfileEditor,
  normalizeFluidRuntimeProfile,
} from "./DoseProfileEditor"

const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100"
const labelClass = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"

function profileKind(kind: AdultDoseProfileRuleKind) {
  return kind === "ADULT_DRUG_PROFILE"
    ? "bolus"
    : kind === "ADULT_INFUSION_PROFILE"
      ? "infusion"
      : "fluid"
}

function defaultProfile(kind: AdultDoseProfileRuleKind): DoseProfile {
  return {
    kind: profileKind(kind),
    mode: "dose",
    min: 0,
    max: kind === "ADULT_FLUID_PROFILE" ? 2000 : 100,
    step: kind === "ADULT_FLUID_PROFILE" ? 50 : 1,
    rounding: "nearest_step",
    quickValues: kind === "ADULT_FLUID_PROFILE" ? [250, 500, 1000] : [1, 2, 5, 10],
    unit: kind === "ADULT_FLUID_PROFILE" ? "mL" : "mg",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "none",
  }
}

function dosePayload(initial: ClinicalRulePayload | null): AdultDoseProfileRulePayload {
  if (
    initial?.kind === "ADULT_DRUG_PROFILE"
    || initial?.kind === "ADULT_INFUSION_PROFILE"
    || initial?.kind === "ADULT_FLUID_PROFILE"
  ) return initial
  const profile = defaultProfile("ADULT_DRUG_PROFILE")
  const metadata = canonicalDoseProfileMetadata(profile)
  return {
    kind: "ADULT_DRUG_PROFILE",
    itemKey: "",
    labelEn: "",
    labelBg: null,
    category: null,
    profile: metadata.profile,
    unit: metadata.unit,
    routeUnits: metadata.routeUnits,
    availability: "AUTO",
  }
}

export function AdultClinicalRuleEditor({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: ClinicalRulePayload | null
  busy: boolean
  onSubmit: (payload: ClinicalRulePayload) => void
  onCancel: () => void
}) {
  const [dose, setDose] = useState(() => dosePayload(initial))
  const [error, setError] = useState("")

  function changeKind(kind: AdultDoseProfileRuleKind) {
    const metadata = canonicalDoseProfileMetadata(defaultProfile(kind))
    setDose(current => ({
      ...current,
      kind,
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
    }))
  }

  function updateProfile(profile: DoseProfile) {
    setDose(current => ({ ...current, profile }))
  }

  function submitDose() {
    const profile = dose.kind === "ADULT_FLUID_PROFILE"
      ? normalizeFluidRuntimeProfile(dose.profile)
      : dose.profile
    const editorIssues = doseProfileEditorIssues(profile)
    if (editorIssues.length) {
      setError(editorIssues.join(" "))
      return
    }
    try {
      const parsedProfile = parseDoseProfile(
        dose.labelEn || dose.itemKey || "Adult clinical rule",
        profileKind(dose.kind),
        profile,
      )
      const metadata = canonicalDoseProfileMetadata(parsedProfile)
      onSubmit({
        ...dose,
        itemKey: dose.itemKey.trim(),
        labelEn: dose.labelEn.trim(),
        labelBg: dose.labelBg?.trim() || null,
        category: dose.category?.trim() || null,
        profile: metadata.profile,
        unit: metadata.unit,
        routeUnits: metadata.routeUnits,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invalid dose profile")
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Profile type
          <select disabled={!!initial} value={dose.kind} onChange={event => changeKind(event.target.value as AdultDoseProfileRuleKind)} className={fieldClass}>
            <option value="ADULT_DRUG_PROFILE">Drug</option>
            <option value="ADULT_INFUSION_PROFILE">Infusion</option>
            <option value="ADULT_FLUID_PROFILE">Fluid</option>
          </select>
        </label>
        <label className={labelClass}>
          Canonical key
          <input disabled={!!initial} value={dose.itemKey} onChange={event => setDose(current => ({ ...current, itemKey: event.target.value }))} className={fieldClass} />
        </label>
        <label className={labelClass}>
          English label
          <input value={dose.labelEn} onChange={event => setDose(current => ({ ...current, labelEn: event.target.value }))} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Bulgarian label
          <input value={dose.labelBg ?? ""} onChange={event => setDose(current => ({ ...current, labelBg: event.target.value }))} className={fieldClass} />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Category
          <input value={dose.category ?? ""} onChange={event => setDose(current => ({ ...current, category: event.target.value }))} className={fieldClass} />
        </label>
      </div>

      {dose.kind === "ADULT_DRUG_PROFILE" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DRUG_PROFILE_AVAILABILITIES.map(availability => (
            <button
              key={availability}
              type="button"
              aria-pressed={(dose.availability ?? "AUTO") === availability}
              onClick={() => setDose(current => ({
                ...current,
                availability: availability as DrugProfileAvailability,
              }))}
              className={`rounded-md border px-3 py-2 text-xs font-bold ${(dose.availability ?? "AUTO") === availability
                ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                : "border-slate-300 text-slate-500 dark:border-[#404040]"}`}
            >
              {availability}
            </button>
          ))}
        </div>
      ) : null}

      <DoseProfileEditor profile={dose.profile} onChange={updateProfile} />

      {error ? <p role="alert" className="text-sm font-semibold text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !dose.itemKey.trim() || !dose.labelEn.trim() || !dose.profile.routes.length}
          onClick={submitDose}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save rule
        </button>
      </div>
    </div>
  )
}
