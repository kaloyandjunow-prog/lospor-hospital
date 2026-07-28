import type {
  CanonicalLibraryOption,
  JsonObject,
  LibraryCategory,
} from "../option-contracts"
import { LIBRARY_CATEGORIES } from "../option-contracts"
export {
  normalizeOptionCode,
  normalizeOptionCodes,
  OPTION_CODE_ALIASES,
} from "../option-aliases"
import { normalizeOptionCode } from "../option-aliases"
import { CLINICAL_RANGES } from "../ranges"
import { AIRWAY_DEVICES, AIRWAY_TOOLS } from "./airway-management"
import { parseDoseProfile } from "./dose-profile"
import { HANDOVER_ITEMS } from "./handover-items"
import { AGENT_CATALOG } from "./inhalational-agents"
import { DRUG_CATALOG } from "./intraop-drugs"
import { CLINICAL_EVENT_CATS } from "./intraop-events"
import { FLUID_CATALOG } from "./intraop-fluids"
import { INFUSION_CATALOG } from "./intraop-infusions"
import { MONITORING } from "./monitoring"
import { POSITIONS } from "./position"
import { PREMED_CATS, PREMED_DOSES } from "./premed-drugs"
import {
  BLOOD_GROUP,
  CORMACK_LEHANE,
  DISPOSITION,
  MALLAMPATI,
  NECK_MOBILITY,
  SEX,
  UPPER_LIP_BITE,
} from "./preop-postop-categorical"
import { TECHNIQUE_TREE } from "./technique"
import type { TreeNode } from "./types"
import { VASCULAR_ACCESS_TREE } from "./vascular-access"

export * from "./airway-management"
export * from "./dose-profile"
export * from "./handover-items"
export * from "./inhalational-agents"
export * from "./intraop-drugs"
export * from "./intraop-events"
export * from "./intraop-fluids"
export * from "./intraop-infusions"
export * from "./monitoring"
export * from "./numeric-ranges"
export * from "./position"
export * from "./premed-drugs"
export * from "./preop-postop-categorical"
export * from "./technique"
export * from "./types"
export * from "./vascular-access"

export const CLINICAL_CATALOG_VERSION = 1
export const CLINICAL_CATALOG_GENERATED_AT = "2026-07-24T00:00:00.000Z"
export const CLINICAL_CATALOG_SOURCE = `lospor-core:${CLINICAL_CATALOG_VERSION}`

export type CatalogOption = CanonicalLibraryOption & {
  category: LibraryCategory
  sortOrder: number
  parentValue: string | null
}

export type OptionTreeInput = {
  id: string
  value: string
  label: string
  labelBg?: string | null
  parentId?: string | null
}

export type OptionTreeNode<T extends OptionTreeInput = CanonicalLibraryOption> = {
  id: string
  value: string
  label: string
  labelBg: string | null
  option: T
  children?: OptionTreeNode<T>[]
}

export function catalogOptionId(category: LibraryCategory, value: string): string {
  return `catalog:${category}:${value}`
}

