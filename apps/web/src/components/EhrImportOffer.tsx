"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { ClinicalMode } from "@lospor/core/pediatric"

import { lookupEhrImport, recordEhrDecisions, type EhrImportOffer as Offer } from "@/lib/ehr-import"
import { EhrImportReview } from "./EhrImportReview"

/**
 * The door onto the import review.
 *
 * Everything behind it was built and reachable from nothing: the staging
 * tables, both transports, the per-field review logic and EhrImportReview all
 * existed, and no page rendered them. This turns a record number the clinician
 * has already typed into an offer they can act on.
 *
 * The PWA has the same component against the same route, and both render a plan
 * Core built — which is how the two clients stay in step about what is being
 * offered and which items are pre-selected.
 */

type Props = {
  caseId: string | null
  /** The record number as typed. Used once, in one request, never stored. */
  identifier: string | null
  identifierType?: "IZ" | "EGN"
  /** False when the deployment has no hospital system to ask. */
  available: boolean
  current: Record<string, unknown>
  currentClinicalMode?: ClinicalMode | null
  labelFor: (field: string) => string
  /** Applies accepted values as an ordinary case edit by this clinician. */
  onApply: (patch: Record<string, unknown>) => Promise<void> | void
  onRequestModeChange?: () => void
}

type State =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "offer"; offer: Offer }
  | { kind: "none" }
  | { kind: "ambiguous" }
  | { kind: "unavailable" }

export function EhrImportOffer({
  caseId,
  identifier,
  identifierType = "IZ",
  available,
  current,
  currentClinicalMode,
  labelFor,
  onApply,
  onRequestModeChange,
}: Props) {
  const t = useTranslations("ehr")
  const [state, setState] = useState<State>({ kind: "idle" })
  const [open, setOpen] = useState(false)

  const ask = useCallback(async () => {
    if (!caseId || !identifier) return
    setState({ kind: "asking" })
    const result = await lookupEhrImport(caseId, identifier, identifierType)
    if (result.status === "offer") {
      setState({ kind: "offer", offer: result.offer })
      setOpen(true)
      return
    }
    setState({ kind: result.status === "none" ? "none" : result.status })
  }, [caseId, identifier, identifierType])

  // Asked once per case and identifier, never polled. A hospital system that
  // answered "nothing" will not be nagged into a different answer, and a poll
  // on a preop form is a poll running all morning in a theatre.
  useEffect(() => {
    if (!available || !caseId || !identifier) return
    void ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, caseId, identifier, identifierType])

  if (!available || !caseId || !identifier) return null

  return (
    <>
      {state.kind === "asking" && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t("asking")}</p>
      )}
      {state.kind === "none" && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t("nothingHeld")}</p>
      )}
      {state.kind === "ambiguous" && (
        <p className="text-xs mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-2">
          {t("ambiguous")}
        </p>
      )}

      {state.kind === "offer" && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-emerald-400 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors cursor-pointer"
        >
          {t("reviewWaiting")}
        </button>
      )}

      {state.kind === "offer" && open && (
        <EhrImportReview
          plan={state.offer.plan}
          current={current}
          currentClinicalMode={currentClinicalMode}
          labelFor={labelFor}
          onClose={() => setOpen(false)}
          onRequestModeChange={onRequestModeChange}
          onDecline={itemKey => {
            // Recorded on its own so the refusal survives the clinician closing
            // the review without accepting anything else.
            void recordEhrDecisions(caseId, state.offer.importId, [], [itemKey])
          }}
          onAccept={async (patch, appliedKeys) => {
            // The write goes first, deliberately. A failure between the two
            // leaves the import pending and self-corrects, because a value
            // already in the case comes back unchanged; recording first would
            // mark an item decided that never reached the record.
            await onApply(patch)
            await recordEhrDecisions(caseId, state.offer.importId, appliedKeys, [])
            setOpen(false)
            setState({ kind: "none" })
          }}
        />
      )}
    </>
  )
}
