import { View, Text, ScrollView } from "react-native"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { ClinicalNumberInput } from "@/components/ClinicalNumberInput"

export type FluidStatusTotalRow = {
  name: string
  total: number
  unit: string
  count?: number
  mgTotal?: number | null
  weightUsed?: number | null
}

/**
 * What has gone in, what has come out, and what was lost.
 *
 * The totals are projections of the timetable, computed by the same Core
 * functions the web form uses and with the same arguments — the institution's
 * configured infusion weight basis, and delivered volume rather than the stored
 * `volume` string, which is only written when a fluid stops. An earlier version
 * of this comment claimed the two surfaces could not drift while the tab was in
 * fact summing that stale field, so a running crystalloid read as 0 mL here and
 * correctly on web. Calling "a Core function" is not sufficient; it has to be
 * the same one, with the same inputs.
 *
 * Urine, blood loss and the blood products note are the figures only the
 * anaesthetist can state, and are the only editable controls here.
 */
export function FluidStatusTab({
  infusionTotals, bolusTotals, weightNote,
  crystalloidsMl, colloidsMl, bloodMl,
  urinaryCatheter,
  urineMl, setUrineMl,
  bloodLossMl, setBloodLossMl,
  tc,
}: {
  infusionTotals: FluidStatusTotalRow[]
  bolusTotals: FluidStatusTotalRow[]
  weightNote: string | null
  crystalloidsMl: number | null
  colloidsMl: number | null
  bloodMl: number | null
  urinaryCatheter: boolean
  // Both are persisted when the tab is left, the same way premedication is,
  // so there is no save control here.
  urineMl: number | null
  setUrineMl: (value: number | null) => void
  bloodLossMl: number | null
  setBloodLossMl: (value: number | null) => void
  tc: (key: ClinicalStringKey) => string
}) {
  const given: { label: string; value: number | null; color: string }[] = [
    { label: tc("crystalloidsLabel"), value: crystalloidsMl, color: "#22d3ee" },
    { label: tc("colloidsLabel"),     value: colloidsMl,     color: "#a78bfa" },
    { label: tc("bloodProductsLabel"), value: bloodMl,       color: "#fb7185" },
  ]

  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {infusionTotals.length > 0 && (
        <View style={{ marginBottom:24 }}>
          <SectionLabel>{tc("infusionTotalsLabel")}</SectionLabel>
          {infusionTotals.map(row => (
            <TotalRow key={`${row.name}-${row.unit}`} row={row} />
          ))}
          {weightNote && (
            <Text style={{ color:"#475569", fontSize:10, fontStyle:"italic", marginTop:6 }}>{weightNote}</Text>
          )}
        </View>
      )}

      {bolusTotals.length > 0 && (
        <View style={{ marginBottom:24 }}>
          <SectionLabel>{tc("bolusTotalsLabel")}</SectionLabel>
          {bolusTotals.map(row => (
            <TotalRow key={`${row.name}-${row.unit}`} row={row} />
          ))}
        </View>
      )}

      <View style={{ marginBottom:24 }}>
        <SectionLabel>{tc("fluidBalanceLabel")}</SectionLabel>
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
          {given.map(({ label, value, color }) => (
            <View key={label} style={{
              flexGrow:1, flexBasis:"30%", paddingVertical:10, paddingHorizontal:12, borderRadius:10,
              backgroundColor:"#0f1621", borderWidth:1, borderColor:"#1e2d40",
            }}>
              {/* A projected total that is genuinely zero reads as 0; one that
                  was never recorded reads as a dash. */}
              <Text style={{ color, fontSize:20, fontWeight:"800" }}>{value ?? "—"}</Text>
              <Text style={{ color:"#64748b", fontSize:10, fontWeight:"600", marginTop:2 }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Only offered once a urinary catheter is recorded in monitoring, which
          is what web does: without one there is no measured output to enter. */}
      {urinaryCatheter && (
        <View style={{ marginBottom:24 }}>
          <SectionLabel>{tc("urineOutputLabel")}</SectionLabel>
          <ClinicalNumberInput
            value={urineMl}
            onChange={value => setUrineMl(value ?? null)}
            unit="mL" min={0} max={20000} step={50}
            quickValues={[100, 250, 500, 1000]}
          />
        </View>
      )}

      <View>
        <SectionLabel>{tc("bloodLossLabel")}</SectionLabel>
        {/* The stepper hands back `undefined` when the field is emptied. It is
            coalesced to null here so the clear reaches the server instead of
            being dropped from the patch as an unmentioned key. */}
        <ClinicalNumberInput
          value={bloodLossMl}
          onChange={value => setBloodLossMl(value ?? null)}
          unit="mL" min={0} max={20000} step={50}
          quickValues={[100, 250, 500, 1000]}
        />
        <Text style={{ color:"#475569", fontSize:10, fontStyle:"italic", marginTop:8 }}>
          {tc("bloodLossOptionalHint")}
        </Text>
      </View>

    </ScrollView>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase",
      letterSpacing:0.8, marginBottom:10,
    }}>{children}</Text>
  )
}

function TotalRow({ row }: { row: FluidStatusTotalRow }) {
  return (
    <View style={{
      flexDirection:"row", alignItems:"center", justifyContent:"space-between",
      paddingVertical:8, borderBottomWidth:1, borderBottomColor:"#16202e",
    }}>
      <Text style={{ color:"#cbd5e1", fontSize:13, fontWeight:"600", flex:1 }} numberOfLines={1}>
        {row.name}
        {row.count != null && row.count > 1 && (
          <Text style={{ color:"#475569", fontSize:11, fontWeight:"500" }}>{`  ×${row.count}`}</Text>
        )}
      </Text>
      <Text style={{ color:"#93c5fd", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
        {row.total} {row.unit}{row.weightUsed != null ? " †" : ""}
        {row.mgTotal != null && (
          <Text style={{ color:"#64748b", fontSize:11, fontWeight:"500" }}>{`  (${row.mgTotal} mg)`}</Text>
        )}
      </Text>
    </View>
  )
}
