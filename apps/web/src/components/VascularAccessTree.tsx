"use client"

import { useState, useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ChevronRight, Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useOptionLibrary, type LibraryOption } from "@/hooks/useOptionLibrary"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import {
  VASCULAR_PREEXISTING_QUICK_OPTIONS,
  buildOptionTree,
} from "@lospor/core/catalog"
import { vascularAccessDefaultUnit } from "@lospor/core/intraop"

export type VascularAccess = {
  site:        string
  siteLabel:   string
  sizeUnit:    string   // "G" or "Fr"
  size:        string
  depthCm:     string
  lumens?:     string
  preexisting?: boolean
}

interface Node { v: string; label: string; canonicalLabel: string; children?: Node[] }

// Populated in place from the OptionLibrary VASCULAR_ACCESS category (see
// buildTree below, called from VascularAccessTree) instead of a hardcoded
// literal — same pattern as TechniqueTree.tsx.
function buildTree(rows: LibraryOption[], locale: string): Node[] {
  const mapNodes = (
    nodes: ReturnType<typeof buildOptionTree<LibraryOption>>,
  ): Node[] => nodes.map(node => ({
    v: node.value,
    label: displayOption("VASCULAR_ACCESS", node.option, locale),
    canonicalLabel: node.option.label,
    children: node.children?.length ? mapNodes(node.children) : undefined,
  }))
  return mapNodes(buildOptionTree(rows))
}

const defaultUnit = vascularAccessDefaultUnit

function shortLabel(a: VascularAccess, siteLabel: string): string {
  const detail = [
    a.size && a.sizeUnit ? `${a.size}${a.sizeUnit}` : "",
    a.depthCm ? `${a.depthCm} cm depth` : "",
    a.lumens ? `${a.lumens} lumen` : "",
  ].filter(Boolean).join(" · ")
  return detail ? `${siteLabel}  (${detail})` : siteLabel
}

function breadcrumb(path: Node[], canonical = false): string {
  return path.map(node => canonical ? node.canonicalLabel : node.label).join(" › ")
}

function findNodePath(value: string, nodes: Node[], path: Node[] = []): Node[] | null {
  for (const node of nodes) {
    const nextPath = [...path, node]
    if (node.v === value) return nextPath
    const childPath = node.children ? findNodePath(value, node.children, nextPath) : null
    if (childPath) return childPath
  }
  return null
}

