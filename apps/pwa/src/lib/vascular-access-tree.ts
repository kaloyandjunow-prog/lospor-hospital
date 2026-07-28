import {
  VASCULAR_PREEXISTING_QUICK_OPTIONS,
  buildOptionTree,
} from "@lospor/core/catalog"
import { vascularAccessDefaultUnit } from "@lospor/core/intraop"
import { displayOption } from "@/lib/clinical-display"
import type { LibraryOption } from "@/lib/use-option-library"

export type VascTreeNode = {
  v: string
  label: string
  canonicalLabel: string
  children?: VascTreeNode[]
}

export function buildVascTree(rows: LibraryOption[], locale: string): VascTreeNode[] {
  const mapNodes = (
    nodes: ReturnType<typeof buildOptionTree<LibraryOption>>,
  ): VascTreeNode[] => nodes.map(node => ({
    v: node.value,
    label: displayOption("VASCULAR_ACCESS", node.option, locale),
    canonicalLabel: node.option.label,
    children: node.children?.length ? mapNodes(node.children) : undefined,
  }))
  return mapNodes(buildOptionTree(rows))
}

export const vascDefaultUnit = vascularAccessDefaultUnit

// Color is presentation-only and remains owned by the mobile UI.
export function vascSiteColor(site: string): string {
  if (site.startsWith("ART_")) return "#ef4444"
  if (site === "VEN_PERIPHERAL") return "#22c55e"
  if (site.startsWith("PICC_")) return "#a855f7"
  return "#3b82f6"
}

export const VASC_PREEXISTING_QUICK = VASCULAR_PREEXISTING_QUICK_OPTIONS.map(
  option => ({ v: option.value, label: option.label, crumb: option.crumb }),
)
