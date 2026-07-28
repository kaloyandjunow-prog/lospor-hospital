import { memo } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { colors } from "@/theme/colors"
import { timeAtCol, formatDateHHMM } from "@/lib/intraop-projection"
import type { LogEvent, ActiveInfusion, ActiveFluid, ActiveGasSettings } from "@/lib/intraop-log-event"
import type { ActiveAgent } from "@/lib/intraop-active-state"
import type { RunningItem, RowSummary } from "@/lib/intraop-running"
import type { VitalsEntry } from "@/components/IntraopTimetable"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"

export type QuickAddAction = "vital" | "bp" | "drug" | "infusion" | "fluid" | "agent" | "gas" | "event"

function quickAddButtons(tc: (key: ClinicalStringKey) => string): { label: string; action: QuickAddAction; color: string }[] {
  return [
    { label: tc("trRowVitals"), action: "vital", color: "#22c55e" },
    { label: tc("trRowDrug"), action: "drug", color: "#3b82f6" },
    { label: tc("trRowInfusion"), action: "infusion", color: "#a855f7" },
    { label: tc("trRowFluid"), action: "fluid", color: "#06b6d4" },
    { label: tc("trRowAgent"), action: "agent", color: "#f59e0b" },
    { label: "FGF", action: "gas", color: "#818cf8" },
    { label: tc("trRowEvent"), action: "event", color: "#6366f1" },
  ]
}

// One row of the vertical timetable (5-minute column): collapsed priority
// summary, or — when expanded — running items + a quick-add grid. Presentational;
// markup moved verbatim from cases/intraop/[id].tsx. Effects flow out via
// callbacks so the screen keeps owning state/sheets.
type TimetableRowProps = {
  col: number
  chartStart: Date
  rowHeight: number
  isNow: boolean
  isQuarter: boolean
  isExpanded: boolean
  nowSlotPercent: number
  vital?: VitalsEntry
  rowEvents: LogEvent[]
  running: RunningItem[]
  summary: RowSummary
  labelOf: (ev: LogEvent) => string
  activeInfusions: ActiveInfusion[]
  activeFluids: ActiveFluid[]
  activeAgent: ActiveAgent
  activeGas: ActiveGasSettings
  onExpand: (col: number) => void
  onCollapse: () => void
  onManageInfusion: (inf: ActiveInfusion, col?: number) => void
  onEndFluid: (fl: ActiveFluid) => void
  onEditGas: (col: number) => void
  onStopAgent: () => void
  onQuickAdd: (col: number, action: QuickAddAction) => void
}

