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
  // 10.1.0: a reading outside its limits. Nothing is logged without the yes.
  vital_deviation: [
    { action: "not_now", label: "vitalNotNow", tone: "no", testId: "attention-vital-not-now" },
    { action: "log_complication", label: "vitalLogIt", tone: "yes", testId: "attention-vital-log" },
  ],
  // 10.2.0: a suggestion -- a card, follow-up or reminder opens; a question logs.
  suggestion: [
    { action: "not_now", label: "vitalNotNow", tone: "no", testId: "attention-suggestion-not-now" },
    { action: "dismiss", label: "suggestionDismiss", tone: "no", testId: "attention-suggestion-dismiss" },
    { action: "open", label: "suggestionOpen", tone: "yes", testId: "attention-suggestion-open" },
    { action: "log_complication", label: "vitalLogIt", tone: "yes", testId: "attention-suggestion-log" },
  ],
}

export function AttentionAnswers({ id, kind, onAnswer, actions, choices = [], choiceLabel = choice => choice }: {
  id: string
  kind: IntraopAttentionKind
  onAnswer: (id: string, action: IntraopAttentionAction, choice?: string) => void
  /** The answers this item offers (a suggestion offers Open or Log it, not both). */
  actions?: readonly IntraopAttentionAction[]
  /** A question with several complications to pick from: one button each, in place of Log it. */
  choices?: readonly string[]
  choiceLabel?: (choice: string) => string
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const shown = ANSWERS[kind].filter(answer => (!actions || actions.includes(answer.action))
    && !(answer.action === "log_complication" && choices.length > 0))
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {choices.map(choice => (
        <TouchableOpacity key={choice} testID={`attention-choice-${choice}-${id}`} onPress={() => onAnswer(id, "log_complication", choice)}
          style={{ flexGrow: 1, minHeight: 44, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, alignItems: "center", justifyContent: "center",
            backgroundColor: shade("#1c1c1c"), borderWidth: 1, borderColor: shade("#22c55e55") }}>
          <Text style={{ color: shade("#86efac"), fontWeight: "700", fontSize: 13 }}>{choiceLabel(choice)}</Text>
        </TouchableOpacity>
      ))}
      {shown.map(answer => (
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
