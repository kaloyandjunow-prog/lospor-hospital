import { displayClinicalCode } from "@/lib/clinical-display"
import { airwayDeviceEntryLines, parseAirwayDeviceEntries } from "@lospor/core/airway-device-entries"
import { vascularLineText } from "@lospor/core/vascular-access-lines"
import { localTimeOf } from "@lospor/core/intraop-time"
import type { CaseDetailIntraop } from "@/types/case-detail"

/**
 * BMI to one decimal, for display only.
 *
 * The stored value is deliberately full precision — this is a research database,
 * and averaging precisely-stored BMIs beats averaging pre-rounded ones
 * (`lospor-api` `_mappers.ts`, pinned to four decimal places by
 * `pediatric-mappers.test.ts`). So the rounding has to happen here.
 *
 * Without it the anaesthesia record printed "BMI 26.1224489795918" — 80 kg at
 * 175 cm — on a sheet that goes in the patient's notes.
 */
export function formatBmi(bmi: number): string {
  return String(Math.round(bmi * 10) / 10)
}

// ── Enum label maps ───────────────────────────────────────────────────────────
/** A failed or replaced device or line, in the sheet's language (10.2.0). */
const STATE_WORDS = {
  en: { failed: "failed", replaced: "replaced" },
  bg: { failed: "неуспешен опит", replaced: "подмяна" },
} as const

function caseTime(i: CaseDetailIntraop | null | undefined) {
  return (iso: string) => (i?.timezone ? localTimeOf(new Date(iso), i.timezone) : null) ?? iso.slice(11, 16)
}

/** The access list with each failed line marked, "Peripheral IV 18G · failed 10:42". */
export function accessLabel(i: CaseDetailIntraop | null | undefined, vascular: { site?: string; siteLabel?: string; size?: string; sizeUnit?: string; failed?: boolean; failedAt?: string | null }[], locale: string): string {
  const words = STATE_WORDS[locale === "bg" ? "bg" : "en"]
  return vascular.map(a => vascularLineText(
    { ...a, site: a.site ?? "", siteLabel: displayClinicalCode("option:VASCULAR_ACCESS", a.site, locale, { label: a.siteLabel }), sizeUnit: a.sizeUnit ?? "" },
    { failed: words.failed, time: caseTime(i) },
  )).filter(Boolean).join(" · ")
}

export function deviceLabel(i: CaseDetailIntraop | null | undefined, locale: string): string {
  // 10.2.0: each device its own line, a failed or replaced one kept ("Oral ETT 8 cuffed · failed 10:42").
  const entries = parseAirwayDeviceEntries((i as { airwayDeviceEntries?: unknown } | null | undefined)?.airwayDeviceEntries)
  if (entries.length > 0) {
    const words = STATE_WORDS[locale === "bg" ? "bg" : "en"]
    return airwayDeviceEntryLines(entries, {
      device: code => displayClinicalCode("option:AIRWAY_MANAGEMENT", code, locale),
      attribute: code => displayClinicalCode("clinicalAttribute", code, locale),
      status: status => words[status],
      time: caseTime(i),
    }).join(" + ")
  }
  const devices: string[] = Array.isArray(i?.airwayDevices) ? i.airwayDevices : []
  const cuffedSuffix = (cuffed: boolean | null | undefined) => cuffed == null
    ? ""
    : ` ${displayClinicalCode("clinicalAttribute", cuffed ? "cuffed" : "uncuffed", locale)}`

  return devices.map(device => {
    const label = displayClinicalCode("option:AIRWAY_MANAGEMENT", device, locale)
    if (device === "ORAL_ETT") return `${label}${i?.oralTubeSize ? " " + i.oralTubeSize + "mm" : ""}${cuffedSuffix(i?.oralCuffed)}`
    if (device === "NASAL_ETT") return `${label}${i?.nasalTubeSize ? " " + i.nasalTubeSize + "mm" : ""}${cuffedSuffix(i?.nasalCuffed)}`
    if (device === "LMA") return `${label}${i?.lmaSize ? " " + i.lmaSize : ""}`
    if (device === "DOUBLE_LUMEN_TUBE") return `${label}${i?.dltType ? " " + i.dltType : ""}${i?.dltSide ? " " + displayClinicalCode("clinicalAttribute", i.dltSide.toLowerCase(), locale, { label: i.dltSide }) : ""}${i?.dltSize ? " " + i.dltSize + "Fr" : ""}`
    if (device === "ENDOBRONCHIAL_TUBE") return `${label}${i?.endobronchialSize ? " " + i.endobronchialSize + "mm" : ""}`
    return label
  }).join(" + ") || "—"
}

