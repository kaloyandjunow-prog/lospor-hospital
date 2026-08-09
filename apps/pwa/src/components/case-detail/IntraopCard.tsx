import React from "react"
import { View, Text } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences, type ClinicalStringKey, type TranslationKey } from "@/lib/preferences-context"
import { displayClinicalCode, displayOptionEntry, displayOptionPath } from "@/lib/clinical-display"
import { SummaryCard, InfoRow, Chip, ChipRow, Divider } from "./CaseDetailPrimitives"
import {
  MONITOR_MAP,
  airwayToolLabel,
  calcDrugTotals,
  calcCaseIBW,
  calcInfusionTotals,
  formatAirway,
  formatDuration,
  formatTimeHHMM,
  getActiveInfusions,
  positionLabel,
  techniqueLabel,
  type CaseData,
  type KeyEvent,
} from "@/lib/case-detail-summary"

function legacyKeyEventsToSummaryLog(keyEvents: unknown): KeyEvent[] {
  const kev = (keyEvents ?? {}) as Record<string, unknown>
  const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}
  const out: KeyEvent[] = []
  if (Array.isArray(kev.drugs)) {
    kev.drugs.forEach(item => {
      const d = asRecord(item)
      out.push({ type: "drug", name: d.name as string | undefined, dose: d.dose as number | string | undefined, unit: d.unit as string | undefined, col: Number(d.colIdx ?? 0) })
    })
  }
  if (Array.isArray(kev.infusions)) {
    kev.infusions.forEach(item => {
      const inf = asRecord(item)
      const infId = String(inf.id ?? inf.name ?? "")
      if (!infId) return
      out.push({ type: "infusion_start", infId, name: inf.name as string | undefined, rate: inf.rate as number | string | undefined, unit: inf.unit as string | undefined, col: Number(inf.startCol ?? 0) })
      if (Array.isArray(inf.rateChanges)) {
        inf.rateChanges.forEach(changeItem => {
          const change = asRecord(changeItem)
          out.push({ type: "infusion_rate", infId, name: inf.name as string | undefined, rate: change.rate as number | string | undefined, unit: (change.unit ?? inf.unit) as string | undefined, col: Number(change.col ?? inf.startCol ?? 0) })
        })
      }
      if (inf.stopped) out.push({ type: "infusion_stop", infId, name: inf.name as string | undefined, col: Number(inf.endCol ?? inf.startCol ?? 0) })
    })
  }
  return out.sort((a, b) => (b.col ?? 0) - (a.col ?? 0))
}

