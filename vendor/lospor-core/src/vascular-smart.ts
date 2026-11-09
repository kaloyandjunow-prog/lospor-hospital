import { VASCULAR_ACCESS_TREE } from "./catalog/vascular-access"
import type { TreeNode } from "./catalog/types"
import { resolveAirwayTime, type AirwayTimeChoice } from "./airway-smart"
import { replaceFailedLine, workingLinesOfKind, type AccessKind, type VascularLine } from "./vascular-access-lines"

/**
 * Smart selection for vascular access, the tab that opens on what is in place (10.2.0).
 *
 * Everything that decides what the tab offers lives here, so the web app and the phone cannot drift: which
 * kinds of access come first for the technique, the sizes (a peripheral line from 14G to 26G, with the colour
 * each size carries), what each kind asks, who placed the line and when, and how it is written to the case.
 * A peripheral line carries no site for now: its kind, size, who placed it and when are the record.
 *
 * It writes the same list the legacy tab does (VascularLine), so the two tabs always agree.
 */

export type VascularType = "PERIPHERAL" | "ARTERIAL" | "CENTRAL"

export const PERIPHERAL_SITE = "VEN_PERIPHERAL"

/** Peripheral cannula sizes with the ISO 10555 colour each carries. */
export const PERIPHERAL_GAUGES: ReadonlyArray<{ size: string; color: string }> = Object.freeze([
  { size: "14", color: "#f08a1c" }, { size: "16", color: "#9aa0a8" }, { size: "18", color: "#2fa35a" }, { size: "20", color: "#ec6fa8" },
  { size: "22", color: "#3b82f6" }, { size: "24", color: "#f2d02b" }, { size: "26", color: "#9b6bd6" },
])
export const ARTERIAL_GAUGES: readonly string[] = Object.freeze(["18", "20", "22", "24"])
export const CENTRAL_FR_SIZES: readonly string[] = Object.freeze(["4", "5", "6", "7", "8", "9"])
export const CENTRAL_DEPTHS_CM: readonly string[] = Object.freeze(["2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"])
export const CENTRAL_LUMENS: readonly string[] = Object.freeze(["1", "2", "3", "4+"])

const nodeOf = (code: string, nodes: readonly TreeNode[] = VASCULAR_ACCESS_TREE): TreeNode | undefined => {
  for (const node of nodes) {
    if (node.v === code) return node
    const inside = node.children ? nodeOf(code, node.children) : undefined
    if (inside) return inside
  }
  return undefined
}

function pathOf(code: string, nodes: readonly TreeNode[] = VASCULAR_ACCESS_TREE, path: TreeNode[] = []): TreeNode[] | null {
  for (const node of nodes) {
    const next = [...path, node]
    if (node.v === code) return next
    const inside = node.children ? pathOf(code, node.children, next) : null
    if (inside) return inside
  }
  return null
}

/** The canonical label stored on a line: "Venous › Central › Central line › Internal jugular". */
export const vascularSiteCrumb = (code: string): string => (pathOf(code)?.map(node => node.label).join(" › ") ?? code)

export type VascularSite = { code: string; label: string }
const childrenOf = (code: string): VascularSite[] => (nodeOf(code)?.children ?? []).map(node => ({ code: node.v, label: node.label }))

export const ARTERIAL_SITES: readonly VascularSite[] = Object.freeze(childrenOf("ARTERIAL"))
export const CENTRAL_SITES: Readonly<Record<"CVK" | "PICC", readonly VascularSite[]>> = Object.freeze({ CVK: childrenOf("CVK"), PICC: childrenOf("PICC") })

/**
 * Every selectable vascular site in the legacy catalogue, in one stable list.
 * Smart screens use the list behind an explicit disclosure so the common
 * choices stay compact without silently dropping less common sites.
 */
export type VascularCatalogLeaf = VascularSite & {
  type: VascularType
  group: "PERIPHERAL" | "ARTERIAL" | "CENTRAL"
  centralType?: "CVK" | "PICC"
}

