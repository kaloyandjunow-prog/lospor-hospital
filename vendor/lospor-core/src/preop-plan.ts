/**
 * The anaesthesia planned at the preop visit (optional): the same menus the
 * intraoperative record uses -- technique, airway devices and instruments,
 * vascular access -- plus whether ventilation after the operation is
 * planned. The summary prints it, and layout C of the consent starts with
 * the techniques it implies ticked. A plan, never a record of what was done:
 * the intraoperative record stays the only source for that.
 */
import { AIRWAY_DEVICES, AIRWAY_TOOLS } from "./catalog/airway-management"
import { TECHNIQUE_TREE } from "./catalog/technique"
import type { TreeNode } from "./catalog/types"
import { VASCULAR_ACCESS_TREE } from "./catalog/vascular-access"
import { techniqueFamily } from "./intraop-domain"
import { CONSENT_TECHNIQUES, type ConsentTechnique } from "./preop-documents"

/** A planned line: the intraoperative access shape, where size and depth stay optional. */
export type PlannedVascularAccess = {
  site: string
  siteLabel?: string
  sizeUnit?: string
  size?: string
  depthCm?: string
  [key: string]: unknown
}

export type PlannedAnaesthesia = {
  /** Technique option codes (TECHNIQUE), as intraop `techniques`. */
  techniques: string[]
  /** Airway device codes (AIRWAY_MANAGEMENT, group Device), as intraop `airwayDevices`. */
  airwayDevices: string[]
  /** Airway instrument codes (AIRWAY_MANAGEMENT, group Instrument), as intraop `airwayTools`. */
  airwayTools: string[]
  /** Lines (VASCULAR_ACCESS), as intraop `vascularAccesses`. */
  vascularAccesses: PlannedVascularAccess[]
  /** Ventilation planned after the operation. */
  postopVentilation: boolean
}

export const EMPTY_PLANNED_ANAESTHESIA: PlannedAnaesthesia = Object.freeze({
  techniques: [], airwayDevices: [], airwayTools: [], vascularAccesses: [], postopVentilation: false,
}) as PlannedAnaesthesia

const codes = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map(item => item.trim()))]
  : []

/** The stored plan in its full shape; anything else (absent, malformed) reads as nothing planned. */
export function normalizePlannedAnaesthesia(value: unknown): PlannedAnaesthesia {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { techniques: [], airwayDevices: [], airwayTools: [], vascularAccesses: [], postopVentilation: false }
  const raw = value as Record<string, unknown>
  const accesses = Array.isArray(raw.vascularAccesses)
    ? raw.vascularAccesses.filter((item): item is PlannedVascularAccess =>
      !!item && typeof item === "object" && typeof (item as { site?: unknown }).site === "string" && (item as { site: string }).site.length > 0)
    : []
  return {
    techniques: codes(raw.techniques),
    airwayDevices: codes(raw.airwayDevices),
    airwayTools: codes(raw.airwayTools),
    vascularAccesses: accesses,
    postopVentilation: raw.postopVentilation === true,
  }
}

export function isPlannedAnaesthesiaEmpty(value: unknown): boolean {
  const plan = normalizePlannedAnaesthesia(value)
  return plan.techniques.length === 0 && plan.airwayDevices.length === 0 && plan.airwayTools.length === 0
    && plan.vascularAccesses.length === 0 && !plan.postopVentilation
}

const CENTRAL_SITE = /^(CVK|PICC|VEN_CENTRAL)/
const ARTERIAL_SITE = /^ART/

/**
 * The consent sections the plan needs, in the consent's order: a technique's
 * family (general, neuraxial, block, sedation), "combined" when two
 * anaesthetic families are planned together, a central or arterial line,
 * and ventilation after the operation.
 */
export function consentTechniquesForPlan(value: unknown): ConsentTechnique[] {
  const plan = normalizePlannedAnaesthesia(value)
  const wanted = new Set<ConsentTechnique>()
  const families = new Set(plan.techniques.map(techniqueFamily))
  for (const family of ["general", "neuraxial", "block", "sedation"] as const) {
    if (families.has(family)) wanted.add(family)
  }
  if (["general", "neuraxial", "block"].filter(family => families.has(family as never)).length >= 2) wanted.add("combined")
  if (plan.vascularAccesses.some(access => CENTRAL_SITE.test(access.site))) wanted.add("cvc")
  if (plan.vascularAccesses.some(access => ARTERIAL_SITE.test(access.site))) wanted.add("arterial")
  if (plan.postopVentilation) wanted.add("ventilation")
  return CONSENT_TECHNIQUES.filter(technique => wanted.has(technique))
}

