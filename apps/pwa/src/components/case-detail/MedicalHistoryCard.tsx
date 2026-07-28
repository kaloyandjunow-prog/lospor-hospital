import React from "react"
import { View, Text } from "react-native"
import { colors } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { SummaryCard, Chip, ChipRow, Divider } from "./CaseDetailPrimitives"
import {
  BODY_SYSTEM_COLORS,
  BODY_SYSTEM_TC,
  SYSTEM_ORDER,
  getBodySystem,
  type CaseData,
  type Comorbidity,
} from "@/lib/case-detail-summary"

export function MedicalHistoryCard({ preop, tc }: { preop: CaseData["preop"]; tc: (key: ClinicalStringKey) => string }) {
  const comorbidities = preop?.comorbidities ?? []
  const currentMedicationsText = (() => {
    const raw = preop?.currentMedications
    if (!raw) return null
    const trimmed = raw.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown[]
        return parsed
          .map((item) => {
            const med = item as { label?: unknown; inn?: unknown; name?: unknown }
            return med.label ?? med.inn ?? med.name
          })
          .filter((label): label is string => typeof label === "string" && label.length > 0)
          .join(", ")
      } catch {}
    }
    return raw
  })()

  const flags: { label: string; color: string }[] = []
  if (preop?.allergies) flags.push({ label: tc("summaryAllergy"), color: colors.danger })
  if (preop?.latexAllergy) flags.push({ label: tc("summaryLatex"), color: colors.danger })
  if (preop?.familyAnesthesiaProblems) flags.push({ label: tc("summaryFamilyHx"), color: colors.warning })
  if (preop?.smoking) flags.push({ label: tc("summarySmoking"), color: colors.warning })
  if (preop?.substanceAbuse) flags.push({ label: tc("summarySubstance"), color: colors.warning })
  if (preop?.dentalProsthetics) flags.push({ label: tc("summaryDental"), color: colors.warning })
  if (preop?.looseTeeth) flags.push({ label: tc("summaryLooseTeeth"), color: colors.warning })

  const hasContent = comorbidities.length > 0 || flags.length > 0
    || !!currentMedicationsText || !!preop?.allergyDetails
    || !!preop?.familyAnesthesiaDetails

  if (!hasContent) {
    return (
      <SummaryCard title={tc("cardHistory")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("noHistoryRecorded")}</Text>
      </SummaryCard>
    )
  }

  const grouped: Record<string, Comorbidity[]> = {}
  for (const c of comorbidities) {
    const sys = getBodySystem(c.code ?? "")
    if (!grouped[sys]) grouped[sys] = []
    grouped[sys].push(c)
  }

  return (
    <SummaryCard title={tc("cardHistory")} badge={comorbidities.length > 0 ? comorbidities.length : undefined}>
      {SYSTEM_ORDER.filter(sys => grouped[sys]?.length).map(sys => {
        const col = BODY_SYSTEM_COLORS[sys]
        const sysTcKey = BODY_SYSTEM_TC[sys]
        return (
          <View key={sys} style={{ marginBottom: 10 }}>
            <Text style={{
              color: col, fontSize: 10, fontWeight: "800",
              textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4,
            }}>
              {sysTcKey ? tc(sysTcKey) : sys}
            </Text>
            <ChipRow>
              {grouped[sys].map((c, i) => (
                <Chip key={`${c.code ?? c.label}-${i}`} label={c.label} color={col} />
              ))}
            </ChipRow>
          </View>
        )
      })}

      {flags.length > 0 && (
        <View>
          <Divider />
          <ChipRow>
            {flags.map((f, i) => <Chip key={`flag-${i}`} label={f.label} color={f.color} />)}
          </ChipRow>
        </View>
      )}

      {preop?.allergyDetails ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: colors.danger, fontSize: 12 }}>
            {tc("summaryAllergyDetails")}: {(() => {
              const raw = preop.allergyDetails!
              const trimmed = raw.trim()
              if (trimmed.startsWith("[")) {
                try {
                  const parsed = JSON.parse(trimmed) as unknown[]
                  const labels = parsed
                    .map((item) => {
                      const m = item as { label?: unknown; name?: unknown }
                      return m.label ?? m.name
                    })
                    .filter((l): l is string => typeof l === "string" && l.length > 0)
                  if (labels.length > 0) return labels.join(", ")
                } catch {}
              }
              return raw
            })()}
          </Text>
        </View>
      ) : null}

      {preop?.familyAnesthesiaDetails ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>
            {tc("summaryFamilyDetails")}: {preop.familyAnesthesiaDetails}
          </Text>
        </View>
      ) : null}

      {currentMedicationsText ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 4,
          }}>
            {tc("summaryCurrentMeds")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            {currentMedicationsText}
          </Text>
        </View>
      ) : null}
    </SummaryCard>
  )
}

// ─── Card 3: Airway Assessment ────────────────────────────────────────────────

