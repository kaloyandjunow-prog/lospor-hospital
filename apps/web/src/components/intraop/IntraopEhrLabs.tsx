"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { lookupIntraopEhrLabs, recordEhrDecisions, type EhrImportOffer as Offer } from "@/lib/ehr-import"
import { useEhrImportCapability } from "@/lib/deployment-capabilities"
import { EhrImportReview } from "@/components/EhrImportReview"

type State =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "offer"; offer: Offer }

/**
 * Laboratory results drawn during the case, from the hospital system (1.4.13).
 *
 * Asked only when pressed. The appliance uses the case's own patient reference
 * and returns only results drawn since the case started, with the usual
 * review: the newest draw of each test ticked, up to three earlier ones
 * collapsed. Accepted results are added to the intraoperative labs with their
 * own draw times and saved with the case; the decisions are recorded as the
 * preoperative review records them.
 */
export function IntraopEhrLabs<Row>({ caseId, value, onChange }: {
  caseId: string | null
  value: Row[]
  onChange: (next: Row[]) => void
}) {
  const t = useTranslations("ehr")
  const capability = useEhrImportCapability()
  const [state, setState] = useState<State>({ kind: "idle" })
  // An import accepted here is not reopened by a second press before the
  // accepted results have been saved with the case.
  const acceptedRef = useRef(new Set<string>())

  if (!capability.enabled || !caseId) return null

  async function ask() {
    if (!caseId) return
    setState({ kind: "asking" })
    const result = await lookupIntraopEhrLabs(caseId)
    if (result.status === "offer" && !acceptedRef.current.has(result.offer.importId)) {
      setState({ kind: "offer", offer: result.offer })
    } else {
      setState({ kind: result.status === "offer" || result.status === "none" ? "none" : "failed" })
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={state.kind === "asking"}
        onClick={() => { void ask() }}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-sky-400 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer disabled:opacity-50"
      >
        {state.kind === "asking" ? t("asking") : t("intraopLabsFetch")}
      </button>
      {state.kind === "none" && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t("intraopLabsNone")}</p>
      )}
      {state.kind === "failed" && (
        <p className="text-xs mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-2">
          {t("intraopLabsFailed")}
        </p>
      )}
      {state.kind === "offer" && (
        <EhrImportReview
          plan={state.offer.plan}
          identityUnverified={state.offer.identityUnverified}
          unreadSources={state.offer.unreadSources}
          current={{ labResults: value }}
          labelFor={field => field}
          onClose={() => setState({ kind: "idle" })}
          onDecline={itemKey => { void recordEhrDecisions(caseId, state.offer.importId, [], [itemKey]) }}
          onAccept={async (patch, appliedKeys) => {
            const importId = state.offer.importId
            acceptedRef.current.add(importId)
            // Written first, then recorded: a failure between the two leaves
            // the item offered again, not lost.
            if (Array.isArray(patch.labResults)) onChange(patch.labResults as Row[])
            await recordEhrDecisions(caseId, importId, appliedKeys, []).catch(() => {})
            setState({ kind: "idle" })
          }}
        />
      )}
    </div>
  )
}
