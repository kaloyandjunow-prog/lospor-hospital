import type { LocalAnaestheticFormulation } from "@lospor/core/catalog"
import type { DrugSelectionSurface } from "@lospor/core/drug-selection"
import type { FluidEntryMode } from "@lospor/core/intraop-fluids"

/**
 * Shared shapes for the intraoperative timetable.
 *
 * These were declared inside IntraopTimetable.tsx, which meant nothing could be
 * lifted out of that file without either dragging the types along or widening
 * them to `unknown` at the boundary. They are here so a row, a lane or a sheet
 * can be given a real type.
 *
 * The names are kept exactly as they were. They are terse, but renaming them
 * would touch several hundred call sites in a component with no end-to-end
 * coverage running, and the split is the point — not the vocabulary.
 */

/** Where a conflict popover is anchored, in viewport coordinates. */
export type FConflictAnchor = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
}

/** A fluid the clinician has chosen but not yet committed to the chart. */
export type PendingFluidEntry = {
  name: string
  category: string
  color: string
  fluidEntryMode: FluidEntryMode
  volume: string
  bagVolumeMl?: number
  rate?: number
  unit?: "mL/h"
  concentration?: string
  clinicalRuleKey?: string
  clinicalRuleVersion?: string
  clinicalRuleSourceIds?: string[]
  clinicalPresetId?: string
  clinicalPresetVersion?: number
  clinicalPresetScope?: "PLATFORM" | "INSTITUTION" | "USER"
}

/**
 * Starting a fluid while the same one is already running is a decision only the
 * clinician can make — continue the existing line, or finish it and start a new
 * one. The phases are the steps of asking.
 */
export type FluidConflict =
  | { phase: "choose"; pending: PendingFluidEntry; newCol: number; existingId: string; existingName: string; anchor: FConflictAnchor }
  | { phase: "finished"; pending: PendingFluidEntry; newCol: number; existingId: string; anchor: FConflictAnchor }
  | { phase: "volume"; pending: PendingFluidEntry; newCol: number; existingId: string; volInput: string; anchor: FConflictAnchor }

/** What the chart currently has selected. */
export type TtSel =
  | { type: "drug"; idx: number }
  | { type: "infusion"; id: string }
  | { type: "fluid"; id: string }
  | { type: "agent"; startCol: number }

export type TtFPMode = "bolus" | "infusion" | "fluid"

// TtSel's `id`/`startCol`/`idx` fields each only exist on 2 of its 4 members —
// these narrow without a cast for spots that key off "is this an id-bearing
// selection" rather than one specific exact type.
export function selId(s: TtSel): string | undefined {
  return s.type === "infusion" || s.type === "fluid" ? s.id : undefined
}

export function selIdx(s: TtSel): number | undefined {
  return s.type === "drug" ? s.idx : undefined
}

/** The dosing flyout: everything the quick-entry popover needs to render. */
export type TtFP = {
  col: number; name: string; unit: string; mode: TtFPMode; dose: string; doseHint: string;
  rate: number; rateUnit: string; rateUnits: string[];
  rateMin: number; rateMax: number; rateStep: number;
  color: string; fluidScale?: "S" | "L";
  fluidEntryMode?: FluidEntryMode
  fluidEntryModes?: FluidEntryMode[]
  fluidRate?: string
  fluidRateHint?: string
  fluidRateMin?: number
  fluidRateMax?: number
  fluidRateStep?: number
  fluidBagMin?: number
  fluidBagMax?: number
  fluidBagStep?: number
  fluidConcentrations?: string[]
  fluidProfileConflict?: boolean
  concentration?: string   // local anaesthetic solution % (e.g. "0.25%")
  concentrationUnitHint?: string
  customConc?: string      // user-typed custom % before appending "%"
  quickDoses?: number[]    // bolus quick-dose presets
  quickRates?: number[]    // infusion quick-rate presets
  routes?: string[]        // available routes of administration for this drug
  route?: string           // selected route
  formulation?: LocalAnaestheticFormulation
  formulationOptions?: LocalAnaestheticFormulation[]
  concentrationOptions?: string[]
  manualEntryOnly?: boolean
  /** Routine-hidden item opened deliberately from search; never resolve guidance for it. */
  searchOnlyManualEntry?: boolean
  advisory?: string
  calculationBasis?: "FLAT" | "TBW" | "IBW" | "BSA_M2"
  calculationWeightKg?: number
  calculationMethod?: string
  calculationUnavailableReason?: DrugSelectionSurface["calculationUnavailableReason"]
  clinicalRuleKey?: string
  clinicalRuleVersion?: string
  clinicalRuleSourceIds?: string[]
  clinicalPresetId?: string
  clinicalPresetVersion?: number
  clinicalPresetScope?: "PLATFORM" | "INSTITUTION" | "USER"
  anchor: FConflictAnchor
}
