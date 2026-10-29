import { drugChip } from "@/lib/drug-tone"

export function createDrugChipResolver(categories: readonly { color: string; drugs: readonly { name: string; customColor?: string }[] }[]) {
  const chips = new Map<string, { className: string; style?: React.CSSProperties }>()
  for (const category of categories) for (const item of category.drugs) {
    if (!chips.has(item.name) && (item.customColor || category.color)) chips.set(item.name, drugChip(category.color, item.customColor))
  }
  return (name: string) => chips.get(name) ?? null
}