function TimetableRowComponent({
  col, chartStart, rowHeight, isNow, isQuarter, isExpanded, nowSlotPercent,
  vital, rowEvents, running, summary, labelOf,
  activeInfusions, activeFluids, activeAgent, activeGas,
  onExpand, onCollapse, onManageInfusion, onEndFluid, onEditGas, onStopAgent, onQuickAdd,
}: TimetableRowProps) {
  const { tc } = usePreferences()
  const t = timeAtCol(chartStart, col)
  const { criticalParts, normalParts, drugParts, hasCritical, hasUnsynced } = summary

  // ── Expanded row ───────────────────────────────────────────
  if (isExpanded) {
    return (
      <View style={{
        backgroundColor: "#0a1220",
        borderBottomWidth: 2, borderBottomColor: "#f9731644",
        borderTopWidth: isNow ? 1 : 0, borderTopColor: "#f9731633",
      }}>
        {/* Header — tap to collapse */}
        <TouchableOpacity
          onPress={onCollapse}
          activeOpacity={0.7}
          style={{
            height: rowHeight, flexDirection: "row", alignItems: "center",
            paddingLeft: 12, paddingRight: 14,
            borderBottomWidth: 1, borderBottomColor: "#1a2a3a",
          }}
        >
          <Text style={{
            color: "#fb923c", fontSize: 13, fontWeight: "800",
            fontVariant: ["tabular-nums"], width: 42,
          }}>
            {formatDateHHMM(t)}
          </Text>
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 8 }}>
            {vital && (
              <View style={{ backgroundColor: "#1a3028", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ color: hasCritical ? "#ef4444" : "#22c55e", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {criticalParts.length > 0 ? criticalParts.join("  ") : normalParts.slice(0, 2).join("  ")}
                </Text>
              </View>
            )}
            {rowEvents.filter(ev => ev.type === "drug" || ev.type === "clinical_event").slice(0, 4).map(ev => (
              <View key={ev.id} style={{
                backgroundColor: (ev.color ?? "#3b82f6") + "22",
                borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                borderWidth: 1, borderColor: (ev.color ?? "#3b82f6") + "55",
              }}>
                <Text style={{ color: ev.color ?? "#3b82f6", fontSize: 11, fontWeight: "600" }}>
                  {labelOf(ev)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: "#475569", fontSize: 18, fontWeight: "300" }}>×</Text>
        </TouchableOpacity>

        {/* Running items */}
        {running.length > 0 && (
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
            <Text style={{
              color: "#475569", fontSize: 10, fontWeight: "700",
              letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 8,
            }}>{tc("trRunning")}</Text>
            <View style={{ gap: 7 }}>
              {running.map(item => {
                const activeInf = activeInfusions.find(i => item.id === `inf-${i.infId}`)
                const activeFl  = activeFluids.find(f => item.id === `fluid-${f.fluidId}`)
                const isAgentItem = item.id.startsWith("agent-")
                const isGasItem = item.id === "gas-settings"
                const canManage = !!(activeInf || activeFl || (isAgentItem && activeAgent) || (isGasItem && activeGas))
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={canManage ? 0.7 : 1}
                    onPress={() => {
                      if (activeInf) onManageInfusion(activeInf, col)
                      else if (activeFl) onEndFluid(activeFl)
                      else if (isGasItem && activeGas) onEditGas(col)
                      else if (isAgentItem && activeAgent) onStopAgent()
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      backgroundColor: item.color + "14",
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                      borderWidth: 1, borderColor: item.color + "44",
                      borderLeftWidth: 4, borderLeftColor: item.color,
                    }}
                  >
                    <Text style={{ color: item.color, fontSize: 13, fontWeight: "700", flex: 1 }}>
                      {item.label}
                    </Text>
                    {canManage && (
                      <Text style={{ color: "#64748b", fontSize: 11 }}>
                        {activeInf ? tc("trManage") : activeFl ? tc("trEndFluid") : isGasItem ? tc("trEdit") : tc("trStop")} →
                      </Text>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* Quick-add grid */}
        <View style={{ paddingHorizontal: 14, paddingTop: running.length > 0 ? 4 : 12, paddingBottom: 16 }}>
          <Text style={{
            color: "#475569", fontSize: 10, fontWeight: "700",
            letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 10,
          }}>{tc("trAddNow")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {quickAddButtons(tc).map(btn => (
              <TouchableOpacity
                key={btn.action}
                onPress={() => onQuickAdd(col, btn.action)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                  backgroundColor: btn.color + "18",
                  borderWidth: 1, borderColor: btn.color + "44",
                }}
              >
                <Text style={{ color: btn.color, fontSize: 12, fontWeight: "700" }}>
                  {btn.action === "gas" && activeGas ? "Gas" : btn.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    )
  }

  // ── Collapsed row ──────────────────────────────────────────
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onExpand(col)}
      style={{
        height: rowHeight,
        flexDirection: "row",
        alignItems: "stretch",
        position: "relative",
        borderBottomWidth: 1,
        borderBottomColor: isNow ? "#f9731633" : isQuarter ? "#1e2d40" : "#0f1826",
        backgroundColor: isNow ? "rgba(249,115,22,0.035)" : "transparent",
      }}
    >
      {/* Now line at exact fractional position within this row */}
      {isNow && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute", left: 0, right: 0,
            top: (nowSlotPercent / 100) * rowHeight - 1,
            height: 2,
            backgroundColor: "#f97316",
            zIndex: 20,
            boxShadow: "0 0 10px rgba(249,115,22,0.85)",
          }}
        />
      )}

      {/* Time label */}
      <View style={{ width: 54, alignItems: "flex-end", paddingRight: 8, justifyContent: "center" }}>
        <Text style={{
          color: isNow ? "#fb923c" : isQuarter ? "#cbd5e1" : "#475569",
          fontSize: isNow || isQuarter ? 12 : 11,
          fontWeight: isNow || isQuarter ? "700" : "500",
          fontVariant: ["tabular-nums"],
        }}>
          {formatDateHHMM(t)}
        </Text>
      </View>

      {/* Timeline spine + dot */}
      <View style={{ width: 18, alignItems: "center" }}>
        <View style={{ position: "absolute", top: 0, bottom: 0, width: 1.5, backgroundColor: "#1a2540" }} />
        <View style={{
          marginTop: rowHeight / 2 - 4,
          width: vital ? 9 : 6,
          height: vital ? 9 : 6,
          borderRadius: 8,
          backgroundColor: hasCritical ? "#ef4444" : vital ? "#22c55e" : isQuarter ? "#2d3e55" : "#151f30",
          borderWidth: isNow ? 2 : 0,
          borderColor: "#f97316",
        }} />
      </View>

      {/* Content — priority summary */}
      <View style={{ flex: 1, justifyContent: "center", paddingLeft: 6, paddingRight: 4 }}>
        {hasCritical && (
          <Text style={{
            color: "#ef4444", fontSize: 12, fontWeight: "800",
            fontVariant: ["tabular-nums"], lineHeight: 16,
          }} numberOfLines={1}>
            {criticalParts.join("  ")}
          </Text>
        )}
        {normalParts.length > 0 && (
          <Text style={{
            color: hasCritical ? "#64748b" : "#94a3b8",
            fontSize: hasCritical ? 10 : 12,
            fontVariant: ["tabular-nums"],
            lineHeight: hasCritical ? 14 : 16,
          }} numberOfLines={1}>
            {normalParts.join("  ")}
          </Text>
        )}
        {drugParts.length > 0 && (
          <Text style={{ color: "#4a5c6e", fontSize: 10, lineHeight: 13 }} numberOfLines={1}>
            {drugParts.join("  ·  ")}
          </Text>
        )}
        {hasUnsynced && (
          <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "800", lineHeight: 12 }}>
            unsynced
          </Text>
        )}
      </View>

      {/* Running strips — full height, stacked from right edge inward (5px each) */}
      <View style={{ flexDirection: "row", alignSelf: "stretch" }}>
        {running.slice().reverse().map(item => (
          <View key={item.id} style={{ width: 5, backgroundColor: item.color + "88" }} />
        ))}
      </View>
    </TouchableOpacity>
  )
}

export const TimetableRow = memo(TimetableRowComponent, (prev, next) => {
  if (
    prev.col !== next.col ||
    prev.chartStart !== next.chartStart ||
    prev.rowHeight !== next.rowHeight ||
    prev.isNow !== next.isNow ||
    prev.isQuarter !== next.isQuarter ||
    prev.isExpanded !== next.isExpanded ||
    prev.vital !== next.vital ||
    prev.rowEvents !== next.rowEvents ||
    prev.running !== next.running ||
    prev.summary !== next.summary ||
    prev.labelOf !== next.labelOf ||
    prev.onExpand !== next.onExpand ||
    prev.onCollapse !== next.onCollapse ||
    prev.onManageInfusion !== next.onManageInfusion ||
    prev.onEndFluid !== next.onEndFluid ||
    prev.onEditGas !== next.onEditGas ||
    prev.onStopAgent !== next.onStopAgent ||
    prev.onQuickAdd !== next.onQuickAdd
  ) {
    return false
  }
  if ((prev.isExpanded || next.isExpanded) && (
    prev.activeInfusions !== next.activeInfusions ||
    prev.activeFluids !== next.activeFluids ||
    prev.activeAgent !== next.activeAgent ||
    prev.activeGas !== next.activeGas
  )) {
    return false
  }
  return !next.isNow || prev.nowSlotPercent === next.nowSlotPercent
})
