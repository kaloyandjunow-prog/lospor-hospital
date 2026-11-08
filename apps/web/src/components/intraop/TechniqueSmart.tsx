"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  TECHNIQUE_SIDES, plannedTechniquesLeft, searchTechniques, setTechniqueSide, techniqueHasSide, techniqueSidesFor,
  type TechniqueSide,
} from "@lospor/core/technique-smart"
import { displayClinicalCode } from "@/lib/clinical-display"
import type { TechniqueNode } from "@/components/TechniqueTree"

const SIDE_KEY = { LEFT: "left", RIGHT: "right", BOTH: "both" } as const

const leavesOf = (node: TechniqueNode): TechniqueNode[] => (node.children?.length ? node.children.flatMap(leavesOf) : [node])

function findNodePath(value: string, nodes: readonly TechniqueNode[], trail: TechniqueNode[] = []): TechniqueNode[] | undefined {
  for (const node of nodes) {
    const next = [...trail, node]
    if (node.v === value) return next
    if (node.children?.length) {
      const found = findNodePath(value, node.children, next)
      if (found) return found
    }
  }
  return undefined
}

/**
 * The Technique section, Smart selection (10.2.0): what is in use (with the side of a block), the preop plan in
 * one tap, a search across every technique, the clinician's usual ones, and the full list opening in place. Finding,
 * sides and the usual list are Core's (technique-smart); the saved data is still the list of technique codes, with
 * the side beside it by code.
 */
