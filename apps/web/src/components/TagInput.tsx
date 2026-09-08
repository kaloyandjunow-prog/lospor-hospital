"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

// `source` ("manual" | "ai-scan" | "import") is per-item provenance. TagInput
// itself never sets it — callers that add AI- or import-derived tags stamp it
// before/after onChange — but the type has to admit the field or it gets
// dropped on the next spread inside this component.
export type Tag = { label: string; sub?: string; code?: string; system?: string; labelEn?: string; labelBg?: string; inn?: string; atcCode?: string; source?: "manual" | "ai-scan" | "import" }

interface Props<T> {
  value: Tag[]
  onChange: (tags: Tag[]) => void
  searchUrl: string
  renderSuggestion: (item: T) => Tag
  placeholder?: string
  disabled?: boolean
  allowFreeText?: boolean
  minSearchLength?: number
}

// Module-level client cache — persists for the browser session
const clientCache = new Map<string, unknown[]>()

export function TagInput<T>({
  value, onChange, searchUrl, renderSuggestion,
  placeholder = "Type to search…", disabled,
  allowFreeText = true,
  minSearchLength = 3,
}: Props<T>) {
  const [query, setQuery]             = useState("")
  const [suggestions, setSuggestions] = useState<T[]>([])
  const [open, setOpen]               = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef                      = useRef<HTMLInputElement>(null)
  const containerRef                  = useRef<HTMLDivElement>(null)
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  function updatePos() {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropdownPos({
      top:   rect.bottom + window.scrollY + 4,
      left:  rect.left   + window.scrollX,
      width: rect.width,
    })
  }

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < minSearchLength) {
      setSuggestions([])
      return
    }
    const cacheKey = `${searchUrl}::${q.toLowerCase()}`
    if (clientCache.has(cacheKey)) {
      setSuggestions(clientCache.get(cacheKey)! as T[])
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const sep  = searchUrl.includes("?") ? "&" : "?"
        const res  = await fetch(`${searchUrl}${sep}q=${encodeURIComponent(q)}`)
        const data: T[] = await res.json()
        if (Array.isArray(data) && data.length > 0) clientCache.set(cacheKey, data)
        setSuggestions(data)
      } catch {
        setSuggestions([])
      }
    }, 150)
  }, [minSearchLength, searchUrl])

  function openDropdown() {
    updatePos()
    setOpen(true)
    setHighlighted(0)
  }

  function closeDropdown() {
    setOpen(false)
    setSuggestions([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  function addTag(item: T) {
    const tag = renderSuggestion(item)
    if ((value ?? []).some(t => t.label === tag.label)) { closeDropdown(); return }
    onChange([...(value ?? []), tag])
    setQuery("")
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  function addFreeText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    if ((value ?? []).some(t => t.label === trimmed)) { setQuery(""); setOpen(false); return }
    onChange([...(value ?? []), { label: trimmed }])
    setQuery("")
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  function removeTag(label: string) {
    onChange((value ?? []).filter(t => t.label !== label))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && open) { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); return }
    if (e.key === "ArrowUp"   && open) { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return }
    if (e.key === "Escape") { e.preventDefault(); closeDropdown(); return }
    if (e.key === "Enter") {
      e.preventDefault()
      if (open && suggestions[highlighted]) addTag(suggestions[highlighted])
      else if (allowFreeText && query.trim()) addFreeText(query)
      return
    }
    if (e.key === ",") {
      e.preventDefault()
      if (allowFreeText && query.trim()) addFreeText(query)
      return
    }
    if (e.key === "Backspace" && query === "" && (value ?? []).length > 0) {
      onChange((value ?? []).slice(0, -1))
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (q.trim().length >= minSearchLength) {
      openDropdown()
      search(q)
    } else {
      setSuggestions([])
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      const portal = document.getElementById("tag-input-portal")
      if (portal?.contains(target)) return
      closeDropdown()
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return
    window.addEventListener("scroll", updatePos, true)
    window.addEventListener("resize", updatePos)
    return () => {
      window.removeEventListener("scroll", updatePos, true)
      window.removeEventListener("resize", updatePos)
    }
  }, [open])

  const dropdown = open && suggestions.length > 0 && typeof document !== "undefined"
    ? createPortal(
        <div
          id="tag-input-portal"
          style={{
            position: "absolute",
            top:   dropdownPos.top,
            left:  dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
          }}
          className="bg-white dark:bg-[#1c1c1c] border border-slate-200 dark:border-[#2e2e2e] rounded-lg shadow-xl max-h-[32rem] overflow-y-auto"
        >
          {suggestions.map((item, idx) => {
            const tag = renderSuggestion(item)
            return (
              <button
                key={idx}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  idx === highlighted
                    ? "bg-blue-50 dark:bg-blue-900/40"
                    : "hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
                }`}
                onMouseEnter={() => setHighlighted(idx)}
                onMouseDown={e => { e.preventDefault(); addTag(item) }}
              >
                <span className="font-medium text-slate-800 dark:text-[#e5e5e5]">{tag.label}</span>
                {tag.sub && <span className="text-slate-400 dark:text-[#888] text-xs ml-2">{tag.sub}</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )
    : null

  return (
    <>
      <div ref={containerRef}>
        <div
          className="flex flex-wrap gap-1.5 min-h-[2.25rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {(value ?? []).map(tag => (
            <span
              key={tag.label}
              className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full max-w-[320px]"
            >
              <span className="truncate">{tag.label}</span>
              {tag.sub && <span className="text-blue-400 text-[10px]"> ({tag.sub})</span>}
              {!disabled && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeTag(tag.label) }}
                  className="shrink-0 hover:text-blue-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (query.trim().length >= minSearchLength) { openDropdown(); search(query) } }}
            placeholder={(value ?? []).length === 0 ? placeholder : ""}
            disabled={disabled}
            className="flex-1 min-w-[140px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          />
        </div>
      </div>
      {dropdown}
    </>
  )
}
