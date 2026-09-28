import { useRef, useState } from "react"
import { Text, View } from "react-native"

import { lookupIntraopEhrLabs, recordEhrDecisions, type EhrImportOffer as Offer } from "@/lib/ehr-import"
import { useDeploymentCapabilities } from "@/lib/deployment-capabilities"
import type { LabResult } from "@/lib/labs"
import { ehrFieldLabel } from "@/lib/ehr-field-labels"
import { usePreferences } from "@/lib/preferences-context"
import { STRINGS } from "@/i18n/strings"
import { colors, withAlpha } from "@/theme/colors"
import { EhrImportPanel } from "../EhrImportPanel"
import { FeedbackPressable } from "./FeedbackPressable"

type State =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "offer"; offer: Offer }

/**
 * Laboratory results drawn during the case, from the hospital system (1.4.13).
 *
 * Asked only when pressed: a result drawn ten minutes ago is the reason to
 * ask, and a poll running through the operation would be a poll nobody is
 * watching. The appliance uses the case's own patient reference and returns
 * only results drawn since the case started, with the usual review: the newest
 * draw of each test ticked, up to three earlier ones collapsed.
 *
 * Accepted results are added to the case's intraoperative labs as they came,
 * with their own draw times, and the decisions are recorded as the
 * preoperative review records them -- only once the case has them, saved or
 * queued to save. Recorded on a refused write, an import read as accepted
 * though its results never reached the case, and a second press said there
 * was nothing new.
 */
export function IntraopEhrLabs({ caseId, value, onChange }: {
  caseId: string | null
  value: LabResult[]
  /** Resolves true once the list is saved or queued to save. */
  onChange: (next: LabResult[]) => Promise<boolean>
}) {
  const { language } = usePreferences()
  const strings = STRINGS[language as "en" | "bg"]
  const { ehrImport } = useDeploymentCapabilities()
  const [state, setState] = useState<State>({ kind: "idle" })
  // An import accepted here is not reopened by a second press before the
  // accepted results have reached the case.
  const acceptedRef = useRef(new Set<string>())

  if (!ehrImport.enabled || !caseId) return null

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

  if (state.kind === "offer") {
    const offer = state.offer
    return (
      <EhrImportPanel
        plan={offer.plan}
        identityUnverified={offer.identityUnverified}
        unreadSources={offer.unreadSources}
        current={{ labResults: value }}
        labelFor={field => ehrFieldLabel(field, language)}
        onClose={() => setState({ kind: "idle" })}
        onDecline={itemKey => { void recordEhrDecisions(caseId, offer.importId, [], [itemKey]) }}
        onAccept={async (patch, appliedKeys) => {
          // Written first, then recorded, as the preoperative review does: a
          // write that did not land leaves the items offered again, not lost.
          if (Array.isArray(patch.labResults) && !await onChange(patch.labResults as LabResult[])) {
            setState({ kind: "idle" })
            return
          }
          acceptedRef.current.add(offer.importId)
          await recordEhrDecisions(caseId, offer.importId, appliedKeys, []).catch(() => {})
          setState({ kind: "idle" })
        }}
      />
    )
  }

  return (
    <View style={{ marginTop: 12 }}>
      <FeedbackPressable
        onPress={() => { if (state.kind !== "asking") void ask() }}
        style={{
          borderRadius: 12, borderWidth: 1, borderColor: withAlpha(colors.primary, "66"),
          backgroundColor: colors.surfaceRaised, paddingVertical: 12, alignItems: "center",
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>
          {state.kind === "asking" ? strings.ehrAsking : strings.ehrIntraopLabsFetch}
        </Text>
      </FeedbackPressable>
      {state.kind === "none" || state.kind === "failed" ? (
        <Text style={{ color: state.kind === "failed" ? colors.warning : colors.textMuted, fontSize: 12, marginTop: 6, textAlign: "center" }}>
          {state.kind === "failed" ? strings.ehrIntraopLabsFailed : strings.ehrIntraopLabsNone}
        </Text>
      ) : null}
    </View>
  )
}
