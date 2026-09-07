import type { LibraryOption } from "@/lib/use-option-library"
import {
  buildOptionTree,
  findLabeledValuePath,
  formatTechniquePath,
} from "@lospor/core/catalog"
import { techniqueFamily, type TechniqueFamily } from "@lospor/core/intraop"

export type TechniqueNode = {
  v: string
  label: string
  isOther?: boolean
  children?: TechniqueNode[]
}

export function buildTechniqueTree(rows: LibraryOption[]): TechniqueNode[] {
  const mapNodes = (
    nodes: ReturnType<typeof buildOptionTree<LibraryOption>>,
  ): TechniqueNode[] => nodes.map(node => ({
    v: node.value,
    label: node.label,
    children: node.children?.length ? mapNodes(node.children) : undefined,
  }))
  return mapNodes(buildOptionTree(rows))
}

export function techniqueValuePath(
  value: string,
  nodes: TechniqueNode[],
  trail: string[] = [],
): string[] | undefined {
  return findLabeledValuePath(value, nodes, trail)
}

export function techniqueDisplayLabel(value: string, tree: TechniqueNode[]): string {
  return formatTechniquePath(value, techniqueValuePath(value, tree))
}

// Which family a technique belongs to is clinical and comes from core, shared
// with web. Only the palette is this app's -- it used to classify for itself
// and missed the peripheral and neuraxial prefixes, painting both grey.
const FAMILY_COLOR: Record<TechniqueFamily, string> = {
  general: "#8b5cf6",
  neuraxial: "#3b82f6",
  block: "#22c55e",
  sedation: "#f59e0b",
  local: "#f43f5e",
  other: "#64748b",
}

export function techniqueColor(value: string): string {
  return FAMILY_COLOR[techniqueFamily(value)]
}
