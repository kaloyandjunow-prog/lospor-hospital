"use client"

import { useMemo, useState } from "react"
import { Check, X } from "lucide-react"
import {
  PEDIATRIC_DRUG_POLICY_DISPOSITIONS,
  PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES,
  PEDIATRIC_INFUSION_DISPOSITIONS,
  validateClinicalRulePayload,
  type PediatricClinicalRulePayload,
  type PediatricDrugDoseRulePayload,
  type PediatricDrugPolicyRulePayload,
  type PediatricDrugProfileRulePayload,
  type PediatricFluidProfileRulePayload,
  type PediatricInfusionDisposition,
  type PediatricInfusionProfileRulePayload,
} from "@lospor/core/clinical-rules"
import type { DoseProfile } from "@lospor/core/catalog"
import {
  FLUID_RATE_SLIDER,
  isBloodProductFluid,
  isMaintenanceCompatibleFluid,
} from "@lospor/core/intraop-fluids"
import {
  DoseProfileEditor,
  doseProfileEditorIssues,
  normalizeFluidRuntimeProfile,
} from "./DoseProfileEditor"

export type ClinicalRuleDrugOption = {
  value: string
  label: string
  labelBg?: string | null
  inn?: string | null
}

export type ClinicalRuleFluidOption = {
  value: string
  label: string
  labelBg?: string | null
  group?: string | null
}

export type ClinicalRuleInfusionOption = ClinicalRuleFluidOption

const EMPTY_FLUID_OPTIONS: ClinicalRuleFluidOption[] = []
const EMPTY_INFUSION_OPTIONS: ClinicalRuleInfusionOption[] = []

export type ClinicalRuleEditorCopy = {
  drug: string
  drugProfile: string
  drugPolicy: string
  fluidProfile: string
  infusionProfile: string
  medication: string
  fluid: string
  infusion: string
  indication: string
  route: string
  ageMin: string
  ageMax: string
  basis: string
  amountPerUnit: string
  flatAmount: string
  minimumAmount: string
  maximumAmount: string
  roundTo: string
  doseUnit: string
  drugCategory: string
  fluidCategory: string
  infusionCategory: string
  infusionDisposition: string
  manualUnit: string
  profileEnabled: string
  manualEntryOnly: string
  routineSuggestion: string
  advisory: string
  minimumWeight: string
  maximumWeight: string
  minimumWeightInclusive: string
  maximumWeightInclusive: string
  labelEn: string
  labelBg: string
  disposition: string
  reviewStatus: string
  rationaleEn: string
  rationaleBg: string
  save: string
  cancel: string
  invalid: string
}

type EditablePediatricKind =
  | "PEDIATRIC_DRUG_DOSE"
  | "PEDIATRIC_DRUG_PROFILE"
  | "PEDIATRIC_DRUG_POLICY"
  | "PEDIATRIC_FLUID_PROFILE"
  | "PEDIATRIC_INFUSION_PROFILE"

