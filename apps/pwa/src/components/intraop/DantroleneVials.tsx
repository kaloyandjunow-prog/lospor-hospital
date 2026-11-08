import { useMemo, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { SvgXml } from "react-native-svg"
import { vialDimensions, vialSvg, type DantroleneVialsView } from "@lospor/core/intraop-suggestions"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * The dantrolene vials on the MH card (10.2.0): the dose in hand, the vials to
 * open for it drawn as glass vials, and how many have been opened in all. The
 * dose steps in mg/kg and the vials refill and rearrange as it moves; the mix
 * is the fewest vials from what the hospital stocks (Core). Give opens the
 * dantrolene sheet with the dose; nothing is charted here.
 */
export function DantroleneVials({ viewFor, initialPerKg, onGive }: {
  viewFor: (perKg: number) => DantroleneVialsView | null
  initialPerKg: number
  onGive: (doseMg: number) => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [perKg, setPerKg] = useState(initialPerKg)
  const view = useMemo(() => viewFor(perKg), [viewFor, perKg])
  const step = (delta: number) => setPerKg(current => Math.min(10, Math.max(0.5, Math.round((current + delta) * 10) / 10)))
  if (!view) return null
  const wasteMg = Math.round((view.plan.totalMg - view.doseMg) * 10) / 10
  const vials = (count: number) => tc(count === 1 ? "vlVialOne" : "vlVialMany").replace("{count}", String(count))
  const stepButton = (label: string, delta: number, testID: string, a11y: string) => (
    <TouchableOpacity testID={testID} accessibilityLabel={a11y} onPress={() => step(delta)}
      style={{ width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: shade("#334155"), backgroundColor: shade("#1c1c1c") }}>
      <Text style={{ color: shade("#f1f5f9"), fontSize: 20, fontWeight: "800" }}>{label}</Text>
    </TouchableOpacity>
  )
  return (
    <View testID="dantrolene-vials" style={{ marginTop: 8, maxHeight: 560, flexShrink: 1, padding: 12, borderRadius: 12, backgroundColor: shade("#0f0f0f"), borderWidth: 1, borderColor: shade("#262626") }}>
      <ScrollView testID="vials-scroll" nestedScrollEnabled style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {stepButton("−", -0.5, "vials-dec", tc("vlLess"))}
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: shade("#f1f5f9"), fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
              <Text testID="vials-per-kg">{perKg.toFixed(1)}</Text><Text style={{ fontSize: 13, color: shade("#94a3b8") }}> mg/kg</Text>
            </Text>
            <Text testID="vials-dose" style={{ color: shade("#cbd5e1"), fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{view.doseMg} mg</Text>
          </View>
          {stepButton("+", 0.5, "vials-inc", tc("vlMore"))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 8, minHeight: 96, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: shade("#141414"), borderBottomWidth: 3, borderBottomColor: shade("#2a2a2a") }}>
          {view.drawing.map((vial, index) => {
            const { w, h } = vialDimensions(vial.size)
            return <SvgXml key={index} testID="dantrolene-vial" xml={vialSvg(vial.size, vial.used)} width={w} height={h} />
          })}
        </View>
        <Text testID="vials-plan" style={{ color: shade("#f1f5f9"), fontSize: 15, fontWeight: "800" }}>
          {view.plan.vials.map(item => `${item.count} × ${item.size} mg`).join("  +  ")}
        </Text>
        <Text testID="vials-detail" style={{ color: shade("#94a3b8"), fontSize: 12 }}>
          {vials(view.plan.count)} · {tc("vlOpened").replace("{mg}", String(view.plan.totalMg))} · {wasteMg > 0 ? tc("vlLeft").replace("{mg}", String(wasteMg)) : tc("vlNoneLeft")}
        </Text>
        <Text testID="vials-so-far" style={{ color: shade("#94a3b8"), fontSize: 12 }}>
          {view.openedVials > 0 ? tc("vlSoFar").replace("{vials}", vials(view.openedVials)).replace("{mg}", String(view.givenMg)) : tc("vlSoFarNone")}
        </Text>
        <Text testID="vials-total" style={{ color: view.reachesNoteAt10 ? shade("#fbbf24") : shade("#94a3b8"), fontSize: 12, fontWeight: view.reachesNoteAt10 ? "700" : "400" }}>
          {view.reachesNoteAt10 ? tc("vlNote") : tc("vlTotal").replace("{value}", String(view.afterMgPerKg))}
        </Text>
      </ScrollView>
      <View style={{ paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: shade("#262626") }}>
        <TouchableOpacity testID="vials-give" onPress={() => onGive(view.doseMg)}
          style={{ minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: shade("#f59e0b") }}>
          <Text style={{ color: shade("#1a1206"), fontWeight: "800", fontSize: 15 }}>{tc("vlGive").replace("{mg}", String(view.doseMg))}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