export function IntraopCard({ intraop, preop, clinicalMode, tc, t }: { intraop: CaseData["intraop"]; preop?: CaseData["preop"]; clinicalMode?: CaseData["clinicalMode"]; tc: (key: ClinicalStringKey) => string; t: (key: TranslationKey) => string }) {
  const { language } = usePreferences()

  if (!intraop) {
    return (
      <SummaryCard title={tc("cardIntraop")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("noIntraopData")}</Text>
      </SummaryCard>
    )
  }

  const log = intraop.keyEvents?.log ?? legacyKeyEventsToSummaryLog(intraop.keyEvents)
  const drugTotals = calcDrugTotals(log)
  const activeInfusions = getActiveInfusions(log)

  // Compute IBW/TBW for weight-adjusted infusion totals
  const summaryIBW = calcCaseIBW({
    clinicalMode,
    sex: preop?.sex,
    heightCm: preop?.heightCm,
    ageValue: preop?.ageValue,
    ageUnit: preop?.ageUnit,
  })
  const summaryTBW = preop?.weightKg ?? null
  // Build infusion segments from timetable for total calculation
  const timetableInfusions = (() => {
    const infMap: Record<string, { name: string; rate: string; unit: string; startCol: number; endCol: number; rateChanges: { col: number; rate: string; unit: string }[] }> = {}
    const chrono = [...log].reverse()
    let maxCol = 0
    for (const ev of chrono) {
      const col = typeof ev.col === "number" ? ev.col : 0
      if (col > maxCol) maxCol = col
      if (ev.type === "infusion_start" && ev.infId) {
        infMap[ev.infId] = { name: ev.name ?? "Infusion", rate: String(ev.rate ?? 0), unit: ev.unit ?? "", startCol: col, endCol: col, rateChanges: [] }
      } else if (ev.type === "infusion_rate" && ev.infId && infMap[ev.infId]) {
        infMap[ev.infId].rateChanges.push({ col, rate: String(ev.rate ?? 0), unit: ev.unit ?? infMap[ev.infId].unit })
        infMap[ev.infId].rate = String(ev.rate ?? 0)
      } else if (ev.type === "infusion_stop" && ev.infId && infMap[ev.infId]) {
        infMap[ev.infId].endCol = col
      }
    }
    // Open-ended infusions extend to maxCol
    for (const entry of Object.values(infMap)) {
      if (entry.endCol === entry.startCol && maxCol > entry.startCol) entry.endCol = maxCol
    }
    return Object.values(infMap)
  })()
  const infusionTotals = calcInfusionTotals(timetableInfusions, summaryIBW, summaryTBW)
  const infWeightNote = (() => {
    const weighted = infusionTotals.filter(r => r.weightUsed != null)
    if (!weighted.length) return null
    const ibwUsed = weighted.some(r => r.weightBasis === "IBW") ? summaryIBW : null
    const tbwUsed = weighted.some(r => r.weightBasis === "TBW") ? summaryTBW : null
    const parts: string[] = []
    if (ibwUsed) parts.push(`IBW ${Math.round(ibwUsed * 10) / 10} kg`)
    if (tbwUsed) parts.push(`TBW ${Math.round((tbwUsed ?? 0) * 10) / 10} kg`)
    return parts.length ? `≈ ${parts.join(" / ")}` : null
  })()

  const airwayStr = formatAirway(intraop, language)
  const airwayTools = (intraop.airwayTools ?? []).map(code => airwayToolLabel(code, language))

  const monitors = MONITOR_MAP.filter(m => {
    const val = (intraop as Record<string, unknown>)[m.key as string]
    return !!val
  })

  const positions = (intraop.positions ?? []).map(code => positionLabel(code, language))
  const ventText = (intraop.ventilationModes ?? [])
    .map(mode => displayClinicalCode("ventilationMode", mode, language))
    .join(" + ")

  let timingStr = ""
  if (intraop.startTime && intraop.endTime) {
    timingStr = `${formatTimeHHMM(intraop.startTime)} → ${formatTimeHHMM(intraop.endTime)}`
    if (intraop.durationMinutes) timingStr += `  ·  ${formatDuration(intraop.durationMinutes)}`
  } else if (intraop.durationMinutes) {
    timingStr = formatDuration(intraop.durationMinutes)
  }

  const volatileStr = intraop.volatileAgent
    ? displayClinicalCode("option:INHALATIONAL_AGENT", intraop.volatileAgent, language, { label: intraop.volatileAgent })
    : null

  return (
    <SummaryCard title={tc("cardIntraop")}>
      {/* Technique */}
      {(intraop.techniques?.length ?? 0) > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryTechnique")}
          </Text>
          <ChipRow>
            {intraop.techniques!.map((t, i) => (
              <Chip key={`tech-${i}`} label={techniqueLabel(t, language)} color={colors.primary} />
            ))}
          </ChipRow>
        </View>
      )}

      {airwayStr ? <InfoRow label={tc("summaryAirwayDevice")} value={airwayStr} /> : null}

      {airwayTools.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 4 }}>{tc("summaryAirwayTools")}</Text>
          <ChipRow>
            {airwayTools.map((t, i) => <Chip key={`at-${i}`} label={t} color={colors.textSecondary} />)}
          </ChipRow>
        </View>
      )}

      {ventText ? <InfoRow label={tc("summaryVentilation")} value={ventText} /> : null}
      {volatileStr ? <InfoRow label={tc("summaryAgent")} value={volatileStr} valueColor={colors.agent} /> : null}

      {positions.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <ChipRow>
            {positions.map((p, i) => <Chip key={`pos-${i}`} label={p} color={colors.textSecondary} />)}
          </ChipRow>
        </View>
      )}

      {timingStr ? <InfoRow label={tc("summaryDuration")} value={timingStr} /> : null}
      {intraop.monthYear ? <InfoRow label={tc("summaryDate")} value={intraop.monthYear} /> : null}

      <Divider />

      {/* Monitoring */}
      {monitors.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryMonitoring")}
          </Text>
          <ChipRow>
            {monitors.map(m => (
              <Chip
                key={String(m.key)}
                label={displayClinicalCode("option:MONITORING", String(m.key), language)}
                color={colors.primary}
              />
            ))}
          </ChipRow>
        </View>
      )}

      {/* Vascular access */}
      {(intraop.vascularAccesses?.length ?? 0) > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryVascular")}
          </Text>
          <ChipRow>
            {intraop.vascularAccesses!.map((va, i) => {
              const siteCode = typeof va.site === "string" ? va.site : null
              const site = siteCode
                ? displayOptionPath("VASCULAR_ACCESS", siteCode, language)
                : displayClinicalCode("option:VASCULAR_ACCESS", va.siteLabel, language, {
                    label: va.siteLabel,
                  })
              const preexisting = va.preexisting
                ? ` (${displayClinicalCode("clinicalAttribute", "preexisting", language)})`
                : ""
              const lbl = `${site} ${va.size}${va.sizeUnit}${va.lumens ? ` ${va.lumens}L` : ""}${preexisting}`
              return <Chip key={`va-${i}`} label={lbl} color={colors.textSecondary} />
            })}
          </ChipRow>
        </View>
      )}

      <Divider />

      {intraop.premedicationEvening ? <InfoRow label={tc("summaryPremedEve")} value={displayOptionEntry("PREMED_DRUG", intraop.premedicationEvening, language)} /> : null}
      {intraop.premedicationMorning ? <InfoRow label={tc("summaryPremedAM")} value={displayOptionEntry("PREMED_DRUG", intraop.premedicationMorning, language)} /> : null}

      {/* Drug totals — bolus */}
      {drugTotals.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            {tc("summaryBolusDrugs")}
          </Text>
          {drugTotals.map((d, i) => (
            <View key={`dt-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: withAlpha(colors.border, "66") }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{displayClinicalCode("option:INTRAOP_DRUG", d.name, language, { label: d.name })}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }}>{d.total} {d.unit}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Infusion totals — weight-adjusted where applicable */}
      {infusionTotals.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            {tc("summaryInfTotals")}
          </Text>
          {infusionTotals.map((d, i) => (
            <View key={`it-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: withAlpha(colors.border, "66") }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{displayClinicalCode("option:INTRAOP_INFUSION", d.name, language, { label: d.name })}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }}>
                {d.total} {d.unit}
                {d.weightUsed != null ? <Text style={{ color: colors.warning, fontSize: 10 }}> ≈</Text> : null}
              </Text>
            </View>
          ))}
          {infWeightNote && (
            <Text style={{ color: colors.textMuted, fontSize: 10, fontStyle: "italic", marginTop: 6 }}>{infWeightNote}</Text>
          )}
        </View>
      )}

      {/* Active infusions */}
      {activeInfusions.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {t("infusions")}
          </Text>
          {activeInfusions.map((inf, i) => (
            <View key={`inf-${i}`} style={{
              flexDirection: "row", justifyContent: "space-between",
              paddingVertical: 5, borderBottomWidth: 1,
              borderBottomColor: withAlpha(colors.border, "66"),
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{displayClinicalCode("option:INTRAOP_INFUSION", inf.name, language, { label: inf.name })}</Text>
              <Text style={{ color: colors.agent, fontSize: 12, fontWeight: "700" }}>
                {inf.rate} {inf.unit}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Divider />

      {/* Fluid balance */}
      <Text style={{
        color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
        letterSpacing: 0.5, marginBottom: 8,
      }}>
        {tc("summaryFluidBalance")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          { labelKey: "summaryCrystalloid" as ClinicalStringKey, value: intraop.crystalloidsMl ?? 0, color: colors.primary },
          { labelKey: "summaryColloid" as ClinicalStringKey, value: intraop.colloidsMl ?? 0, color: "#38bdf8" },
          { labelKey: "summaryBlood" as ClinicalStringKey, value: intraop.bloodMl ?? 0, color: colors.danger },
          { labelKey: "summaryUrineOut" as ClinicalStringKey, value: intraop.urineMl ?? 0, color: "#2dd4bf" },
        ]).map(item => (
          <View key={item.labelKey} style={{
            flex: 1, minWidth: 72,
            backgroundColor: withAlpha(item.color, "11"),
            borderWidth: 1, borderColor: withAlpha(item.color, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: item.color, fontSize: 16, fontWeight: "800" }}>{item.value}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
              {tc(item.labelKey)} mL
            </Text>
          </View>
        ))}
      </View>

      {intraop.bloodProductsNote ? (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>
          {intraop.bloodProductsNote}
        </Text>
      ) : null}

      {intraop.complications ? (
        <View style={{ marginTop: 10 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 4,
          }}>
            {tc("summaryComplications")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            {intraop.complications}
          </Text>
        </View>
      ) : null}
    </SummaryCard>
  )
}

// ─── Card 5: Postoperative Recovery ──────────────────────────────────────────


