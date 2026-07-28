"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import type { ClinicalChoice } from "@/lib/clinical-display"

function selectedCodes(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean)
}

export function ClinicalMultiSelect({
  value,
  options,
  onChange,
  emptyLabel,
  searchLabel,
}: {
  value: string
  options: readonly ClinicalChoice[]
  onChange: (value: string) => void
  emptyLabel: string
  searchLabel: string
}) {
  const [query, setQuery] = useState("")
  const selected = useMemo(() => selectedCodes(value), [value])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const labels = useMemo(
    () => selected.map(code => options.find(option => option.code === code)?.label ?? code),
    [options, selected],
  )
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return options
    return options.filter(option =>
      `${option.label} ${option.code}`.toLocaleLowerCase().includes(normalized),
    )
  }, [options, query])

  function toggle(code: string) {
    const next = selectedSet.has(code)
      ? selected.filter(item => item !== code)
      : [...selected, code]
    onChange(next.join(", "))
  }

  return (
    <details className="clinical-select">
      <summary className="input clinical-select-summary">
        <span className={labels.length ? "" : "clinical-select-placeholder"}>
          {labels.length ? labels.join(", ") : emptyLabel}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="clinical-select-menu">
        <input
          className="input clinical-select-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
        />
        <div className="clinical-select-options">
          {filtered.map(option => {
            const checked = selectedSet.has(option.code)
            return (
              <button
                className={`clinical-select-option${checked ? " selected" : ""}`}
                type="button"
                key={option.code}
                onClick={() => toggle(option.code)}
              >
                <span className="clinical-select-check" aria-hidden="true">
                  {checked && <Check size={14} />}
                </span>
                <span>{option.label}</span>
                <code>{option.code}</code>
              </button>
            )
          })}
          {!filtered.length && <div className="empty clinical-select-empty">{emptyLabel}</div>}
        </div>
      </div>
    </details>
  )
}