export const VASCULAR_CATALOG_LEAVES: readonly VascularCatalogLeaf[] = Object.freeze([
  { code: PERIPHERAL_SITE, label: "Peripheral IV", type: "PERIPHERAL", group: "PERIPHERAL" },
  ...ARTERIAL_SITES.map(site => ({ ...site, type: "ARTERIAL" as const, group: "ARTERIAL" as const })),
  ...CENTRAL_SITES.CVK.map(site => ({ ...site, type: "CENTRAL" as const, group: "CENTRAL" as const, centralType: "CVK" as const })),
  ...CENTRAL_SITES.PICC.map(site => ({ ...site, type: "CENTRAL" as const, group: "CENTRAL" as const, centralType: "PICC" as const })),
])

export const vascularTypeOfSite = (site: string | null | undefined): VascularType | null => {
  const kind: AccessKind | null = ((): AccessKind | null => {
    if (!site) return null
    if (site === "ARTERIAL" || site.startsWith("ART_")) return "ARTERIAL"
    if (site === "VEN_CENTRAL" || site.startsWith("CVK") || site.startsWith("PICC")) return "CENTRAL"
    if (site === PERIPHERAL_SITE || site === "VENOUS") return "VENOUS"
    return null
  })()
  return kind === "VENOUS" ? "PERIPHERAL" : kind
}

/* ---------- which kinds come first ---------- */

export type VascularChoices = { main: VascularType[]; other: VascularType[] }

/** General anaesthesia leads with all three; anything else with a peripheral line, the rest behind "More types". */
export function vascularChoices(techniques: readonly string[]): VascularChoices {
  const general = techniques.length === 0 || techniques.some(technique => technique === "GENERAL" || technique.startsWith("GENERAL_"))
  const main: VascularType[] = general ? ["PERIPHERAL", "ARTERIAL", "CENTRAL"] : ["PERIPHERAL"]
  const all: VascularType[] = ["PERIPHERAL", "ARTERIAL", "CENTRAL"]
  return { main, other: all.filter(type => !main.includes(type)) }
}

/* ---------- what is suggested for this patient ---------- */

export type VascularPatient = { ageDays?: number | null; clinicalMode?: "ADULT" | "PEDIATRIC" | string | null; ageYears?: number | null }

const ageDaysOf = (patient: VascularPatient): number | null =>
  patient.ageDays != null ? patient.ageDays : patient.ageYears != null ? patient.ageYears * 365.25 : null

/** The size to start from: 18G for an adult, smaller by age for a child. Only a starting point. */
export function suggestedPeripheralGauge(patient: VascularPatient): string {
  const days = ageDaysOf(patient)
  if (days == null) return patient.clinicalMode === "PEDIATRIC" ? "22" : "18"
  if (days < 365) return "24"
  if (days < 6 * 365.25) return "22"
  if (days < 13 * 365.25) return "20"
  return "18"
}

export function suggestedArterialGauge(patient: VascularPatient): string {
  const days = ageDaysOf(patient)
  if (days == null) return patient.clinicalMode === "PEDIATRIC" ? "22" : "20"
  return days < 6 * 365.25 ? "24" : days < 13 * 365.25 ? "22" : "20"
}

/* ---------- what each kind asks ---------- */

export type VascularAsk =
  | { field: "origin" }
  | { field: "size"; values: readonly string[]; unit: "G" | "Fr"; colors?: Readonly<Record<string, string>> }
  | { field: "site"; values: readonly VascularSite[] }
  | { field: "centralType"; values: readonly ("CVK" | "PICC")[] }
  | { field: "depth"; values: readonly string[] }
  | { field: "lumens"; values: readonly string[] }

const GAUGE_COLORS: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(PERIPHERAL_GAUGES.map(gauge => [gauge.size, gauge.color])))

/** The questions the panel asks for a kind, in order. */
export function vascularAsks(type: VascularType, centralType: "CVK" | "PICC" = "CVK"): VascularAsk[] {
  if (type === "PERIPHERAL") return [{ field: "origin" }, { field: "size", values: PERIPHERAL_GAUGES.map(gauge => gauge.size), unit: "G", colors: GAUGE_COLORS }]
  if (type === "ARTERIAL") return [{ field: "origin" }, { field: "site", values: ARTERIAL_SITES }, { field: "size", values: ARTERIAL_GAUGES, unit: "G", colors: GAUGE_COLORS }]
  return [
    { field: "origin" }, { field: "centralType", values: ["CVK", "PICC"] }, { field: "site", values: CENTRAL_SITES[centralType] },
    { field: "lumens", values: CENTRAL_LUMENS }, { field: "depth", values: CENTRAL_DEPTHS_CM }, { field: "size", values: CENTRAL_FR_SIZES, unit: "Fr" },
  ]
}

