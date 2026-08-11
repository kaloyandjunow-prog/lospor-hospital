"use client"

import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { FluidDoseFields } from "./FluidDoseFields"
import { fitPopoverWidth, positionPopover } from "./anchored-position"
import type { createDoseSurfaces } from "./dose-surfaces"
import type { TtFP } from "./timetable-types"
import { drugSelectorAtomicState } from "@/lib/drug-selector-surface"

/**
 * The quick-entry flyout: the panel that opens on a cell and takes a dose.
 *
 * This is where a drug, an infusion or a fluid is actually recorded, so it is
 * the single most-used surface on the chart and the one that has to survive
 * being used badly — one thumb, in a hurry, on a screen that may be small.
 *
 * It sizes itself to what it has to show. A drug with several routes,
 * concentrations or entry modes gets a wider panel and needs more headroom
 * before it will open downwards; a plain dose gets a narrow one. Placement goes
 * through the shared popover maths so it behaves like every other panel on the
 * screen rather than being a tenth hand-rolled copy.
 *
 * What it opens *with* — which dose, from which rule — is decided before it is
 * rendered, in ./flyout-state and ./dose-surfaces. This component is the panel,
 * not the pharmacology.
 */

export type DosingFlyoutProps = {
  /** Null when no cell is being edited; the flyout renders nothing. */
  fp: TtFP | null
  setFp: React.Dispatch<React.SetStateAction<TtFP | null>>
  doseSurfaces: ReturnType<typeof createDoseSurfaces>
  /** Wall-clock label per column, for the "at 08:35" line. */
  times: string[]
  isPediatric: boolean
  /** Bulgarian locale, which some clinical labels are written for. */
  isBg: boolean
  ibw?: number | null
  tbw?: number | null
  displayDrugName: (name: string) => string
  displayInfusionName: (name: string) => string
  displayFluidName: (name: string) => string
  getFluidCategory: (name: string) => string
  clinicalMode: "ADULT" | "PEDIATRIC"
  /** Local-anaesthetic strengths offered per drug. */
  laConcentrations: Record<string, string[]>
  /** Whether an infusion's rate is per-kilogram, and on which weight. */
  infusionWeightBasis: Record<string, "IBW" | "TBW" | "none">
  /** Provenance of the paediatric ruleset, shown as a badge in the panel. */
  pediatricRulesSource: "server" | "cache" | null
  pediatricRulesCachedAt: string | null
  pediatricRulesLoading: boolean
  pediatricRulesError: string | null
  fpCommitBolus: () => void
  fpCommitInfusion: () => void
  fpCommitFluid: () => void
}

