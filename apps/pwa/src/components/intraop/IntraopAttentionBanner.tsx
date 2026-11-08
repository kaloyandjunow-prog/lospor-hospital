import { Pressable, Text, View } from "react-native"
import { colors } from "@/theme/colors"
import { intraopAttentionText, intraopRefusedEntry, type IntraopAttentionAction, type IntraopAttentionItem } from "@lospor/core/intraop-attention"
import { vitalQuestionText } from "@lospor/core/vital-questions"
import { clinicalDisplayLabel } from "@lospor/core/display"
import { latexBanner, REMINDER_IDS, type SuggestionContext } from "@lospor/core/intraop-suggestions"
import { automationEnabled } from "@lospor/core/intraop-automation"
import type { IntraopAttentionItem as Item } from "@lospor/core/intraop-attention"

import type { LogEvent } from "@/lib/intraop-log-event"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { AttentionAnswers } from "./AttentionAnswers"
import type { CaseSaveState } from "@/lib/use-case-save-state"

export type IntraopAttentionView = {
  items: IntraopAttentionItem[]
  resolve: (key: string, action: IntraopAttentionAction, choice?: string) => Promise<void>
  /** A suggestion line's Open: its card, follow-up or reminder in a sheet (10.2.0). */
  open?: (key: string) => void
  /** Time of day in the case's own zone. */
  clockOf: (ts: string) => string
  labelOf: (event: LogEvent) => string
  /** The saved log: names what a refused edit or deletion was about. */
  log?: LogEvent[]
  /** Whether each change reached the server (9.13.0). */
  saveState?: CaseSaveState
  /** The clinician keeps logging while out of range (10.1.0): the question says when that stops. */
  keepLogging?: boolean
  /** The suggestions (10.2.0): a latex allergy on the preop record shows a banner (P4). */
  suggestions?: SuggestionContext | null
}

/**
 * The questions the timeline is waiting on, above the chart (9.13.0): a stop
 * entered ahead whose time has come, and on an ended case anything left after
 * the end -- which otherwise could only be answered at End case, so a case
 * ended automatically could never be finalised. Visible without opening a
 * row; a tired clinician should not have to hunt for it.
 */
/** Why a reading is unusual, and when automatic logging would stop (10.1.0). */
function VitalQuestionDetail({ item, keepLogging }: { item: IntraopAttentionItem; keepLogging: boolean }) {
  const shade = useShade()
  const { language } = usePreferences()
  if (!item.vital) return null
  const text = vitalQuestionText(item.vital, language, keepLogging)
  return (
    <View testID={`attention-vital-detail-${item.key}`} style={{ marginTop: -2, marginBottom: 6 }}>
      <Text style={{ color: shade("#cbd5e1"), fontSize: 12 }}>{text.detail}</Text>
      {text.stop ? <Text style={{ color: shade("#94a3b8"), fontSize: 12, marginTop: 2 }}>{text.stop}</Text> : null}
    </View>
  )
}

/** A question that offers several complications to pick from (a shock, EtCO2 near zero). */
function choicesOf(item: Item): readonly string[] {
  const line = item.suggestion?.item
  if (line?.type === "reverse" && line.question.choices.length > 1) return line.question.choices
  if (line?.type === "reading" && line.question.kind === "nearZero") return line.question.choices
  return []
}

export function IntraopAttentionBanner({ attention }: { attention: IntraopAttentionView }) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const refused = attention.saveState?.refused ?? []
  const context = attention.suggestions
  const latex = context && automationEnabled(context.settings, "reminders", REMINDER_IDS.latex, context.user) ? latexBanner(context.preop, language) : null
  const latexLine = latex ? (
    <View testID="latex-banner" style={{ marginHorizontal: 10, marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: shade("#ef4444") + "22", borderWidth: 1, borderColor: shade("#ef4444") + "66" }}>
      <Text style={{ color: shade("#fca5a5"), fontWeight: "800", fontSize: 14 }}>⚠ {latex}</Text>
    </View>
  ) : null
  if (attention.items.length === 0 && refused.length === 0) return latexLine
  return (
    <>
    {latexLine}
    <View testID="intraop-attention" style={{
      marginHorizontal: 10, marginTop: 8, marginBottom: 4, padding: 10, borderRadius: 12,
      backgroundColor: shade("#fbbf24") + "14", borderWidth: 1, borderColor: shade("#fbbf24") + "66",
    }}>
      {refused.length > 0 && (
        <View testID="intraop-refused" style={{ marginBottom: attention.items.length > 0 ? 10 : 0 }}>
          {/* Not saved, and never will be as entered: said, not lost. The entry
              itself stays in the device's refused log. */}
          <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 13, marginBottom: 4 }}>
            {tc("refusedTitle")}
          </Text>
          {refused.map(item => {
            // What it was and why, in Core's words -- the same line as the web's.
            const entry = intraopRefusedEntry(item, language, attention.log)
            return (
              <Text key={`${item.eventId}-${item.at}`} style={{ color: shade("#fca5a5"), fontSize: 12, marginBottom: 2 }}>
                {attention.clockOf(entry.at)} · {entry.text}
              </Text>
            )
          })}
          <Pressable testID="intraop-refused-dismiss" onPress={() => attention.saveState?.dismissRefused()} style={{ alignSelf: "flex-start", marginTop: 6, minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.danger }}>
            <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12 }}>{tc("refusedDismiss")}</Text>
          </Pressable>
        </View>
      )}
      {attention.items.length > 0 && (
        <Text style={{ color: shade("#fbbf24"), fontWeight: "800", fontSize: 13, marginBottom: 6 }}>
          {tc("attentionBannerTitle")}
        </Text>
      )}
      {attention.items.map(item => (
        <View key={item.key} style={{ marginBottom: 8 }}>
          <Text style={{ color: shade("#e2e8f0"), fontWeight: "700", fontSize: 13, marginBottom: 6 }}>
            {attention.clockOf(item.event.ts)} · {intraopAttentionText(item, language)}
            {item.kind === "unconfirmed_stop" ? ` — ${tc("stopUnconfirmedLabel")}` : ""}
          </Text>
          {item.vital ? <VitalQuestionDetail item={item} keepLogging={attention.keepLogging ?? true} /> : null}
          <AttentionAnswers id={item.key} kind={item.kind} actions={item.actions} choices={choicesOf(item)}
            choiceLabel={choice => clinicalDisplayLabel("complication", choice, language === "bg" ? "bg" : "en", { label: choice })}
            onAnswer={(key, action, choice) => { if (action === "open") attention.open?.(key); else void (choice === undefined ? attention.resolve(key, action) : attention.resolve(key, action, choice)) }} />
        </View>
      ))}
    </View>
    </>
  )
}
