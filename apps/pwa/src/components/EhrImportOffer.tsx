import { useCallback, useEffect, useState } from "react"
import { Text, View } from "react-native"
import type { ClinicalMode } from "@lospor/core/pediatric"

import { lookupEhrImport, recordEhrDecisions, type EhrImportOffer as Offer } from "@/lib/ehr-import"
import { STRINGS } from "@/i18n/strings"
import { colors, withAlpha } from "@/theme/colors"
import { EhrImportPanel } from "./EhrImportPanel"
import { FeedbackPressable } from "./intraop/FeedbackPressable"

/**
 * The door onto the import review.
 *
 * Everything behind it was built and reachable from nothing: the staging
 * tables, both transports, the per-field review logic and this panel all
 * existed, and no screen ever rendered them. This is the piece that turns a
 * record number a clinician has already typed into an offer they can act on.
 *
 * It asks once, when the case has an identifier and the deployment says it can
 * ask. It never asks repeatedly: a hospital system that answered "nothing" is
 * not going to be nagged into a different answer, and a poll on a preop form is
 * a poll running all morning in a theatre.
 */

type Props = {
  caseId: string | null
  /** The record number as typed. Used once, in one request, never stored. */
  identifier: string | null
  identifierType?: "IZ" | "EGN"
  /** False when the deployment has no hospital system to ask. */
  available: boolean
  language: string
  current: Record<string, unknown>
  currentClinicalMode?: ClinicalMode | null
  labelFor: (field: string) => string
  /** Applies accepted values as an ordinary case edit by this clinician. */
  onApply: (patch: Record<string, unknown>) => Promise<void> | void
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
  language,
  current,
  currentClinicalMode,
  labelFor,
  onApply,
  onlyFields,
  onRequestModeChange,
}: Props) {
  const strings = STRINGS[language as "en" | "bg"]
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

  // Asked once per case and identifier, not polled. A later look is a
  // deliberate act — the button below — because a hospital system that has
  // nothing now will not have something a second later, and a form that polls
  // is a form polling all morning.
  useEffect(() => {
    if (!available || !caseId || !identifier) return
    setState(current => (current.kind === "idle" ? current : current))
    void ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, caseId, identifier, identifierType])

  if (!available || !caseId || !identifier) return null

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

  const banner = (text: string, tone: "info" | "warn") => (
    <View style={{
      borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12,
      backgroundColor: tone === "warn" ? withAlpha(colors.warning, "22") : colors.surfaceRaised,
      borderColor: tone === "warn" ? withAlpha(colors.warning, "66") : colors.border,
    }}>
      <Text style={{ color: tone === "warn" ? colors.warning : colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
        {text}
      </Text>
    </View>
  )

  return (
    <>
      {state.kind === "asking" ? banner(strings.ehrAsking, "info") : null}
      {state.kind === "ambiguous" ? banner(strings.ehrAmbiguous, "warn") : null}
      {state.kind === "none" ? banner(strings.ehrNothingHeld, "info") : null}

      {state.kind === "offer" && !open ? (
        <FeedbackPressable
          onPress={() => setOpen(true)}
          style={{
            borderRadius: 12, borderWidth: 1, borderColor: withAlpha(colors.primary, "66"),
            backgroundColor: colors.primarySoft, paddingVertical: 12, alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>
            {strings.ehrReviewWaiting}
          </Text>
        </FeedbackPressable>
      ) : null}

      {state.kind === "offer" && open ? (
        <EhrImportPanel
          plan={planFor(state.offer)}
          identityUnverified={state.offer.identityUnverified}
          unreadSources={state.offer.unreadSources}
          current={current}
          currentClinicalMode={currentClinicalMode}
          labelFor={labelFor}
          onClose={() => setOpen(false)}
          onRequestModeChange={onRequestModeChange}
          onDecline={itemKey => {
            // Recorded on its own so the refusal survives the clinician closing
            // the sheet without accepting anything else.
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
      ) : null}
    </>
  )
}
