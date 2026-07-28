"use client"

type Props = { onTakeover: () => void; holderName?: string | null }

export function WatchingBanner({ onTakeover, holderName }: Props) {
  const message = holderName
    ? `${holderName} is currently editing this case — your changes will not be saved until they finish.`
    : "Another clinician is currently editing this case. Your changes will not be saved until they finish."

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-amber-400/40 bg-amber-500/10 px-4 py-3 backdrop-blur-sm">
      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
        ⚠ {message}
      </span>
      <button
        onClick={onTakeover}
        className="ml-auto shrink-0 rounded-md border border-amber-400 px-3 py-1 text-xs font-bold text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
      >
        Take over editing
      </button>
    </div>
  )
}
