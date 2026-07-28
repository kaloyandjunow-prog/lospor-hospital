"use client"

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Check, Search, X } from "lucide-react"
import {
  CLINICAL_SEARCH_MIN_LENGTH,
  parseClinicalSearchResults,
  type CanonicalSearchTag,
  type ClinicalSearchKind,
  type ClinicalSearchLocale,
} from "@lospor/core/search"
import { apiJson } from "@/lib/client-api"

type SearchChoice = {
  value: string
  label: string
  sub?: string
}

function splitValues(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean)
}

export function canonicalSearchValue(kind: ClinicalSearchKind, item: CanonicalSearchTag): string {
  if (kind === "medication") return item.inn ?? item.label
  return item.code
}

function choices(
  kind: ClinicalSearchKind,
  value: unknown,
  locale: ClinicalSearchLocale,
): SearchChoice[] {
  const seen = new Set<string>()
  return parseClinicalSearchResults(kind, value, locale).flatMap(item => {
    const canonicalValue = canonicalSearchValue(kind, item).trim()
    if (!canonicalValue || seen.has(canonicalValue)) return []
    seen.add(canonicalValue)
    return [{ value: canonicalValue, label: item.label, sub: item.sub ?? item.code }]
  })
}

export function ClinicalSearchSelect({
  kind,
  endpoint,
  locale,
  value,
  onChange,
  searchLabel,
  loadingLabel,
  noResultsLabel,
  minimumLabel,
}: {
  kind: ClinicalSearchKind
  endpoint: string
  locale: ClinicalSearchLocale
  value: string
  onChange: (value: string) => void
  searchLabel: string
  loadingLabel: string
  noResultsLabel: string
  minimumLabel: string
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchChoice[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const requestRef = useRef<AbortController | null>(null)
  const selected = useMemo(() => splitValues(value), [value])
  const generatedId = useId()
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const minimum = CLINICAL_SEARCH_MIN_LENGTH[kind]
  const trimmedQuery = query.trim()
  const listId = `clinical-search-${generatedId.replace(/:/g, "")}`

  useEffect(() => {
    requestRef.current?.abort()
    if (trimmedQuery.length < minimum) return

    const controller = new AbortController()
    requestRef.current = controller
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: trimmedQuery })
        if (kind === "icd10") params.set("locale", locale)
        const data = await apiJson<unknown>(`${endpoint}?${params}`, {
          signal: controller.signal,
        })
        if (!controller.signal.aborted) {
          setResults(choices(kind, data, locale).slice(0, 12))
          setActiveIndex(0)
        }
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [endpoint, kind, locale, minimum, trimmedQuery])

  function add(choice: SearchChoice) {
    if (!selectedSet.has(choice.value)) {
      onChange([...selected, choice.value].join(", "))
    }
    setLabels(current => ({ ...current, [choice.value]: choice.label }))
    setQuery("")
    setResults([])
    setLoading(false)
    setOpen(false)
  }

  function remove(item: string) {
    onChange(selected.filter(value => value !== item).join(", "))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(index => Math.min(index + 1, results.length - 1))
      return
    }
    if (event.key === "ArrowUp" && results.length) {
      event.preventDefault()
      setActiveIndex(index => Math.max(index - 1, 0))
      return
    }
    if (event.key === "Enter" && open && results[activeIndex]) {
      event.preventDefault()
      add(results[activeIndex])
      return
    }
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (event.key === "Backspace" && !query && selected.length) {
      remove(selected[selected.length - 1])
    }
  }

  return (
    <div
      className="clinical-search"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <div className="input clinical-search-control" onClick={() => setOpen(true)}>
        {selected.map(item => (
          <span className="clinical-search-tag" key={item}>
            <span>{labels[item] ?? item}</span>
            <button type="button" onClick={() => remove(item)} aria-label={`Remove ${labels[item] ?? item}`}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <span className="clinical-search-input-wrap">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={event => {
              const nextQuery = event.target.value
              setQuery(nextQuery)
              setOpen(true)
              if (nextQuery.trim().length < minimum) {
                requestRef.current?.abort()
                setResults([])
                setLoading(false)
                setActiveIndex(0)
              } else {
                setLoading(true)
              }
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selected.length ? "" : searchLabel}
            aria-label={searchLabel}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
          />
        </span>
      </div>

      {open && (
        <div className="clinical-select-menu clinical-search-menu" id={listId} role="listbox">
          {trimmedQuery.length < minimum && (
            <div className="clinical-search-status">
              {minimumLabel.replace("{count}", String(minimum))}
            </div>
          )}
          {trimmedQuery.length >= minimum && loading && (
            <div className="clinical-search-status">{loadingLabel}...</div>
          )}
          {trimmedQuery.length >= minimum && !loading && !results.length && (
            <div className="clinical-search-status">{noResultsLabel}</div>
          )}
          {!loading && results.map((result, index) => {
            const isSelected = selectedSet.has(result.value)
            return (
              <button
                className={`clinical-search-option${index === activeIndex ? " active" : ""}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                key={result.value}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => add(result)}
              >
                <span className="clinical-select-check" aria-hidden="true">
                  {isSelected && <Check size={14} />}
                </span>
                <span className="clinical-search-option-label">
                  <strong>{result.label}</strong>
                  {result.sub && <small>{result.sub}</small>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
