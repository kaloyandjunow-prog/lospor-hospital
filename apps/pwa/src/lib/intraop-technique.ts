import type { LibraryOption } from "@/lib/use-option-library"
import {
  buildOptionTree,
  findLabeledValuePath,
  formatTechniquePath,
} from "@lospor/core/catalog"

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

// Colors are application presentation, not clinical domain data.
export function techniqueColor(value: string): string {
  if (value.startsWith("GENERAL")) return "#8b5cf6"
  if (
    value.startsWith("SPINAL")
    || value.startsWith("EPIDURAL")
    || value.startsWith("CSE")
    || value === "DPE"
  ) return "#3b82f6"
  if (value.startsWith("BLOCK")) return "#22c55e"
  if (value.startsWith("SEDATION")) return "#f59e0b"
  if (value === "LOCAL") return "#f43f5e"
  return "#64748b"
}
