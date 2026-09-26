import { useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { Sheet } from "./Sheet"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

export type EndCaseStopContext = {
  endTs: string
  administeredVolumeMl?: number
}

export type EndCaseCleanupItem = {
  key: string
  label: string
  sublabel: string
  color: string
  onStop: (context?: EndCaseStopContext) => void | Promise<void>
  fluidVolume?: {
    mode: "VOLUME" | "RATE"
    atEnd: (endTs: string) => number
  }
}

/** An entry dated after the end (a planned item): it must be resolved before finalising. */
export type EndCaseAfterEndItem = { id: string; label: string; time: string; color: string }

type Props = {
  visible: boolean
  onClose: () => void
  items: EndCaseCleanupItem[]
  afterEnd?: EndCaseAfterEndItem[]
  /** "delete": it did not happen. "move": it happened, by the end time. */
  onResolveAfterEnd?: (id: string, resolution: "delete" | "move") => void
  decisions: Record<string, "stop" | "continue">
  continueLabel: string
  onDecision: (key: string, decision: "stop" | "continue") => void
  onFinalize: (continuedItems: string[], endTs: string) => void
}

export function EndCaseSheet({
  visible,
  onClose,
  items,
  afterEnd = [],
  onResolveAfterEnd,
  decisions,
  continueLabel,
  onDecision,
  onFinalize,
}: Props) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [fluidActualVolumes, setFluidActualVolumes] = useState<Record<string, string>>({})
  const allDecided = items.length === 0 || items.every(item => !!decisions[item.key])
  const endedFluidVolumesValid = items.every(item => {
    if (!decisions[item.key] || !item.fluidVolume) return true
    const edited = fluidActualVolumes[item.key]
    return edited === undefined || (edited.trim() !== "" && Number.isFinite(Number(edited)) && Number(edited) >= 0)
  })
  // Nothing may remain after the end (1.4.9).
  const canFinalize = allDecided && endedFluidVolumesValid && afterEnd.length === 0

  function close() {
    setFluidActualVolumes({})
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={close} title={tc("endCaseTitle")} full>
      <Text style={{ color:shade("#94a3b8"), fontSize:13, marginBottom:16 }}>
        {items.length === 0
          ? tc("endCaseReady")
          : tc("endCaseChoose")}
      </Text>
      {items.map(item => {
        const dec = decisions[item.key]
        return (
          <View key={item.key} style={{ marginBottom:10,
            backgroundColor:item.color+"1a", borderRadius:12, padding:12,
            borderWidth:1, borderColor:item.color+"44" }}>
            <View style={{ marginBottom:8 }}>
              <Text style={{ color:item.color, fontWeight:"700" }}>{item.label}</Text>
              <Text style={{ color:shade("#94a3b8"), fontSize:11 }}>{item.sublabel}</Text>
            </View>
            {dec === "stop" && item.fluidVolume ? (
              <View style={{ marginBottom:10 }}>
                <Text style={{ color:shade("#94a3b8"), fontSize:11, marginBottom:5 }}>
                  {item.fluidVolume.mode === "RATE" ? tc("calculatedPumpActual") : tc("actualAdministeredVolume")}
                </Text>
                <TextInput
                  testID={`end-case-fluid-actual-${item.key}`}
                  value={fluidActualVolumes[item.key] ?? String(item.fluidVolume.atEnd(new Date().toISOString()))}
                  onChangeText={value => setFluidActualVolumes(current => ({ ...current, [item.key]: value }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={formatMessage(tc("actualVolumeAccessibility"), { name: item.label })}
                  style={{ backgroundColor:shade("#111111"), color:shade("#fff"), borderRadius:9, paddingHorizontal:11,
                    paddingVertical:9, borderWidth:1, borderColor:item.color+"55", fontSize:16 }}
                />
                <Text style={{ color:shade("#64748b"), fontSize:10, marginTop:4 }}>mL</Text>
              </View>
            ) : null}
            <View style={{ flexDirection:"row", gap:8 }}>
              <TouchableOpacity
                onPress={() => onDecision(item.key, "stop")}
                style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                  backgroundColor: dec === "stop" ? shade("#2a0a0a") : shade("#1c1c1c"),
                  borderWidth:1, borderColor: dec === "stop" ? shade("#ef4444") : shade("#ef444433") }}>
                <Text style={{ color: dec === "stop" ? shade("#ef4444") : shade("#64748b"),
                  fontWeight:"700", fontSize:13 }}>{tc("stopLabel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDecision(item.key, "continue")}
                style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                  backgroundColor: dec === "continue" ? shade("#0a1f2a") : shade("#1c1c1c"),
                  borderWidth:1, borderColor: dec === "continue" ? shade("#38bdf8") : shade("#38bdf833") }}>
                <Text style={{ color: dec === "continue" ? shade("#38bdf8") : shade("#64748b"),
                  fontWeight:"700", fontSize:13 }}>{tc("continuePostopShort")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })}
      {afterEnd.length > 0 && (
        <View testID="end-case-after-end" style={{ marginTop:6, marginBottom:10 }}>
          <Text style={{ color:shade("#fbbf24"), fontWeight:"700", fontSize:13 }}>{tc("endCaseAfterEndTitle")}</Text>
          <Text style={{ color:shade("#94a3b8"), fontSize:11, marginBottom:8 }}>{tc("endCaseAfterEndHint")}</Text>
          {afterEnd.map(entry => (
            <View key={entry.id} style={{ marginBottom:8, backgroundColor:entry.color+"14", borderRadius:10, padding:10,
              borderWidth:1, borderStyle:"dashed", borderColor:entry.color+"66" }}>
              <Text style={{ color:entry.color, fontWeight:"700", marginBottom:6 }}>{entry.time} · {entry.label}</Text>
              <View style={{ flexDirection:"row", gap:8 }}>
                <TouchableOpacity testID={`end-case-after-end-delete-${entry.id}`} onPress={() => onResolveAfterEnd?.(entry.id, "delete")}
                  style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center", backgroundColor:shade("#1c1c1c"), borderWidth:1, borderColor:shade("#ef444455") }}>
                  <Text style={{ color:shade("#f87171"), fontWeight:"700", fontSize:13 }}>{tc("endCaseDidntHappen")}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`end-case-after-end-move-${entry.id}`} onPress={() => onResolveAfterEnd?.(entry.id, "move")}
                  style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center", backgroundColor:shade("#1c1c1c"), borderWidth:1, borderColor:shade("#22c55e55") }}>
                  <Text style={{ color:shade("#86efac"), fontWeight:"700", fontSize:13 }}>{tc("endCaseHappened")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <Text style={{ color:shade("#fbbf24"), fontSize:11 }}>{tc("endCaseFinaliseBlocked")}</Text>
        </View>
      )}
      {allDecided && (
        <TouchableOpacity
          testID="end-case-finalize"
          disabled={!canFinalize}
          onPress={async () => {
            const endTs = new Date().toISOString()
            // Run all stops concurrently instead of one full round-trip at a
            // time — each item's local optimistic update no longer needs to
            // wait for the previous item's network save to finish.
            // Only items marked "stop" get a stop, at the end time. Items continued
            // postoperatively keep running; the chart and every total stop at the end.
            await Promise.all(items.filter(item => decisions[item.key] === "stop").map(item => {
              if (!item.fluidVolume) return item.onStop({ endTs })
              const edited = fluidActualVolumes[item.key]
              const administeredVolumeMl = edited === undefined
                ? item.fluidVolume.atEnd(endTs)
                : Number(edited)
              return item.onStop({ endTs, administeredVolumeMl })
            }))
            const continued = items
              .filter(item => decisions[item.key] === "continue")
              .map(item => `${item.label} (${item.sublabel})`)
            setFluidActualVolumes({})
            onFinalize(continued, endTs)
          }}
          style={{ marginTop:8, backgroundColor:canFinalize ? shade("#1a2e1a") : shade("#1c1c1c"), borderRadius:12,
            padding:18, alignItems:"center", borderWidth:1, borderColor:shade("#22c55e") }}>
          <Text style={{ color:shade("#86efac"), fontWeight:"700", fontSize:16 }}>
            {continueLabel}
          </Text>
        </TouchableOpacity>
      )}
    </Sheet>
  )
}
