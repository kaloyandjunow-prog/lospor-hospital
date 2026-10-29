"use client"

export type StepTab<V extends string> = {
  value: V
  label: string
  /** A required field on this tab was refused: a red dot. */
  flagged?: boolean
}

/**
 * The tab bar of every case step in the sectioned layout (10.0.0): preop,
 * intraop and postop had three looks. Full width, the tabs sharing it, the
 * chosen one underlined; on a narrow screen the bar scrolls sideways.
 */
export function StepTabBar<V extends string>({ tabs, active, onSelect, label, testId }: {
  tabs: readonly StepTab<V>[]
  active: V
  onSelect: (value: V) => void
  label: string
  testId?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      data-testid={testId}
      className="sticky top-0 z-20 flex h-11 items-stretch overflow-x-auto border-b border-slate-200 bg-white dark:border-[#2a2a2a] dark:bg-[#111]"
    >
      {tabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => onSelect(tab.value)}
          className={`relative min-w-max flex-1 shrink-0 border-b-2 px-4 text-xs font-semibold transition-colors ${
            active === tab.value
              ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {tab.label}
          {tab.flagged ? <span className="absolute right-1.5 top-2 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden /> : null}
        </button>
      ))}
    </div>
  )
}
