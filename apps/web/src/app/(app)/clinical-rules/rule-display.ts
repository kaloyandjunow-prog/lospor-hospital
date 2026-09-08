import type {
  ClinicalPresetRule,
  ClinicalPresetScope,
  ClinicalRuleMode,
  ClinicalRulePayload,
} from "@lospor/core/clinical-rules"
import { CLINICAL_RULES_PAGE_COPY as COPY } from "@/components/clinical-rules/page-copy"

/**
 * How a clinical ruleset reads on the workbench: the words for a scope or a
 * status, the label and age band for one rule, and how sibling rules for the
 * same drug collapse into a single grouped row.
 *
 * Pure functions of their arguments, split out of the page so the screen is
 * state and layout rather than 195 lines of naming rules ahead of the
 * component that renders them.
 */

export function scopeLabel(scope: ClinicalPresetScope, copy: typeof COPY.en | typeof COPY.bg) {
  return scope === "PLATFORM"
    ? copy.platform
    : scope === "INSTITUTION"
      ? copy.institution
      : copy.personal
}

export function statusLabel(status: string, copy: typeof COPY.en | typeof COPY.bg) {
  return status === "DRAFT"
    ? copy.draft
    : status === "PUBLISHED"
      ? copy.published
      : copy.retired
}

export function ruleLabel(payload: ClinicalRulePayload, bg: boolean) {
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

export function pediatricDrugKey(payload: ClinicalRulePayload): string | null {
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
export function pediatricBandKey(payload: ClinicalRulePayload): string | null {
  if (
    payload.kind !== "PEDIATRIC_INFUSION_PROFILE"
    && payload.kind !== "PEDIATRIC_FLUID_PROFILE"
  ) return null
  return `${payload.kind}:${payload.itemKey.trim().toUpperCase()}`
}

/** Human-readable age band, e.g. "0–28 d", "1–12 mo", "3–18 y". */
export function ageBandLabel(payload: ClinicalRulePayload): string | null {
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

export function groupVisibleRules(
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
