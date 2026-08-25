import { X } from "lucide-react"

export function DosingFlyoutHeader({
  title,
  atLabel,
  time,
  onClose,
}: {
  title: string
  atLabel: string
  time?: string
  onClose: () => void
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{title}</span>
        <button type="button" onClick={onClose} className="text-slate-300 hover:text-red-400 shrink-0 transition-colors"><X className="h-3.5 w-3.5" /></button>
      </div>
      <p className="text-[9px] text-slate-400 dark:text-slate-500">
        {atLabel} <span className="font-semibold text-blue-500 dark:text-blue-400">{time}</span>
      </p>
    </>
  )
}
