import { useMemo, useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { contextLinkAnswerOps, type ContextLinkAnswer } from "@lospor/core/intraop-suggestions"
import { airwayDeviceEntriesOf, airwayPrimaryConflict, isPrimaryAirwayDevice } from "@lospor/core/airway-device-entries"
import { instantFromLocalTime, isValidTimeZone, localTimeOf } from "@lospor/core/intraop-time"
import { techniqueHasSide, type TechniqueSide } from "@lospor/core/technique-smart"
import type { IntraopAttention } from "@/lib/use-intraop-attention"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { Sheet } from "./Sheet"
import type { PhoneSuggestionSheets } from "./SuggestionSheetHost"

type Step = "route" | "kind" | "technique" | "side" | "airway" | "airway-replacement" | "airway-device"
type TechniqueKind = "sedation" | "general"

export function ContextLinkSheet({ entry, attention, sheets, onClose }: {
  entry: IntraopAttention["items"][number]
  attention: IntraopAttention
  sheets: Pick<PhoneSuggestionSheets, "nowIso">
  onClose: () => void
}) {
  const { tc, language } = usePreferences()
  const shade = useShade()
  const link = entry.suggestion?.item.type === "context" ? entry.suggestion.item.link : null
  const firstStep = link?.kind === "route" ? "route" : link?.kind === "side" ? "side" : link?.kind === "induction" || link?.kind === "airway" ? "kind" : "technique"
  const [step, setStep] = useState<Step>(firstStep)
  const [techniqueKind, setTechniqueKind] = useState<TechniqueKind | null>(null)
  const [technique, setTechnique] = useState<string | null>(null)
  const [replaceArrivalTube, setReplaceArrivalTube] = useState<boolean | null>(null)
  const [timeConfirmed, setTimeConfirmed] = useState(() => link?.startedAt != null)
  const [time, setTime] = useState(() => {
    const instant = new Date(link?.suggestedAt ?? sheets.nowIso())
    const zone = link?.timeZone && isValidTimeZone(link.timeZone) ? link.timeZone : null
    return (zone && localTimeOf(instant, zone)) ?? instant.toISOString().slice(11, 16)
  })
  const at = useMemo(() => {
    if (!link) return null
    const base = new Date(link.suggestedAt)
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (hours > 23 || minutes > 59) return null
    const zone = link.timeZone && isValidTimeZone(link.timeZone) ? link.timeZone : null
    const zoned = zone ? instantFromLocalTime(base, `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`, zone) : null
    if (zoned) return zoned.toISOString()
    base.setHours(hours, minutes, 0, 0)
    return Number.isFinite(base.getTime()) ? base.toISOString() : null
  }, [link, time])
  if (!link) return null
  const lang = language === "bg" ? "bg" : "en"
  const button = { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: shade("#475569"), backgroundColor: shade("#1c1c1c"), justifyContent: "center" as const }
  const commit = (answer: ContextLinkAnswer) => {
    const requiresClinicalTime = answer.type === "side"
      || answer.type === "event"
      || answer.type === "technique"
      || answer.type === "induction"
    // Keep the sheet visible when the answer cannot be charted safely.  The
    // previous behaviour closed it even though Core returned no operations.
    if (requiresClinicalTime && (!at || (link.startedAt == null && !timeConfirmed))) return
    void attention.applyOps(contextLinkAnswerOps(link, answer, sheets.nowIso()))
    onClose()
  }
  const chooseTechnique = (code: string) => {
    setTechnique(code)
    if (techniqueHasSide(code)) setStep("side")
    else if (link.kind === "induction") setStep("airway")
    else if (link.kind === "technique-event") commit({ type: "event", at: at ?? undefined, timeConfirmed })
    else commit({ type: "technique", code, at: at ?? undefined, timeConfirmed })
  }
  const chooseTechniqueKind = (kind: TechniqueKind) => {
    setTechniqueKind(kind)
    setStep("technique")
  }
  const chooseSide = (side: TechniqueSide) => {
    if (!technique) commit({ type: "side", side, at: at ?? undefined, timeConfirmed })
    else if (link.kind === "induction") setStep("airway")
    else commit({ type: "technique", code: technique, side, at: at ?? undefined, timeConfirmed })
  }
  const chooseAirway = (device: string | null) => {
    if (device == null && technique) commit({ type: "induction", code: technique, at: at ?? undefined, timeConfirmed, replaceArrivalTube: false })
    else if (device != null) {
      const entries = airwayDeviceEntriesOf({ airwayDevices: link.airwayDevices, airwayDeviceEntries: link.airwayDeviceEntries })
      if ((link.presentsIntubated && isPrimaryAirwayDevice(device)) || airwayPrimaryConflict(entries, device)) {
        setReplaceArrivalTube(null)
        setStep("airway-replacement")
      } else setStep("airway-device")
    }
  }
  const chooseAirwayReplacement = (replace: boolean) => {
    setReplaceArrivalTube(replace)
    if (replace) setStep("airway-device")
    else if (technique) commit({ type: "induction", code: technique, at: at ?? undefined, timeConfirmed, replaceArrivalTube: false })
  }
  const label = (choice: { label: string; labelBg: string }) => lang === "bg" ? choice.labelBg : choice.label
  const sideLabel: Record<TechniqueSide, string> = lang === "bg" ? { LEFT: "Лява", RIGHT: "Дясна", BOTH: "И двете" } : { LEFT: "Left", RIGHT: "Right", BOTH: "Bilateral" }
  const title = lang === "bg" ? link.titleBg : link.titleEn
  const prompt = lang === "bg" ? link.promptBg : link.promptEn
  const techniqueChoices = link.techniqueChoices.filter(choice => {
    if (!techniqueKind) return true
    return techniqueKind === "sedation" ? choice.value.startsWith("SEDATION_") : choice.value.startsWith("GENERAL_")
  })

  return (
    <Sheet visible onClose={onClose} title={title} allowInline={false} footer={
      <TouchableOpacity testID="context-link-dismiss" onPress={() => { void attention.resolve(entry.key, "dismiss"); onClose() }} style={{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: shade("#ef444466"), alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: shade("#fca5a5"), fontWeight: "800" }}>{tc("suggestionDismiss")}</Text>
      </TouchableOpacity>
    }>
      <Text style={{ color: shade("#cbd5e1"), fontSize: 14, marginBottom: 12 }}>{prompt}</Text>
      {link.startedAt == null ? <Text testID="context-link-missing-start" style={{ color: shade("#fde68a"), backgroundColor: shade("#3b2f12"), borderRadius: 8, padding: 9, marginBottom: 12 }}>{tc("contextMissingStart")}</Text> : null}
      {!at ? <Text testID="context-link-invalid-time" style={{ color: shade("#fde68a"), backgroundColor: shade("#3b2f12"), borderRadius: 8, padding: 9, marginBottom: 12 }}>{tc("contextInvalidTime")}</Text> : null}
      {link.kind === "route" && step === "route" && <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity style={{ ...button, borderColor: shade("#22c55e88") }} onPress={() => setStep("technique")}><Text style={{ color: shade("#86efac"), fontWeight: "800" }}>{tc("contextYes")}</Text></TouchableOpacity>
        <TouchableOpacity style={button} onPress={() => commit({ type: "no" })}><Text style={{ color: shade("#e2e8f0"), fontWeight: "800" }}>{tc("contextNo")}</Text></TouchableOpacity>
      </View>}
      {link.kind === "extubation" && <>
        <Text style={{ color: shade("#cbd5e1"), fontSize: 13, marginBottom: 10 }}>{tc("contextReviewAirway")}</Text>
        <TouchableOpacity style={{ ...button, borderColor: shade("#22c55e88") }} onPress={() => commit({ type: "complete" })}><Text style={{ color: shade("#86efac"), fontWeight: "800" }}>{tc("contextRecord")}</Text></TouchableOpacity>
      </>}
      {(link.kind === "induction" || link.kind === "airway") && step === "kind" && <>
        <Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 7 }}>{tc("contextChooseKind")}</Text>
        <View style={{ flexDirection: "row", gap: 7 }}>
          <TouchableOpacity style={{ ...button, borderColor: shade("#a78bfa88") }} onPress={() => chooseTechniqueKind("sedation")}><Text style={{ color: shade("#c4b5fd"), fontWeight: "800" }}>{tc("contextSedation")}</Text></TouchableOpacity>
          <TouchableOpacity style={{ ...button, borderColor: shade("#60a5fa88") }} onPress={() => chooseTechniqueKind("general")}><Text style={{ color: shade("#93c5fd"), fontWeight: "800" }}>{tc("contextGeneral")}</Text></TouchableOpacity>
        </View>
      </>}
      {step === "technique" && link.kind !== "extubation" && <>
        <Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 7 }}>{tc("contextChooseTechnique")}</Text>
        <View style={{ gap: 7 }}>{techniqueChoices.map(choice => <TouchableOpacity key={choice.value} style={button} onPress={() => chooseTechnique(choice.value)}><Text style={{ color: shade("#e2e8f0"), fontWeight: "700" }}>{label(choice)}</Text></TouchableOpacity>)}</View>
      </>}
      {step === "side" && <>
        <Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 7 }}>{tc("contextChooseSide")}</Text>
        <View style={{ flexDirection: "row", gap: 7 }}>{(["LEFT", "RIGHT", "BOTH"] as TechniqueSide[]).map(value => <TouchableOpacity key={value} style={{ ...button, borderColor: shade("#a78bfa88") }} onPress={() => chooseSide(value)}><Text style={{ color: shade("#c4b5fd"), fontWeight: "800" }}>{sideLabel[value]}</Text></TouchableOpacity>)}</View>
      </>}
      {step === "airway" && <>
        <Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 7 }}>{tc("contextChooseAirway")}</Text>
        <View style={{ flexDirection: "row", gap: 7 }}><TouchableOpacity style={{ ...button, borderColor: shade("#22c55e88") }} onPress={() => chooseAirway("")}><Text style={{ color: shade("#86efac"), fontWeight: "800" }}>{tc("contextYes")}</Text></TouchableOpacity><TouchableOpacity style={button} onPress={() => chooseAirway(null)}><Text style={{ color: shade("#e2e8f0"), fontWeight: "800" }}>{tc("contextNo")}</Text></TouchableOpacity></View>
      </>}
      {step === "airway-replacement" && <>
        <Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 7 }}>{link.presentsIntubated ? tc("contextReplaceArrival") : tc("contextReplaceRecorded")}</Text>
        <View style={{ flexDirection: "row", gap: 7 }}><TouchableOpacity style={{ ...button, borderColor: shade("#22c55e88") }} onPress={() => chooseAirwayReplacement(true)}><Text style={{ color: shade("#86efac"), fontWeight: "800" }}>{tc("contextYes")}</Text></TouchableOpacity><TouchableOpacity style={button} onPress={() => chooseAirwayReplacement(false)}><Text style={{ color: shade("#e2e8f0"), fontWeight: "800" }}>{tc("contextNo")}</Text></TouchableOpacity></View>
      </>}
      {step === "airway-device" && <><Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 7 }}>{tc("contextChooseAirway")}</Text><View style={{ gap: 7 }}>{link.airwayChoices.map(choice => <TouchableOpacity key={choice.value} style={{ ...button, borderColor: shade("#818cf888") }} onPress={() => commit({ type: "induction", code: technique!, airwayDevice: choice.value, at: at ?? undefined, timeConfirmed, ...(replaceArrivalTube === true ? { replaceArrivalTube: true } : {}) })}><Text style={{ color: shade("#c7d2fe"), fontWeight: "700" }}>{label(choice)}</Text></TouchableOpacity>)}</View></>}
      <View style={{ marginTop: 12 }}><Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>{tc("contextTime")}</Text><TextInput value={time} onChangeText={value => { setTime(value); setTimeConfirmed(true) }} keyboardType="numbers-and-punctuation" placeholder={tc("sgTimePlaceholder")} placeholderTextColor={shade("#64748b")} style={{ marginTop: 5, minHeight: 44, borderWidth: 1, borderColor: shade("#475569"), borderRadius: 10, paddingHorizontal: 12, color: shade("#f8fafc") }} /></View>
    </Sheet>
  )
}
