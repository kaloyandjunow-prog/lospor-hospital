"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import type { ClinicalMode } from "@lospor/core/pediatric"

import {
  lookupEhrImport,
  lookupEhrImportWithoutCase,
  recordEhrDecisions,
  type EhrImportOffer as Offer,
} from "@/lib/ehr-import"
import { offerHasQuestions, offerWithoutAccepted } from "@/lib/ehr-offer-remaining"
import { EhrImportReview } from "./EhrImportReview"

/** How often a request to the hospital system is checked, and for how long (1.5.0). */
const REQUEST_CHECK_MS = 15_000
const REQUEST_WAIT_MS = 5 * 60_000

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
  /**
   * How this site receives EHR data, when it receives any.
   *
   * Only FHIR answers a question. A watched folder and an HL7 feed are
   * pushed: the hospital writes when it writes, and asking cannot make it
   * happen. Offering a button that fetches on those sites promises
   * something the transport cannot do, and the honest answer it produces
   * -- the hospital holds nothing -- is indistinguishable from the patient
   * having no history.
   */
  transport?: "FOLDER" | "FHIR" | "HL7V2" | null
  /**
   * A watched-folder site whose lookups ask the hospital system (1.5.0).
   * Then a folder answers a question too, only later: the lookup drops a
   * request, and the answer arrives as an ordinary import.
   */
  folderRequests?: boolean
  current: Record<string, unknown>
  currentClinicalMode?: ClinicalMode | null
  labelFor: (field: string) => string
  /**
   * Applies accepted values as an ordinary case edit by this clinician.
   *
   * `modeChange`, when set, is the clinical mode the accepted age puts the
   * case in (1.4.23). Run the page's own mode switch first, with the clearing
   * it always does, then write `patch`: the other order would wipe the
   * vitals the import just brought.
   */
  onApply: (patch: Record<string, unknown>, modeChange: ClinicalMode | null) => Promise<void> | void
  /** False where the deployment has no paediatric mode; the age is then left out. */
  modeChangeAvailable?: boolean
  /**
   * Restrict the offer to these canonical fields.
   *
   * Used where the offer is opened inside something narrower than the whole
   * record -- the intraoperative labs sheet asks for laboratory results and
   * nothing else, and proposing a diagnosis there would be answering a question
   * the clinician did not ask. Undefined means the whole plan.
   */
  onlyFields?: readonly string[]
  onRequestModeChange?: () => void
  /**
   * Saves the draft and resolves the case id, for asking before a case exists.
   *
   * The lookup is case-scoped, so until the case is saved there is nothing to
   * ask against and this component used to render nothing at all. The number
   * was therefore typed, and then nothing happened: the only way to reach the
   * hospital system was to start filling a second field and let autosave
   * create the case as a side effect. Nobody could be expected to guess that.
   */
  /**
   * Records an acceptance made before the case existed.
   *
   * The decisions belong to a case, and accepting is what produces one --
   * the imported age, height and weight are usually the values that make it
   * saveable. So the offer hands the acceptance back, and the page records
   * it once the case id exists.
   */
  onAcceptedBeforeCase?: (importId: string, appliedKeys: string[]) => Promise<void>
}

type State =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "offer"; offer: Offer }
  | { kind: "none" }
  /** The hospital sent something, and all of it is already decided. */
  | { kind: "reviewed" }
  | { kind: "ambiguous" }
  | { kind: "unavailable" }
  | { kind: "error" }
  /** Asked of the hospital system over the folder, and waiting for its answer (1.5.0). */
  | { kind: "requested"; requestId: string; since: number; checks: number }
  /** Asked, and no answer within the wait. It can still come. */
  | { kind: "notAnswered" }

