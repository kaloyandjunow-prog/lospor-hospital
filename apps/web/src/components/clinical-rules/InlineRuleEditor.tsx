"use client"

import type {
  ClinicalPresetRule,
  ClinicalRuleMode,
  ClinicalRulePayload,
  PediatricDrugProfileRulePayload,
} from "@lospor/core/clinical-rules"
import { AdultClinicalRuleEditor } from "@/components/clinical-rules/AdultClinicalRuleEditor"
import { AgentRuleEditor, isAgentRulePayload } from "@/components/clinical-rules/AgentRuleEditor"
import {
  ClinicalRuleEditor,
  type ClinicalRuleDrugOption,
  type ClinicalRuleFluidOption,
  type ClinicalRuleInfusionOption,
} from "@/components/clinical-rules/ClinicalRuleEditor"
import { PediatricDrugProfileSetEditor } from "@/components/clinical-rules/PediatricDrugProfileSetEditor"
import { clinicalRuleEditorCopy } from "@/components/clinical-rules/editor-copy"
import { pediatricEditorPayload } from "@/lib/clinical-preset-scope"

export type ActiveEditorState = {
  initial: ClinicalRulePayload | null
  existingRuleKey: string | null
  pediatricDrugRules?: ClinicalPresetRule[]
}

export function InlineRuleEditor({
  id,
  label,
  mode,
  editorCopy,
  editor,
  busy,
  drugOptions,
  fluidOptions,
  infusionOptions,
  onSubmit,
  onSubmitPediatricDrug,
  onCancel,
}: {
  id: string
  label: string
  mode: ClinicalRuleMode
  editorCopy: ReturnType<typeof clinicalRuleEditorCopy>
  editor: ActiveEditorState
  busy: boolean
  drugOptions: ClinicalRuleDrugOption[]
  fluidOptions: ClinicalRuleFluidOption[]
  infusionOptions: ClinicalRuleInfusionOption[]
  onSubmit: (payload: ClinicalRulePayload) => void
  onSubmitPediatricDrug: (
    medicationKey: string,
    profiles: PediatricDrugProfileRulePayload[],
  ) => void
  onCancel: () => void
}) {
  return (
    <section
      id={id}
      aria-label={`${editorCopy.edit} ${label}`}
      className="w-full basis-full border-l-2 border-blue-400 bg-blue-50/50 py-4 pl-3 pr-1 dark:border-blue-700 dark:bg-blue-950/10"
    >
      {mode === "PEDIATRIC" && editor.pediatricDrugRules ? (
        <PediatricDrugProfileSetEditor
          key={editor.existingRuleKey ?? "new-pediatric-drug"}
          rules={editor.pediatricDrugRules}
          drugOptions={drugOptions}
          busy={busy}
          lockIdentity={editor.pediatricDrugRules.length > 0}
          onSubmit={onSubmitPediatricDrug}
          onCancel={onCancel}
        />
      ) : isAgentRulePayload(editor.initial) ? (
        <AgentRuleEditor
          key={editor.existingRuleKey ?? "agent"}
          initial={editor.initial}
          busy={busy}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      ) : mode === "ADULT" ? (
        <AdultClinicalRuleEditor
          key={`${editor.existingRuleKey ?? "new"}:${editor.initial?.kind ?? "none"}`}
          initial={editor.initial}
          busy={busy}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      ) : (
        <ClinicalRuleEditor
          key={`${editor.existingRuleKey ?? "new"}:${editor.initial?.kind ?? "none"}`}
          initial={pediatricEditorPayload(editor.initial)}
          lockIdentity={!!editor.existingRuleKey}
          drugOptions={drugOptions}
          fluidOptions={fluidOptions}
          infusionOptions={infusionOptions}
          copy={editorCopy}
          busy={busy}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
    </section>
  )
}
