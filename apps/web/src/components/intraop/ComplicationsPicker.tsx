"use client"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useTranslations, useLocale } from "next-intl"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { COMPLICATION_CATEGORIES, ALL_COMPLICATIONS } from "@lospor/core/complications"
import { displayClinicalCode } from "@/lib/clinical-display"

export { ALL_COMPLICATIONS }

export function ComplicationsPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const t = useTranslations()
  const locale = useLocale()
  const [open, setOpen]           = useState(false)
  const [phase, setPhase]         = useState<"categories" | "items" | "search">("categories")
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [search, setSearch]       = useState("")
  const [btnRect, setBtnRect]     = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = value
    ? value.split(";").map(s => s.trim()).filter(s => ALL_COMPLICATIONS.includes(s))
    : []
  const freeText = value
    ? value.split(";").map(s => s.trim()).filter(s => s && !ALL_COMPLICATIONS.includes(s)).join("; ")
    : ""

  function toggle(item: string) {
    const next = selected.includes(item) ? selected.filter(d => d !== item) : [...selected, item]
    onChange([...next, ...(freeText ? [freeText] : [])].join("; "))
  }

  function openPicker() {
    if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect())
    setPhase("categories"); setActiveCat(null); setSearch(""); setOpen(true)
  }

  function handleSearch(q: string) {
    setSearch(q)
    setPhase(q.trim() ? "search" : activeCat ? "items" : "categories")
  }

  useEffect(() => {
    if (!open) return
    function close() { setOpen(false) }
    function reposition() { if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect()) }
    const id = setTimeout(() => document.addEventListener("mousedown", close), 0)
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      clearTimeout(id)
      document.removeEventListener("mousedown", close)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [open])

  const catTitle = (cat: { id: string; title: string; titleBg: string }) => displayClinicalCode("complication", cat.id, locale, { label: cat.title, labelBg: cat.titleBg })
  const catInfo = COMPLICATION_CATEGORIES.find(c => c.id === activeCat)
  const itemLabel = (item: string) => displayClinicalCode("complication", item, locale, { label: item })
  const q = search.toLowerCase()
  const searchResults = q
    ? COMPLICATION_CATEGORIES.map(c => ({ ...c, items: c.items.filter(i => `${i} ${itemLabel(i)}`.toLowerCase().includes(q)) })).filter(c => c.items.length > 0)
    : []

  function ItemRow({ item }: { item: string }) {
    const isSel = selected.includes(item)
    return (
      <button type="button" onClick={() => toggle(item)}
        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${isSel ? "bg-red-50 dark:bg-red-900/15" : "hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"}`}>
        <span className={`flex-none w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${isSel ? "bg-red-500 border-red-500" : "border-slate-300 dark:border-[#555]"}`}>
          {isSel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
        </span>
        <span className={isSel ? "text-red-700 dark:text-red-300 font-medium" : "text-slate-700 dark:text-slate-200"}>{itemLabel(item)}</span>
      </button>
    )
  }

  const dropdown = open && btnRect && createPortal(
    <div className="fixed z-[9999] bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl flex flex-col"
      style={{ top: btnRect.bottom + 4, left: btnRect.left, width: Math.max(btnRect.width, 320), maxHeight: Math.min(460, window.innerHeight - btnRect.bottom - 16) }}
      onMouseDown={e => e.stopPropagation()}>

      {/* Search bar — always visible */}
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-[#2e2e2e] shrink-0">
        <input ref={searchRef} type="text" placeholder={t("intraop.complications.searchPlaceholder")} value={search}
          onChange={e => handleSearch(e.target.value)}
          autoFocus
          className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-400" />
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Phase: search results */}
        {phase === "search" && (
          searchResults.length > 0 ? searchResults.map(cat => (
            <div key={cat.id}>
              <p className="sticky top-0 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#666] bg-white dark:bg-[#1e1e1e] border-b border-slate-50 dark:border-[#252525]">
                {catTitle(cat)}
              </p>
              {cat.items.map(item => <ItemRow key={item} item={item} />)}
            </div>
          )) : <p className="text-sm text-slate-400 text-center py-8">{t("intraop.complications.noMatches")}</p>
        )}

        {/* Phase: category list */}
        {phase === "categories" && COMPLICATION_CATEGORIES.map(cat => {
          const count = cat.items.filter(i => selected.includes(i)).length
          return (
            <button key={cat.id} type="button"
              onClick={() => { setActiveCat(cat.id); setPhase("items") }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] flex items-center justify-between gap-2 transition-colors">
              <span>{catTitle(cat)}</span>
              <span className="flex items-center gap-2 shrink-0">
                {count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">{count}</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              </span>
            </button>
          )
        })}

        {/* Phase: items within category */}
        {phase === "items" && catInfo && (
          <>
            <button type="button"
              onClick={() => { setPhase("categories"); setActiveCat(null) }}
              className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border-b border-slate-100 dark:border-[#2e2e2e] flex items-center gap-2 transition-colors sticky top-0 bg-white dark:bg-[#1e1e1e]">
              <ChevronLeft className="h-3.5 w-3.5" /> {catTitle(catInfo)}
            </button>
            {catInfo.items.map(item => <ItemRow key={item} item={item} />)}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-2.5 border-t border-slate-100 dark:border-[#2e2e2e] flex items-center justify-between">
        <span className="text-xs text-slate-400">{selected.length} {t("intraop.complications.selected")}</span>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">{t("intraop.complications.done")}</button>
      </div>
    </div>,
    document.body
  )

  return (
    <div className="space-y-2">
      <button ref={btnRef} type="button" onClick={openPicker}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${open ? "border-red-400 ring-1 ring-red-300" : "border-slate-200 dark:border-[#3a3a3a] hover:border-slate-300 dark:hover:border-[#555]"} bg-white dark:bg-[#2a2a2a]`}>
        <span className={`truncate ${selected.length ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-[#666]"}`}>
          {selected.length === 0
            ? t("intraop.complications.noneRecorded")
            : selected.length === 1
              ? t("intraop.complications.recordedOne")
              : t("intraop.complications.recordedMany", { count: selected.length })}
        </span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {dropdown}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(item => (
            <span key={item} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {itemLabel(item)}
              <button type="button" onClick={() => toggle(item)} className="text-red-400 hover:text-red-600 transition-colors">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
