"use client"

import { useMemo } from "react"
import { useState } from "react"
import { useLocale } from "next-intl"
import { ChevronRight, Plus, X } from "lucide-react"
import { useOptionLibrary, type LibraryOption } from "@/hooks/useOptionLibrary"
import { displayOption } from "@/lib/clinical-display"
import {
  buildOptionTree,
  findLabeledValuePath,
  formatTechniquePath,
} from "@lospor/core/catalog"
import {
  isGeneralAnesthesiaCase,
  techniqueNeedsRegionalBlock,
  techniqueUsesGas as coreTechniqueUsesGas,
} from "@lospor/core/intraop"

// ── Tree data ──────────────────────────────────────────────────────────────────
// Built from the OptionLibrary TECHNIQUE category via buildTree (exported so
// IntraopForm.tsx can build its own copy for techniqueDisplayLabel, which
// takes the tree as an explicit parameter rather than reading module state).
export interface TechniqueNode { v: string; label: string; children?: TechniqueNode[] }

export function buildTree(rows: LibraryOption[], locale: string = "en"): TechniqueNode[] {
  const mapNodes = (
    nodes: ReturnType<typeof buildOptionTree<LibraryOption>>,
  ): TechniqueNode[] => nodes.map(node => ({
    v: node.value,
    label: displayOption("TECHNIQUE", node.option, locale),
    children: node.children?.length ? mapNodes(node.children) : undefined,
  }))
  return mapNodes(buildOptionTree(rows))
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function techniqueColor(v: string): string {
  if (v.startsWith("GENERAL"))                                             return "bg-violet-600 dark:bg-violet-700 border-violet-600 dark:border-violet-700 text-white"
  if (v.startsWith("SPINAL") || v.startsWith("EPIDURAL") || v.startsWith("CSE") || v.startsWith("NEURAXIAL") || v === "DPE")
                                                                           return "bg-blue-600 dark:bg-blue-700 border-blue-600 dark:border-blue-700 text-white"
  if (v.startsWith("BLOCK") || v.startsWith("PERIPHERAL"))                return "bg-emerald-600 dark:bg-emerald-700 border-emerald-600 dark:border-emerald-700 text-white"
  if (v.startsWith("SEDATION"))                                            return "bg-amber-500 dark:bg-amber-600 border-amber-500 dark:border-amber-600 text-white"
  if (v === "LOCAL")                                                       return "bg-rose-500 dark:bg-rose-600 border-rose-500 dark:border-rose-600 text-white"
  return "bg-slate-600 dark:bg-slate-500 border-slate-600 dark:border-slate-500 text-white"
}

// Category-aware label: e.g. "General Inhalational", "Regional Femoral nerve",
// "Regional Neuraxial Epidural Lumbar". Takes the tree explicitly — callers
// get it from useOptionLibrary("TECHNIQUE") + buildTree, not module state.
export function techniqueDisplayLabel(v: string, tree: TechniqueNode[]): string {
  return formatTechniquePath(v, findLabeledValuePath(v, tree))
}

// ── Inline tree picker ────────────────────────────────────────────────────────
function TreePicker({ onSelect, exclude, tree }: { onSelect: (v: string) => void; exclude: string[]; tree: TechniqueNode[] }) {
  const [path, setPath]           = useState<TechniqueNode[]>([])
  const [showOther, setShowOther] = useState(false)
  const [otherText, setOtherText] = useState("")
  const nodes = path.length === 0 ? tree : path[path.length - 1].children ?? []

  function pick(node: TechniqueNode) {
    if (node.v === "OTHER") { setShowOther(true); return }
    if (node.children?.length) { setPath(p => [...p, node]) }
    else { onSelect(node.v) }
  }

  function commitOther() {
    const t = otherText.trim()
    if (t) { onSelect(`OTHER:${t}`); setOtherText(""); setShowOther(false) }
  }

  return (
    <div className="space-y-2">
      {/* Breadcrumb */}
      {path.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-[#666] flex-wrap">
          <button type="button" onClick={() => { setPath([]); setShowOther(false) }}
            className="hover:text-blue-500 transition-colors">Technique</button>
          {path.map((n, i) => (
            <span key={n.v} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 opacity-40" />
              <button type="button" onClick={() => setPath(p => p.slice(0, i + 1))}
                className="hover:text-blue-500 transition-colors">{n.label}</button>
            </span>
          ))}
        </div>
      )}

      {showOther ? (
        <div className="flex items-center gap-2">
          <input autoFocus type="text" placeholder="Describe technique…"
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitOther(); if (e.key === "Escape") setShowOther(false) }}
            className="flex-1 text-sm bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-3 py-1.5 outline-none focus:border-blue-400" />
          <button type="button" onClick={commitOther}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors">
            Add
          </button>
          <button type="button" onClick={() => setShowOther(false)}
            className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {nodes.filter(n => !exclude.includes(n.v)).map(node => (
              <button key={node.v} type="button" onClick={() => pick(node)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-[#c0c0c0] text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-300 transition-all">
                {node.label}
                {node.children && <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />}
              </button>
            ))}
          </div>
          {path.length > 0 && (
            <button type="button" onClick={() => setPath(p => p.slice(0, -1))}
              className="text-xs text-slate-400 dark:text-[#666] hover:text-slate-600 transition-colors">
              ← Back
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Main multi-select component ───────────────────────────────────────────────
export function TechniqueTree({ value = [], onChange }: {
  value?: string[]
  onChange: (v: string[]) => void
}) {
  const locale = useLocale()
  const { options: techniqueOpts } = useOptionLibrary("TECHNIQUE")
  const tree = useMemo(() => buildTree(techniqueOpts, locale), [locale, techniqueOpts])

  const [adding, setAdding] = useState(false)

  function add(v: string) {
    if (!value.includes(v)) onChange([...value, v])
    setAdding(false)
  }

  function remove(v: string) {
    onChange(value.filter(x => x !== v))
  }

  return (
    <div className="space-y-3">
      {/* Selected pills + add button */}
      <div className="flex flex-wrap items-center gap-2">
        {value.map(v => (
          <div key={v}
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border ${techniqueColor(v)}`}>
            <span className="text-[11px] leading-tight">{techniqueDisplayLabel(v, tree)}</span>
            <button type="button" onClick={() => remove(v)}
              className="opacity-70 hover:opacity-100 transition-opacity">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-dashed border-slate-300 dark:border-[#444] text-slate-400 dark:text-[#666] text-sm hover:border-blue-400 hover:text-blue-500 transition-all">
            <Plus className="h-3.5 w-3.5" />
            {value.length === 0 ? "Select technique" : "Add"}
          </button>
        )}

        {adding && (
          <button type="button" onClick={() => setAdding(false)}
            className="text-xs text-slate-400 dark:text-[#666] hover:text-red-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tree picker */}
      {adding && (
        <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] p-3">
          <TreePicker onSelect={add} exclude={value} tree={tree} />
        </div>
      )}
    </div>
  )
}

// ── Show/hide helpers for IntraopForm ─────────────────────────────────────────
export function techniqueIsGeneral(values: string[]) {
  return isGeneralAnesthesiaCase(values)
}
export function techniqueUsesGas(values: string[]) {
  return coreTechniqueUsesGas(values)
}
export function techniqueNeedsBlock(values: string[]) {
  return techniqueNeedsRegionalBlock(values)
}