export function DosingFlyout({
  fp,
  setFp,
  doseSurfaces,
  times,
  isPediatric,
  isBg,
  ibw,
  tbw,
  displayDrugName,
  displayInfusionName,
  displayFluidName,
  getFluidCategory,
  clinicalMode,
  laConcentrations,
  infusionWeightBasis,
  pediatricRulesSource,
  pediatricRulesCachedAt,
  pediatricRulesLoading,
  pediatricRulesError,
  fpCommitBolus,
  fpCommitInfusion,
  fpCommitFluid,
}: DosingFlyoutProps) {
  if (!fp || typeof document === "undefined") return null

  return createPortal(
    <>
      {/* Backdrop to close */}
      <div className="fixed inset-0 z-[9998]" onClick={() => setFp(null)} />
      {/* Popup */}
      {(() => {
        const bsurf = doseSurfaces.bolusRouteSurface(fp.name, fp.route)
        const adultSurface = !isPediatric && fp.mode === "bolus"
          ? doseSurfaces.adultBolusSurface(fp.name, fp.route)
          : null
        const pediatricProfiles = isPediatric && fp.mode === "bolus" ? doseSurfaces.pediatricProfilesFor(fp.name) : []
        const pediatricSurface = pediatricProfiles.length === 1
          ? doseSurfaces.pediatricProfileResolution(pediatricProfiles[0], fp.route)
          : null
        const bolusSurface = pediatricSurface ?? adultSurface
        const hasDetailedBolus = fp.mode === "bolus" && !!bolusSurface && (
          bolusSurface.routes.length > 1
          || bolusSurface.quickValues.length > 5
          || bolusSurface.concentrationOptions.length > 0
          || bolusSurface.formulationOptions.length > 0
        )
        const hasDetailedFluid = fp.mode === "fluid" && (
          (fp.fluidEntryModes?.length ?? 0) > 1
          || (fp.fluidConcentrations?.length ?? 0) > 0
        )
        // A flyout with routes, concentrations or entry modes needs both more
        // width and more headroom before it is worth opening downwards.
        const detailed = hasDetailedBolus || hasDetailedFluid
        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const POP_W = fitPopoverWidth(detailed ? 300 : 220, viewport.width)
        const { left, top, showAbove } = positionPopover({
          anchor: fp.anchor,
          width: POP_W,
          viewport,
          flipBelowSpace: detailed ? 420 : 260,
          align: "center",
          belowGap: 6,
        })
        const br = bolusSurface
          ? { min: bolusSurface.min, max: bolusSurface.max, step: bolusSurface.step }
          : bsurf
            ? { min: bsurf.min, max: bsurf.max, step: bsurf.step }
            : doseSurfaces.bolusRange(fp.name, fp.unit)
        return (
          <div
            style={{ position:"fixed", left, top, width:POP_W, zIndex:9999, transform: showAbove ? "translateY(-100%)" : undefined }}
            className="max-h-[calc(100vh-16px)] overflow-y-auto bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{fp.mode === "bolus" ? displayDrugName(fp.name) : fp.mode === "infusion" ? displayInfusionName(fp.name) : displayFluidName(fp.name)}</span>
              <button type="button" onClick={() => setFp(null)} className="text-slate-300 hover:text-red-400 shrink-0 transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500">
              at <span className="font-semibold text-blue-500 dark:text-blue-400">{times[fp.col]}</span>
            </p>

            {fp.mode === "fluid" && (
              <FluidDoseFields
                fp={fp}
                setFp={setFp}
                doseSurfaces={doseSurfaces}
                clinicalMode={clinicalMode}
                ibw={ibw}
                tbw={tbw}
                getFluidCategory={getFluidCategory}
                onCommit={fpCommitFluid}
              />
            )}

            {fp.mode === "bolus" && (() => {
              const conc = bolusSurface?.concentrationOptions.length
                ? bolusSurface.concentrationOptions
                : !isPediatric && bsurf
                  ? (bsurf.mode?.includes("concentration") ? bsurf.concentrationOptions : undefined)
                  : !isPediatric
                    ? laConcentrations[fp.name]
                    : undefined
              const isLA = !!conc?.length
              const laSelected = isLA && !!fp.concentration
              const quick = bolusSurface?.quickValues ?? bsurf?.quickValues ?? fp.quickDoses
              return (
                <>
                  {isPediatric && pediatricRulesLoading ? (
                    <p className="text-[10px] text-slate-500">
                      {isBg ? "Зареждане на одобрения набор..." : "Loading the approved preset..."}
                    </p>
                  ) : null}
                  {isPediatric && pediatricRulesSource === "cache" ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      {isBg
                        ? `Използва се последният запазен набор${pediatricRulesCachedAt ? ` от ${new Date(pediatricRulesCachedAt).toLocaleString()}` : ""}.`
                        : `Using the last cached preset${pediatricRulesCachedAt ? ` from ${new Date(pediatricRulesCachedAt).toLocaleString()}` : ""}.`}
                    </p>
                  ) : null}
                  {isPediatric && !pediatricRulesLoading && pediatricProfiles.length === 0 ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      {isBg
                        ? "Няма приложим одобрен профил. Въведете ръчно проверена доза."
                        : "No applicable approved profile. Enter a manually verified dose."}
                      {pediatricRulesError ? ` ${pediatricRulesError}` : ""}
                    </p>
                  ) : null}
                  {isPediatric && pediatricProfiles.length > 1 ? (
                    <p className="text-[10px] text-red-600 dark:text-red-400">
                      {isBg
                        ? "Има припокриващи се профили. Дозата не може да бъде записана."
                        : "Overlapping profiles were returned. The dose cannot be recorded."}
                    </p>
                  ) : null}
                  {fp.calculationUnavailableReason && (!isPediatric || pediatricProfiles.length === 1) ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      {isBg
                        ? "Дозата не може да бъде изчислена от наличните данни. Въведете я ръчно."
                        : "The dose cannot be calculated from the available patient data. Enter it manually."}
                    </p>
                  ) : null}
                  <DoseSelector
                    key={`bolus-${fp.name}-${fp.route}`}
                    accent="violet"
                    hint={fp.doseHint}
                    quickValues={quick}
                    manualEntryOnly={fp.manualEntryOnly}
                    concentrationOptions={isLA ? conc : undefined}
                    concentration={fp.concentration}
                    concentrationUnit={bolusSurface?.concentrationUnit ?? (isLA ? "%" : undefined)}
                    onConcentrationChange={c => setFp(f => f ? {
                      ...f,
                      concentration: c,
                      customConc: "",
                      unit: c && !bolusSurface ? "ml" : f.unit,
                    } : f)}
                    customConcentration={fp.customConc}
                    onCustomConcentrationChange={v => setFp(f => f ? {...f, customConc: v} : f)}
                    formulationOptions={bolusSurface?.formulationOptions}
                    formulation={fp.formulation}
                    onFormulationChange={formulation => setFp(f => f ? { ...f, formulation } : f)}
                    value={fp.dose} onValueChange={dose => setFp(f => f ? {...f, dose, unit: laSelected ? "ml" : f.unit} : f)}
                    valuePlaceholder="Dose"
                    min={br.min} max={br.max} step={br.step}
                    units={!bolusSurface && !laSelected ? ["mg","mcg","ml","g","IU"] : undefined}
                    unit={fp.unit} onUnitChange={u => setFp(f => f ? {...f, unit: u} : f)}
                    unitSuffix={bolusSurface || laSelected ? fp.unit : undefined}
                    routes={fp.routes}
                    route={fp.route}
                    onRouteChange={r => setFp(f => {
                      if (!f) return f
                      const nextPediatricSurface = isPediatric ? doseSurfaces.pediatricSurfaceFor(f.name, r) : null
                      const nextAdultSurface = !isPediatric ? doseSurfaces.adultBolusSurface(f.name, r) : null
                      const nextSurface = nextPediatricSurface ?? nextAdultSurface
                      const sugg = doseSurfaces.calcSuggestedDose(f.name, ibw ?? null, tbw ?? null, r)
                      if (nextSurface) {
                        const nextAudit = doseSurfaces.calculationAuditFromSurface(nextSurface)
                        const nextRuleAudit = nextPediatricSurface
                          ? {
                              clinicalRuleKey: nextPediatricSurface.ruleKey,
                              clinicalRuleVersion: nextPediatricSurface.ruleVersion,
                              clinicalRuleSourceIds: nextPediatricSurface.sourceIds,
                            }
                          : doseSurfaces.adultDoseAudit(f.name, nextSurface)
                        return {
                          ...f,
                          ...drugSelectorAtomicState(nextSurface),
                          doseHint: isPediatric ? "" : sugg.hint,
                          calculationBasis: nextAudit.calculationBasis,
                          calculationWeightKg: nextAudit.calculationWeightKg,
                          calculationMethod: nextAudit.calculationMethod,
                          clinicalRuleKey: nextRuleAudit.clinicalRuleKey,
                          clinicalRuleVersion: nextRuleAudit.clinicalRuleVersion,
                          clinicalRuleSourceIds: "clinicalRuleSourceIds" in nextRuleAudit
                            ? nextRuleAudit.clinicalRuleSourceIds
                            : undefined,
                          manualEntryOnly: nextPediatricSurface?.manualEntryOnly
                            ?? (nextAdultSurface?.calculationUnavailableReason === "NO_AUTOFILL"
                              && nextAdultSurface.quickValues.length === 0),
                        }
                      }
                      const surf = doseSurfaces.bolusRouteSurface(f.name, r)
                      return {
                        ...f,
                        route: r,
                        dose: isPediatric ? "" : sugg.dose,
                        doseHint: isPediatric ? "" : sugg.hint,
                        unit: surf?.unit ?? f.unit,
                        quickDoses: isPediatric ? undefined : surf?.quickValues ?? f.quickDoses,
                        concentration: undefined,
                        concentrationUnitHint: undefined,
                        customConc: "",
                        formulation: undefined,
                        calculationBasis: undefined,
                        calculationWeightKg: undefined,
                        calculationMethod: undefined,
                        calculationUnavailableReason: undefined,
                        clinicalRuleKey: undefined,
                        clinicalRuleVersion: undefined,
                        clinicalRuleSourceIds: undefined,
                      }
                    })}
                    confirmLabel="Administer"
                    onConfirm={fpCommitBolus}
                    confirmDisabled={
                      !fp.dose
                      || (!!bolusSurface?.concentrationOptions.length && !fp.concentration)
                      || (!!bolusSurface?.formulationOptions.length && !fp.formulation)
                      || pediatricProfiles.length > 1
                    }
                    stickyConfirm
                  />
                </>
              )
            })()}

            {fp.mode === "infusion" && (
              (() => {
                const isurf = doseSurfaces.infusionRouteSurface(fp.name, fp.route)
                const conc = isPediatric
                  ? fp.concentrationOptions
                  : isurf ? (isurf.mode?.includes("concentration") ? isurf.concentrationOptions : undefined) : laConcentrations[fp.name]
                const isLA = !!fp.concentrationUnitHint || !!conc?.length
                const basis = infusionWeightBasis[fp.name]
                const isPerKg = fp.rateUnit?.includes("/kg/")
                const wt = basis === "TBW" ? tbw : ibw
                const weightHint = isPerKg && basis
                  ? `⚖ Total will use ${basis}${wt ? ` ${Math.round(wt * 10) / 10} kg` : " — enter patient weight in preop"}`
                  : undefined
                const extraHint = [fp.advisory, weightHint].filter(Boolean).join(" · ") || undefined
                return (
                  <DoseSelector
                    accent="blue"
                    concentrationOptions={isLA ? conc : undefined}
                    concentrationUnit={isLA ? fp.concentrationUnitHint : undefined}
                    concentration={fp.concentration}
                    onConcentrationChange={c => setFp(f => f ? {...f, concentration: c, customConc: ""} : f)}
                    customConcentration={fp.customConc}
                    onCustomConcentrationChange={v => setFp(f => f ? {...f, customConc: v} : f)}
                    quickValues={fp.quickRates}
                    manualEntryOnly={fp.manualEntryOnly}
                    value={String(fp.rate)} onValueChange={v => setFp(f => f ? {...f, rate: parseFloat(v) || f.rateMin} : f)}
                    valuePlaceholder="Rate"
                    min={fp.rateMin} max={fp.rateMax} step={fp.rateStep}
                    units={!isLA ? fp.rateUnits : undefined}
                    unit={fp.rateUnit} onUnitChange={u => setFp(f => f ? {...f, rateUnit: u} : f)}
                    unitSuffix={fp.rateUnit}
                    extraHint={extraHint}
                    formulationOptions={fp.formulationOptions}
                    formulation={fp.formulation}
                    onFormulationChange={formulation => setFp(f => f ? { ...f, formulation } : f)}
                    routes={fp.routes} route={fp.route} onRouteChange={r => setFp(f => {
                      if (!f) return f
                      if (isPediatric) {
                        const next = doseSurfaces.clinicalPediatricInfusionFor(f.name, r).surface
                        if (!next || next.disposition === "HIDDEN") return f
                        return {
                          ...f,
                          route: next.route,
                          rate: next.suggestedRate ?? 0,
                          rateUnit: next.unit,
                          rateUnits: [next.unit],
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
                          clinicalRuleKey: next.ruleKey,
                          clinicalRuleVersion: next.ruleVersion,
                          clinicalRuleSourceIds: next.sourceIds,
                        }
                      }
                      const surf = doseSurfaces.infusionRouteSurface(f.name, r)
                      if (!surf) return { ...f, route: r }
                      return { ...f, route: r,
                        rateUnit: surf.unit, rateUnits: [surf.unit],
                        rateMin: surf.min, rateMax: surf.max, rateStep: surf.step,
                        rate: surf.suggestedRate ?? surf.min,
                        quickRates: surf.quickValues ?? f.quickRates,
                        concentration: surf.suggestedConcentration, customConc: "" }
                    })}
                    confirmLabel="Start Infusion"
                    confirmDisabled={
                      !Number.isFinite(Number(fp.rate))
                      || Number(fp.rate) <= 0
                      || (!!fp.concentrationUnitHint && !fp.concentration)
                      || (!!fp.formulationOptions?.length && !fp.formulation)
                    }
                    onConfirm={fpCommitInfusion}
                  />
                )
              })()
            )}
          </div>
        )
      })()}
    </>,
    document.body,
  )
}