export function EhrImportOffer({
  caseId,
  identifier,
  identifierType = "IZ",
  available,
  transport,
  folderRequests,
  current,
  currentClinicalMode,
  labelFor,
  onApply,
  onlyFields,
  modeChangeAvailable,
  onRequestModeChange,
  onAcceptedBeforeCase,
}: Props) {
  const t = useTranslations("ehr")
  const [state, setState] = useState<State>({ kind: "idle" })
  const [open, setOpen] = useState(false)
  // Items accepted on this screen, per import (1.4.11, narrowed in 1.4.17).
  // Accepting creates the case, and the new case asks again at once -- before
  // the values are saved -- which could reopen the same offer; accepting it
  // again duplicated list items. Only those items are held back now: the rest
  // of the import is still the clinician's to decide.
  const acceptedItemsRef = useRef(new Map<string, Set<string>>())

  const ask = useCallback(async (
    id: string | null,
    how: { request?: boolean; waiting?: { requestId: string; since: number; checks: number } } = {},
  ) => {
    if (!identifier) return
    if (!how.waiting) setState({ kind: "asking" })
    // A re-check names the request it waits on and never asks again.
    const lookupAsk = how.waiting ? { requestId: how.waiting.requestId } : how.request ? { request: true } : {}
    const result = id
      ? await lookupEhrImport(id, identifier, identifierType, lookupAsk)
      : await lookupEhrImportWithoutCase(identifier, identifierType, lookupAsk)
    if (result.status === "offer") {
      const accepted = acceptedItemsRef.current.get(result.offer.importId)
      const offer = accepted ? offerWithoutAccepted(result.offer, accepted) : result.offer
      // Everything the hospital sent is already in the case or refused. That
      // is not "the hospital holds nothing", which reads as no history at all.
      if (!offer || !offerHasQuestions(offer)) {
        setState({ kind: "reviewed" })
        return
      }
      setState({ kind: "offer", offer })
      // Opened only when something is ticked to add; otherwise one press away
      // rather than a sheet whose only button is disabled (1.4.13).
      setOpen(offer.plan.preselectedKeys.length > 0)
      return
    }
    if (result.status === "requested") {
      const since = how.waiting?.since ?? Date.now()
      setState(Date.now() - since >= REQUEST_WAIT_MS
        ? { kind: "notAnswered" }
        : { kind: "requested", requestId: result.requestId, since, checks: (how.waiting?.checks ?? 0) + 1 })
      return
    }
    setState({ kind: result.status === "none" ? "none" : result.status })
  }, [identifier, identifierType])

  // Whether the button can ask: FHIR always answers a question; a folder only
  // where the site has the hospital system answering requests.
  const asksOverFolder = transport === "FOLDER" && folderRequests === true
  const canAsk = transport === "FHIR" || asksOverFolder

  // The one repeated check (1.5.0), and only after a request was actually
  // sent: every REQUEST_CHECK_MS until the answer arrives or REQUEST_WAIT_MS
  // runs out. A check never asks again, and leaving the form stops it.
  useEffect(() => {
    if (state.kind !== "requested") return
    const waiting = state
    const timer = setTimeout(() => { void ask(caseId, { waiting }) }, REQUEST_CHECK_MS)
    return () => clearTimeout(timer)
  }, [state, ask, caseId])

  // Asked once per case and identifier, never polled. A hospital system that
  // answered "nothing" will not be nagged into a different answer, and a poll
  // on a preop form is a poll running all morning in a theatre.
  //
  // ask() moves to "asking" synchronously before it awaits, which is the state
  // this effect exists to enter: the identifier becoming known is an external
  // trigger, not other React state being mirrored. It cannot cascade -- none of
  // the deps below is derived from `state`, so the re-render it causes does not
  // re-run this effect.
  useEffect(() => {
    if (!available || !identifier) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void ask(caseId, { request: asksOverFolder })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, caseId, identifier, identifierType, asksOverFolder])


  // No case needed to ask any more. Typing the number and pressing this is
  // the whole interaction; the case comes into existence if the clinician
  // accepts something.
  const fetchNow = async () => { await ask(caseId, { request: asksOverFolder }) }

  if (!available || !identifier) return null


  // Narrowed to the fields this surface asked about. The preselected keys are
  // narrowed with them, or the review would arrive with items ticked that it
  // does not show -- and accepting would write a value the clinician never saw.
  const planFor = (offer: Offer) => {
    if (!onlyFields) return offer.plan
    const keep = new Set(onlyFields)
    const items = offer.plan.items.filter(item => keep.has(item.field))
    const visible = new Set(items.map(item => item.itemKey))
    return {
      ...offer.plan,
      items,
      preselectedKeys: offer.plan.preselectedKeys.filter(key => visible.has(key)),
    }
  }

  return (
    <>
      {state.kind === "asking" && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t("asking")}</p>
      )}
      {state.kind === "none" && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t("nothingHeld")}</p>
      )}
      {state.kind === "reviewed" && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t("allReviewed")}</p>
      )}
      {state.kind === "requested" && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2" role="status">{t("requested")}</p>
      )}
      {state.kind === "notAnswered" && (
        <p className="text-xs mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-2">
          {t("notAnswered")}
        </p>
      )}
      {state.kind === "ambiguous" && (
        <p className="text-xs mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-2">
          {t("ambiguous")}
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-xs mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-2">
          {t("lookupFailed")}
        </p>
      )}

      {/* Offered whenever there is no plan on screen: before the first ask,
          and again after one that found nothing, since the number may simply
          have been mistyped. */}
      {state.kind !== "offer" && state.kind !== "asking" && state.kind !== "requested" && canAsk && (
        <button
          type="button"
          onClick={() => { void fetchNow() }}
          className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-sky-400 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer"
        >
          {state.kind === "idle" ? t("fetchPatient") : t("fetchPatientAgain")}
        </button>
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
          plan={planFor(state.offer)}
          identityUnverified={state.offer.identityUnverified}
          unreadSources={state.offer.unreadSources}
          current={current}
          currentClinicalMode={currentClinicalMode}
          modeChangeAvailable={modeChangeAvailable}
          labelFor={labelFor}
          onClose={() => setOpen(false)}
          onRequestModeChange={onRequestModeChange}
          onDecline={itemKey => {
            // Recorded on its own so the refusal survives the clinician closing
            // the review without accepting anything else. With no case yet
            // there is nothing to record it against, and nothing to survive:
            // closing an unaccepted offer leaves no case behind either.
            if (caseId) void recordEhrDecisions(caseId, state.offer.importId, [], [itemKey])
          }}
          onAccept={async (patch, appliedKeys, modeChange) => {
            const importId = state.offer.importId
            acceptedItemsRef.current.set(importId, new Set([...(acceptedItemsRef.current.get(importId) ?? []), ...appliedKeys]))
            // The write goes first, deliberately. A failure between the two
            // leaves the import pending and self-corrects, because a value
            // already in the case comes back unchanged; recording first would
            // mark an item decided that never reached the record.
            await onApply(patch, modeChange)
            if (caseId) {
              await recordEhrDecisions(caseId, state.offer.importId, appliedKeys, [])
            } else {
              // Accepting is what creates the case: the values just applied
              // are usually the ones that make it saveable. The page owns
              // that, and records the decisions once the id exists.
              await onAcceptedBeforeCase?.(state.offer.importId, appliedKeys)
            }
            setOpen(false)
            setState({ kind: "none" })
          }}
        />
      )}
    </>
  )
}