export function TechniqueSmart({ techniques, sides, onChange, tree, planned, recents }: {
  techniques: readonly string[]
  sides: Record<string, TechniqueSide>
  /** The new list and sides; the caller saves both together and remembers what was added. */
  onChange: (techniques: string[], sides: Record<string, TechniqueSide>, added: string[]) => void
  tree: readonly TechniqueNode[]
  /** Techniques planned at the preop visit. */
  planned: readonly string[]
  recents: readonly string[]
}) {
  const t = useTranslations("intraop.techniqueSmart")
  const locale = useLocale()
  const [query, setQuery] = useState("")
  const [browsePath, setBrowsePath] = useState<string[]>([])
  const [otherText, setOtherText] = useState("")
  const label = (code: string) => displayClinicalCode("option:TECHNIQUE", code, locale)
  // The breadcrumb above the browser already gives the path. Keep every
  // selectable technique scannable by showing only its leaf name; the full
  // canonical label remains available to assistive technology.
  const shortLabel = (code: string) => code.startsWith("OTHER:")
    ? code.slice(6)
    : findNodePath(code, tree)?.at(-1)?.label ?? label(code)
  const nameOf = shortLabel
  const pillLabel = shortLabel

  function toggle(code: string) {
    const on = techniques.includes(code)
    const next = on ? techniques.filter(item => item !== code) : [...techniques, code]
    onChange(next, techniqueSidesFor(next, sides), on ? [] : [code])
  }
  function usePlan() {
    const left = plannedTechniquesLeft(planned, techniques)
    if (left.length > 0) onChange([...techniques, ...left], sides, left)
  }
  function pickSide(code: string, side: TechniqueSide) {
    onChange([...techniques], setTechniqueSide(sides, code, sides[code] === side ? null : side), [])
  }
  function addOther() {
    const text = otherText.trim()
    if (!text) return
    const code = `OTHER:${text}`
    if (!techniques.includes(code)) onChange([...techniques, code], sides, [])
    setOtherText("")
  }

  const hits = searchTechniques(query, 6, code => [label(code)])
  const planLeft = plannedTechniquesLeft(planned, techniques)
  const eyebrow = "mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
  const currentNodes = browsePath.length === 0
    ? tree
    : findNodePath(browsePath[browsePath.length - 1]!, tree)?.at(-1)?.children ?? []
  const breadcrumb = browsePath
    .map(code => findNodePath(code, tree)?.at(-1))
    .filter((node): node is TechniqueNode => !!node)

  const renderNode = (node: TechniqueNode, index: number) => {
    if (node.v === "OTHER") {
      return <input key={`${node.v}-${index}`} data-testid="technique-other" value={otherText} onChange={event => setOtherText(event.target.value)} placeholder={label(node.v)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addOther() } }}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-[#444] dark:bg-[#141414]" />
    }
    if (!node.children?.length) {
      const on = techniques.includes(node.v)
      return (
        <button key={`${node.v}-${index}`} type="button" aria-label={label(node.v)} aria-pressed={on} data-testid={`technique-leaf-${node.v}`} onClick={() => toggle(node.v)}
          className={`my-1 flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm ${on ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-[#333]"}`}>
          <span className={`grid h-5 w-5 place-items-center rounded-full border-2 text-xs font-bold ${on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{on ? "✓" : ""}</span>
          {shortLabel(node.v)}
        </button>
      )
    }
    const count = leavesOf(node).filter(leaf => techniques.includes(leaf.v)).length
    return (
      <button key={`${node.v}-${index}`} type="button" aria-label={label(node.v)} data-testid={`technique-node-${node.v}`} onClick={() => setBrowsePath(path => [...path, node.v])}
        className="my-1 flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-semibold dark:border-[#333]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-[#222]">›</span>
        <span className="min-w-0 flex-1">{node.label}</span>
        <span className="text-xs font-normal text-slate-500">{count > 0 ? `${t("selectedCount", { count })} · ` : ""}{leavesOf(node).length}</span>
      </button>
    )
  }

  return (
    <div data-testid="technique-smart">
      <p className={`${eyebrow} !mt-0`}>{t("inUse")}{techniques.length > 0 ? ` · ${techniques.length}` : ""}</p>
      {techniques.length === 0 ? (
        <p data-testid="technique-empty" className="text-sm text-slate-500">{t("nothing")}</p>
      ) : (
        <div className="space-y-2">
          {techniques.map((code, index) => (
            <div key={`${code}-${index}`} data-testid={`technique-chip-${code}`} className="rounded-xl border border-emerald-500/40 bg-emerald-50/60 p-2 dark:bg-emerald-950/20">
              <button type="button" data-testid={`technique-remove-${code}`} aria-label={nameOf(code)} onClick={() => toggle(code)} className="flex min-h-9 w-full items-center gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{nameOf(code)}</span>
                </span>
                <span className="text-lg text-slate-400">×</span>
              </button>
              {techniqueHasSide(code) ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className={`w-14 text-[11px] font-bold ${sides[code] ? "text-slate-500" : "text-amber-600 dark:text-amber-400"}`}>{sides[code] ? t("side") : t("sideNeeded")}</span>
                  {TECHNIQUE_SIDES.map(side => (
                    <button key={side} type="button" aria-pressed={sides[code] === side} data-testid={`technique-side-${code}-${side}`} onClick={() => pickSide(code, side)}
                      className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold ${sides[code] === side ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300" : "border-slate-300 dark:border-[#444]"}`}>{t(SIDE_KEY[side])}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {planLeft.length > 0 ? (
        <>
          <p className={eyebrow}>{t("plan")}</p>
          <div data-testid="technique-plan" className="flex items-center gap-3 rounded-xl border border-dashed border-amber-500 bg-amber-50 p-2.5 dark:bg-amber-950/20">
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-amber-700 dark:text-amber-400">{t("planned")}</span>
              <span className="block text-sm font-bold">{planLeft.map(nameOf).join(" + ")}</span>
            </span>
            <button type="button" data-testid="technique-use-plan" onClick={usePlan} className="min-h-11 rounded-xl border border-violet-500 bg-violet-50 px-4 text-sm font-bold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">{t("usePlan")}</button>
          </div>
        </>
      ) : null}

      <p className={eyebrow}>{t("find")}</p>
      <input data-testid="technique-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("searchHint")}
        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm dark:border-[#444] dark:bg-[#141414]" />
      {query.trim() ? (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 dark:border-[#333]">
          {hits.length === 0 ? <p className="p-3 text-sm text-slate-500">{t("noMatch")}</p> : hits.map(hit => (
            <button key={hit.code} type="button" aria-label={label(hit.code)} aria-pressed={techniques.includes(hit.code)} data-testid={`technique-hit-${hit.code}`} onClick={() => { toggle(hit.code); setQuery("") }}
              className="block min-h-12 w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 dark:border-[#2a2a2a]">
              <span className="block text-sm font-bold">{shortLabel(hit.code)}{techniques.includes(hit.code) ? " ✓" : ""}</span>
            </button>
          ))}
        </div>
      ) : recents.length > 0 ? (
        <>
          <p className={eyebrow}>{t("usual")}</p>
          <div className="flex flex-wrap gap-2">
          {recents.map((code, index) => {
              const on = techniques.includes(code)
              return (
                <button key={`${code}-${index}`} type="button" aria-pressed={on} data-testid={`technique-recent-${code}`} onClick={() => toggle(code)}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${on ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-[#333]"}`}>{pillLabel(code)}</button>
              )
            })}
          </div>
        </>
      ) : null}

      {browsePath.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-400">
          <button type="button" onClick={() => setBrowsePath([])} className="font-semibold hover:text-blue-500">{t("all")}</button>
          {breadcrumb.map((node, index) => (
            <span key={`${node.v}-${index}`} className="flex items-center gap-1">
              <span aria-hidden="true">›</span>
              <button type="button" onClick={() => setBrowsePath(path => path.slice(0, index + 1))} className="hover:text-blue-500">{node.label}</button>
            </span>
          ))}
        </div>
      ) : null}
      <div data-testid="technique-browser" className="space-y-1">
        {currentNodes.map((node, index) => renderNode(node, index))}
      </div>
    </div>
  )
}
