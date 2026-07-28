"use client"
import { useState } from "react"

/** Same ceiling the API enforces and mobile's picker applies. */
export const MAX_FAVOURITES = 8

/**
 * Pick the shortlist of drugs (or infusions) that appears first in the
 * intraoperative picker.
 *
 * Mirrors mobile's FavouritePicker: search, toggle, at most eight, saved to the
 * same server-side preference — so a shortlist chosen on either device shows up
 * on both.
 */
export function FavouritesEditor({
  title, options, selected, onSave, saving, searchPlaceholder, emptyLabel, displayOption = name => name,
}: {
  title: string
  /** Canonical names from the library. */
  options: string[]
  selected: string[]
  onSave: (next: string[]) => void
  saving?: boolean
  searchPlaceholder: string
  emptyLabel: string
  displayOption?: (name: string) => string
}) {
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<string[]>(selected)

  // Adopt the server's list when it arrives (or changes underneath us). This is
  // React's documented "adjust state during render" pattern rather than an
  // effect — it re-renders immediately instead of flashing the stale list.
  const [lastSelected, setLastSelected] = useState(selected)
  if (selected !== lastSelected) {
    setLastSelected(selected)
    setDraft(selected)
  }

  const filtered = query.trim()
    ? options.filter(o => `${o} ${displayOption(o)}`.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  const dirty = draft.length !== selected.length || draft.some(d => !selected.includes(d))

  function toggle(name: string) {
    setDraft(prev =>
      prev.includes(name)
        ? prev.filter(x => x !== name)
        // Silently ignoring the 9th tap would look broken; the counter below
        // shows why nothing happened.
        : prev.length >= MAX_FAVOURITES ? prev : [...prev, name],
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
        <span className={`text-xs tabular-nums ${draft.length >= MAX_FAVOURITES ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
          {draft.length}/{MAX_FAVOURITES}
        </span>
      </div>

      <input type="text" value={query} onChange={e => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
      />

      <div className="max-h-48 overflow-y-auto flex flex-wrap gap-1 p-1 rounded-lg border border-slate-100 dark:border-[#2a2a2a]">
        {filtered.map(name => {
          const on = draft.includes(name)
          const full = !on && draft.length >= MAX_FAVOURITES
          return (
            <button key={name} type="button" onClick={() => toggle(name)} disabled={full}
              aria-pressed={on}
              className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${
                on
                  ? "bg-sky-500 border-sky-500 text-white"
                  : full
                    ? "border-slate-200 dark:border-[#3a3a3a] text-slate-300 dark:text-[#555] cursor-not-allowed"
                    : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600"
              }`}>
              {displayOption(name)}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-[#666] text-center py-3 w-full">{emptyLabel}</p>
        )}
      </div>

      {dirty && (
        <div className="flex gap-2">
          <button type="button" onClick={() => onSave(draft)} disabled={saving}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-[#3a3a3a] text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setDraft(selected)} disabled={saving}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300">
            Reset
          </button>
        </div>
      )}
    </div>
  )
}
