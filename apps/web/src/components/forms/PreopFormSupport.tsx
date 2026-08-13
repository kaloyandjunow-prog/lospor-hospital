import type { ReactNode } from "react"
import { X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Tag } from "@/components/TagInput"
import {
  getBodySystem,
  SYSTEM_COLORS,
  SYSTEM_ORDER,
  type BodySystem,
} from "@/lib/icd-categories"

export const DISCRETE_PREOP_FIELDS = new Set<string>([
  "sex", "asaScore", "mallampati", "cormackLehane", "neckMobility", "bloodType", "rhFactor",
  "clinicalMode", "ageUnit",
])

export function ComorbiditiesBySystem({ tags, onRemove }: {
  tags: Tag[]
  onRemove: (label: string) => void
}) {
  if (tags.length === 0) return null
  const grouped: Partial<Record<BodySystem, Tag[]>> = {}
  for (const tag of tags) {
    const system = getBodySystem(tag.sub ?? "")
    if (!grouped[system]) grouped[system] = []
    grouped[system]!.push(tag)
  }
  return (
    <div className="space-y-3 pt-3 border-t border-slate-100">
      {SYSTEM_ORDER.filter(system => grouped[system]).map(system => (
        <div key={system}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{system}</p>
          <div className="flex flex-wrap gap-1.5">
            {grouped[system]!.map(tag => (
              <span key={tag.label} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${SYSTEM_COLORS[system]}`}>
                <span>{tag.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${tag.label}`}
                  onClick={() => onRemove(tag.label)}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SectionCard({ title, children, action, error }: {
  title: string
  children: ReactNode
  action?: ReactNode
  error?: boolean
}) {
  return (
    <Card className={error ? "border-red-500 dark:border-red-500" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-slate-700">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/** Announce a rejected field without interrupting clinical entry. */
export function RejectionNote({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-red-500 text-xs mt-1" role="status">{msg}</p>
}
