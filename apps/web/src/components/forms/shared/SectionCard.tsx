"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronDown } from "lucide-react"

/** The page event that opens a card by its anchor (10.8.0): the menu's Edit on an airway or vascular entry. */
export const OPEN_SECTION_EVENT = "lospor:open-section"

/** True when a section was opened: the menu's Edit on an airway or vascular entry. */
export function openLinkedSection(section: "airway" | "vascular" | null): boolean {
  if (!section) return false
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: { id: `intraop-${section}` } }))
  return true
}

/** The intraop form's side: bring the Anaesthesia section forward and scroll to the card (OPEN_SECTION_EVENT). */
export function useOpenSectionEvents(setTab: (tab: string) => void) {
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id
      if (!id) return
      setTab("anaesthesia")
      for (const delay of [60, 300]) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), delay)
    }
    window.addEventListener(OPEN_SECTION_EVENT, open)
    return () => window.removeEventListener(OPEN_SECTION_EVENT, open)
  }, [setTab])
}

export function SectionCard({ title, children, collapsible = false, defaultCollapsed = false, badge, readiness, required = false, anchor }: {
  /** An id the card can be opened and scrolled to by (OPEN_SECTION_EVENT). */
  anchor?: string
  title: string; children: React.ReactNode
  collapsible?: boolean; defaultCollapsed?: boolean; badge?: string
  /** The readiness name a "Go to" scrolls to (1.5.0). */
  readiness?: string
  /** Holds a field needed to finalise: the title carries the red star. */
  required?: boolean
}) {
  const [open, setOpen] = useState(!defaultCollapsed)
  useEffect(() => {
    if (!anchor) return
    const onOpen = (event: Event) => { if ((event as CustomEvent<{ id: string }>).detail?.id === anchor) setOpen(true) }
    window.addEventListener(OPEN_SECTION_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen)
  }, [anchor])
  return (
    <Card data-readiness={readiness} id={anchor} className={anchor ? "scroll-mt-28" : undefined}>
      <CardHeader
        className={`pb-3 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-slate-700 dark:text-slate-200">{title}{required ? <span className="text-red-500"> *</span> : null}</CardTitle>
          <div className="flex items-center gap-2">
            {badge && !open && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal truncate max-w-[180px]">{badge}</span>}
            {collapsible && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  )
}
