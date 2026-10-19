"use client"

import { DoseSelector } from "@/components/intraop/DoseSelector"
import { DISPLAY_CLINICAL_DOSE_GUIDANCE } from "@/lib/clinical-guidance-policy"
import { infusionRateView, infusionStrengths, suggestedRateAt, switchInfusionUnit, type InfusionRateInput } from "@/lib/infusion-rate-view"
import { infusionConfirmProblem, infusionEntryWeightKg, infusionRecord, type InfusionRecord } from "@lospor/core/infusion-entry"
import { infusionCalculationBasis } from "@lospor/core/intraop-totals"
import type { createDoseSurfaces } from "./dose-surfaces"
import type { TtFP } from "./timetable-types"
import { useIntraopUiCopy } from "./ui-copy"
import { SyringeCustomFields } from "./SyringeCustomFields"
import { parseSyringe } from "@lospor/core/infusion-volume"
import { TCI_DRUG_SPECS, tciDrugFor, tciModelsFor } from "@lospor/core/tci"
import { defaultTciChoice, TciFields, TciModeSwitch } from "./TciFields"
import { useTciPatient } from "./tci-patient-context"

/**
 * The infusion half of the dosing flyout: strength, rate, unit, route.
 *
 * The strength comes first -- a syringe ("4 mg/50 mL", or typed with Other)
 * or a local anaesthetic's %. The rate may be entered in the drug's unit, the
 * other dose unit of the same amount, or the pump's mL/hr; the other rate is
 * read out beside it, and both are recorded (2026-10-18). The syringe may be
 * skipped: then there is no pump rate and no millilitres for the balance.
 * Same logic as the PWA (core infusion-entry.ts).
 */
/** Marks Other as open while its syringe is not yet valid (the selector reopens on a non-empty value). */
const OTHER_OPEN = "…"

