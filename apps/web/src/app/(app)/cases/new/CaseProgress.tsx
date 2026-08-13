import { CheckCircle2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"

export function CaseProgress({ labels, currentStep, caseExists, onStepChange }: {
  labels: readonly string[]
  currentStep: number
  caseExists: boolean
  onStepChange: (step: number) => void
}) {
  return (
    <div className="no-print space-y-3">
      <Progress value={((currentStep + 1) / labels.length) * 100} className="h-2" />
      <div className="flex justify-between">
        {labels.map((label, index) => {
          const isClickable = currentStep === 3 && index < 3 && caseExists
          return (
            <button key={label} type="button" disabled={!isClickable}
              aria-current={index === currentStep ? "step" : undefined}
              onClick={() => onStepChange(index)}
              className={`flex items-center gap-1.5 ${isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}>
              {index < currentStep
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <div className={`h-4 w-4 rounded-full border-2 ${index === currentStep ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />}
              <span className={`text-sm font-medium ${index === currentStep ? "text-blue-600" : index < currentStep ? "text-green-600" : "text-slate-400"} ${isClickable ? "underline underline-offset-2" : ""}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