// ── Tree picker ───────────────────────────────────────────────────────────────
function TreePicker({ onLeaf, tree }: { onLeaf: (v: string, displayCrumb: string, canonicalCrumb: string) => void; tree: Node[] }) {
  const t = useTranslations()
  const [path, setPath] = useState<Node[]>([])
  const nodes = path.length === 0 ? tree : path[path.length - 1].children ?? []

  function pick(node: Node) {
    if (node.children?.length) { setPath(p => [...p, node]); return }
    const selectedPath = [...path, node]
    onLeaf(node.v, breadcrumb(selectedPath), breadcrumb(selectedPath, true))
  }

  return (
    <div className="space-y-2">
      {path.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-[#666] flex-wrap">
          <button type="button" onClick={() => setPath([])} className="hover:text-blue-500 transition-colors">{t("intraop.vascular.access")}</button>
          {path.map((n, i) => (
            <span key={n.v} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 opacity-40" />
              <button type="button" onClick={() => setPath(p => p.slice(0, i + 1))} className="hover:text-blue-500 transition-colors">{n.label}</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {nodes.map(node => (
          <button key={node.v} type="button" onClick={() => pick(node)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-[#c0c0c0] text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-300 transition-all">
            {node.label}
            {node.children && <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />}
          </button>
        ))}
      </div>
      {path.length > 0 && (
        <button type="button" onClick={() => setPath(p => p.slice(0, -1))}
          className="text-xs text-slate-400 dark:text-[#666] hover:text-slate-600 transition-colors">← Back</button>
      )}
    </div>
  )
}

// ── Detail form shown after leaf selection ────────────────────────────────────
function DetailForm({
  site, crumb, onConfirm, onCancel,
}: {
  site: string; crumb: string
  onConfirm: (a: Omit<VascularAccess, "site" | "siteLabel">) => void
  onCancel: () => void
}) {
  const t = useTranslations()
  const [sizeUnit, setSizeUnit] = useState(defaultUnit(site))
  const [size,     setSize]     = useState("")
  const [depthCm,  setDepthCm]  = useState("")
  const [lumens,   setLumens]   = useState("")
  const isCentral = site.startsWith("CVK_") || site.startsWith("PICC_")

  const SIZE_PRESETS_G  = ["14", "16", "18", "20", "22"]
  const SIZE_PRESETS_Fr = ["4", "5", "6", "7", "8", "9"]
  const presets = sizeUnit === "G" ? SIZE_PRESETS_G : SIZE_PRESETS_Fr

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{crumb}</p>
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("intraop.vascular.unit")}</p>
        <div className="flex gap-2">
          {(["G", "Fr"] as const).map(u => (
            <button key={u} type="button" onClick={() => { setSizeUnit(u); setSize("") }}
              className={`px-4 py-1.5 rounded-lg border-2 text-sm font-bold transition-all ${
                sizeUnit === u
                  ? "bg-blue-500 border-blue-500 text-white dark:bg-slate-600 dark:border-slate-300"
                  : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-blue-300"
              }`}>{u}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Size ({sizeUnit})</p>
        <div className="flex flex-wrap gap-1.5 mb-1">
          {presets.map(p => (
            <button key={p} type="button" onClick={() => setSize(p)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                size === p
                  ? "bg-blue-500 border-blue-500 text-white dark:bg-slate-600 dark:border-slate-300"
                  : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-blue-300"
              }`}>{p}{sizeUnit}</button>
          ))}
        </div>
        <Input
          value={size}
          onChange={e => setSize(e.target.value)}
          placeholder={`e.g. ${sizeUnit === "G" ? "18" : "7"}`}
          className="h-8 text-sm w-28"
        />
      </div>
      {isCentral && (
        <>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("intraop.vascular.depthFromSkin")}</p>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {["2","4","6","8","10","12","14","16","18","20","22","24"].map(p => (
                <button key={p} type="button" onClick={() => setDepthCm(p)}
                  className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                    depthCm === p
                      ? "bg-blue-500 border-blue-500 text-white dark:bg-slate-600 dark:border-slate-300"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-blue-300"
                  }`}>{p}</button>
              ))}
            </div>
            <Input
              value={depthCm}
              onChange={e => setDepthCm(e.target.value)}
              placeholder="e.g. 12"
              className="h-8 text-sm w-28"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("intraop.vascular.lumens")}</p>
            <div className="flex gap-1.5">
              {["1", "2", "3", "4+"].map(l => (
                <button key={l} type="button" onClick={() => setLumens(lumens === l ? "" : l)}
                  className={`px-3 py-1 rounded-md border text-xs font-bold transition-all ${
                    lumens === l
                      ? "bg-blue-500 border-blue-500 text-white dark:bg-slate-600 dark:border-slate-300"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-blue-300"
                  }`}>{l}</button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => onConfirm({ sizeUnit, size, depthCm, lumens: lumens || undefined })}
          className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white text-sm font-medium transition-colors">
          Add
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 text-sm hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function VascularAccessTree({
  value = [],
  onChange,
}: {
  value?: VascularAccess[]
  onChange: (v: VascularAccess[]) => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const { options: vascularOpts } = useOptionLibrary("VASCULAR_ACCESS")
  const tree = useMemo(() => buildTree(vascularOpts, locale), [locale, vascularOpts])
  const preexistingQuick = useMemo(() => VASCULAR_PREEXISTING_QUICK_OPTIONS.map(option => {
    const path = findNodePath(option.value, tree)
    return {
      v: option.value,
      label: displayClinicalCode("option:VASCULAR_ACCESS", option.value, locale),
      displayCrumb: path ? breadcrumb(path) : displayClinicalCode("option:VASCULAR_ACCESS", option.value, locale),
      canonicalCrumb: option.crumb,
    }
  }), [locale, tree])

  const [adding, setAdding]           = useState(false)
  const [pending, setPending]         = useState<{ v: string; displayCrumb: string; canonicalCrumb: string } | null>(null)
  const [preexisting, setPreexisting] = useState(false)

  function handleLeaf(v: string, displayCrumb: string, canonicalCrumb: string) {
    setPending({ v, displayCrumb, canonicalCrumb })
  }

  function handleConfirm(detail: Omit<VascularAccess, "site" | "siteLabel">) {
    if (!pending) return
    onChange([...value, { site: pending.v, siteLabel: pending.canonicalCrumb, ...detail }])
    setPending(null)
    setAdding(false)
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-3">
      {/* Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {value.map((a, idx) => (
          <div key={idx}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
              a.preexisting
                ? "bg-amber-500 text-white"
                : "bg-blue-600 text-white"
            }`}>
            {a.preexisting && <span className="text-[9px] font-bold opacity-80 uppercase tracking-wide">pre</span>}
            <span className="leading-tight">{shortLabel(
              a,
              (() => {
                const path = findNodePath(a.site, tree)
                return path ? breadcrumb(path) : displayClinicalCode("option:VASCULAR_ACCESS", a.site, locale, { label: a.siteLabel })
              })(),
            )}</span>
            <button type="button" onClick={() => remove(idx)} className={`transition-colors ${a.preexisting ? "text-amber-200 hover:text-white" : "text-blue-200 hover:text-white"}`}>
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!adding && !preexisting && (
          <>
            <button type="button" onClick={() => { setAdding(true); setPending(null); setPreexisting(false) }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-dashed border-slate-300 dark:border-[#444] text-slate-400 dark:text-[#666] text-sm hover:border-blue-400 hover:text-blue-500 transition-all">
              <Plus className="h-3.5 w-3.5" />
              {value.length === 0 ? "Add vascular access" : "Add"}
            </button>
            <button type="button" onClick={() => setPreexisting(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-500 dark:text-amber-400 text-sm hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all">
              Already in place
            </button>
          </>
        )}
        {adding && !pending && (
          <button type="button" onClick={() => setAdding(false)} className="text-slate-400 hover:text-red-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
        {preexisting && !pending && (
          <button type="button" onClick={() => setPreexisting(false)} className="text-slate-400 hover:text-red-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Full tree picker */}
      {adding && (
        <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1a1a1a] p-3">
          {pending ? (
            <DetailForm
              site={pending.v}
              crumb={pending.displayCrumb}
              onConfirm={handleConfirm}
              onCancel={() => setPending(null)}
            />
          ) : (
            <TreePicker onLeaf={handleLeaf} tree={tree} />
          )}
        </div>
      )}

      {/* Already-in-place quick picker */}
      {preexisting && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-3">
          {pending ? (
            <DetailForm
              site={pending.v}
              crumb={pending.displayCrumb}
              onConfirm={detail => {
                if (!pending) return
                onChange([...value, { site: pending.v, siteLabel: pending.canonicalCrumb, ...detail, preexisting: true }])
                setPending(null)
                setPreexisting(false)
              }}
              onCancel={() => setPending(null)}
            />
          ) : (
            <>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t("intraop.vascular.selectPreexisting")}</p>
              <div className="flex flex-wrap gap-2">
                {preexistingQuick.map(q => (
                  <button key={q.v} type="button" onClick={() => setPending(q)}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                    {q.label}
                  </button>
                ))}
                <button type="button" onClick={() => { setAdding(true); setPreexisting(false) }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 text-sm hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors">
                  Other…
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