export function InfusionDoseFields({
  fp, setFp, doseSurfaces, isPediatric, laConcentrations, infusionWeightBasis, ibw, tbw, onConfirm,
}: {
  fp: TtFP
  setFp: React.Dispatch<React.SetStateAction<TtFP | null>>
  doseSurfaces: ReturnType<typeof createDoseSurfaces>
  isPediatric: boolean
  laConcentrations: Record<string, string[]>
  infusionWeightBasis: Record<string, "IBW" | "TBW" | "BSA_M2" | "none">
  ibw?: number | null
  tbw?: number | null
  onConfirm: (record?: InfusionRecord) => void
}) {
  const copy = useIntraopUiCopy()
  const tciPatient = useTciPatient()
  const isurf = fp.searchOnlyManualEntry
    ? undefined
    : doseSurfaces.infusionRouteSurface(fp.name, fp.route)
  const conc = isPediatric
    ? fp.concentrationOptions
    : isurf ? (isurf.mode?.includes("concentration") ? isurf.concentrationOptions : undefined) : laConcentrations[fp.name]
  const isLA = !!fp.concentrationUnitHint || !!conc?.length
  // Children's infusions are on actual weight (the paediatric profiles' basis);
  // an adult library basis of "none" names no weight at all.
  const libraryBasis = fp.searchOnlyManualEntry ? undefined : infusionWeightBasis[fp.name]
  const basis = isPediatric && !fp.searchOnlyManualEntry ? "TBW" : libraryBasis === "none" ? undefined : libraryBasis
  const isPerKg = fp.rateUnit?.includes("/kg/")
  const wt = basis === "TBW" ? tbw : ibw
  const weightHint = isPerKg && basis
    ? `⚖ ${copy.totalUsesWeight(basis, wt ? Math.round(wt * 10) / 10 : undefined)}`
    : undefined
  // A typed infusion with no library entry keeps its free unit choice (it is
  // given several); any catalogue infusion -- one unit, with or without
  // per-route profiles -- gets the strength, the entry units and both rates.
  const governed = !fp.searchOnlyManualEntry && (isPediatric || !!isurf || fp.rateUnits.length === 1)
  const weightKg = isPediatric ? tbw ?? null : infusionEntryWeightKg({
    basis: infusionCalculationBasis(fp.name, infusionWeightBasis), idealWeightKg: ibw, actualWeightKg: tbw })
  const entryUnit = fp.entryUnit ?? fp.rateUnit
  const rateInput: InfusionRateInput = {
    name: fp.name, ruleUnit: fp.rateUnit, entryUnit, doseUnit: fp.doseUnit, value: fp.manualEntryOnly && fp.rate === 0 ? "" : fp.rate,
    min: fp.rateMin, max: fp.rateMax, step: fp.rateStep, quickValues: fp.quickRates,
    doseLimit: fp.doseLimit, concentration: fp.concentration, weightKg,
  }
  const view = infusionRateView({ ...rateInput, onPumpLabel: copy.volumeOnPump })
  const strengths = governed && (isLA || doseSurfaces.guidanceEnabled)
    ? infusionStrengths({ name: fp.name, route: fp.route, localAnaesthetic: isLA ? conc : undefined })
    : { options: isLA ? conc ?? [] : [], syringe: false }
  const extraHint = governed
    ? [view.readout, fp.advisory, weightHint].filter(Boolean).join(" · ") || undefined
    : [fp.advisory, weightHint].filter(Boolean).join(" · ") || undefined
  const record = (): InfusionRecord | undefined => governed
    ? infusionRecord({ unit: fp.rateUnit, min: fp.rateMin, max: fp.rateMax, step: fp.rateStep, doseLimit: fp.doseLimit,
        concentration: fp.concentration, weightKg, value: Number(fp.rate), entryUnit, doseUnit: fp.doseUnit }) ?? undefined
    : undefined
  // Why Start is off, said above it rather than refused in silence.
  const blocked = infusionConfirmProblem({ rate: fp.rate, strengthMissing: !!fp.concentrationUnitHint && !fp.concentration,
    formulationMissing: !!fp.formulationOptions?.length && !fp.formulation })
  // Propofol, remifentanil, sufentanil and alfentanil may run as TCI instead (2026-10-18).
  const tciDrug = governed ? tciDrugFor(fp.name) : null
  const offersTci = !!tciDrug && tciModelsFor(tciDrug, isPediatric).length > 0
  const rateFields = (
    <DoseSelector
      accent="blue"
      concentrationOptions={strengths.options.length ? strengths.options : undefined}
      concentrationLabel={strengths.syringe ? copy.syringe : undefined}
      customConcentrationContent={strengths.syringe && fp.customConc ? (
        <SyringeCustomFields name={fp.name} route={fp.route} doseUnit={fp.rateUnit}
          onChange={label => setFp(f => f ? { ...f, concentration: label, customConc: label ?? OTHER_OPEN } : f)} />
      ) : undefined}
      concentrationUnit={isLA ? fp.concentrationUnitHint : undefined} concentrationName={fp.name}
      concentration={fp.concentration}
      onConcentrationChange={c => setFp(f => {
        if (!f) return f
        const suggested = suggestedRateAt({ ...rateInput, value: f.rate }, c)
        return { ...f, concentration: c, customConc: "", ...(suggested == null ? {} : { rate: suggested }) }
      })}
      customConcentration={fp.customConc}
      onCustomConcentrationChange={v => setFp(f => f ? {...f, customConc: strengths.syringe && v === "" ? OTHER_OPEN : v} : f)}
      quickValues={governed ? view.quickValues : fp.quickRates}
      manualEntryOnly={fp.manualEntryOnly}
      value={fp.manualEntryOnly && fp.rate === 0 ? "" : String(fp.rate)}
      onValueChange={v => setFp(f => f ? { ...f, rate: parseFloat(v) || (governed ? 0 : f.rateMin) } : f)}
      valuePlaceholder={copy.rate}
      min={governed ? view.min : fp.rateMin} max={governed ? view.max : fp.rateMax} step={governed ? view.step : fp.rateStep}
      units={governed ? (view.units.length > 1 ? view.units : undefined) : !isLA ? fp.rateUnits : undefined}
      unit={governed ? entryUnit : fp.rateUnit}
      onUnitChange={u => setFp(f => {
        if (!f) return f
        if (!governed) return { ...f, rateUnit: u }
        const next = switchInfusionUnit({ ...rateInput, value: f.rate, next: u })
        return { ...f, rate: next.value ?? 0, entryUnit: next.entryUnit, doseUnit: next.doseUnit }
      })}
      unitSuffix={governed ? entryUnit : fp.rateUnit}
      extraHint={extraHint}
      showGuidance={DISPLAY_CLINICAL_DOSE_GUIDANCE}
      formulationOptions={fp.formulationOptions}
      formulation={fp.formulation}
      onFormulationChange={formulation => setFp(f => f ? { ...f, formulation } : f)}
      routes={fp.routes} route={fp.route} onRouteChange={r => setFp(f => {
        if (!f) return f
        if (f.searchOnlyManualEntry) return { ...f, route: r }
        if (isPediatric) {
          const next = doseSurfaces.clinicalPediatricInfusionFor(f.name, r).surface
          if (!next || next.disposition === "HIDDEN") return f
          return {
            ...f,
            route: next.route,
            rate: next.suggestedRate ?? 0,
            rateUnit: next.unit,
            rateUnits: [next.unit],
            entryUnit: undefined,
            doseUnit: undefined,
            rateMin: next.min,
            rateMax: next.max,
            rateStep: next.step,
            quickRates: next.quickValues,
            concentration: next.concentration || undefined,
            concentrationOptions: next.concentrationOptions,
            concentrationUnitHint: next.concentrationUnit,
            customConc: "",
            formulation: next.formulation,
            formulationOptions: next.formulationOptions,
            manualEntryOnly: next.manualEntryOnly,
            advisory: next.advisory ?? undefined,
            doseLimit: next.doseLimit,
            clinicalRuleKey: next.ruleKey,
            clinicalRuleVersion: next.ruleVersion,
            clinicalRuleSourceIds: next.sourceIds,
          }
        }
        const surf = doseSurfaces.infusionRouteSurface(f.name, r)
        if (!surf) return { ...f, route: r }
        return { ...f, route: r,
          rateUnit: surf.unit, rateUnits: [surf.unit], entryUnit: undefined, doseUnit: undefined,
          rateMin: surf.min, rateMax: surf.max, rateStep: surf.step,
          rate: surf.suggestedRate ?? surf.min,
          quickRates: surf.quickValues ?? f.quickRates,
          concentration: surf.suggestedConcentration, customConc: "" }
      })}
      confirmLabel={copy.startInfusion}
      // Other open and not yet a usable syringe: its fields say why, and the start waits.
      confirmDisabled={!!blocked || (strengths.syringe && !!fp.customConc && !parseSyringe(fp.concentration))}
      confirmBlockedReason={blocked ? copy.infusionNeeds[blocked] : undefined}
      onConfirm={() => onConfirm(record())}
    />
  )
  if (!offersTci || !tciDrug) return rateFields
  return (
    <div className="space-y-2">
      <TciModeSwitch
        tci={!!fp.tci}
        onRate={() => setFp(f => f ? { ...f, tci: undefined, rate: f.quickRates?.[0] ?? f.rateMin } : f)}
        onTci={() => setFp(f => {
          const choice = f ? defaultTciChoice(tciDrug, isPediatric, tciPatient) : null
          return f && choice ? { ...f, tci: choice, rate: TCI_DRUG_SPECS[tciDrug].target.prefill, entryUnit: undefined, doseUnit: undefined } : f
        })}
      />
      {fp.tci ? (
        <TciFields
          drug={tciDrug} pediatric={isPediatric} patient={tciPatient} choice={fp.tci}
          onChoice={choice => setFp(f => f ? { ...f, tci: choice } : f)}
          target={fp.rate} onTarget={value => setFp(f => f ? { ...f, rate: value } : f)}
          syringes={strengths.syringe ? strengths.options : []} syringe={fp.concentration}
          onSyringe={concentration => setFp(f => f ? { ...f, concentration } : f)}
          onConfirm={() => onConfirm({ rate: fp.rate, unit: TCI_DRUG_SPECS[tciDrug].units.target })}
        />
      ) : rateFields}
    </div>
  )
}