export function slugOptionValue(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function json(value: object): JsonObject {
  return value as unknown as JsonObject
}

function row(
  category: LibraryCategory,
  value: string,
  label: string,
  sortOrder: number,
  extra: Partial<CatalogOption> = {},
): CatalogOption {
  return {
    id: catalogOptionId(category, value),
    category,
    value,
    label,
    labelBg: null,
    group: null,
    parentId: null,
    parentValue: null,
    color: null,
    description: null,
    drugId: null,
    atcCode: null,
    inn: null,
    metadata: null,
    sortOrder,
    ...extra,
  }
}

function flattenTree(category: LibraryCategory, nodes: readonly TreeNode[]): CatalogOption[] {
  const rows: CatalogOption[] = []
  let sortOrder = 0
  const visit = (entries: readonly TreeNode[], parentValue: string | null) => {
    for (const node of entries) {
      rows.push(row(category, node.v, node.label, sortOrder++, {
        labelBg: node.labelBg ?? null,
        parentValue,
        parentId: parentValue ? catalogOptionId(category, parentValue) : null,
      }))
      if (node.children?.length) visit(node.children, node.v)
    }
  }
  visit(nodes, null)
  return rows
}

function buildCatalog(): CatalogOption[] {
  const rows: CatalogOption[] = []

  POSITIONS.forEach((option, index) => rows.push(row(
    "POSITION",
    option.v,
    option.label,
    index,
    { labelBg: option.labelBg, description: option.desc, color: option.sel },
  )))

  let sortOrder = 0
  for (const [value, label, labelBg] of AIRWAY_DEVICES) {
    rows.push(row("AIRWAY_MANAGEMENT", value, label, sortOrder++, { labelBg, group: "Device" }))
  }
  for (const [value, label, labelBg] of AIRWAY_TOOLS) {
    rows.push(row("AIRWAY_MANAGEMENT", value, label, sortOrder++, { labelBg, group: "Instrument" }))
  }

  MONITORING.forEach((option, index) => rows.push(row(
    "MONITORING",
    option.field,
    option.label,
    index,
    { labelBg: option.labelBg, group: option.cat },
  )))

  sortOrder = 0
  for (const { cat, drugs } of PREMED_CATS) {
    for (const name of drugs) {
      rows.push(row("PREMED_DRUG", slugOptionValue(name), name, sortOrder++, {
        labelBg: name,
        group: cat,
        metadata: PREMED_DOSES[name] ? json(PREMED_DOSES[name]) : null,
      }))
    }
  }

  DRUG_CATALOG.forEach((entry, index) => rows.push(row(
    "INTRAOP_DRUG",
    slugOptionValue(entry.name),
    entry.name,
    index,
    {
      labelBg: entry.name,
      group: entry.category,
      color: entry.color,
      metadata: json(parseDoseProfile(entry.name, "bolus", entry.profile)),
    },
  )))

  INFUSION_CATALOG.forEach((entry, index) => rows.push(row(
    "INTRAOP_INFUSION",
    slugOptionValue(entry.name),
    entry.name,
    index,
    {
      labelBg: entry.name,
      color: entry.color,
      metadata: json(parseDoseProfile(entry.name, "infusion", entry.profile)),
    },
  )))

  AGENT_CATALOG.forEach((entry, index) => rows.push(row(
    "INHALATIONAL_AGENT",
    entry.value,
    entry.label,
    index,
    {
      labelBg: entry.label,
      metadata: json({
        ...parseDoseProfile(entry.label, "agent", entry.profile),
        bar: entry.bar,
        text: entry.text,
        grip: entry.grip,
      }),
    },
  )))

  FLUID_CATALOG.forEach((entry, index) => rows.push(row(
    "INTRAOP_FLUID",
    slugOptionValue(entry.name),
    entry.name,
    index,
    {
      labelBg: entry.name,
      group: entry.category,
      color: entry.color,
      metadata: json(parseDoseProfile(entry.name, "fluid", entry.profile)),
    },
  )))

  sortOrder = 0
  for (const category of CLINICAL_EVENT_CATS) {
    for (const event of category.events) {
      rows.push(row(
        "INTRAOP_EVENT",
        slugOptionValue(`${category.cat}_${event.label}`),
        event.label,
        sortOrder++,
        {
          labelBg: event.labelBg,
          group: category.cat,
          color: event.color,
          metadata: json({
            categoryColor: category.color,
            ...(category.isComplication ? { isComplication: true } : {}),
          }),
        },
      ))
    }
  }

  rows.push(...flattenTree("TECHNIQUE", TECHNIQUE_TREE))
  rows.push(...flattenTree("VASCULAR_ACCESS", VASCULAR_ACCESS_TREE))
  rows.push(...flattenTree("HANDOVER_ITEM", HANDOVER_ITEMS))

  SEX.forEach((option, index) => rows.push(row("SEX", option.v, option.label, index, {
    labelBg: option.labelBg,
  })))
  BLOOD_GROUP.forEach((option, index) => rows.push(row(
    "BLOOD_GROUP",
    option.v,
    option.label,
    index,
    { labelBg: option.labelBg, metadata: json({ bloodType: option.bloodType, rhFactor: option.rhFactor }) },
  )))
  NECK_MOBILITY.forEach((option, index) => rows.push(row(
    "NECK_MOBILITY",
    option.v,
    option.label,
    index,
    { labelBg: option.labelBg, color: option.color },
  )))
  MALLAMPATI.forEach((option, index) => rows.push(row(
    "MALLAMPATI",
    option.v,
    option.label,
    index,
    { labelBg: option.labelBg, description: option.desc, color: option.color },
  )))
  UPPER_LIP_BITE.forEach((option, index) => rows.push(row(
    "UPPER_LIP_BITE",
    option.v,
    option.label,
    index,
    { labelBg: option.labelBg, description: option.desc, color: option.color },
  )))
  CORMACK_LEHANE.forEach((option, index) => rows.push(row(
    "CORMACK_LEHANE",
    option.v,
    option.label,
    index,
    { labelBg: option.labelBg, description: option.desc, color: option.color },
  )))
  DISPOSITION.forEach((option, index) => rows.push(row(
    "DISPOSITION",
    option.v,
    option.label,
    index,
    { labelBg: option.labelBg, color: option.color },
  )))

  for (const [category, range] of Object.entries(CLINICAL_RANGES)) {
    rows.push(row(category as LibraryCategory, "default", "default", 0, {
      metadata: json(range),
    }))
  }

  // Preserve the old seed's last-write-wins behavior for duplicate authored
  // entries while exposing a unique category/value catalog to every consumer.
  const unique = new Map<string, CatalogOption>()
  for (const option of rows) unique.set(`${option.category}:${option.value}`, option)
  return [...unique.values()]
}

export const CLINICAL_CATALOG: readonly CatalogOption[] = buildCatalog()

const CATALOG_BY_CATEGORY = new Map<LibraryCategory, readonly CatalogOption[]>(
  LIBRARY_CATEGORIES.map(category => [
    category,
    CLINICAL_CATALOG
      .filter(option => option.category === category)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  ]),
)

export function bundledOptions(category: LibraryCategory | string): CanonicalLibraryOption[] {
  const options = CATALOG_BY_CATEGORY.get(category as LibraryCategory) ?? []
  return options.map(({ sortOrder: _sortOrder, parentValue: _parentValue, ...option }) => option)
}

export const BUNDLED_CATALOG_SNAPSHOT: Readonly<Record<string, unknown>> = {
  generatedAt: CLINICAL_CATALOG_GENERATED_AT,
  sourceHash: CLINICAL_CATALOG_SOURCE,
  ...Object.fromEntries(LIBRARY_CATEGORIES.map(category => [category, bundledOptions(category)])),
}

export function catalogOptions(category: LibraryCategory): readonly CatalogOption[] {
  return CATALOG_BY_CATEGORY.get(category) ?? []
}

export function catalogOption(category: LibraryCategory, value: string): CatalogOption | undefined {
  const normalized = normalizeOptionCode(category, value)
  return catalogOptions(category).find(option => option.value === normalized)
}

export function buildOptionTree<T extends OptionTreeInput>(
  options: readonly T[],
): OptionTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>()
  for (const option of options) {
    const parentId = option.parentId ?? null
    const siblings = byParent.get(parentId) ?? []
    siblings.push(option)
    byParent.set(parentId, siblings)
  }
  const build = (parentId: string | null): OptionTreeNode<T>[] =>
    (byParent.get(parentId) ?? []).map(option => {
      const children = build(option.id)
      return {
        id: option.id,
        value: option.value,
        label: option.label,
        labelBg: option.labelBg ?? null,
        option,
        ...(children.length ? { children } : {}),
      }
    })
  return build(null)
}

