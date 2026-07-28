"use client"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

export function HotkeysModal({ onClose }: { onClose: () => void }) {
  const SHORTCUTS: [string, string][] = [
    ["Click",                        "Select / deselect item"],
    ["Esc",                          "Deselect / close dialogs"],
    ["Tab",                          "Cycle: drugs → infusions → fluids → agents"],
    ["Del / Backspace",              "Delete selected item"],
    ["→  (Right arrow)",             "Extend bar right / copy drug right"],
    ["←  (Left arrow)",              "Retract bar left / remove drug"],
    ["Double-click stopped bar",     "Reactivate bar"],
    ["Double-click infusion bar",    "Change infusion rate"],
    ["Double-click drug pill",       "Change drug dose"],
    ["↑ / ↓",                        "Adjust vitals slider value"],
    ["Enter",                        "Confirm value in any input"],
    ["Ctrl + Z",                     "Undo"],
    ["Ctrl + Y  /  Ctrl + Shift + Z","Redo"],
  ]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border border-slate-200 dark:border-[#3a3a3a]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Keyboard Shortcuts</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          {SHORTCUTS.map(([key, desc]) => (
            <div key={key} className="flex items-center gap-3">
              <kbd className="shrink-0 w-52 px-2 py-1 font-mono text-[10px] bg-slate-100 dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded text-slate-600 dark:text-slate-300 whitespace-nowrap">
                {key}
              </kbd>
              <span className="text-xs text-slate-600 dark:text-slate-300">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
