import { useCallback, useRef, type MutableRefObject } from "react"
import { confirmAction } from "@/lib/notify"
import { phoneGateWarnings, tagWithSuggestion } from "@/lib/phone-suggestion-sheets"
import { MH_HISTORY_WARNING, type SuggestionContext } from "@lospor/core/intraop-suggestions"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"

/**
 * The save used by sheets a suggestion card opened (10.2.0): the entry is saved with the card's tag, after the
 * warnings that apply (P1 and E2: an MH history before a volatile or suxamethonium, a local anaesthetic over the
 * maximum) have been confirmed. The tag is held in `pendingSuggestion` until a sheet saves or every sheet closes.
 */
export function usePhoneTaggedSave({ save, logRef, language, tc }: {
  save: SaveIntraopEvent
  logRef: MutableRefObject<LogEvent[]>
  language: string
  tc: (key: never) => string
}) {
  const pendingSuggestion = useRef<string | null>(null)
  const suggestionContextRef = useRef<Omit<SuggestionContext, "now"> | null>(null)
  const say = tc as (key: string) => string
  const saveTagged = useCallback<SaveIntraopEvent>(async (partial, ...rest) => {
    const warnings = phoneGateWarnings(suggestionContextRef.current, logRef.current, partial,
      { mh: MH_HISTORY_WARNING[language === "bg" ? "bg" : "en"], laMax: say("sgLaMaxExceeds") }, language as never, new Date().toISOString())
    if (warnings.length > 0 && !(await confirmAction(`⚠ ${say("sgLaMaxTitle")}`, warnings.join("\n\n"), { destructive: true, confirmLabel: say("sgMhGive"), cancelLabel: say("sgCancel"), labelledOnWeb: true }))) {
      pendingSuggestion.current = null
      return null
    }
    return save(tagWithSuggestion(partial, pendingSuggestion), ...rest)
  }, [save, logRef, language, say])
  return { saveTagged, pendingSuggestion, suggestionContextRef }
}
