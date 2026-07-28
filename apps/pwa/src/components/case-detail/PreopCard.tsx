import React from "react"
import { View, Text } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import type { ClinicalStringKey, TranslationKey } from "@/lib/preferences-context"
import { SummaryCard, InfoRow, Chip, ChipRow, Divider } from "./CaseDetailPrimitives"
import {
  asaColor,
  apfelRiskLabel,
  calcIBW,
  rcriRiskLabel,
  riskColor,
  stopBangRiskLabel,
  type CaseData,
  type RiskLevel,
} from "@/lib/case-detail-summary"

export function PreopCard({ preop, tc, t }: { preop: CaseData["preop"]; tc: (key: ClinicalStringKey) => string; t: (key: TranslationKey) => string }) {
  if (!preop) {
    return (
      <SummaryCard title={tc("cardPreop")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("noPreopData")}</Text>
      </SummaryCard>
    )
  }

  const bmi = preop.bmi ?? (
    preop.weightKg != null && preop.heightCm != null
      ? Math.round(preop.weightKg / Math.pow(preop.heightCm / 100, 2) * 10) / 10
      : undefined
  )
  const showIBW = bmi != null && bmi >= 30 && preop.heightCm != null
  const ibw = showIBW ? calcIBW(preop.sex, preop.heightCm!) : undefined

  const diagLabel = preop.diagnosesJson?.[0]?.label ?? preop.diagnosis
  const procLabel = preop.proceduresJson?.[0]?.label ?? preop.plannedProcedure

  const bloodType = preop.bloodType && preop.rhFactor
    ? `${preop.bloodType}${preop.rhFactor === "POSITIVE" ? "+" : preop.rhFactor === "NEGATIVE" ? "−" : preop.rhFactor}`
    : undefined

  const sexLabel = preop.sex === "MALE" ? tc("sexMale") : preop.sex === "FEMALE" ? tc("sexFemale") : preop.sex

  const rcriResult = preop.rcriScore != null ? rcriRiskLabel(preop.rcriScore, tc) : null
  const apfelResult = preop.apfelScore != null ? apfelRiskLabel(preop.apfelScore, tc) : null
  const stopBangResult = preop.stopBangScore != null ? stopBangRiskLabel(preop.stopBangScore, tc) : null

  const vitals: string[] = []
  if (preop.bpSystolic != null && preop.bpDiastolic != null) vitals.push(`BP ${preop.bpSystolic}/${preop.bpDiastolic}`)
  else if (preop.bpSystolic != null) vitals.push(`SBP ${preop.bpSystolic}`)
  if (preop.heartRate != null) vitals.push(`HR ${preop.heartRate}`)
  if (preop.spO2 != null) vitals.push(`SpO₂ ${preop.spO2}%`)
  if (preop.temperature != null) vitals.push(`Temp ${preop.temperature}°C`)
  if (preop.respiratoryRate != null) vitals.push(`RR ${preop.respiratoryRate}/min`)

  type RiskItem = { label: string; score: number; max: string; risk: string; level: RiskLevel }
  const riskItems: RiskItem[] = [
    rcriResult ? { label: "RCRI", score: preop.rcriScore!, max: "6", risk: rcriResult.label, level: rcriResult.level } : null,
    apfelResult ? { label: "Apfel", score: preop.apfelScore!, max: "4", risk: apfelResult.label, level: apfelResult.level } : null,
    stopBangResult ? { label: "STOP-BANG", score: preop.stopBangScore!, max: "8", risk: stopBangResult.label, level: stopBangResult.level } : null,
  ].filter((x): x is RiskItem => x !== null)

  return (
    <SummaryCard title={tc("cardPreop")}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* Left: demographics */}
        <View style={{ flex: 1 }}>
          <InfoRow label={tc("summaryAge")} value={preop.ageYears != null ? `${preop.ageYears} yr` : null} />
          <InfoRow label={tc("summarySex")} value={sexLabel ?? null} />
          <InfoRow label={tc("summaryHeight")} value={preop.heightCm != null ? `${preop.heightCm} cm` : null} />
          <InfoRow label={tc("summaryWeight")} value={preop.weightKg != null ? `${preop.weightKg} kg` : null} />
          <InfoRow label={tc("summaryBMI")} value={bmi != null ? `${bmi} kg/m²` : null} />
          {showIBW && ibw != null && (
            <InfoRow label={tc("summaryIBW")} value={`${ibw} kg`} valueColor={colors.warning} />
          )}
          <InfoRow label={tc("summaryBloodType")} value={bloodType ?? null} />
        </View>

        {/* Right: ASA + risk scores */}
        <View style={{ width: 116, alignItems: "center" }}>
          {preop.asaScore ? (
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <View style={{
                width: 54, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center",
                backgroundColor: withAlpha(asaColor(preop.asaScore), "22"),
                borderWidth: 2, borderColor: withAlpha(asaColor(preop.asaScore), "88"),
              }}>
                <Text style={{ color: asaColor(preop.asaScore), fontSize: 18, fontWeight: "900" }}>
                  {preop.asaScore}{preop.emergencySurgery ? "E" : ""}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 3 }}>ASA</Text>
            </View>
          ) : null}

          {riskItems.map(it => {
            const c = riskColor(it.level)
            return (
              <View key={it.label} style={{ alignItems: "center", marginBottom: 8, width: "100%" }}>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: withAlpha(c, "22"), borderWidth: 1, borderColor: withAlpha(c, "55"),
                  width: "100%", alignItems: "center",
                }}>
                  <Text style={{ color: c, fontSize: 13, fontWeight: "800" }}>
                    {it.score}/{it.max}
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: "center", marginTop: 2 }}>
                  {it.label}
                </Text>
                <Text style={{ color: c, fontSize: 9, textAlign: "center" }}>
                  {it.risk}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {(preop.emergencySurgery || preop.highRiskSurgery) && (
        <ChipRow>
          {preop.emergencySurgery && <Chip label={t("emergencyChip")} color={colors.danger} />}
          {preop.highRiskSurgery && <Chip label={t("highRiskChip")} color={colors.warning} />}
        </ChipRow>
      )}

      <Divider />

      <InfoRow label={tc("summaryDiagnosis")} value={diagLabel ?? null} />
      <InfoRow label={tc("summaryProcedure")} value={procLabel ?? null} />

      {vitals.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, marginBottom: 4,
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            {tc("summaryPreopVitals")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            {vitals.join("  ·  ")}
          </Text>
          {preop.heartArrhythmia && (
            <Text style={{ color: colors.warning, fontSize: 11, marginTop: 2 }}>{tc("summaryArrhythmia")}</Text>
          )}
        </View>
      )}

      {preop.teamNotes ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>
            {preop.teamNotes}
          </Text>
        </View>
      ) : null}
    </SummaryCard>
  )
}

// ─── Card 2: Medical History ──────────────────────────────────────────────────