export const defaultVascularSite = (type: VascularType, centralType: "CVK" | "PICC" = "CVK"): string =>
  type === "PERIPHERAL" ? PERIPHERAL_SITE : type === "ARTERIAL" ? "ART_RADIAL" : centralType === "PICC" ? "PICC_BASILIC" : "CVK_IJV"

/* ---------- when ---------- */

export type VascularTimeChoice = AirwayTimeChoice | "arrived"

/** The instant a line went in; null for a line that arrived with the patient, whose time nobody here knows. */
export function resolveVascularTime(choice: VascularTimeChoice, context: { startedAt: string | null; now: string; picked?: string | null }): string | null {
  return choice === "arrived" ? null : resolveAirwayTime(choice, context)
}

/** The charted events that open the panel, with the kind each stands for. */
export const VASCULAR_EVENT_TYPE: Readonly<Record<string, { type: VascularType; centralType?: "CVK" | "PICC" }>> = Object.freeze({
  "IV line in": { type: "PERIPHERAL" },
  "Art line in": { type: "ARTERIAL" },
  "CVC in": { type: "CENTRAL", centralType: "CVK" },
  "PICC": { type: "CENTRAL", centralType: "PICC" },
})

/** The event written when a clinician confirms a line placed by the anaesthesia team. */
export const vascularClinicalEvent = (type: VascularType, site: string | null | undefined): string =>
  type === "PERIPHERAL" ? "IV line in" : type === "ARTERIAL" ? "Art line in" : site?.startsWith("PICC") ? "PICC" : "CVC in"

/* ---------- writing it to the case ---------- */

export type VascularAdd = {
  id: string
  type: VascularType
  site?: string
  size?: string
  depthCm?: string
  lumens?: string
  /** Placed by the anaesthesia team, or already in place when the patient arrived (ward, preoperative). */
  origin: "here" | "ward"
  /** When it went in; null for a line that arrived with the patient and whose time nobody here knows. */
  insertedAt: string | null
  sourceEventId?: string
  /** The line being replaced, by its place in the list: it stays on it, marked failed at this line's time. */
  replacesIndex?: number | null
}

export function newVascularLine(add: VascularAdd): VascularLine {
  const site = add.site ?? defaultVascularSite(add.type)
  const unit = add.type === "CENTRAL" ? "Fr" : "G"
  return {
    id: add.id,
    site,
    siteLabel: vascularSiteCrumb(site),
    size: add.size ?? "",
    sizeUnit: unit,
    depthCm: add.type === "CENTRAL" ? add.depthCm ?? "" : "",
    ...(add.type === "CENTRAL" && add.lumens ? { lumens: add.lumens } : {}),
    ...(add.origin === "ward" ? { preexisting: true } : {}),
    insertedAt: add.insertedAt,
    ...(add.sourceEventId ? { sourceEventId: add.sourceEventId } : {}),
  }
}

/** The list with the line added; a replaced line stays on it, marked failed at the new line's time. */
export function addVascularLine(lines: readonly VascularLine[], add: VascularAdd): VascularLine[] {
  const next = newVascularLine(add)
  if (add.replacesIndex != null && lines[add.replacesIndex]) return replaceFailedLine(lines, add.replacesIndex, add.insertedAt ?? new Date().toISOString(), next)
  return [...lines, next]
}

/** The lines still working, newest last: what the tab shows as in place. */
export const vascularLinesInPlace = (lines: readonly VascularLine[]): VascularLine[] => lines.filter(line => !line.failed)

/** How many working lines of each kind, for the badge. */
export function vascularCounts(lines: readonly VascularLine[]): Record<VascularType, number> {
  return {
    PERIPHERAL: workingLinesOfKind(lines, "VENOUS").length,
    ARTERIAL: workingLinesOfKind(lines, "ARTERIAL").length,
    CENTRAL: workingLinesOfKind(lines, "CENTRAL").length,
  }
}
