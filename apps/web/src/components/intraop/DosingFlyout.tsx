"use client"

import { createPortal } from "react-dom"
import { useIntraopUiCopy } from "./ui-copy"
import { DosingFlyoutHeader } from "./DosingFlyoutHeader"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { FluidDoseFields } from "./FluidDoseFields"
import { InfusionDoseFields } from "./InfusionDoseFields"
import { fitPopoverWidth, positionPopover } from "./anchored-position"
import type { createDoseSurfaces } from "./dose-surfaces"
import type { TtFP } from "./timetable-types"
import type { InfusionRecord } from "@lospor/core/infusion-entry"
import { drugSelectorAtomicState } from "@/lib/drug-selector-surface"
import { DISPLAY_CLINICAL_DOSE_GUIDANCE } from "@/lib/clinical-guidance-policy"
import { doseConfirmProblem } from "@lospor/core/infusion-entry"

/**
 * The quick-entry flyout: the panel that opens on a cell and takes a dose.
 *
 * This is where a drug, an infusion or a fluid is recorded, so it has to survive
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
  infusionWeightBasis: Record<string, "IBW" | "TBW" | "BSA_M2" | "none">
  /** Provenance of the paediatric ruleset, shown as a badge in the panel. */
  pediatricRulesSource: "server" | "cache" | null
  pediatricRulesCachedAt: string | null
  pediatricRulesLoading: boolean
  pediatricRulesError: string | null
  fpCommitBolus: () => void
  /** The record carries both rates (dose and pump) worked out by InfusionDoseFields. */
  fpCommitInfusion: (record?: InfusionRecord) => void
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
  const copy = useIntraopUiCopy()
  if (!fp || typeof document === "undefined") return null

  return createPortal(
    <>
      {/* Backdrop to close */}
      <div className="fixed inset-0 z-[9998]" onClick={() => setFp(null)} />
      {/* Popup */}
      {(() => {
        const bsurf = fp.searchOnlyManualEntry
          ? undefined
          : doseSurfaces.bolusRouteSurface(fp.name, fp.route)
        const adultSurface = !fp.searchOnlyManualEntry && !isPediatric && fp.mode === "bolus"
          ? doseSurfaces.adultBolusSurface(fp.name, fp.route)
          : null
        const pediatricProfiles = !fp.searchOnlyManualEntry && isPediatric && fp.mode === "bolus"
          ? doseSurfaces.pediatricProfilesFor(fp.name)
          : []
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
        const detailed = hasDetailedBolus || hasDetailedFluid || fp.mode === "infusion" // syringe, units and readout
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
            <DosingFlyoutHeader
              title={fp.mode === "bolus" ? displayDrugName(fp.name) : fp.mode === "infusion" ? displayInfusionName(fp.name) : displayFluidName(fp.name)}
              atLabel={copy.at} time={times[fp.col]} onClose={() => setFp(null)}
            />

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
              // Why Administer is off, said above it. A strength offered must be
              // picked (a refused Other leaves none), as on the PWA.
              const blocked = doseConfirmProblem({ dose: fp.dose, strengthMissing: isLA && !fp.concentration,
                formulationMissing: !!bolusSurface?.formulationOptions.length && !fp.formulation })
              const quick = bolusSurface?.quickValues ?? bsurf?.quickValues ?? fp.quickDoses
              return (
                <>
                  {DISPLAY_CLINICAL_DOSE_GUIDANCE && isPediatric && pediatricRulesLoading ? (
                    <p className="text-[10px] text-slate-500">
                      {isBg ? "Зареждане на одобрения набор..." : "Loading the approved preset..."}
                    </p>
                  ) : null}
                  {DISPLAY_CLINICAL_DOSE_GUIDANCE && isPediatric && pediatricRulesSource === "cache" ? (
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
                  {/* Only missing patient data is worth saying; a route with no calculation (intrathecal, say) is not missing anything. */}
                  {fp.calculationUnavailableReason && fp.calculationUnavailableReason !== "NO_AUTOFILL" && (!isPediatric || pediatricProfiles.length === 1) ? (
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
                    showGuidance={DISPLAY_CLINICAL_DOSE_GUIDANCE}
                    quickValues={quick}
                    manualEntryOnly={fp.manualEntryOnly}
                    concentrationOptions={isLA ? conc : undefined}
                    concentration={fp.concentration}
                    concentrationUnit={bolusSurface?.concentrationUnit ?? (isLA ? "%" : undefined)} concentrationName={fp.name}
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
                    valuePlaceholder={copy.dose}
                    min={br.min} max={br.max} step={br.step}
                    units={!bolusSurface && !laSelected ? ["mg","mcg","ml","g","IU"] : undefined}
                    unit={fp.unit} onUnitChange={u => setFp(f => f ? {...f, unit: u} : f)}
                    unitSuffix={bolusSurface || laSelected ? fp.unit : undefined}
                    routes={fp.routes}
                    route={fp.route}
                    onRouteChange={r => setFp(f => {
                      if (!f) return f
                      if (f.searchOnlyManualEntry) return { ...f, route: r }
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
                    confirmLabel={copy.administer}
                    confirmBlockedReason={blocked ? copy.infusionNeeds[blocked] : undefined}
                    onConfirm={fpCommitBolus}
                    confirmDisabled={
                      !!blocked || pediatricProfiles.length > 1
                    }
                    stickyConfirm
                  />
                </>
              )
            })()}

            {fp.mode === "infusion" && (
              <InfusionDoseFields fp={fp} setFp={setFp} doseSurfaces={doseSurfaces} isPediatric={isPediatric}
                laConcentrations={laConcentrations} infusionWeightBasis={infusionWeightBasis} ibw={ibw} tbw={tbw} onConfirm={fpCommitInfusion} />
            )}
          </div>
        )
      })()}
    </>,
    document.body,
  )
}
