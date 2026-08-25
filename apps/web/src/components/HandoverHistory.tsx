"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { UserCheck } from "lucide-react"
import { format } from "date-fns"

type Person = { id: string; name: string | null; title: string | null } | null

type Transfer = {
  id: string
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED"
  createdAt: string
  resolvedAt: string | null
  previousCaseCode: string | null
  fromUser: Person
  toUser: Person
}

/**
 * Who has held this case.
 *
 * The audit log has recorded handovers all along, but only an administrator can
 * read it. The people who need it are the clinicians on the case: asked weeks
 * later why a record is in their name, "accepted from Dr X on the 14th" is the
 * answer, and it should not require an admin to run a query.
 *
 * Renders nothing when a case has never changed hands, which is most of them —
 * an empty panel on every case would train people to ignore the one that is not.
 */
export function HandoverHistory({ caseId }: { caseId: string }) {
  const t = useTranslations()
  const [transfers, setTransfers] = useState<Transfer[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/cases/${caseId}/transfers`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setTransfers(Array.isArray(d) ? d : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [caseId])

  if (transfers.length === 0) return null

  const nameOf = (person: Person) => person?.name ?? t("transfer.unknownUser")

  return (
    <section className="mt-6 rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1e1e1e] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
        <UserCheck className="h-4 w-4" />
        {t("transfer.history")}
      </h2>
      <ol className="space-y-2">
        {transfers.map(transfer => (
          <li key={transfer.id} className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-2">
            <time dateTime={transfer.resolvedAt ?? transfer.createdAt} className="tabular-nums text-slate-400">
              {format(new Date(transfer.resolvedAt ?? transfer.createdAt), "dd MMM yyyy HH:mm")}
            </time>
            <span>
              {t(`transfer.history_${transfer.status}`, {
                from: nameOf(transfer.fromUser),
                to: nameOf(transfer.toUser),
              })}
            </span>
            {/* The number the case carried before it moved. A printed sheet
                showing the old code is how a chart stops matching its record,
                so it is stated rather than left to be reconstructed. */}
            {transfer.previousCaseCode && (
              <span className="text-slate-400">
                {t("transfer.previouslyNumbered", { code: transfer.previousCaseCode })}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
