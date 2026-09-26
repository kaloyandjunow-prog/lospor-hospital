import type { PremedicationDrug } from "@lospor/core/option-library"
// Shared value types for the intraop screen and its extracted pieces.

export type ClinicalEventDef = { code?: string; label: string; labelBg?: string | null; color: string }

export type VascularEntry = {
  id: string
  site: string
  siteLabel: string
  size: string
  sizeUnit: string
  depthCm: string
  lumens?: string
  preexisting?: boolean
}

export type PremDrug = {
  name: string
  /** Per-route dose, range and step (1.4.9); see adultPremedForRoute. */
  routeDoses?: PremedicationDrug["routeDoses"]
  dose: number
  unit: string
  min: number
  max: number
  step: number
  routes: string[]
  defaultRoute: string
  hint: string
}
