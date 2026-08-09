import type {
  AgentSegment,
  ClinicalEvent,
  EventType,
  GasSettingsSegment,
  LogEvent as CoreLogEvent,
  PhaseSegment,
  PositionSegment,
  TimetableData as CoreTimetableData,
  TimetableDrug as CoreTimetableDrug,
  TimetableFluid as CoreTimetableFluid,
  TimetableInfusion,
  VitalsEntry,
} from "@lospor/core/intraop-types"
import type { ConcentrationUnit } from "@lospor/core/clinical-rule-vocabulary"
import type { LocalAnaestheticFormulation } from "@lospor/core/catalog"

export type {
  AgentSegment,
  ClinicalEvent,
  GasSettingsSegment,
  PhaseSegment,
  PositionSegment,
  TimetableInfusion,
  VitalsEntry,
}

export type DrugAdministrationAudit = {
  concentration?: string
  concentrationValue?: number
  concentrationUnit?: ConcentrationUnit
  formulation?: LocalAnaestheticFormulation
  calculationBasis?: "FLAT" | "TBW" | "IBW" | "BSA_M2"
  calculationWeightKg?: number
  calculationMethod?: string
  clinicalRuleKey?: string
  clinicalRuleVersion?: string
  clinicalRuleSourceIds?: string[]
  clinicalPresetId?: string
  clinicalPresetVersion?: number
  clinicalPresetScope?: "PLATFORM" | "INSTITUTION" | "USER"
}

export type TimetableDrug = Omit<CoreTimetableDrug, keyof DrugAdministrationAudit>
  & DrugAdministrationAudit

export type ClinicalRuleProvenance = Pick<
  DrugAdministrationAudit,
  | "clinicalRuleKey"
  | "clinicalRuleVersion"
  | "clinicalRuleSourceIds"
  | "clinicalPresetId"
  | "clinicalPresetVersion"
  | "clinicalPresetScope"
>

export type TimetableFluid = CoreTimetableFluid & ClinicalRuleProvenance

export type TimetableData = Omit<CoreTimetableData, "drugs" | "fluids"> & {
  drugs: TimetableDrug[]
  fluids: TimetableFluid[]
}

// The API accepts old projected snapshots whose events predate required ids
// and timestamps. New live events use CoreLogEvent; this boundary type keeps
// legacy reads explicit without weakening Core's canonical event contract.
export type LogEvent = Partial<Omit<CoreLogEvent, "type" | keyof DrugAdministrationAudit>> & {
  type?: EventType | string
} & DrugAdministrationAudit

export type LegacyKeyEvents = Partial<TimetableData> & {
  log?: LogEvent[]
  legacyUnanchored?: boolean
}
