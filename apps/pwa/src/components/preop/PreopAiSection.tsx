import { Text } from "react-native"
import { Controller, type Control } from "react-hook-form"
import { AiAdvisorPanel } from "@/components/AiAdvisorPanel"
import { PreopSectionCard } from "@/components/preop/PreopSectionCard"
import { capabilityMessageKey, type ClinicalAiCapabilities } from "@/lib/deployment-capabilities"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { colors } from "@/theme/colors"

/**
 * AI assistance: the case's consent and the adult advisor, its own preop
 * section right after the patient (10.4.1). It was inside the risk scores.
 * The new-case screen hides it, rail pill included, unless Status has an AI
 * feature on.
 */
export function PreopAiSection({ control, visible, onLayout, pediatric, clinicalAi, advisor, tc }: {
  control: Control<PreopFormInput>
  visible: boolean
  onLayout: (y: number) => void
  pediatric: boolean
  clinicalAi: ClinicalAiCapabilities
  advisor: { analysing: boolean; text: string; error: string; onRun: () => void }
  tc: (key: ClinicalStringKey) => string
}) {
  return (
    <PreopSectionCard title={tc("sectionAi")} onLayout={onLayout} visible={visible}>
      <Controller control={control} name="aiOptIn" render={({ field }) => (
        <AiAdvisorPanel
          adviceAvailable={!pediatric && clinicalAi.clinicalAdvice.enabled}
          aiOptIn={!!field.value}
          onToggleOptIn={field.onChange}
          analysing={advisor.analysing}
          streamedText={advisor.text}
          error={advisor.error}
          onRun={advisor.onRun}
          tc={tc}
        />
      )} />
      {!pediatric && !clinicalAi.clinicalAdvice.enabled ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 14 }}>{tc(capabilityMessageKey(clinicalAi.clinicalAdvice.reason))}</Text>
      ) : null}
    </PreopSectionCard>
  )
}
