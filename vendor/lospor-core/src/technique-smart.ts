import { TECHNIQUE_TREE } from "./catalog/technique"
import type { TreeNode } from "./catalog/types"
import { canonicalTechnique } from "./intraop-domain"
import { TCI_MODEL_DRUG, TCI_MODELS, type TciModel } from "./tci-models"

/**
 * Smart selection for the Technique tab (10.2.0): finding a technique by name, the side of a block, and the
 * list a clinician uses most.
 *
 * Everything that is not drawing lives here so the web app and the phone cannot drift. The saved data is
 * still the list of technique codes; the side of a block is stored beside it, by code.
 */

export type TechniqueSide = "LEFT" | "RIGHT" | "BOTH"
export const TECHNIQUE_SIDES: readonly TechniqueSide[] = Object.freeze(["LEFT", "RIGHT", "BOTH"])

/** The technique recorded when a TCI Propofol infusion starts. */
export const TCI_TECHNIQUE = "GENERAL_TCI" as const

/** TCI models that imply the TCI anaesthesia technique, rather than a manually selected label. Remifentanil-only TCI is not sufficient. */
export function tciTechniqueForModel(model: string | null | undefined): typeof TCI_TECHNIQUE | null {
  if (!TCI_MODELS.includes(model as TciModel)) return null
  const drug = TCI_MODEL_DRUG[model as TciModel]
  return drug === "PROPOFOL" ? TCI_TECHNIQUE : null
}

/** Whether a TCI start is strong enough to ask for the TCI anaesthesia technique.
 * Propofol is the hypnotic signal; Remifentanil-only TCI is an analgesic
 * infusion and must not ask the clinician to label the case as TCI anaesthesia.
 */
export function isPropofolTciModel(model: string | null | undefined): boolean {
  return TCI_MODELS.includes(model as TciModel) && TCI_MODEL_DRUG[model as TciModel] === "PROPOFOL"
}

/** Add the TCI technique once a qualifying TCI infusion has started. */
export function techniquesAfterTciStart(techniques: readonly string[], model: string | null | undefined): string[] {
  if (!tciTechniqueForModel(model) || techniques.some(technique => canonicalTechnique(technique) === TCI_TECHNIQUE)) {
    return [...techniques]
  }
  return [...techniques, TCI_TECHNIQUE]
}

/** Techniques that are done on one side or both, and so are asked for one: every peripheral block but the scalp block, and the unilateral spinal. */
export const UNILATERAL_SPINAL = "SPINAL_UNILATERAL"
const UNSIDED_BLOCKS: readonly string[] = ["BLOCK_SCALP"]

type Walked = { node: TreeNode; ancestors: string[] }
const walked: Walked[] = []
;(function walk(nodes: readonly TreeNode[], ancestors: string[]) {
  for (const node of nodes) {
    walked.push({ node, ancestors })
    if (node.children?.length) walk(node.children, [...ancestors, node.v])
  }
})(TECHNIQUE_TREE, [])
const byCode = new Map(walked.map(item => [item.node.v, item]))

const isLeaf = (node: TreeNode) => !node.children?.length

export const techniqueExists = (code: string): boolean => byCode.has(code)

/** The codes from the family down to the parent of this technique. */
export const techniqueAncestors = (code: string): string[] => byCode.get(code)?.ancestors ?? []

export function techniqueHasSide(code: string): boolean {
  if (code === UNILATERAL_SPINAL) return true
  const item = byCode.get(code)
  if (!item || !isLeaf(item.node)) return false
  return item.ancestors.includes("PERIPHERAL") && !UNSIDED_BLOCKS.includes(code)
}

/** A stored side map as it should be read: known sides only, for techniques that take a side. */
export function parseTechniqueSides(value: unknown): Record<string, TechniqueSide> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, TechniqueSide> = {}
  for (const [code, side] of Object.entries(value as Record<string, unknown>)) {
    if (techniqueHasSide(code) && TECHNIQUE_SIDES.includes(side as TechniqueSide)) out[code] = side as TechniqueSide
  }
  return out
}

/** The sides kept for the techniques that are on the list: a side outlives nothing it belongs to. */
export function techniqueSidesFor(techniques: readonly string[], sides: Record<string, TechniqueSide>): Record<string, TechniqueSide> {
  return Object.fromEntries(Object.entries(sides).filter(([code]) => techniques.includes(code)))
}

export function setTechniqueSide(sides: Record<string, TechniqueSide>, code: string, side: TechniqueSide | null): Record<string, TechniqueSide> {
  const { [code]: _removed, ...rest } = sides
  void _removed
  return side && techniqueHasSide(code) ? { ...rest, [code]: side } : rest
}

/** Techniques on the list that take a side and have none yet. */
export const techniquesMissingSide = (techniques: readonly string[], sides: Record<string, TechniqueSide>): string[] =>
  techniques.filter(code => techniqueHasSide(code) && !sides[code])

/* ---------- finding a technique ---------- */

export type TechniqueHit = { code: string; label: string; labelBg: string; ancestors: string[] }

/** Every technique that can be chosen (a leaf), in list order. */
export const TECHNIQUE_LEAVES: readonly TechniqueHit[] = Object.freeze(
  walked.filter(item => isLeaf(item.node)).map(item => ({ code: item.node.v, label: item.node.label, labelBg: item.node.labelBg ?? item.node.label, ancestors: item.ancestors })),
)

const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

/**
 * Techniques matching what was typed, in either language, ranked: a name that starts with it first, then a name
 * that contains it, then one whose family or group does. Empty text finds nothing.
 */
export function searchTechniques(query: string, limit = 8, names: (code: string) => string[] = () => []): TechniqueHit[] {
  const q = fold(query.trim())
  if (!q) return []
  const scored = TECHNIQUE_LEAVES.flatMap(hit => {
    const labels = [hit.label, hit.labelBg, ...names(hit.code)].map(fold)
    const group = hit.ancestors.flatMap(code => {
      const node = byCode.get(code)?.node
      return node ? [fold(node.label), fold(node.labelBg ?? node.label)] : []
    })
    const rank = labels.some(label => label.startsWith(q) || label.split(/[\s/()-]+/).some(word => word.startsWith(q))) ? 0
      : labels.some(label => label.includes(q)) ? 1
      : group.some(label => label.includes(q)) ? 2
      : null
    return rank == null ? [] : [{ hit, rank }]
  })
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map(item => item.hit)
}

/* ---------- the usual ones ---------- */

export const RECENT_TECHNIQUES_MAX = 6

/** The recent list after these were used: most recent first, no repeats, only techniques that exist, capped. */
export function addRecentTechniques(recent: readonly string[], used: readonly string[]): string[] {
  const fresh = used.filter(code => techniqueExists(code) && isLeaf(byCode.get(code)!.node)).reverse()
  return [...new Set([...fresh, ...recent.filter(code => techniqueExists(code))])].slice(0, RECENT_TECHNIQUES_MAX)
}

/* ---------- the plan from the preop visit ---------- */

/** The planned techniques that are not on the list yet, and that exist. */
export const plannedTechniquesLeft = (planned: readonly string[], techniques: readonly string[]): string[] =>
  planned.filter(code => techniqueExists(code) && !techniques.includes(code))
