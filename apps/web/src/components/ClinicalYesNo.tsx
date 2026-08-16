"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

/**
 * A yes/no clinical question with a third state: nobody asked.
 *
 * These questions used to be checkboxes over a `Boolean @default(false)`
 * column, which cannot hold the distinction. An unticked box meant either "I
 * asked and the answer was no" or "I never got to it", and both reached the
 * register as a documented negative. On export the difference matters: a
 * negative difficult-airway history is a finding, an unasked one is not, and a
 * study that counts them together is counting something it did not measure.
 *
 * So the value is `boolean | null` and there is no boolean overload. A call
 * site that still coerces with `!!field.value` fails to compile rather than
 * quietly collapsing the two states again.
 *
 * `label` is optional. Pass it for a standalone row; omit it to drop the
 * control in where a `Checkbox` used to sit, leaving that site's own `Label`
 * and any suggestion hints untouched.
 *
 * `tone` marks the answer that is clinically notable. Only a positive finding
 * is coloured, so a recorded "no allergy" does not paint the row like an
 * alarm -- if every answered row lights up, the colour stops meaning anything.
 */
export function ClinicalYesNo({
  value,
  onChange,
  label,
  id,
  tone = "primary",
  className,
}: {
  value: boolean | null
  onChange: (value: boolean | null) => void
  label?: React.ReactNode
  id: string
  tone?: "primary" | "danger"
  className?: string
}) {
  const t = useTranslations()
  const answered = value != null

  const option = (optionValue: boolean, text: string) => {
    const selected = value === optionValue
    const notable = selected && optionValue === true
    return (
      <button
        type="button"
        // Tapping the chosen side again clears it. Without this the only way
        // back from a mis-tap is to record a different wrong answer.
        onClick={() => onChange(selected ? null : optionValue)}
        aria-pressed={selected}
        aria-label={`${typeof label === "string" ? label : id}: ${text}`}
        className={cn(
          "min-w-12 rounded-md border px-2.5 py-0.5 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          selected
            ? notable && tone === "danger"
              ? "border-destructive bg-destructive text-white"
              : "border-primary bg-primary text-primary-foreground"
            : "border-input text-muted-foreground hover:bg-accent",
        )}
      >
        {text}
      </button>
    )
  }

  const control = (
    <div className="flex shrink-0 flex-col items-start gap-0.5" role="group" aria-labelledby={`${id}-label`}>
      <div className="flex gap-1">
        {option(true, t("common.yes"))}
        {option(false, t("common.no"))}
      </div>
      {!answered && (
        <span className="text-[11px] leading-none text-muted-foreground">{t("common.notAsked")}</span>
      )}
    </div>
  )

  if (label == null) return <div className={className} data-slot="clinical-yes-no">{control}</div>

  return (
    <div className={cn("flex items-start justify-between gap-3", className)} data-slot="clinical-yes-no">
      <span id={`${id}-label`} className="min-w-0 text-sm leading-snug">{label}</span>
      {control}
    </div>
  )
}
