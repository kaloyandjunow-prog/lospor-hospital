"use client"

import { CheckCircle2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"

/** The progress bar and step names above a case; a finished step is clickable from the summary. */
export function StepProgress({ steps, stepsShort, step, caseId, onSelect, hiddenOnWide }: {
  steps: string[]
  stepsShort: string[]
  step: number
  caseId: string | null
  onSelect: (index: number) => void
  /** With the case panel on a wide screen, its own stage strip shows the steps. */
  hiddenOnWide: boolean
}) {
  return (
    <div className={`no-print space-y-3 ${hiddenOnWide ? "lg:hidden" : ""}`}>
      <Progress value={((step + 1) / steps.length) * 100} className="h-2" />
      <div className="flex justify-between">
        {steps.map((label, i) => {
          const isClickable = step === 3 && i < 3 && !!caseId
          return (
            <button key={label} type="button"
              onClick={() => { if (isClickable) onSelect(i) }}
              className={`flex items-center gap-1.5 ${isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}>
              {i < step
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <div className={`h-4 w-4 rounded-full border-2 ${i === step ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
              }
              {/* Short names on a narrow screen: the full ones ran into each other. */}
              <span className={`text-xs sm:text-sm font-medium ${i === step ? "text-blue-600" : i < step ? "text-green-600" : "text-slate-400"} ${isClickable ? "underline underline-offset-2" : ""}`}>
                <span className="sm:hidden">{stepsShort[i]}</span><span className="hidden sm:inline">{label}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
