import { useState } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { syringeStrengthProps } from "@/components/intraop/SyringeStrength"
import { resolvePediatricInfusionProfileSurface, type PediatricInfusionProfileRule } from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import { resolvePediatricInfusionAvailability } from "@/lib/pediatric-infusion-routes"
import { useInfusionRateFields } from "@/components/intraop/use-infusion-rate-fields"
import { infusionConfirmProblem, infusionEntryWeightKg, type InfusionRecord } from "@lospor/core/infusion-entry"
import { infusionCalculationBasis, type WeightBasisMap } from "@lospor/core/intraop-totals"
import { Sheet } from "@/components/intraop/Sheet"
import type { ActiveInfusion } from "@/lib/intraop-log-event"
import type { PumpTotalUnit } from "@lospor/core/intraop-types"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { PumpTotalField, tciTargetSurface } from "@/components/intraop/TciSheetFields"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import { useShade } from "@/theme/shade"

type Range = { min: number; max: number; step: number }
type RouteProfileLite = {
  min: number; max: number; step: number
  quickValues?: number[]
  concentrationOptions?: string[]; unit?: string
}

export function InfusionActionSheet({
  visible, onClose, target, ratePresets, newRate, setNewRate, onChangeRate, onStop,
  laConcentrations = {}, newConcentration, setNewConcentration, ranges = {}, routeProfiles = {},
  pediatricMode = false, plannedAt = null, pediatricInfusionProfiles = [], patientAge = null, patientWeightKg,
  patientIdealWeightKg, weightBasis, ruleUnits = {}, prospectiveGuidanceEnabled = true,
}: {
  visible: boolean
  onClose: () => void
  target: ActiveInfusion | null
  ratePresets: Record<string, string[]>
  newRate: string
  setNewRate: (v: string) => void
  /** The record carries both rates (dose and pump) for the change. */
  onChangeRate: (target: ActiveInfusion, rate: string, concentration?: string, record?: InfusionRecord) => void
  /** With the pump total when one was entered (a TCI infusion, 2026-10-18). */
  onStop: (target: ActiveInfusion, pump?: { value: number; unit: PumpTotalUnit }) => void
  laConcentrations?: Record<string, string[]>
  newConcentration?: string
  setNewConcentration?: (c: string | undefined) => void
  ranges?: Record<string, Range>
  // Per-route dose surfaces, keyed by infusion name then route. When the running
  // infusion has a route with a profile (e.g. Lidocaine PD/IT in mL/hr +
  // concentration), the rate-change controls use it instead of the flat range.
  routeProfiles?: Record<string, Record<string, RouteProfileLite>>
  pediatricMode?: boolean
  /**
   * The row time, when the sheet was opened from a row after now: the change
   * or stop is planned for then, and the sheet says so (1.4.14 appliance test).
   */
  plannedAt?: string | null
  pediatricInfusionProfiles?: readonly PediatricInfusionProfileRule[]
  patientAge?: PediatricAgeInput | null
  patientWeightKg?: number | null
  patientIdealWeightKg?: number | null
  weightBasis?: WeightBasisMap
  /** Each infusion's own unit, which its range belongs to; it may be running in another. */
  ruleUnits?: Record<string, string>
  prospectiveGuidanceEnabled?: boolean
}) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const infusionLabel = (name: string) => displayClinicalCode("option:INTRAOP_INFUSION", name, language, { label: name })

  // Resolve the per-route entry surface for the running infusion, falling back
  // to the flat per-name range and concentration when there is no route profile.
  // A child's local anaesthetic infusion keeps its rule's volume limit; any
  // other paediatric infusion is changed by hand, as before.
  const pediatricRule = pediatricMode && target?.route
    ? resolvePediatricInfusionAvailability({ itemKey: target.name, age: patientAge, weightKg: patientWeightKg, profiles: pediatricInfusionProfiles }).rule
    : null
  const pediatricSurface = pediatricRule ? resolvePediatricInfusionProfileSurface({ rule: pediatricRule, route: target?.route }) : null
  const volumeRule = pediatricSurface?.doseLimit ? pediatricSurface : null
  const prof = volumeRule ?? (target?.route ? routeProfiles[target.name]?.[target.route] : undefined)
  const range: Range = prof
    ? { min: prof.min, max: prof.max, step: prof.step }
    : (target ? ranges[target.name] : undefined) ?? { min: 0, max: 100, step: 1 }
  const quickValues = prof?.quickValues ?? (target ? ratePresets[target.name]?.map(Number) : undefined)
  const laStrengths = prof?.concentrationOptions ?? (target ? laConcentrations[target.name] : undefined)
  const concentration = newConcentration ?? target?.concentration
  const ruleUnit = volumeRule?.unit ?? (target ? ruleUnits[target.name] : undefined) ?? target?.unit ?? ""
  // A new syringe may come with the change: the running one, the presets, or Other.
  const [custom, setCustom] = useState<string | undefined>(undefined)
  const strength = syringeStrengthProps({ name: target?.name, route: target?.route, doseUnit: ruleUnit, localAnaesthetic: laStrengths,
    offerSyringes: !!target && prospectiveGuidanceEnabled, concentration: custom !== undefined ? newConcentration : concentration,
    customConcentration: custom, setConcentration: setNewConcentration, color: shade("#3b82f6"), syringeLabel: tc("infusionSyringe") })
  const weightKg = pediatricMode ? patientWeightKg : infusionEntryWeightKg({
    basis: target ? infusionCalculationBasis(target.name, weightBasis) : null, idealWeightKg: patientIdealWeightKg, actualWeightKg: patientWeightKg })
  const fields = useInfusionRateFields({ resetKey: target?.infId ?? "", name: target?.name, unit: ruleUnit, initialEntryUnit: target?.unit, ...range, quickValues,
    doseLimit: volumeRule?.doseLimit, concentration, weightKg, rate: newRate, setRate: setNewRate })
  const at = plannedAt ? ` ${formatMessage(tc("plannedAtTime"), { time: plannedAt })}` : ""
  // A TCI infusion changes its target, in its model's range, and may record the pump's total on the stop (2026-10-18).
  const tci = tciTargetSurface(target?.tciModel)
  // Kept with the infusion it was entered for: the sheet is reused for the next one.
  const [pumpEntry, setPumpEntry] = useState<{ infId: string; pump?: { value: number; unit: PumpTotalUnit } } | null>(null)
  const pump = pumpEntry && pumpEntry.infId === target?.infId ? pumpEntry.pump : undefined
  const tciSuffix = tci ? `${target?.tciSite === "PLASMA" ? "Cp" : "Ce"} ${tci.unit}` : ""
  const selector = tci
    ? { value: newRate, onValueChange: setNewRate, min: tci.min, max: tci.max, step: tci.step, quickValues: tci.quickValues, unitSuffix: tciSuffix }
    : fields.selector

  return (
    <Sheet visible={visible} onClose={onClose} title={target ? `${infusionLabel(target.name)}${plannedAt ? ` ·${at}` : ""}` : tc("trRowInfusion")}>
      {target && (
        <View style={{ gap:12 }}>
          {pediatricMode && !volumeRule ? (
            <Text style={{ color:shade("#fbbf24"), fontSize:12, lineHeight:17 }}>
              {tc("pediatricInfusionManual")}
            </Text>
          ) : null}
          <Text style={{ color:shade("#94a3b8"), fontSize:13 }}>
            {tc("currentLabel")}: {target.rate} {target.unit}{target.concentration ? ` · ${target.concentration}` : ""}
          </Text>
          <DoseSelector
            color={shade("#3b82f6")}
            {...selector}
            valuePlaceholder={tc(tci ? "tciNewTarget" : "newRate")}
            {...strength.selector}
            concentration={concentration}
            {...(laStrengths?.length ? {} : { customConcentration: custom, onCustomConcentrationChange: (value: string | undefined) => { setCustom(value); if (value !== undefined) setNewConcentration?.(undefined) } })}
            onConcentrationChange={next => { setNewConcentration?.(next); const suggested = fields.suggestedFor(next); if (suggested) setNewRate(suggested) }}
            extraHint={tci ? undefined : fields.readout}
            confirmLabel={`${formatMessage(tc("changeTo"), { value: `${newRate} ${selector.unitSuffix}` })}${at}`}
            onConfirm={() => onChangeRate(target, newRate, newConcentration, tci ? { rate: Number(newRate), unit: tci.unit } : fields.record() ?? undefined)}
            confirmDisabled={!!infusionConfirmProblem({ rate: newRate }) || strength.customInvalid}
            confirmBlockedReason={infusionConfirmProblem({ rate: newRate }) ? tc("infusionNeedsRate") : undefined}
          />
          {tci ? <PumpTotalField key={target.infId} amountUnit={tci.amountUnit} color={shade("#ef4444")} onChange={next => setPumpEntry({ infId: target.infId, pump: next })} /> : null}
          <TouchableOpacity
            onPress={() => onStop(target, pump)}
            style={{ backgroundColor:shade("#1e1414"), borderRadius:10, padding:14, alignItems:"center",
              borderWidth:1, borderColor:shade("#ef444444") }}>
            <Text style={{ color:shade("#ef4444"), fontWeight:"700" }}>{tc("trStop")} {tc("trRowInfusion").toLowerCase()}{at}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Sheet>
  )
}
