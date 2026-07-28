"use client"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Label } from "@/components/ui/label"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useLocale } from "next-intl"
import { displayClinicalCode, displayOptionEntry } from "@/lib/clinical-display"

// Premedication drug categories/doses live in the OptionLibrary table
// (PREMED_DRUG category, grouped by `group`, dosing config in `metadata`) —
// fetched via useOptionLibrary in IntraopForm.tsx, then passed down here.
export type PremDoseCfg = { dose: number; unit: string; min: number; max: number; step: number; routes: string[]; defaultRoute: string; hint: string }
export type PremedCat = { cat: string; drugs: string[] }

export function PremedicationPicker({ label, value, onChange, categories, doses }: {
  label: string; value?: string; onChange: (v: string) => void
  categories: PremedCat[]; doses: Record<string, PremDoseCfg>
}) {
  const locale = useLocale()
  const [open, setOpen]           = useState(false)
  const [phase, setPhase]         = useState<"categories" | "drugs" | "dose">("categories")
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [activeDrug, setActiveDrug] = useState<string | null>(null)
  const [doseVal, setDoseVal]     = useState(0)
  const [doseUnit, setDoseUnit]   = useState("mg")
  const [route, setRoute]         = useState("PO")
  const [btnRect, setBtnRect]     = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const selected = value ? value.split(";").map(s => s.trim()).filter(Boolean) : []

  const displayDrug = (name: string) => displayClinicalCode("option:PREMED_DRUG", name, locale, { label: name })
  const displayCategory = (category: string) => displayClinicalCode("optionGroup", category, locale, { label: category })
  const displayEntry = (entry: string) => displayOptionEntry("PREMED_DRUG", entry, locale)

  function remove(item: string) { onChange(selected.filter(d => d !== item).join("; ")) }

  function openDosePicker(drugName: string) {
    const cfg = doses[drugName]
    setActiveDrug(drugName)
    setDoseVal(cfg?.dose ?? 1)
    setDoseUnit(cfg?.unit ?? "mg")
    setRoute(cfg?.defaultRoute ?? "PO")
    setPhase("dose")
  }

  function confirmDose() {
    if (!activeDrug) return
    const label = `${activeDrug} ${doseVal} ${doseUnit} ${route}`
    // Remove any prior entry for same drug before adding new
    const filtered = selected.filter(s => !s.startsWith(activeDrug + " "))
    onChange([...filtered, label].join("; "))
    setPhase("drugs")
  }

  function openPicker() {
    if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect())
    setPhase("categories"); setActiveCat(null); setActiveDrug(null); setOpen(true)
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

  const catInfo = categories.find(c => c.cat === activeCat)
  const doseCfg = activeDrug ? doses[activeDrug] : null

  const dropdown = open && btnRect && createPortal(
    <div className="fixed z-[9999] bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl"
      style={{ top: btnRect.bottom + 4, left: btnRect.left, width: Math.max(btnRect.width, 280), maxHeight: Math.min(420, window.innerHeight - btnRect.bottom - 16), overflowY: "auto" }}
      onMouseDown={e => e.stopPropagation()}>

      {/* ── Phase 1: categories ── */}
      {phase === "categories" && (
        <>
          <button type="button" onClick={() => { onChange("N/A"); setOpen(false) }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border-b border-slate-100 dark:border-[#2e2e2e] transition-colors italic">
            N/A — not applicable
          </button>
          {categories.map(cat => (
            <button key={cat.cat} type="button"
              onClick={() => { setActiveCat(cat.cat); setPhase("drugs") }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] flex items-center justify-between transition-colors">
              <span>{displayCategory(cat.cat)}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          ))}
        </>
      )}

      {/* ── Phase 2: drugs in category ── */}
      {phase === "drugs" && catInfo && (
        <>
          <button type="button" onClick={() => { setPhase("categories"); setActiveCat(null) }}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border-b border-slate-100 dark:border-[#2e2e2e] flex items-center gap-2 transition-colors sticky top-0 bg-white dark:bg-[#1e1e1e]">
            <ChevronLeft className="h-3.5 w-3.5" /> {displayCategory(catInfo.cat)}
          </button>
          {catInfo.drugs.map(name => {
            const isSel = selected.some(s => s.startsWith(name + " "))
            return (
              <button key={name} type="button" onClick={() => openDosePicker(name)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${isSel ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"}`}>
                <span className={`font-medium ${isSel ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"}`}>{displayDrug(name)}</span>
                <ChevronRight className={`h-3.5 w-3.5 ${isSel ? "text-blue-400" : "text-slate-300"}`} />
              </button>
            )
          })}
        </>
      )}

      {/* ── Phase 3: dose prompt ── */}
      {phase === "dose" && activeDrug && (
        <div className="p-4 space-y-4">
          {/* Header */}
          <button type="button" onClick={() => setPhase("drugs")}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> {displayDrug(activeDrug)}
          </button>

          {/* Hint */}
          {doseCfg?.hint && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">{doseCfg.hint}</p>
          )}

          {/* Dose input + unit */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input type="number"
                value={doseVal}
                min={doseCfg?.min} max={doseCfg?.max} step={doseCfg?.step}
                onChange={e => setDoseVal(parseFloat(e.target.value) || 0)}
                onFocus={e => e.target.select()}
                className="flex-1 text-center text-lg font-semibold bg-transparent outline-none border-b-2 border-slate-200 dark:border-[#3a3a3a] focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-800 dark:text-slate-100"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap font-medium">{doseUnit}</span>
            </div>
            {doseCfg && doseCfg.min !== doseCfg.max && (
              <input type="range"
                min={doseCfg.min} max={doseCfg.max} step={doseCfg.step}
                value={doseVal}
                onChange={e => setDoseVal(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-blue-500"
              />
            )}
            {doseCfg && doseCfg.min !== doseCfg.max && (
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{doseCfg.min} {doseUnit}</span>
                <span>{doseCfg.max} {doseUnit}</span>
              </div>
            )}
          </div>

          {/* Route pills */}
          {doseCfg && doseCfg.routes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Route</p>
              <div className="flex flex-wrap gap-1.5">
                {doseCfg.routes.map(r => (
                  <button key={r} type="button" onClick={() => setRoute(r)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${route === r ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add button */}
          <button type="button" onClick={confirmDose}
            className="w-full text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 transition-colors">
            Add — {displayDrug(activeDrug)} {doseVal} {doseUnit} {route}
          </button>
        </div>
      )}
    </div>,
    document.body
  )

  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</Label>
      <button ref={btnRef} type="button" onClick={openPicker}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${open ? "border-blue-400 ring-1 ring-blue-300" : "border-slate-200 dark:border-[#3a3a3a] hover:border-slate-300 dark:hover:border-[#555]"} bg-white dark:bg-[#2a2a2a]`}>
        <span className={`truncate ${selected.length ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-[#666]"}`}>
          {selected.length ? selected.map(displayEntry).join(" · ") : "Not set — click to add"}
        </span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {dropdown}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {selected.map(drug => (
            <span key={drug} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
              {displayEntry(drug)}
              <button type="button" onClick={() => remove(drug)} className="text-blue-400 hover:text-blue-600 transition-colors">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
