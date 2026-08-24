"use client"
import { useState } from "react"
import { ChevronLeft } from "lucide-react"
import type { ScenarioGroup } from "@lospor/core"

export type BrowseCategory = {
  cat: string
  color: string
  items: { name: string; unit?: string; manualEntryOnly?: boolean }[]
}

/**
 * The intraoperative drug / infusion menu.
 *
 * Deliberately mirrors mobile's DrugSheet and InfusionSheet: a home view with a
 * Favourites shortlist, the eight clinical scenario groups, and a Browse escape
 * hatch into the full library. Web previously offered only a flat search over
 * every category, which is a different mental model for the same task — and the
 * two apps share the same drug library, so the menus have to agree.
 *
 * The scenario groups themselves live in @lospor/core so neither app can drift.
 */
export function ScenarioPicker({
  scenarios, favourites, browse, searchOnly = [], onPick, labels, displayItem = name => name,
  displayCategory = category => category, displayScenario = group => group.label,
}: {
  scenarios: ScenarioGroup[]
  favourites: string[]
  browse: BrowseCategory[]
  /** Items hidden from routine menus but still findable for exact documentation. */
  searchOnly?: BrowseCategory[]
  /** unit is whatever the library knows; the dose panel resolves the rest. */
  onPick: (name: string, unit?: string, manualEntryOnly?: boolean) => void
  displayItem?: (name: string) => string
  displayCategory?: (category: string) => string
  displayScenario?: (group: ScenarioGroup) => string
  labels: {
    favourites: string
    browseAll: string
    search: string
    empty: string
    favouritesHint: string
    back: string
    selected: string
    manualEntry: string
  }
}) {
  const [mode, setMode] = useState<"home" | "favourites" | "scenario" | "browse">("home")
  const [group, setGroup] = useState<ScenarioGroup | null>(null)
  const [query, setQuery] = useState("")

  // A favourite is stored by canonical name; the unit comes from the library
  // when we can find it, so the dose panel opens with the right units.
  const normalizeName = (name: string) => name.trim().toUpperCase()
  const routineExcludedNames = new Set(
    searchOnly.flatMap(category => category.items.map(item => normalizeName(item.name))),
  )
  const routineFavourites = favourites.filter(name => !routineExcludedNames.has(normalizeName(name)))
  const routineScenarios = scenarios
    .map(scenario => ({
      ...scenario,
      items: scenario.items.filter(item => !routineExcludedNames.has(normalizeName(item.canonical))),
    }))
    .filter(scenario => scenario.items.length > 0)

  const unitFor = (name: string) =>
    [...browse, ...searchOnly].flatMap(c => c.items).find(i => i.name === name)?.unit

  const back = (
    <button type="button"
      onClick={() => { setMode("home"); setGroup(null); setQuery("") }}
      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
      <ChevronLeft className="h-3.5 w-3.5" /> {labels.back}
    </button>
  )

  const itemButton = (name: string, unit: string | undefined, color: string, key: string) => (
    <button key={key} type="button" onClick={() => onPick(name, unit)}
      className="text-xs font-medium px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}1a`, color }}>
      {displayItem(name)}
    </button>
  )

  // Every item in the library, flattened — used by the home search box.
  const allItems = [...browse, ...searchOnly]
    .flatMap(c => c.items.map(i => ({ ...i, color: c.color, cat: c.cat })))
    .filter((item, index, items) => (
      items.findIndex(candidate => (
        candidate.cat === item.cat && normalizeName(candidate.name) === normalizeName(item.name)
      )) === index
    ))
  const homeMatches = query.trim()
    ? allItems.filter(i => `${i.name} ${displayItem(i.name)}`.toLowerCase().includes(query.toLowerCase()))
    : []

  if (mode === "home") {
    return (
      <div className="p-2 space-y-2 max-h-72 overflow-y-auto">
        {/* Search stays on the home view here, unlike mobile: a desktop user has
            a keyboard already under their hands, so making them open Browse
            first would be slower, not more consistent. */}
        <input autoFocus type="text" placeholder={labels.search} value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />

        {query.trim() ? (
          homeMatches.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {homeMatches.map(i => (
                <button key={`${i.cat}:${i.name}`} type="button" onClick={() => onPick(i.name, i.unit, i.manualEntryOnly)}
                  className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity ${i.color}`}>
                  {displayItem(i.name)}
                  {i.manualEntryOnly && (
                    <span className="block text-[9px] font-normal opacity-75">{labels.manualEntry}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">{labels.empty}</p>
          )
        ) : (
        <>
        <button type="button" onClick={() => setMode("favourites")}
          className="w-full text-left px-2.5 py-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors">
          <span className="block text-xs font-bold text-sky-700 dark:text-sky-300">{labels.favourites}</span>
          <span className="block text-[10px] text-sky-600/70 dark:text-sky-400/70">
            {routineFavourites.length > 0 ? `${routineFavourites.length} ${labels.selected}` : labels.favouritesHint}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          {routineScenarios.map(g => (
            <button key={g.key} type="button"
              onClick={() => { setGroup(g); setMode("scenario") }}
              className="text-left px-2 py-1.5 rounded-lg border hover:opacity-80 transition-opacity"
              style={{ borderColor: `${g.color}55`, backgroundColor: `${g.color}14` }}>
              <span className="block text-[11px] font-bold" style={{ color: g.color }}>{displayScenario(g)}</span>
              <span className="block text-[9px] text-slate-500 dark:text-slate-400 truncate">
                {g.items.slice(0, 2).map(i => displayItem(i.canonical)).join(", ")}
              </span>
            </button>
          ))}
        </div>

        <button type="button" onClick={() => setMode("browse")}
          className="w-full text-left px-2.5 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
          <span className="block text-xs font-bold text-slate-600 dark:text-slate-300">{labels.browseAll}</span>
        </button>
        </>
        )}
      </div>
    )
  }

  if (mode === "favourites") {
    return (
      <div className="p-2 space-y-2 max-h-72 overflow-y-auto">
        {back}
        {routineFavourites.length === 0 ? (
          <p className="text-[11px] text-slate-400 leading-relaxed py-2">{labels.favouritesHint}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {routineFavourites.map(name => itemButton(name, unitFor(name), "#38bdf8", name))}
          </div>
        )}
      </div>
    )
  }

  if (mode === "scenario" && group) {
    return (
      <div className="p-2 space-y-2 max-h-72 overflow-y-auto">
        {back}
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: group.color }}>{displayScenario(group)}</p>
        <div className="flex flex-wrap gap-1">
          {group.items.map(i => itemButton(i.canonical, unitFor(i.canonical), group.color, i.canonical))}
        </div>
      </div>
    )
  }

  // browse — the full library, searchable, as it was before
  const filtered = query.trim()
    ? [...browse, ...searchOnly].map(c => ({ ...c, items: c.items.filter(i => `${i.name} ${displayItem(i.name)}`.toLowerCase().includes(query.toLowerCase())) }))
        .filter(c => c.items.length > 0)
    : browse

  return (
    <div className="max-h-72 overflow-y-auto">
      <div className="p-2 border-b border-slate-100 dark:border-[#2a2a2a] space-y-2">
        {back}
        <input autoFocus type="text" placeholder={labels.search} value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      </div>
      <div className="p-2 space-y-2">
        {filtered.map(c => (
          <div key={c.cat}>
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666] mb-1">{displayCategory(c.cat)}</p>
            <div className="flex flex-wrap gap-1">
              {c.items.map(i => (
                <button key={i.name} type="button" onClick={() => onPick(i.name, i.unit, i.manualEntryOnly)}
                  className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity ${c.color}`}>
                  {displayItem(i.name)}
                  {i.manualEntryOnly && (
                    <span className="block text-[9px] font-normal opacity-75">{labels.manualEntry}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">{labels.empty}</p>
        )}
      </div>
    </div>
  )
}