/** The labels from the root to the code, in the reader's language; null when the catalogue has no such code. */
function treePath(tree: readonly TreeNode[], code: string, language: "en" | "bg"): string[] | null {
  for (const node of tree) {
    const label = language === "bg" ? node.labelBg ?? node.label : node.label
    if (node.v === code) return [label]
    const below = node.children ? treePath(node.children, code, language) : null
    if (below) return [label, ...below]
  }
  return null
}

/** Grouping levels of the technique menu, left out of a printed name. */
const TECHNIQUE_GROUPS = new Set(["REGIONAL", "NEURAXIAL", "PERIPHERAL", "BLOCK_UPPER", "BLOCK_LOWER", "BLOCK_TRUNK", "BLOCK_HEAD_NECK", "BLOCK_OPHTHALMIC"])

function treeNodes(tree: readonly TreeNode[], code: string): TreeNode[] | null {
  for (const node of tree) {
    if (node.v === code) return [node]
    const below = node.children ? treeNodes(node.children, code) : null
    if (below) return [node, ...below]
  }
  return null
}

/** Lower-case a word that is not an abbreviation ("Лумбална" but not "ТИВА"). */
const lowerFirst = (label: string) => /^\p{Lu}\p{Ll}/u.test(label) ? label.charAt(0).toLocaleLowerCase() + label.slice(1) : label

/** "Спинална анестезия: еднократна, лумбална": the technique, then its details, without the menu's grouping levels. */
function techniqueText(code: string, language: "en" | "bg"): string {
  if (code.startsWith("OTHER:")) return code.slice(6)
  const nodes = treeNodes(TECHNIQUE_TREE, code)
  if (!nodes) return code
  const labels = nodes.filter(node => !TECHNIQUE_GROUPS.has(node.v)).map(node => language === "bg" ? node.labelBg ?? node.label : node.label)
  const [head, ...details] = labels
  return details.length > 0 ? `${head}: ${details.map(lowerFirst).join(", ")}` : head ?? code
}

/** A line as its kind and site: "Central line (Internal jugular)", "Arterial (Radial)", "Peripheral IV". */
function accessText(access: PlannedVascularAccess, language: "en" | "bg"): string {
  const path = treePath(VASCULAR_ACCESS_TREE, access.site, language)
  if (!path) return typeof access.siteLabel === "string" && access.siteLabel ? access.siteLabel : access.site
  const leaf = path[path.length - 1]
  if (path.length >= 3) return `${path[path.length - 2]} (${leaf})`
  return access.site.startsWith("ART") && path.length === 2 ? `${path[0]} (${leaf})` : leaf
}

const listLabel = (list: readonly [string, string, string][], code: string, language: "en" | "bg") => {
  const row = list.find(([value]) => value === code)
  return row ? (language === "bg" ? row[2] : row[1]) : null
}

const POSTOP_VENTILATION = { en: "ventilation after the operation", bg: "изкуствена вентилация след операцията" }

/**
 * The plan in one line, items split by semicolons, for the printed summary and the consent's
 * "planned anaesthesia" line: techniques, airway, lines, ventilation.
 * Codes the bundled catalogue does not know (a hospital's own options,
 * free-text "OTHER:") print as written.
 */
export function plannedAnaesthesiaText(value: unknown, language: "en" | "bg"): string {
  const plan = normalizePlannedAnaesthesia(value)
  const other = (code: string) => code.startsWith("OTHER:") ? code.slice(6) : code
  const parts = [
    ...plan.techniques.map(code => techniqueText(code, language)),
    ...plan.airwayDevices.map(code => listLabel(AIRWAY_DEVICES, code, language) ?? other(code)),
    ...plan.airwayTools.map(code => listLabel(AIRWAY_TOOLS, code, language) ?? other(code)),
    ...plan.vascularAccesses.map(access => accessText(access, language)),
    ...(plan.postopVentilation ? [POSTOP_VENTILATION[language]] : []),
  ]
  return parts.join("; ")
}
