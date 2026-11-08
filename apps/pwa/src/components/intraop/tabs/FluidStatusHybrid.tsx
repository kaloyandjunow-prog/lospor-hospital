import { useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import type { FluidStatusTabProps, FluidStatusTotalRow } from "@/components/intraop/tabs/FluidStatusTab"
import { ClinicalNumberInput } from "@/components/ClinicalNumberInput"
import { useShade } from "@/theme/shade"
import { useIntraopHeaderScroll } from "../IntraopHeaderCollapse"
import { OverflowCueScrollView } from "../OverflowCueScrollView"

/**
 * The default fluid screen: a compact summary first, with drill-down groups.
 * Timetable totals deliberately have no edit affordance. Urine and blood loss
 * are clinician measurements, so they are the only values that can be edited.
 */
export function FluidStatusHybrid({
  infusionTotals, bolusTotals, weightNote,
  crystalloidsMl, colloidsMl, bloodMl, infusionsMl = null,
  urinaryCatheter, urineMl, setUrineMl, bloodLossMl, setBloodLossMl, tc,
  provisional = false,
}: FluidStatusTabProps) {
  const shade = useShade()
  const { onScroll, scrollEventThrottle } = useIntraopHeaderScroll()
  const [open, setOpen] = useState<"given" | "output" | "losses" | null>(null)
  const [editing, setEditing] = useState<"urine" | "blood" | null>(null)
  const totalIn = [crystalloidsMl, colloidsMl, bloodMl, infusionsMl].every(value => value == null)
    ? null
    : [crystalloidsMl, colloidsMl, bloodMl, infusionsMl].reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const totalOut = urinaryCatheter ? urineMl : null
  const netBalance = totalIn == null || (totalOut == null && bloodLossMl == null)
    ? null
    : totalIn - (totalOut ?? 0) - (bloodLossMl ?? 0)

  const toggle = (group: "given" | "output" | "losses") => setOpen(current => current === group ? null : group)
  const rowValue = (value: number | null) => value == null ? tc("fluidNotMeasured") : `${value} mL`

  return (
    <OverflowCueScrollView style={{ flex: 1 }} scrollViewStyle={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}>
      <View testID="fluid-summary" style={{ marginBottom: 14, padding: 14, borderRadius: 14, backgroundColor: shade("#132033"), borderWidth: 1, borderColor: shade("#25405a") }}>
        <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>{tc("fluidRecordedHint")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <SummaryMetric testID="fluid-total-in" label={tc("fluidInputLabel")} value={rowValue(totalIn)} tint={shade("#22d3ee")} />
          <SummaryMetric label={tc("fluidOutputLabel")} value={rowValue(totalOut)} tint={shade("#a78bfa")} />
          <SummaryMetric label={tc("fluidBloodLossLabel")} value={rowValue(bloodLossMl)} tint={shade("#fb7185")} />
          <SummaryMetric label={tc("fluidNetBalanceLabel")} value={rowValue(netBalance)} tint={shade("#f8fafc")} />
        </View>
      </View>

      <SummaryGroup
        testID="fluid-given-toggle"
        label={tc("fluidInputLabel")}
        open={open === "given"}
        onPress={() => toggle("given")}
        tint={shade("#22d3ee")}
        expandLabel={tc("fluidExpandDetails")}
        collapseLabel={tc("fluidCollapseDetails")}
      >
        {[
          [tc("crystalloidsLabel"), crystalloidsMl],
          [tc("colloidsLabel"), colloidsMl],
          [tc("bloodProductsLabel"), bloodMl],
          [tc("drugInfusionsLabel"), infusionsMl],
        ].map(([label, value]) => <ReadOnlyRow key={String(label)} label={String(label)} value={rowValue(value as number | null)} shade={shade} />)}
        {infusionTotals.length > 0 && (
          <ReadOnlyList title={`${provisional ? "≈ " : ""}${tc("infusionTotalsLabel")}`} rows={infusionTotals} weightNote={weightNote} shade={shade} />
        )}
        {bolusTotals.length > 0 && <ReadOnlyList title={`${provisional ? "≈ " : ""}${tc("bolusTotalsLabel")}`} rows={bolusTotals} shade={shade} />}
      </SummaryGroup>

      <SummaryGroup
        testID="fluid-output-toggle"
        label={tc("fluidOutputLabel")}
        open={open === "output"}
        onPress={() => toggle("output")}
        tint={shade("#a78bfa")}
        expandLabel={tc("fluidExpandDetails")}
        collapseLabel={tc("fluidCollapseDetails")}
      >
        {urinaryCatheter ? (
          editing === "urine" ? (
            <EditableMeasurement
              testID="fluid-urine-editor"
              label={tc("urineOutputLabel")}
              value={urineMl}
              onChange={value => setUrineMl(value ?? null)}
              onDone={() => setEditing(null)}
              doneLabel={tc("fluidDoneLabel")}
              shade={shade}
            />
          ) : (
            <EditableRow testID="fluid-edit-urine" label={tc("urineOutputLabel")} value={rowValue(urineMl)} editLabel={tc("fluidEditLabel")} onPress={() => setEditing("urine")} shade={shade} />
          )
        ) : <Text style={{ color: shade("#94a3b8"), fontSize: 12, lineHeight: 18 }}>{tc("fluidNoCatheterHint")}</Text>}
      </SummaryGroup>

      <SummaryGroup
        testID="fluid-losses-toggle"
        label={tc("fluidBloodLossLabel")}
        open={open === "losses"}
        onPress={() => toggle("losses")}
        tint={shade("#fb7185")}
        expandLabel={tc("fluidExpandDetails")}
        collapseLabel={tc("fluidCollapseDetails")}
      >
        {editing === "blood" ? (
          <EditableMeasurement
            testID="fluid-blood-loss-editor"
            label={tc("bloodLossLabel")}
            value={bloodLossMl}
            onChange={value => setBloodLossMl(value ?? null)}
            onDone={() => setEditing(null)}
            doneLabel={tc("fluidDoneLabel")}
            shade={shade}
          />
        ) : (
          <EditableRow testID="fluid-edit-blood-loss" label={tc("bloodLossLabel")} value={rowValue(bloodLossMl)} editLabel={tc("fluidEditLabel")} onPress={() => setEditing("blood")} shade={shade} />
        )}
        <Text style={{ color: shade("#64748b"), fontSize: 10, fontStyle: "italic", marginTop: 8 }}>{tc("bloodLossOptionalHint")}</Text>
      </SummaryGroup>
    </OverflowCueScrollView>
  )
}

function SummaryMetric({ testID, label, value, tint }: { testID?: string; label: string; value: string; tint: string }) {
  const shade = useShade()
  return (
    <View testID={testID} style={{ flexGrow: 1, minWidth: "45%", padding: 9, borderRadius: 10, backgroundColor: shade("#0b111b"), borderWidth: 1, borderColor: shade("#1e2d40") }}>
      <Text style={{ color: tint, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: shade("#f8fafc"), fontSize: 17, fontWeight: "800", marginTop: 3, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  )
}

function SummaryGroup({ testID, label, open, onPress, tint, expandLabel, collapseLabel, children }: {
  testID: string
  label: string
  open: boolean
  onPress: () => void
  tint: string
  expandLabel: string
  collapseLabel: string
  children: React.ReactNode
}) {
  const shade = useShade()
  return (
    <View style={{ marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: shade("#1e2d40"), overflow: "hidden" }}>
      <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={`${label}. ${open ? collapseLabel : expandLabel}`} accessibilityState={{ expanded: open }} onPress={onPress} style={{ minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: shade("#0f1621"), flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ color: tint, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={shade("#94a3b8")} accessibilityElementsHidden />
      </TouchableOpacity>
      {open && <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: shade("#0b111b") }}>{children}</View>}
    </View>
  )
}

function ReadOnlyRow({ label, value, shade }: { label: string; value: string; shade: (hex: string) => string }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: shade("#16202e") }}>
    <Text style={{ color: shade("#cbd5e1"), fontSize: 13, fontWeight: "600", flex: 1 }}>{label}</Text>
    <Text style={{ color: shade("#93c5fd"), fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{value}</Text>
  </View>
}

function ReadOnlyList({ title, rows, weightNote, shade }: { title: string; rows: FluidStatusTotalRow[]; weightNote?: string | null; shade: (hex: string) => string }) {
  return <View style={{ marginTop: 12 }}>
    <Text style={{ color: shade("#64748b"), fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 }}>{title}</Text>
    {rows.map(row => <ReadOnlyRow key={`${row.name}-${row.unit}`} label={`${row.name}${row.count != null && row.count > 1 ? `  ×${row.count}` : ""}`} value={`${row.display ?? `${row.total} ${row.unit}`}${row.weightUsed != null ? " †" : ""}${row.mgTotal != null ? `  (${row.mgTotal} mg)` : ""}`} shade={shade} />)}
    {weightNote && <Text style={{ color: shade("#475569"), fontSize: 10, fontStyle: "italic", marginTop: 6 }}>{weightNote}</Text>}
  </View>
}

function EditableRow({ testID, label, value, editLabel, onPress, shade }: { testID: string; label: string; value: string; editLabel: string; onPress: () => void; shade: (hex: string) => string }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
    <View style={{ flex: 1 }}><Text style={{ color: shade("#cbd5e1"), fontSize: 13, fontWeight: "600" }}>{label}</Text><Text style={{ color: shade("#f8fafc"), fontSize: 15, fontWeight: "800", marginTop: 3 }}>{value}</Text></View>
    <TouchableOpacity testID={testID} accessibilityRole="button" onPress={onPress} style={{ minWidth: 64, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: shade("#36506a") }}><Text style={{ color: shade("#7dd3fc"), fontSize: 12, fontWeight: "800" }}>{editLabel}</Text></TouchableOpacity>
  </View>
}

function EditableMeasurement({ testID, label, value, onChange, onDone, doneLabel, shade }: { testID: string; label: string; value: number | null; onChange: (value: number | null) => void; onDone: () => void; doneLabel: string; shade: (hex: string) => string }) {
  return <View testID={testID}>
    <Text style={{ color: shade("#cbd5e1"), fontSize: 13, fontWeight: "700", marginBottom: 8 }}>{label}</Text>
    <ClinicalNumberInput value={value} onChange={onChange} unit="mL" min={0} max={20000} step={50} quickValues={[100, 250, 500, 1000]} />
    <TouchableOpacity testID={`${testID}-done`} accessibilityRole="button" onPress={onDone} style={{ alignSelf: "flex-end", minWidth: 64, minHeight: 38, marginTop: 8, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: shade("#164e63") }}><Text style={{ color: shade("#ecfeff"), fontSize: 12, fontWeight: "800" }}>{doneLabel}</Text></TouchableOpacity>
  </View>
}
