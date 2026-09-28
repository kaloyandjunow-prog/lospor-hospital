import { Text, TouchableOpacity, View } from "react-native"
import type { IntraopAttentionAction, IntraopAttentionKind } from "@lospor/core/intraop-attention"

import type { ClinicalStringKey } from "@/lib/preferences-context"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * The two answers to one question the timeline asks (9.13.0). One component
 * wherever the question appears -- End case, the timetable banner, the stop's
 * own row -- so the answers cannot differ between them. What each answer
 * writes is Core's (intraop-attention), never decided here.
 */
const ANSWERS: Record<IntraopAttentionKind, { action: IntraopAttentionAction; label: ClinicalStringKey; tone: "no" | "yes"; testId: string }[]> = {
  after_end: [
    { action: "did_not_happen", label: "endCaseDidntHappen", tone: "no", testId: "end-case-after-end-delete" },
    { action: "happened", label: "endCaseHappened", tone: "yes", testId: "end-case-after-end-move" },
  ],
  unconfirmed_stop: [
    { action: "still_running", label: "stopStillRunning", tone: "no", testId: "attention-still-running" },
    { action: "stopped", label: "stopConfirmedStopped", tone: "yes", testId: "attention-stopped" },
  ],
}

export function AttentionAnswers({ id, kind, onAnswer }: {
  id: string
  kind: IntraopAttentionKind
  onAnswer: (id: string, action: IntraopAttentionAction) => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {ANSWERS[kind].map(answer => (
        <TouchableOpacity
          key={answer.action}
          testID={`${answer.testId}-${id}`}
          onPress={() => onAnswer(id, answer.action)}
          style={{
            flex: 1, minHeight: 44, paddingVertical: 8, borderRadius: 8, alignItems: "center", justifyContent: "center",
            backgroundColor: shade("#1c1c1c"), borderWidth: 1,
            borderColor: answer.tone === "yes" ? shade("#22c55e55") : shade("#ef444455"),
          }}
        >
          <Text style={{ color: answer.tone === "yes" ? shade("#86efac") : shade("#f87171"), fontWeight: "700", fontSize: 13 }}>
            {tc(answer.label)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
