"use client"

import { useEffect, useState } from "react"

export type JumpSection = { id: string; label: string; missing?: boolean }

/** The section nearest the top of the screen, for the highlight. */
export function useActiveJumpSection(ids: string[], prefix: string): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  const key = ids.join("|")
  useEffect(() => {
    const elements = key.split("|").map(id => document.getElementById(`${prefix}${id}`)).filter((item): item is HTMLElement => !!item)
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.id.slice(prefix.length)
        if (entry.isIntersecting) visible.add(id)
        else visible.delete(id)
      }
      const first = key.split("|").find(id => visible.has(id))
      if (first) setActive(first)
    }, { rootMargin: "-10% 0px -70% 0px" })
    elements.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [key, prefix])
  return active
}

/**
 * The scrolling layout's sticky row of jump links (10.0.0): every case step
 * has one, so a long page is never scrolled blind. `className` adds to the
 * row, e.g. hiding it where a wider panel takes over.
 */
export function SectionJumpStrip({ sections, anchorPrefix, testId, className = "", children }: {
  sections: JumpSection[]
  anchorPrefix: string
  testId?: string
  className?: string
  /** Shown under the links: the allergy warning, where there is one. */
  children?: React.ReactNode
}) {
  const active = useActiveJumpSection(sections.map(section => section.id), anchorPrefix)
  const jump = (id: string) => document.getElementById(`${anchorPrefix}${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  return (
    <div className={`sticky top-20 z-20 -mx-1 space-y-1.5 border-b border-slate-200 bg-white/95 px-1 py-1.5 backdrop-blur dark:border-[#2a2a2a] dark:bg-[#111]/95 ${className}`} data-testid={testId}>
      <div className="flex gap-1 overflow-x-auto">
        {sections.map(section => (
          <button
            key={section.id}
            type="button"
            onClick={() => jump(section.id)}
            aria-current={active === section.id ? "true" : undefined}
            className={`relative shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
              active === section.id
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-200 text-slate-600 dark:border-[#333] dark:text-slate-300"
            }`}
          >
            {section.label}
            {section.missing ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" /> : null}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
