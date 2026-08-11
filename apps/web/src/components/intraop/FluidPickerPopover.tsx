"use client"

import { AnchoredPopover } from "./AnchoredPopover"
import type { AnchorRect } from "./anchored-position"

/**
 * Choosing which fluid to start in a column.
 *
 * Picking one opens the dose selector pre-filled rather than adding the fluid
 * straight away — mirroring mobile's selectFluid. Web used to commit it
 * immediately whenever the library supplied a quick volume, which is why the
 * slider and the quick pills never appeared for the common fluids: they all
 * have one. Volume is a clinical value on the record; it gets confirmed, not
 * assumed.
 *
 * Search matches the stored name and the clinician's own language together, so
 * a Bulgarian user typing Bulgarian finds what an English user finds.
 */

export type FluidOption = {
  name: string
  displayName: string
}

export type FluidCategory = {
  cat: string
  displayCat: string
  /** Tailwind classes for this category's chips. */
  color: string
  fluids: FluidOption[]
}

export type FluidPickerPopoverProps = {
  anchor: AnchorRect
  search: string
  categories: FluidCategory[]
  searchPlaceholder: string
  onSearchChange: (value: string) => void
  onPick: (fluid: FluidOption, category: FluidCategory) => void
  onDismiss: () => void
}

export function FluidPickerPopover({
  anchor,
  search,
  categories,
  searchPlaceholder,
  onSearchChange,
  onPick,
  onDismiss,
}: FluidPickerPopoverProps) {
  const query = search.trim().toLowerCase()
  const visible = query
    ? categories
      .map(category => ({
        ...category,
        fluids: category.fluids.filter(fluid =>
          `${fluid.name} ${fluid.displayName}`.toLowerCase().includes(query)),
      }))
      .filter(category => category.fluids.length > 0)
    : categories

  return (
    <AnchoredPopover anchor={anchor} width={240} flipBelowSpace={300} onDismiss={onDismiss}>
      <div className="p-2 border-b border-slate-100 dark:border-[#2a2a2a]">
        <input
          autoFocus
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          onKeyDown={event => { if (event.key === "Escape") onDismiss() }}
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400"
        />
      </div>

      <div className="max-h-56 overflow-y-auto p-2 space-y-2">
        {visible.map(category => (
          <div key={category.cat}>
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666] mb-1">
              {category.displayCat}
            </p>
            <div className="flex flex-wrap gap-1">
              {category.fluids.map(fluid => (
                <button
                  key={fluid.name}
                  type="button"
                  onClick={() => onPick(fluid, category)}
                  className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity ${category.color}`}
                >
                  {fluid.displayName}
                </button>
              ))}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">No fluids found</p>
        )}
      </div>
    </AnchoredPopover>
  )
}
