import { canonicalComplicationLabel, complicationGroupsBeyond } from "@lospor/core/complications"
import { complicationDisplayLabel } from "@lospor/core/clinical-display"
import { defibrillationPrefillJoules } from "@lospor/core/defibrillation"
import type { ClinicalEvent } from "@lospor/core/intraop-types"
import { preopAgeDays } from "@lospor/core/vital-questions"
import type { EventCategory, EventOption } from "./EventPickerPopover"

const COMPLICATION_COLOR = "#ef4444"

/** A quick complication button: saved under, and named by, the complications catalogue. */
export function quickComplicationOption(event: { label: string; color: string }, locale: string): EventOption {
  const label = canonicalComplicationLabel(event.label)
  return { label, color: event.color, displayLabel: complicationDisplayLabel(label, locale) }
}

/**
 * Every other complication of the shared catalogue, under its own heading,
 * after the quick ones -- so any of them can be charted at its time, as the
 * PWA's slot sheet offers (10.1.0).
 */
export function moreComplicationCategories(quick: readonly { label: string }[], locale: string): EventCategory[] {
  return complicationGroupsBeyond(quick.map(event => event.label)).map(group => ({
    cat: `complications:${group.id}`,
    color: COMPLICATION_COLOR,
    displayCat: locale === "bg" ? group.titleBg : group.title,
    isComplication: true,
    events: group.items.map(label => ({ label, color: COMPLICATION_COLOR, displayLabel: complicationDisplayLabel(label, locale) })),
  }))
}

/** The Defibrillation dialog’s figures at a column: which shock this is and a child’s prefill. */
export function defibrillationDialogProps(
  markers: readonly ClinicalEvent[],
  colIdx: number,
  timeLabel: string,
  patient: { ageValue: number | null | undefined; ageUnit: string | null | undefined; weightKg: number | null | undefined },
) {
  const shockNumber = markers.filter(marker => marker.kind === "defibrillation" && marker.colIdx <= colIdx).length + 1
  const ageDays = preopAgeDays({ ageValue: patient.ageValue, ageUnit: patient.ageUnit })
  return {
    timeLabel,
    shockNumber,
    prefillJoules: defibrillationPrefillJoules({ ageDays, weightKg: patient.weightKg, shockNumber }),
  }
}
