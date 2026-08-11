"use client"

/**
 * Ending something that is currently running.
 *
 * Two steps rather than one, because the button sits on a chart where cells are
 * small and a stray tap is easy: the first press asks, the second commits. It
 * is used by every lane that draws a bar — agent, gas settings, infusion — so
 * that stopping any of them feels the same.
 */
export function DiscontinuePrompt({
  open,
  onOpen,
  onConfirm,
  onCancel,
  style,
  /** The gas and agent lanes dim their cancel slightly less than the infusion lane. */
  cancelClassName = "text-[8px] text-white/70 hover:text-white px-1 whitespace-nowrap",
}: {
  open: boolean
  onOpen: () => void
  onConfirm: () => void
  onCancel: () => void
  style: React.CSSProperties
  cancelClassName?: string
}) {
  return (
    <div className="absolute z-30 flex items-center gap-1" style={style}>
      {open ? (
        <>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onConfirm() }}
            className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full hover:bg-red-600 border border-white/40 whitespace-nowrap"
          >
            ✓ Confirm
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onCancel() }} className={cancelClassName}>
            ✕
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onOpen() }}
          className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap"
        >
          ✕ Disc
        </button>
      )}
    </div>
  )
}