type Props = {
  initial?: PediatricClinicalRulePayload | null
  lockIdentity?: boolean
  drugOptions: ClinicalRuleDrugOption[]
  fluidOptions?: ClinicalRuleFluidOption[]
  infusionOptions?: ClinicalRuleInfusionOption[]
  copy: ClinicalRuleEditorCopy
  busy?: boolean
  onSubmit: (payload: PediatricClinicalRulePayload) => void
  onCancel: () => void
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100 dark:disabled:bg-[#161616]"
const labelClass = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function requiredNumber(value: string): number {
  return optionalNumber(value) ?? Number.NaN
}

function valueString(value: number | null | undefined): string {
  return value == null ? "" : String(value)
}

function defaultPediatricProfile(): DoseProfile {
  return {
    kind: "bolus",
    mode: "dose",
    min: 0,
    max: 100,
    step: 1,
    rounding: "nearest_step",
    quickValues: [],
    unit: "mg",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "TBW",
  }
}

function defaultPediatricFluidProfile(): DoseProfile {
  return {
    kind: "fluid",
    mode: "dose",
    min: 0,
    max: 2_000,
    step: 50,
    rounding: "nearest_step",
    quickValues: [250, 500, 1_000],
    unit: "mL",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "none",
    fluidEntryModes: ["VOLUME", "RATE"],
    defaultFluidEntryMode: "RATE",
    fluidRate: {
      ...FLUID_RATE_SLIDER,
      calculation: "HOLLIDAY_SEGAR_4_2_1",
    },
  }
}

function defaultPediatricInfusionProfile(): DoseProfile {
  return {
    kind: "infusion",
    mode: "rate",
    min: 0,
    max: 100,
    step: 0.1,
    rounding: "nearest_step",
    quickValues: [],
    unit: "mcg/kg/min",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "TBW",
  }
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  multiline,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  multiline?: boolean
}) {
  return (
    <label className={labelClass}>
      {label}
      {multiline ? (
        <textarea value={value} disabled={disabled} rows={2} onChange={event => onChange(event.target.value)} className={inputClass} />
      ) : (
        <input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={inputClass} />
      )}
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className={labelClass}>
      {label}
      <input type="number" inputMode="decimal" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={inputClass} />
    </label>
  )
}

export function ClinicalRuleEditor({
  initial,
  lockIdentity = false,
  drugOptions,
  fluidOptions = EMPTY_FLUID_OPTIONS,
  infusionOptions = EMPTY_INFUSION_OPTIONS,
  copy,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const initialDrug = initial?.kind === "PEDIATRIC_DRUG_DOSE" ? initial : null
  const initialDrugProfile = initial?.kind === "PEDIATRIC_DRUG_PROFILE" ? initial : null
  const initialDrugPolicy = initial?.kind === "PEDIATRIC_DRUG_POLICY" ? initial : null
  const initialFluidProfile = initial?.kind === "PEDIATRIC_FLUID_PROFILE" ? initial : null
  const initialInfusionProfile = initial?.kind === "PEDIATRIC_INFUSION_PROFILE" ? initial : null
  const initialKind: EditablePediatricKind = initialInfusionProfile
    ? "PEDIATRIC_INFUSION_PROFILE"
    : initialFluidProfile
    ? "PEDIATRIC_FLUID_PROFILE"
    : initialDrugProfile
    ? "PEDIATRIC_DRUG_PROFILE"
    : initialDrugPolicy
      ? "PEDIATRIC_DRUG_POLICY"
      : initialDrug
        ? "PEDIATRIC_DRUG_DOSE"
        // A new rule starts as a drug profile: the dose kind is retired for
        // authoring, so defaulting to it would fail on save.
        : "PEDIATRIC_DRUG_PROFILE"
  const initialAgeBand = initialDrug ?? initialDrugProfile ?? initialFluidProfile ?? initialInfusionProfile

  const [kind, setKind] = useState<EditablePediatricKind>(initialKind)
  const [medicationKey, setMedicationKey] = useState(
    initialDrug?.medicationKey
      ?? initialDrugProfile?.medicationKey
      ?? initialDrugPolicy?.medicationKey
      ?? initialFluidProfile?.itemKey
      ?? initialInfusionProfile?.itemKey
      ?? "",
  )
  const [labelEn, setLabelEn] = useState(
    initialDrug?.labelEn ?? initialDrugProfile?.labelEn ?? initialDrugPolicy?.labelEn ?? initialFluidProfile?.labelEn ?? initialInfusionProfile?.labelEn ?? "",
  )
  const [labelBg, setLabelBg] = useState(
    initialDrug?.labelBg ?? initialDrugProfile?.labelBg ?? initialDrugPolicy?.labelBg ?? initialFluidProfile?.labelBg ?? initialInfusionProfile?.labelBg ?? "",
  )
  const [inn, setInn] = useState(
    initialDrug?.inn ?? initialDrugProfile?.inn ?? initialDrugPolicy?.inn ?? "",
  )
  const [indication, setIndication] = useState(initialDrug?.indication ?? "")
  const [route, setRoute] = useState(initialDrug?.route ?? "")
  const [minimumAgeDays, setMinimumAgeDays] = useState(valueString(initialAgeBand?.minimumAgeDays))
  const [maximumAgeDays, setMaximumAgeDays] = useState(valueString(initialAgeBand?.maximumAgeDaysExclusive))
  const [basis, setBasis] = useState<PediatricDrugDoseRulePayload["basis"]>(initialDrug?.basis ?? "TBW_KG")
  const [amountPerUnit, setAmountPerUnit] = useState(valueString(initialDrug?.amountPerUnit))
  const [flatAmount, setFlatAmount] = useState(valueString(initialDrug?.flatAmount))
  const [minimumAmount, setMinimumAmount] = useState(valueString(initialDrug?.minimumAmount))
  const [maximumAmount, setMaximumAmount] = useState(valueString(initialDrug?.maximumAmount))
  const [roundTo, setRoundTo] = useState(valueString(initialDrug?.roundTo))
  const [doseUnit, setDoseUnit] = useState(initialDrug?.doseUnit ?? "")
  const [drugCategory, setDrugCategory] = useState(initialDrugProfile?.category ?? initialDrugPolicy?.category ?? initialFluidProfile?.category ?? initialInfusionProfile?.category ?? "")
  const [doseProfile, setDoseProfile] = useState<DoseProfile>(
    initialInfusionProfile?.profile ?? initialFluidProfile?.profile ?? initialDrugProfile?.profile ?? defaultPediatricProfile(),
  )
  const [profileEnabled, setProfileEnabled] = useState(initialInfusionProfile?.profile !== null)
  const [infusionDisposition, setInfusionDisposition] = useState<PediatricInfusionDisposition>(
    initialInfusionProfile?.disposition ?? "MANUAL",
  )
  const [routeDispositions, setRouteDispositions] = useState<Record<string, PediatricInfusionDisposition>>(
    initialInfusionProfile?.routeDispositions ?? {},
  )
  const [manualEntryOnly, setManualEntryOnly] = useState(initialInfusionProfile?.manualEntryOnly ?? false)
  const [routeManualEntryOnly, setRouteManualEntryOnly] = useState<Record<string, boolean>>(
    initialInfusionProfile?.routeManualEntryOnly ?? {},
  )
  const [manualUnit, setManualUnit] = useState(initialInfusionProfile?.manualUnit ?? "")
  const [minimumWeightKg, setMinimumWeightKg] = useState(valueString(initialInfusionProfile?.minimumWeightKg))
  const [maximumWeightKg, setMaximumWeightKg] = useState(valueString(initialInfusionProfile?.maximumWeightKg))
  const [minimumWeightInclusive, setMinimumWeightInclusive] = useState(initialInfusionProfile?.minimumWeightInclusive ?? true)
  const [maximumWeightInclusive, setMaximumWeightInclusive] = useState(initialInfusionProfile?.maximumWeightInclusive ?? false)
  const [routineSuggestion, setRoutineSuggestion] = useState(initialInfusionProfile?.routineSuggestion ?? true)
  const [advisory, setAdvisory] = useState(initialInfusionProfile?.advisory ?? "")
  const [drugDisposition, setDrugDisposition] = useState<PediatricDrugPolicyRulePayload["disposition"]>(initialDrugPolicy?.disposition ?? "PENDING_RESEARCH")
  const [reviewStatus, setReviewStatus] = useState<PediatricDrugPolicyRulePayload["reviewStatus"]>(initialDrugPolicy?.reviewStatus ?? "PENDING")
  const [rationaleEn, setRationaleEn] = useState(initialDrugPolicy?.rationaleEn ?? "")
  const [rationaleBg, setRationaleBg] = useState(initialDrugPolicy?.rationaleBg ?? "")
  const [error, setError] = useState("")

  const isFluidProfile = kind === "PEDIATRIC_FLUID_PROFILE"
  const isInfusionProfile = kind === "PEDIATRIC_INFUSION_PROFILE"
  const itemOptions = isFluidProfile
    ? fluidOptions
    : isInfusionProfile
      ? infusionOptions
      : drugOptions
  const selectedItem = useMemo(
    () => itemOptions.find(option => option.value === medicationKey),
    [itemOptions, medicationKey],
  )

  function selectItem(value: string) {
    setMedicationKey(value)
    const selected = itemOptions.find(option => option.value === value)
    if (!selected) return
    setLabelEn(selected.label)
    setLabelBg(selected.labelBg ?? selected.label)
    if (isFluidProfile) {
      setInn("")
      const category = "group" in selected ? selected.group ?? "" : ""
      setDrugCategory(category)
      const nextProfile = defaultPediatricFluidProfile()
      const fluidIdentity = { name: selected.label, category }
      setDoseProfile(isBloodProductFluid(fluidIdentity)
        ? {
          ...nextProfile,
          fluidEntryModes: ["VOLUME"],
          defaultFluidEntryMode: "VOLUME",
          fluidRate: undefined,
        }
        : isMaintenanceCompatibleFluid(fluidIdentity)
          ? nextProfile
          : {
              ...nextProfile,
              fluidRate: { ...FLUID_RATE_SLIDER },
            })
    } else if (isInfusionProfile) {
      setInn("")
      setDrugCategory("group" in selected ? selected.group ?? "" : "")
      setDoseProfile(defaultPediatricInfusionProfile())
      setProfileEnabled(true)
      setInfusionDisposition("MANUAL")
      setRouteDispositions({})
      setManualEntryOnly(false)
      setRouteManualEntryOnly({})
      setManualUnit("")
      setMinimumWeightKg("")
      setMaximumWeightKg("")
      setMinimumWeightInclusive(true)
      setMaximumWeightInclusive(false)
      setRoutineSuggestion(true)
      setAdvisory("")
    } else {
      setInn("inn" in selected ? selected.inn ?? "" : "")
    }
  }

  function changeKind(nextKind: EditablePediatricKind) {
    const currentFamily = isFluidProfile ? "fluid" : isInfusionProfile ? "infusion" : "drug"
    const nextFamily = nextKind === "PEDIATRIC_FLUID_PROFILE"
      ? "fluid"
      : nextKind === "PEDIATRIC_INFUSION_PROFILE"
        ? "infusion"
        : "drug"
    setKind(nextKind)
    if (currentFamily === nextFamily) return
    setMedicationKey("")
    setLabelEn("")
    setLabelBg("")
    setInn("")
    setDrugCategory("")
    setDoseProfile(nextFamily === "fluid"
      ? defaultPediatricFluidProfile()
      : nextFamily === "infusion"
        ? defaultPediatricInfusionProfile()
        : defaultPediatricProfile())
    if (nextFamily === "infusion") {
      setProfileEnabled(true)
      setInfusionDisposition("MANUAL")
      setRouteDispositions({})
      setManualEntryOnly(false)
      setRouteManualEntryOnly({})
      setManualUnit("")
      setMinimumWeightKg("")
      setMaximumWeightKg("")
      setMinimumWeightInclusive(true)
      setMaximumWeightInclusive(false)
      setRoutineSuggestion(true)
      setAdvisory("")
    }
  }

  function submit() {
    let candidate: PediatricClinicalRulePayload
    if (kind === "PEDIATRIC_DRUG_POLICY") {
      candidate = {
        kind,
        medicationKey,
        labelEn,
        labelBg: labelBg || null,
        inn: inn || null,
        category: drugCategory || null,
        disposition: drugDisposition,
        reviewStatus,
        rationaleEn,
        rationaleBg: rationaleBg || null,
      }
    } else if (kind === "PEDIATRIC_DRUG_DOSE") {
      candidate = {
        kind,
        medicationKey,
        labelEn,
        labelBg: labelBg || null,
        inn: inn || null,
        indication,
        route,
        basis,
        amountPerUnit: basis === "FLAT" ? null : optionalNumber(amountPerUnit),
        flatAmount: basis === "FLAT" ? optionalNumber(flatAmount) : null,
        minimumAmount: optionalNumber(minimumAmount),
        maximumAmount: optionalNumber(maximumAmount),
        roundTo: optionalNumber(roundTo),
        doseUnit,
        minimumAgeDays: requiredNumber(minimumAgeDays),
        maximumAgeDaysExclusive: requiredNumber(maximumAgeDays),
      }
    } else if (kind === "PEDIATRIC_INFUSION_PROFILE") {
      const profile = profileEnabled ? doseProfile : null
      if (profile) {
        const editorIssues = doseProfileEditorIssues(profile)
        if (editorIssues.length) {
          setError(editorIssues.join(" "))
          return
        }
      }
      candidate = {
        kind,
        itemKey: medicationKey,
        labelEn,
        labelBg: labelBg || null,
        category: drugCategory || null,
        disposition: infusionDisposition,
        routeDispositions,
        manualEntryOnly,
        routeManualEntryOnly,
        profile,
        unit: initialInfusionProfile?.unit ?? null,
        routeUnits: initialInfusionProfile?.routeUnits ?? {},
        manualUnit: manualUnit || null,
        minimumAgeDays: requiredNumber(minimumAgeDays),
        maximumAgeDaysExclusive: requiredNumber(maximumAgeDays),
        minimumWeightKg: optionalNumber(minimumWeightKg),
        minimumWeightInclusive,
        maximumWeightKg: optionalNumber(maximumWeightKg),
        maximumWeightInclusive,
        routineSuggestion,
        advisory: advisory || null,
      } satisfies PediatricInfusionProfileRulePayload
    } else {
      const profile = isFluidProfile ? normalizeFluidRuntimeProfile(doseProfile) : doseProfile
      const editorIssues = doseProfileEditorIssues(profile)
      if (editorIssues.length) {
        setError(editorIssues.join(" "))
        return
      }
      candidate = isFluidProfile
        ? {
            kind: "PEDIATRIC_FLUID_PROFILE",
            itemKey: medicationKey,
            labelEn,
            labelBg: labelBg || null,
            category: drugCategory || null,
            profile,
            unit: initialFluidProfile?.unit ?? null,
            routeUnits: initialFluidProfile?.routeUnits ?? {},
            minimumAgeDays: requiredNumber(minimumAgeDays),
            maximumAgeDaysExclusive: requiredNumber(maximumAgeDays),
          } satisfies PediatricFluidProfileRulePayload
        : {
            kind: "PEDIATRIC_DRUG_PROFILE",
            medicationKey,
            labelEn,
            labelBg: labelBg || null,
            inn: inn || null,
            category: drugCategory || null,
            profile,
            unit: initialDrugProfile?.unit ?? null,
            routeUnits: initialDrugProfile?.routeUnits ?? {},
            minimumAgeDays: requiredNumber(minimumAgeDays),
            maximumAgeDaysExclusive: requiredNumber(maximumAgeDays),
          } satisfies PediatricDrugProfileRulePayload
    }
    const parsed = validateClinicalRulePayload(candidate)
    if (!parsed.valid) {
      setError(parsed.issues.map(issue => `${issue.field}: ${issue.message}`).join("; ") || copy.invalid)
      return
    }
    setError("")
    onSubmit(parsed.value as PediatricClinicalRulePayload)
  }

  const isPolicy = kind === "PEDIATRIC_DRUG_POLICY"
  const isProfile = kind === "PEDIATRIC_DRUG_PROFILE" || isFluidProfile || isInfusionProfile

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-[#303030]">
      {!initial ? (
        <div className="flex flex-wrap rounded-md border border-slate-300 p-1 dark:border-[#3a3a3a]">
          {([
            // PEDIATRIC_DRUG_DOSE is retired for authoring — see
            // RETIRED_AUTHORING_RULE_KINDS in core. The server rejects it, so
            // offering it here would only produce an error. An existing rule of
            // that kind still opens for editing below.
            ["PEDIATRIC_DRUG_PROFILE", copy.drugProfile],
            ["PEDIATRIC_DRUG_POLICY", copy.drugPolicy],
            ["PEDIATRIC_FLUID_PROFILE", copy.fluidProfile],
            ["PEDIATRIC_INFUSION_PROFILE", copy.infusionProfile],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={kind === value} onClick={() => changeKind(value)} className={`rounded px-3 py-1.5 text-sm font-semibold ${kind === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#292929]"}`}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <label className={labelClass}>
          {isFluidProfile ? copy.fluid : isInfusionProfile ? copy.infusion : copy.medication}
          <select value={medicationKey} disabled={lockIdentity} onChange={event => selectItem(event.target.value)} className={inputClass}>
            <option value="">-</option>
            {medicationKey && !itemOptions.some(option => option.value === medicationKey) ? (
              <option value={medicationKey}>{labelEn || medicationKey}</option>
            ) : null}
            {itemOptions.map(option => <option key={option.value} value={option.value}>{option.label}{"inn" in option && option.inn ? ` (${option.inn})` : ""}</option>)}
          </select>
        </label>
        {kind === "PEDIATRIC_DRUG_DOSE" ? (
          <>
            <TextField label={copy.indication} value={indication} onChange={setIndication} disabled={lockIdentity} />
            <TextField label={copy.route} value={route} onChange={setRoute} disabled={lockIdentity} />
          </>
        ) : (
          <TextField label={isFluidProfile ? copy.fluidCategory : isInfusionProfile ? copy.infusionCategory : copy.drugCategory} value={drugCategory} onChange={setDrugCategory} />
        )}
        <TextField label={copy.labelEn} value={labelEn} onChange={setLabelEn} />
        <TextField label={copy.labelBg} value={labelBg ?? selectedItem?.labelBg ?? ""} onChange={setLabelBg} />
        {!isPolicy ? (
          <>
            <NumberField label={copy.ageMin} value={minimumAgeDays} onChange={setMinimumAgeDays} disabled={lockIdentity} />
            <NumberField label={copy.ageMax} value={maximumAgeDays} onChange={setMaximumAgeDays} disabled={lockIdentity} />
          </>
        ) : null}

        {isPolicy ? (
          <>
            <label className={labelClass}>
              {copy.disposition}
              <select value={drugDisposition} onChange={event => setDrugDisposition(event.target.value as PediatricDrugPolicyRulePayload["disposition"])} className={inputClass}>
                {PEDIATRIC_DRUG_POLICY_DISPOSITIONS.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              {copy.reviewStatus}
              <select value={reviewStatus} onChange={event => setReviewStatus(event.target.value as PediatricDrugPolicyRulePayload["reviewStatus"])} className={inputClass}>
                {PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <TextField label={copy.rationaleEn} value={rationaleEn} onChange={setRationaleEn} multiline />
            <TextField label={copy.rationaleBg} value={rationaleBg} onChange={setRationaleBg} multiline />
          </>
        ) : kind === "PEDIATRIC_DRUG_DOSE" ? (
          <>
            <label className={labelClass}>
              {copy.basis}
              <select value={basis} onChange={event => setBasis(event.target.value as PediatricDrugDoseRulePayload["basis"])} className={inputClass}>
                <option value="TBW_KG">TBW / kg</option>
                <option value="BSA_M2">BSA / m2</option>
                <option value="FLAT">Flat</option>
              </select>
            </label>
            {basis === "FLAT" ? <NumberField label={copy.flatAmount} value={flatAmount} onChange={setFlatAmount} /> : <NumberField label={copy.amountPerUnit} value={amountPerUnit} onChange={setAmountPerUnit} />}
            <TextField label={copy.doseUnit} value={doseUnit} onChange={setDoseUnit} />
            <NumberField label={copy.minimumAmount} value={minimumAmount} onChange={setMinimumAmount} />
            <NumberField label={copy.maximumAmount} value={maximumAmount} onChange={setMaximumAmount} />
            <NumberField label={copy.roundTo} value={roundTo} onChange={setRoundTo} />
          </>
        ) : isInfusionProfile ? (
          <>
            <label className={labelClass}>
              {copy.infusionDisposition}
              <select value={infusionDisposition} onChange={event => setInfusionDisposition(event.target.value as PediatricInfusionDisposition)} className={inputClass}>
                {PEDIATRIC_INFUSION_DISPOSITIONS.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <TextField label={copy.manualUnit} value={manualUnit} onChange={setManualUnit} />
            <NumberField label={copy.minimumWeight} value={minimumWeightKg} onChange={setMinimumWeightKg} disabled={lockIdentity} />
            <NumberField label={copy.maximumWeight} value={maximumWeightKg} onChange={setMaximumWeightKg} disabled={lockIdentity} />
            <label className={labelClass}>
              <span>{copy.profileEnabled}</span>
              <input type="checkbox" checked={profileEnabled} onChange={event => setProfileEnabled(event.target.checked)} className="h-4 w-4" />
            </label>
            <label className={labelClass}>
              <span>{copy.manualEntryOnly}</span>
              <input type="checkbox" checked={manualEntryOnly} onChange={event => setManualEntryOnly(event.target.checked)} className="h-4 w-4" />
            </label>
            <label className={labelClass}>
              <span>{copy.routineSuggestion}</span>
              <input type="checkbox" checked={routineSuggestion} onChange={event => setRoutineSuggestion(event.target.checked)} className="h-4 w-4" />
            </label>
            <label className={labelClass}>
              <span>{copy.minimumWeightInclusive}</span>
              <input type="checkbox" checked={minimumWeightInclusive} onChange={event => setMinimumWeightInclusive(event.target.checked)} className="h-4 w-4" />
            </label>
            <label className={labelClass}>
              <span>{copy.maximumWeightInclusive}</span>
              <input type="checkbox" checked={maximumWeightInclusive} onChange={event => setMaximumWeightInclusive(event.target.checked)} className="h-4 w-4" />
            </label>
            <div className="md:col-span-2 lg:col-span-3">
              <TextField label={copy.advisory} value={advisory} onChange={setAdvisory} multiline />
            </div>
          </>
        ) : null}
      </div>

      {isInfusionProfile && profileEnabled && doseProfile.routes.length ? (
        <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-[#303030]">
          {doseProfile.routes.map(profileRoute => (
            <div key={profileRoute} className="grid gap-3 md:grid-cols-3 md:items-end">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{profileRoute}</div>
              <label className={labelClass}>
                {copy.infusionDisposition}
                <select
                  value={routeDispositions[profileRoute] ?? ""}
                  onChange={event => setRouteDispositions(current => {
                    const next = { ...current }
                    const value = event.target.value as PediatricInfusionDisposition | ""
                    if (value) next[profileRoute] = value
                    else delete next[profileRoute]
                    return next
                  })}
                  className={inputClass}
                >
                  <option value="">{infusionDisposition}</option>
                  {PEDIATRIC_INFUSION_DISPOSITIONS.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                <span>{copy.manualEntryOnly}</span>
                <input
                  type="checkbox"
                  checked={routeManualEntryOnly[profileRoute] ?? false}
                  onChange={event => setRouteManualEntryOnly(current => ({ ...current, [profileRoute]: event.target.checked }))}
                  className="h-4 w-4"
                />
              </label>
            </div>
          ))}
        </div>
      ) : null}

      {isProfile && (!isInfusionProfile || profileEnabled) ? <DoseProfileEditor profile={doseProfile} onChange={setDoseProfile} /> : null}

      {error ? <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <Check className="h-4 w-4" /> {copy.save}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3a3a] dark:text-slate-200 dark:hover:bg-[#292929]">
          <X className="h-4 w-4" /> {copy.cancel}
        </button>
      </div>
    </div>
  )
}
