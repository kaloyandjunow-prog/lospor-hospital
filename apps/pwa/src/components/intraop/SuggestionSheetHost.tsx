import { useEffect, useMemo, useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import {
  accessEventLabels,
  dantroleneCardVials,
  dantroleneDosesMg,
  cardAlsoLogOps,
  cardCloseOps,
  cardEventOps,
  cardQuestionOps,
  cardRelabelOps,
  cardResolveOps,
  cardSuggestionTag,
  resolveCard,
  say,
  stopRowTargets,
  suggestionCardFor,
  type ResolvedCard,
  type ResolvedRow,
} from "@lospor/core/intraop-suggestions"
import { arrestQuickDoseOps, arrestRespaceOps, type ArrestDrug } from "@lospor/core/intraop-suggestions"
import { intraopAttentionText } from "@lospor/core/intraop-attention"
import { clinicalDisplayLabel } from "@lospor/core/display"
import { resolveIntraopEventLabel } from "@lospor/core/clinical-display"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { IntraopAttention } from "@/lib/use-intraop-attention"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { colors } from "@/theme/colors"
import { Sheet } from "./Sheet"
import { InlineSheetSlot } from "./InlineSheetSlot"
import { inlineSheet } from "./inline-sheet"
import { DantroleneVials } from "./DantroleneVials"
import { ContextLinkSheet } from "./ContextLinkSheet"

/**
 * What the phone's chart offers a suggestion (10.2.0): its own sheets,
 * prefilled. Built by the intraop screen, which owns them.
 */
export type PhoneSuggestionSheets = {
  nowIso: () => string
  clockOf: (iso: string) => string
  openDrug: (args: { name: string; mode: "bolus" | "infusion"; amount: number | "catalogue" | null; unit?: string; route?: string; suggestion: string }) => void
  openFluid: (args: { name?: string; category?: string; amount: number | "catalogue" | null; mode?: "VOLUME" | "RATE"; suggestion: string }) => void
  openShock: (suggestion: string) => void
  openLab: () => void
  openGas: (fio2: number, fgf: number, air: boolean, suggestion: string) => void
  deepenTargets: () => { key: string; label: string; open: () => void }[]
  stop: (event: LogEvent, suggestion: string) => void
  displayName: (event: LogEvent) => string
  linesOf?: (access: "VENOUS" | "ARTERIAL" | "CENTRAL") => { id: string; label: string; failed: boolean }[]
  markLineFailed?: (id: string, at: string) => void
  openAirway?: (complication: LogEvent) => void
}

type Inline = { kind: "deepen" | "access"; row: ResolvedRow }

export function SuggestionSheetHost({ attention, sheets }: { attention: IntraopAttention; sheets: PhoneSuggestionSheets }) {
  const { opened, open, items, log, suggestions } = attention
  const entry = opened ? items.find(item => item.key === opened) ?? null : null
  // A card stays open after its rows are charted, so it is resolved from the log.
  const card = useMemo<{ card: ResolvedCard; complication: LogEvent } | null>(() => {
    if (!opened?.startsWith("card:") || !suggestions) return null
    const complication = log.find(event => event.id === opened.slice(5) && event.type === "complication")
    const def = complication ? suggestionCardFor(complication.label) : undefined
    if (!complication || !def) return null
    return {
      card: resolveCard(def, { log: log as never, patient: suggestions.patient, preop: suggestions.preop, complication: complication as never, tofMonitor: suggestions.tofMonitor, now: suggestions.now }),
      complication,
    }
  }, [opened, log, suggestions])
  const timer = entry?.suggestion?.item.type === "timer" ? entry.suggestion.item.timer : null
  useEffect(() => {
    if (timer && !timer.dose && timer.complicationEventId && !timer.site) open(`card:${timer.complicationEventId}`)
  }, [timer, open])

  if (!opened || !suggestions) return null
  const close = () => open(null)
  if (card) return <CardSheet key={opened} card={card.card} complication={card.complication} attention={attention} sheets={sheets} onClose={close} />
  if (!entry?.suggestion) return null
  if (entry.suggestion.item.type === "context") {
    return <ContextLinkSheet key={opened} entry={entry} attention={attention} sheets={sheets} onClose={close} />
  }
  return <FollowUpSheet entry={entry} attention={attention} sheets={sheets} onClose={close} />
}

function CardSheet({ card, complication, attention, sheets, onClose }: {
  card: ResolvedCard
  complication: LogEvent
  attention: IntraopAttention
  sheets: PhoneSuggestionSheets
  onClose: () => void
}) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const lang = language === "bg" ? "bg" : "en"
  const [branch, setBranch] = useState<string | null>(null)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [resolveTime, setResolveTime] = useState("")
  const [eventTimes, setEventTimes] = useState<Record<string, string>>({})
  const [inline, setInline] = useState<Inline | null>(null)
  const nowIso = sheets.nowIso
  const write = (ops: Parameters<IntraopAttention["applyOps"]>[0]) => { void attention.applyOps(ops) }
  const name = (label: string) => clinicalDisplayLabel("complication", label, lang, { label })
  const rows = card.rows.filter(row => !row.branches || (branch != null && row.branches.includes(branch)))
  const minutes = Math.max(0, Math.floor((Date.parse(nowIso()) - Date.parse(card.onset)) / 60_000))
  const comp = complication as never
  // Cardiac arrest (10.2.0): doses are tapped as they are given or afterwards,
  // written at once and spread across the arrest when ROSC or Death ends it.
  const isArrest = complication.label === "Cardiac arrest"
  const arrestDrugOf = (row: ResolvedRow): ArrestDrug | null => isArrest && row.def.kind === "drug"
    && (row.def.drug === "Epinephrine / Adrenaline" || row.def.drug === "Amiodarone") ? row.def.drug : null
  const endsArrest = (label: string) => isArrest && (label === "ROSC" || label === "Death (exitus letalis)")
  function writeEvent(row: ResolvedRow, label: string, at: string) {
    const ops = cardEventOps(comp, label, row.id, at, nowIso())
    if (!endsArrest(label)) { write(ops); return }
    const respaced = arrestRespaceOps(attention.log as never, comp, at)
    write({ add: ops.add, update: respaced.update, remove: [] })
  }
  const pill = (tone: "yes" | "no" | "plain") => ({
    minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, justifyContent: "center" as const,
    backgroundColor: shade("#1c1c1c"),
    borderColor: tone === "yes" ? shade("#22c55e66") : tone === "no" ? shade("#ef444466") : shade("#334155"),
  })
  const pillText = (tone: "yes" | "no" | "plain") => ({ color: tone === "yes" ? shade("#86efac") : tone === "no" ? shade("#fca5a5") : shade("#e2e8f0"), fontWeight: "700" as const, fontSize: 13 })

  function typedInstant(value: string): string | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (!match) return null
    const at = new Date(card.onset)
    at.setHours(Number(match[1]), Number(match[2]), 0, 0)
    return Number.isFinite(at.getTime()) ? at.toISOString() : null
  }

  // The row's own controls open under it, inside the card; the same row again folds them away.
  function openInline(id: string, open: () => void) {
    if (inlineSheet.get().id === id) { inlineSheet.fold(); return }
    inlineSheet.activate(id)
    open()
  }

  // A card that closes takes its open controls with it.
  useEffect(() => () => inlineSheet.fold(), [])

  function onRow(row: ResolvedRow) {
    const tag = cardSuggestionTag(complication.label ?? "", row.id)
    const prefill = row.prefill
    switch (row.def.kind) {
      case "drug": if (prefill?.drug) openInline(row.id, () => sheets.openDrug({ name: prefill.drug!, mode: "bolus", amount: prefill.amount, unit: prefill.unit, route: prefill.route, suggestion: tag })); return
      case "infusion": if (prefill?.drug) openInline(row.id, () => sheets.openDrug({ name: prefill.drug!, mode: "infusion", amount: prefill.amount, unit: prefill.unit, suggestion: tag })); return
      case "fluid": openInline(row.id, () => sheets.openFluid({ name: prefill?.fluid, category: prefill?.category, amount: prefill?.amount ?? null, mode: prefill?.mode, suggestion: tag })); return
      case "gas": { const gas = row.def; openInline(row.id, () => sheets.openGas(gas.fio2, gas.fgf, !!gas.stopNitrous, tag)); return }
      case "shock": onClose(); sheets.openShock(tag); return
      case "lab": onClose(); sheets.openLab(); return
      case "airway": onClose(); sheets.openAirway?.(complication); return
      case "deepen": setInline(inline?.row.id === row.id ? null : { kind: "deepen", row }); return
      case "access": setInline(inline?.row.id === row.id ? null : { kind: "access", row }); return
    }
  }

  function body(row: ResolvedRow) {
    const def = row.def
    switch (def.kind) {
      case "relabel":
        return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{def.choices.map(choice => (
          <TouchableOpacity key={choice} testID={`card-relabel-${choice}`} style={pill("plain")} onPress={() => write(cardRelabelOps(comp, choice, row.id))}>
            <Text style={pillText("plain")}>{name(choice)}</Text>
          </TouchableOpacity>))}</View>
      case "alsoLog":
        return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{def.complications.map(choice => (
          <TouchableOpacity key={choice} testID={`card-also-${choice}`} disabled={!!row.used} style={pill("no")} onPress={() => write(cardAlsoLogOps(comp, choice, row.id, nowIso()))}>
            <Text style={pillText("no")}>{name(choice)}</Text>
          </TouchableOpacity>))}</View>
      case "openCard":
        return <TouchableOpacity testID={`card-open-${def.complication}`} disabled={!!row.used} style={[pill("plain"), { marginTop: 6, alignSelf: "flex-start" }]}
          onPress={() => write(cardAlsoLogOps(comp, def.complication, row.id, nowIso()))}><Text style={pillText("plain")}>{tc("sgOpenCard")}</Text></TouchableOpacity>
      case "question":
        return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <Text style={{ color: shade("#cbd5e1"), fontSize: 13 }}>{say(def.prompt, lang)}</Text>
          <TouchableOpacity testID={`card-question-${row.id}`} disabled={!!row.used} style={pill("yes")} onPress={() => write(cardQuestionOps(comp, row.id, def.reveals, def.logs, nowIso()))}>
            <Text style={pillText("yes")}>{tc("sgYes")}</Text>
          </TouchableOpacity>
        </View>
      case "resolve":
        return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <TouchableOpacity testID="card-resolve-now" style={pill("yes")} onPress={() => write(cardResolveOps(comp, nowIso()))}><Text style={pillText("yes")}>{tc("sgNow")}</Text></TouchableOpacity>
          <TextInput value={resolveTime} onChangeText={setResolveTime} placeholder={tc("sgTimePlaceholder")} placeholderTextColor={shade("#64748b")} keyboardType="numbers-and-punctuation"
            style={{ width: 76, minHeight: 40, borderWidth: 1, borderColor: shade("#334155"), borderRadius: 10, color: shade("#f8fafc"), paddingHorizontal: 8 }} />
          <TouchableOpacity disabled={typedInstant(resolveTime) == null} style={pill("plain")} onPress={() => { const at = typedInstant(resolveTime); if (at) write(cardResolveOps(comp, at)) }}>
            <Text style={pillText("plain")}>{tc("sgAt")}</Text>
          </TouchableOpacity>
        </View>
      case "event": {
        // Now, or the time it really happened: an arrest is often charted afterwards.
        const typed = eventTimes[row.id] ?? ""
        return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <TouchableOpacity testID={`card-event-${row.id}`} style={pill("yes")} onPress={() => writeEvent(row, def.label, nowIso())}><Text style={pillText("yes")}>{tc("sgNow")}</Text></TouchableOpacity>
          <TextInput testID={`card-event-time-${row.id}`} value={typed} onChangeText={value => setEventTimes(prev => ({ ...prev, [row.id]: value }))} placeholder={tc("sgTimePlaceholder")} placeholderTextColor={shade("#64748b")} keyboardType="numbers-and-punctuation"
            style={{ width: 76, minHeight: 40, borderWidth: 1, borderColor: shade("#334155"), borderRadius: 10, color: shade("#f8fafc"), paddingHorizontal: 8 }} />
          <TouchableOpacity testID={`card-event-at-${row.id}`} disabled={typedInstant(typed) == null} style={pill("plain")} onPress={() => { const at = typedInstant(typed); if (at) writeEvent(row, def.label, at) }}>
            <Text style={pillText("plain")}>{tc("sgAt")}</Text>
          </TouchableOpacity>
        </View>
      }
      case "stop": {
        const targets = stopRowTargets(row, { log: attention.log as never, patient: attention.suggestions!.patient, preop: attention.suggestions!.preop, complication: comp, tofMonitor: attention.suggestions!.tofMonitor })
        if (targets.length === 0) return <Text style={{ color: shade("#94a3b8"), fontSize: 12, marginTop: 4 }}>{tc("sgNothingRunning")}</Text>
        return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{targets.map(target => (
          <TouchableOpacity key={target.id} testID={`card-stop-${target.id}`} style={pill("no")} onPress={() => sheets.stop(target as LogEvent, cardSuggestionTag(complication.label ?? "", row.id))}>
            <Text style={pillText("no")}>{tc("sgStop")} · {sheets.displayName(target as LogEvent)}</Text>
          </TouchableOpacity>))}</View>
      }
      case "memory":
        return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{def.items.map((item, index) => {
          const key = `${row.id}-${index}`
          return <TouchableOpacity key={key} style={pill(ticked[key] ? "yes" : "plain")} onPress={() => setTicked(prev => ({ ...prev, [key]: !prev[key] }))}>
            <Text style={pillText(ticked[key] ? "yes" : "plain")}>{ticked[key] ? "✓ " : ""}{say(item, lang)}</Text>
          </TouchableOpacity>
        })}</View>
      default:
        return null
    }
  }

  const opensSheet = (row: ResolvedRow) => ["drug", "infusion", "fluid", "gas", "shock", "lab", "deepen", "access", "airway"].includes(row.kind)

  return (
    <Sheet visible onClose={onClose} title={name(card.complication)} full allowInline={false} footer={
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity testID="suggestion-card-not-now" style={[pill("no"), { flex: 1, alignItems: "center" }]} onPress={() => { write(cardCloseOps(comp, "not_now", nowIso())); onClose() }}>
          <Text style={pillText("no")}>{tc("vitalNotNow")}</Text>
        </TouchableOpacity>
        {card.kind === "checklist" && (
          <TouchableOpacity testID="suggestion-card-done" style={[pill("yes"), { flex: 1, alignItems: "center" }]} onPress={() => { write(cardCloseOps(comp, "done", nowIso())); onClose() }}>
            <Text style={pillText("yes")}>{tc("sgDone")}</Text>
          </TouchableOpacity>
        )}
      </View>
    }>
      <View testID="suggestion-card">
        {card.redStrip && (
          <View testID="suggestion-card-strip" style={{ backgroundColor: colors.danger, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 10 }}>
            <Text style={{ color: shade("#ffffff"), fontWeight: "800" }}>{tc("sgSinceOnset").replace("{minutes}", String(minutes))}</Text>
          </View>
        )}
        <Text style={{ color: shade("#94a3b8"), fontSize: 13, marginBottom: 8 }}>
          {sheets.clockOf(card.onset)}{card.question ? ` · ${say(card.question, lang)}` : ""}
        </Text>
        {card.branches && (
          <View style={{ marginBottom: 10 }}>
            {card.branches.prompt ? <Text style={{ color: shade("#94a3b8"), fontSize: 12, marginBottom: 4 }}>{say(card.branches.prompt, lang)}</Text> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{card.branches.options.map(option => (
              <TouchableOpacity key={option.id} testID={`card-branch-${option.id}`} style={pill(branch === option.id ? "yes" : "plain")} onPress={() => setBranch(option.id)}>
                <Text style={pillText(branch === option.id ? "yes" : "plain")}>{say(option.title, lang)}</Text>
              </TouchableOpacity>))}</View>
          </View>
        )}
        {rows.map(row => {
          const prefill = row.prefill && row.prefill.amount !== "catalogue"
            ? row.prefill.amount == null ? tc("sgNoDose") : `${row.prefill.amount} ${row.prefill.unit ?? ""}`.trim()
            : null
          const detail = [prefill,
            row.step ? tc("sgStep").replace("{index}", String(row.step.index + 1)).replace("{of}", String(row.step.of)) : null,
            row.total ? tc("sgTotal").replace("{amount}", String(row.total.amount)).replace("{max}", String(row.total.max)).replace("{unit}", row.total.unit) : null,
          ].filter(Boolean).join(" · ")
          const head = (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, marginTop: 1, borderWidth: 1, alignItems: "center", justifyContent: "center",
                backgroundColor: row.used ? colors.success : "transparent", borderColor: row.used ? colors.success : shade("#475569") }}>
                {row.used ? <Text style={{ color: shade("#ffffff"), fontSize: 12, fontWeight: "900" }}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: shade("#f1f5f9"), fontSize: 15, fontWeight: "700" }}>{say(row.title, lang)}</Text>
                {detail ? <Text style={{ color: shade("#94a3b8"), fontSize: 13 }}>{detail}</Text> : null}
                {row.used ? <Text testID={`card-used-${row.id}`} style={{ color: shade("#86efac"), fontSize: 13 }}>
                  ✓ {[row.used.lastAmount ? `${row.used.lastAmount} ${row.used.lastUnit ?? ""}`.trim() : null, sheets.clockOf(row.used.lastTs), row.used.count > 1 ? `×${row.used.count}` : null].filter(Boolean).join(" · ")}
                </Text> : null}
                {row.note ? <Text style={{ color: shade("#94a3b8"), fontSize: 12, fontStyle: "italic" }}>{say(row.note, lang)}</Text> : null}
              </View>
            </View>
          )
          return (
            <View key={row.id} testID={`card-row-${row.id}`} style={{ borderWidth: 1, borderColor: shade("#262626"), borderRadius: 12, padding: 10, marginBottom: 8 }}>
              {opensSheet(row) && !arrestDrugOf(row) ? <TouchableOpacity testID={`card-row-open-${row.id}`} onPress={() => onRow(row)} style={{ minHeight: 44 }}>{head}</TouchableOpacity> : head}
              {arrestDrugOf(row) && attention.suggestions ? (
                <TouchableOpacity testID={`card-arrest-give-${row.id}`} style={[pill("yes"), { marginTop: 6, alignSelf: "flex-start" }]}
                  onPress={() => write(arrestQuickDoseOps(attention.log as never, comp, arrestDrugOf(row)!, attention.suggestions!.patient, nowIso(), cardSuggestionTag(complication.label ?? "", row.id)))}>
                  <Text style={pillText("yes")}>{tc("sgGive")}</Text>
                </TouchableOpacity>
              ) : null}
              {body(row)}
              <InlineSheetSlot id={row.id} />
              {row.def.kind === "drug" && row.def.drug === "Dantrolene" && attention.suggestions ? (
                <DantroleneVials
                  initialPerKg={dantroleneDosesMg(attention.log as never, comp, attention.suggestions.now).length > 0 ? 1 : 2.5}
                  viewFor={perKg => dantroleneCardVials(attention.log as never, comp, { patient: attention.suggestions!.patient, now: attention.suggestions!.now, dantroleneVialsMg: attention.suggestions!.settings.dantroleneVialsMg }, perKg)}
                  onGive={doseMg => { onClose(); sheets.openDrug({ name: "Dantrolene", mode: "bolus", amount: doseMg, unit: "mg", suggestion: cardSuggestionTag(complication.label ?? "", row.id) }) }} />
              ) : null}
              {inline?.row.id === row.id && inline.kind === "deepen" && (() => {
                const targets = sheets.deepenTargets()
                if (targets.length === 0) return <Text style={{ color: shade("#94a3b8"), fontSize: 12, marginTop: 6 }}>{tc("sgDeepenNothing")}</Text>
                return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{targets.map(target => (
                  <TouchableOpacity key={target.key} style={pill("plain")} onPress={() => { onClose(); target.open() }}><Text style={pillText("plain")}>{target.label}</Text></TouchableOpacity>))}</View>
              })()}
              {inline?.row.id === row.id && inline.kind === "access" && row.def.kind === "access" && (() => {
                const access = row.def.access
                const lines = sheets.linesOf?.(access).filter(line => !line.failed) ?? []
                return <View style={{ marginTop: 6, gap: 6 }}>
                  {lines.length > 0 ? <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{tc("sgWhichFailed")}</Text> : null}
                  {lines.map(line => (
                    <TouchableOpacity key={line.id} testID={`suggestion-line-failed-${line.id}`} style={pill("no")} onPress={() => sheets.markLineFailed?.(line.id, nowIso())}>
                      <Text style={pillText("no")}>{tc("sgMarkFailed")} · {line.label}</Text>
                    </TouchableOpacity>))}
                  <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{tc("sgNewLine")}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{accessEventLabels(access).map(label => (
                    <TouchableOpacity key={label} testID={`suggestion-new-line-${label}`} style={pill("yes")} onPress={() => { write(cardEventOps(comp, label, row.id, nowIso(), nowIso())); setInline(null) }}>
                      <Text style={pillText("yes")}>{resolveIntraopEventLabel(label, lang)}</Text>
                    </TouchableOpacity>))}</View>
                </View>
              })()}
            </View>
          )
        })}
      </View>
    </Sheet>
  )
}