export function findOptionPath<T extends OptionTreeInput>(
  tree: readonly OptionTreeNode<T>[],
  value: string,
): OptionTreeNode<T>[] | null {
  for (const node of tree) {
    if (node.value === value) return [node]
    const childPath = node.children ? findOptionPath(node.children, value) : null
    if (childPath) return [node, ...childPath]
  }
  return null
}

export function optionLeafValues<T extends OptionTreeInput>(
  tree: readonly OptionTreeNode<T>[],
): string[] {
  return tree.flatMap(node =>
    node.children?.length ? optionLeafValues(node.children) : [node.value],
  )
}

export function compactTechniqueLabel<T extends OptionTreeInput>(
  path: readonly OptionTreeNode<T>[],
): string {
  if (path.length === 0) return ""
  const labels = path.map(node => node.label)
  if (labels[0] === "General Anaesthesia") labels[0] = "General"
  if (labels[0] === "Regional Anaesthesia") labels[0] = "Regional"
  return labels.join(" \u203a ")
}

export type LabeledValueTreeNode<T> = {
  v: string
  label: string
  children?: readonly T[]
}

export function findLabeledValuePath<T extends LabeledValueTreeNode<T>>(
  value: string,
  nodes: readonly T[],
  trail: readonly string[] = [],
): string[] | undefined {
  for (const node of nodes) {
    const next = [...trail, node.label]
    if (node.v === value) return next
    const found = node.children
      ? findLabeledValuePath(value, node.children, next)
      : undefined
    if (found) return found
  }
  return undefined
}

export const TECHNIQUE_SKIP_LABELS = new Set([
  "Peripheral nerve block",
  "Upper extremity",
  "Lower extremity",
  "Trunk / Abdominal wall",
  "Head & Neck",
  "Ophthalmic",
  "Single shot",
])

export const TECHNIQUE_ROOT_SHORT: Readonly<Record<string, string>> = {
  "General Anaesthesia": "General",
  "Regional Anaesthesia": "Regional",
  "Sedation / MAC": "Sedation",
  "Local infiltration": "Local infiltration",
}

function techniqueRootShort(label: string): string {
  const normalized = label.toLocaleLowerCase("en")
  return Object.entries(TECHNIQUE_ROOT_SHORT)
    .find(([candidate]) => candidate.toLocaleLowerCase("en") === normalized)?.[1]
    ?? label
}

export function formatTechniquePath(
  value: string,
  path: readonly string[] | undefined,
): string {
  if (value.startsWith("OTHER:")) return value.slice(6) || "Other"
  if (!path?.length) return value
  const parts = path
    .map((label, index) =>
      index === 0 ? techniqueRootShort(label) : label,
    )
    .filter(label => ![...TECHNIQUE_SKIP_LABELS].some(
      skipped => skipped.toLocaleLowerCase("en") === label.toLocaleLowerCase("en"),
    ))
    .map(label => label.replace(" (SAB)", ""))
  return parts.filter((part, index) => index === 0 || parts[index - 1] !== part).join(" ")
}

export function techniqueDisplayLabel(
  value: string,
  tree: readonly OptionTreeNode[],
): string {
  const path = findOptionPath(tree, normalizeOptionCode("TECHNIQUE", value))
  return formatTechniquePath(value, path?.map(node => node.label))
}
