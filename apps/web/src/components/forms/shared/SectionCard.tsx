"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronDown } from "lucide-react"

export function SectionCard({ title, children, collapsible = false, defaultCollapsed = false, badge }: {
  title: string; children: React.ReactNode
  collapsible?: boolean; defaultCollapsed?: boolean; badge?: string
}) {
  const [open, setOpen] = useState(!defaultCollapsed)
  return (
    <Card>
      <CardHeader
        className={`pb-3 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-slate-700 dark:text-slate-200">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {badge && !open && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal truncate max-w-[180px]">{badge}</span>}
            {collapsible && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  )
}