function FollowUpSheet({ entry, attention, sheets, onClose }: {
  entry: IntraopAttention["items"][number]
  attention: IntraopAttention
  sheets: PhoneSuggestionSheets
  onClose: () => void
}) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const lang = language === "bg" ? "bg" : "en"
  const item = entry.suggestion!.item
  const tag = `${item.type}:${entry.key}`
  const button = { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: shade("#22c55e66"), backgroundColor: shade("#1c1c1c"), justifyContent: "center" as const }
  const label = { color: shade("#86efac"), fontWeight: "800" as const, fontSize: 14 }
  const drug = (name: string, amount: number | "catalogue" | null = "catalogue", unit?: string) => () => { onClose(); sheets.openDrug({ name, mode: "bolus", amount, unit, suggestion: tag }) }
  const offers: { key: string; text: string; onPress: () => void; testID?: string }[] = []
  if (item.type === "timer") {
    const dose = item.timer.dose
    if (dose?.drug) offers.push({ key: "give", text: tc("sgGive"), onPress: drug(dose.drug, dose.amount, dose.unit), testID: "follow-up-give" })
    else if (dose?.fluid) offers.push({ key: "give", text: tc("sgGive"), testID: "follow-up-give", onPress: () => { onClose(); sheets.openFluid({ name: dose.fluid, amount: dose.amount, mode: dose.mode, suggestion: tag }) } })
    if (item.timer.site != null || item.timer.kind.startsWith("tourniquet")) {
      offers.push({ key: "off", text: tc("sgTourniquetOff"), testID: "follow-up-tourniquet-off", onPress: () => {
        const at = sheets.nowIso()
        void attention.applyOps({ add: [{ id: `sg-tourniquet-off-${Date.parse(at)}`, ts: at, type: "clinical_event", label: "Tourniquet off", ...(item.timer.site ? { site: item.timer.site } : {}), suggestion: tag, recordedAt: at }], update: [], remove: [] })
        onClose()
      } })
    }
  } else if (item.type === "reminder") {
    if (item.reminder.kind === "ponv") offers.push({ key: "ponv", text: tc("sgGive"), onPress: drug("Ondansetron") })
    else offers.push({ key: "lab", text: tc("suggestionOpen"), onPress: () => { onClose(); sheets.openLab() } })
  } else if (item.type === "lab") {
    offers.push({ key: "fib", text: clinicalDisplayLabel("option:INTRAOP_DRUG", "Fibrinogen concentrate", lang, { label: "Fibrinogen concentrate" }), onPress: drug("Fibrinogen concentrate") })
    offers.push({ key: "cryo", text: clinicalDisplayLabel("option:INTRAOP_FLUID", "Cryoprecipitate", lang, { label: "Cryoprecipitate" }), onPress: () => { onClose(); sheets.openFluid({ name: "Cryoprecipitate", amount: "catalogue", suggestion: tag }) } })
  } else if (item.type === "reading") {
    offers.push({ key: "sug", text: clinicalDisplayLabel("option:INTRAOP_DRUG", "Sugammadex", lang, { label: "Sugammadex" }), onPress: drug("Sugammadex") })
    offers.push({ key: "neo", text: clinicalDisplayLabel("option:INTRAOP_DRUG", "Neostigmine", lang, { label: "Neostigmine" }), onPress: drug("Neostigmine") })
  }
  return (
    <Sheet visible onClose={onClose} title={intraopAttentionText(entry, language)} allowInline={false} footer={
      <TouchableOpacity testID="follow-up-not-now" onPress={() => { void attention.resolve(entry.key, "not_now"); onClose() }}
        style={{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: shade("#ef444466"), alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: shade("#fca5a5"), fontWeight: "700" }}>{tc("vitalNotNow")}</Text>
      </TouchableOpacity>
    }>
      <View testID="suggestion-follow-up" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {offers.map(offer => (
          <TouchableOpacity key={offer.key} testID={offer.testID} style={button} onPress={offer.onPress}><Text style={label}>{offer.text}</Text></TouchableOpacity>
        ))}
      </View>
    </Sheet>
  )
}
