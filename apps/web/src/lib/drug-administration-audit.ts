import { canonicalConcentrationSelection } from "@lospor/core/drug-selection"
import type { DrugAdministrationAudit } from "@/types/timetable"

export type DrugAdministrationAuditInput = {
  concentration?: string
  concentrationUnitHint?: string
  formulation?: DrugAdministrationAudit["formulation"]
  calculationBasis?: DrugAdministrationAudit["calculationBasis"]
  calculationWeightKg?: number
  calculationMethod?: string
  clinicalRuleKey?: string
  clinicalRuleVersion?: string
  clinicalRuleSourceIds?: string[]
  clinicalPresetId?: string
  clinicalPresetVersion?: number
  clinicalPresetScope?: DrugAdministrationAudit["clinicalPresetScope"]
}

export function drugAdministrationAudit(
  input: DrugAdministrationAuditInput,
): DrugAdministrationAudit {
  const concentration = canonicalConcentrationSelection(
    input.concentration,
    input.concentrationUnitHint,
  )
  return {
    concentration: concentration?.label,
    concentrationValue: concentration?.value,
    concentrationUnit: concentration?.unit,
    formulation: input.formulation,
    calculationBasis: input.calculationBasis,
    calculationWeightKg: input.calculationWeightKg,
    calculationMethod: input.calculationMethod,
    clinicalRuleKey: input.clinicalRuleKey,
    clinicalRuleVersion: input.clinicalRuleVersion,
    clinicalRuleSourceIds: input.clinicalRuleSourceIds,
    clinicalPresetId: input.clinicalPresetId,
    clinicalPresetVersion: input.clinicalPresetVersion,
    clinicalPresetScope: input.clinicalPresetScope,
  }
}
