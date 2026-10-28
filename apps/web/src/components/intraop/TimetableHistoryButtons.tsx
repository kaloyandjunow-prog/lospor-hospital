"use client"

export function TimetableHistoryButtons({ depth, undoLabel, redoLabel, onUndo, onRedo }: { depth: { past: number; future: number }; undoLabel: string; redoLabel: string; onUndo: () => void; onRedo: () => void }) {
  const className = "flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors select-none bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-[#bbb] hover:border-slate-300 dark:hover:border-[#555] disabled:opacity-40 disabled:cursor-not-allowed"
  return <><button type="button" onClick={onUndo} disabled={depth.past === 0} aria-label={undoLabel} title={undoLabel} data-testid="timetable-undo" className={className}><span aria-hidden>↶</span> {undoLabel}</button><button type="button" onClick={onRedo} disabled={depth.future === 0} aria-label={redoLabel} title={redoLabel} data-testid="timetable-redo" className={className}><span aria-hidden>↷</span> {redoLabel}</button></>
}
