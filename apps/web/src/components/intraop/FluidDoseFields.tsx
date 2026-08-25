"use client"

import { DoseSelector } from "@/components/intraop/DoseSelector"
import { resolveFluidSelectorDefaults } from "@/lib/fluid-entry-ui"
import type { createDoseSurfaces } from "./dose-surfaces"
import type { TtFP } from "./timetable-types"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * The fluid half of the quick-entry flyout.
 *
 * A fluid is recorded one of two ways and the choice changes what is being
 * asked for. By volume is a bag hung and given: a number of millilitres. By
 * rate is a line running: millilitres per hour, which keeps accruing until the
 * line is stopped and is what the delivered total is later computed from.
 *
 * The two are offered as a pair of buttons rather than inferred, because a bag
 * recorded as a rate — or the reverse — produces a fluid balance that is wrong
 * in a way nobody reads back off the chart.
 *
 * Presentational: every change goes back through setFp and the commit callback.
 */

export type FluidDoseFieldsProps = {
  fp: TtFP
  setFp: React.Dispatch<React.SetStateAction<TtFP | null>>
  doseSurfaces: ReturnType<typeof createDoseSurfaces>
  clinicalMode: "ADULT" | "PEDIATRIC"
  ibw?: number | null
  tbw?: number | null
  getFluidCategory: (name: string) => string
  onCommit: () => void
}

export function FluidDoseFields({
  fp,
  setFp,
  doseSurfaces,
  clinicalMode,
  ibw,
  tbw,
  getFluidCategory,
  onCommit,
}: FluidDoseFieldsProps) {
  const copy = useIntraopUiCopy()
  const guidanceEnabled = doseSurfaces.guidanceEnabled
  const fluidEntryMode = fp.fluidEntryMode ?? "VOLUME"
  const fluidConcentrations = fp.fluidConcentrations
  const category = getFluidCategory(fp.name)
  return (
    <div className="space-y-2">
      {(fp.fluidEntryModes?.length ?? 0) > 1 && (
        <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#3a3a3a] dark:bg-[#252525]" role="group" aria-label={copy.fluid.entryModeAria}>
          {fp.fluidEntryModes?.map(mode => (
            <button
              key={mode}
              type="button"
              aria-pressed={fluidEntryMode === mode}
              onClick={() => setFp(current => current ? { ...current, fluidEntryMode: mode } : current)}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                fluidEntryMode === mode
                  ? "bg-cyan-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {mode === "VOLUME" ? copy.fluid.bag : copy.fluid.rate}
            </button>
          ))}
        </div>
      )}
      {fp.fluidProfileConflict && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          {copy.fluid.overlappingProfiles}
        </p>
      )}
      <DoseSelector
        key={`fluid-${fp.name}-${fluidEntryMode}`}
        accent="cyan"
        quickValues={fluidEntryMode === "VOLUME" ? fp.quickDoses : undefined}
        concentrationOptions={fluidConcentrations}
        concentration={fp.concentration}
        concentrationUnit="%"
        onConcentrationChange={concentration => setFp(current => {
          if (!current) return current
          if (!guidanceEnabled) {
            return { ...current, concentration, customConc: "" }
          }
          const clinicalProfile = doseSurfaces.clinicalFluidProfileFor(current.name)
          const defaults = resolveFluidSelectorDefaults({
            clinicalMode,
            name: current.name,
            category,
            concentration,
            profile: clinicalProfile.profile,
            totalBodyWeightKg: tbw,
            mclarenIdealBodyWeightKg: ibw,
            useIdealBodyWeight: false,
          })
          return {
            ...current,
            concentration,
            customConc: "",
            fluidRate: defaults.rate,
            fluidRateHint: defaults.rateHint,
            fluidEntryModes: defaults.availableModes,
            fluidEntryMode: current.fluidEntryMode
              && defaults.availableModes.includes(current.fluidEntryMode)
                ? current.fluidEntryMode
                : defaults.defaultMode,
            fluidProfileConflict: clinicalProfile.conflict,
          }
        })}
        customConcentration={fp.customConc}
        onCustomConcentrationChange={customConc => setFp(current => current ? { ...current, customConc } : current)}
        value={fluidEntryMode === "VOLUME" ? fp.dose : fp.fluidRate ?? ""}
        onValueChange={value => setFp(current => current
          ? fluidEntryMode === "VOLUME"
            ? { ...current, dose: value }
            : { ...current, fluidRate: value }
          : current)}
        valuePlaceholder={fluidEntryMode === "VOLUME" ? copy.fluid.bagVolume : copy.fluid.rate}
        min={fluidEntryMode === "VOLUME" ? fp.fluidBagMin ?? 0 : fp.fluidRateMin ?? 1}
        max={fluidEntryMode === "VOLUME" ? fp.fluidBagMax ?? 2000 : fp.fluidRateMax ?? 200}
        step={fluidEntryMode === "VOLUME" ? fp.fluidBagStep ?? 50 : fp.fluidRateStep ?? 1}
        unitSuffix={fluidEntryMode === "VOLUME" ? fp.unit : "mL/h"}
        extraHint={fluidEntryMode === "RATE" ? fp.fluidRateHint : undefined}
        routes={fp.routes}
        route={fp.route}
        onRouteChange={route => setFp(current => {
          if (!current) return current
          const next = doseSurfaces.fluidDoseSurface(current.name, route)
          if (!guidanceEnabled) {
            return {
              ...current,
              unit: next.surface.unit,
              route: next.surface.route,
              dose: "",
              quickDoses: [],
              concentration: undefined,
              customConc: "",
              fluidConcentrations: [],
              fluidEntryModes: ["VOLUME"],
              fluidEntryMode: "VOLUME",
              fluidRate: "",
              fluidRateHint: undefined,
              fluidProfileConflict: next.conflict,
            }
          }
          const concentration = next.surface.defaultConcentration
          const defaults = resolveFluidSelectorDefaults({
            clinicalMode,
            name: current.name,
            category,
            concentration,
            profile: next.profile,
            totalBodyWeightKg: tbw,
            mclarenIdealBodyWeightKg: ibw,
            useIdealBodyWeight: false,
          })
          return {
            ...current,
            unit: next.surface.unit,
            route: next.surface.route,
            dose: String(next.surface.suggestedVolume),
            quickDoses: next.surface.quickValues,
            concentration,
            customConc: "",
            fluidConcentrations: next.surface.concentrationOptions,
            fluidBagMin: next.surface.min,
            fluidBagMax: next.surface.max,
            fluidBagStep: next.surface.step,
            fluidEntryModes: defaults.availableModes,
            fluidEntryMode: current.fluidEntryMode
              && defaults.availableModes.includes(current.fluidEntryMode)
                ? current.fluidEntryMode
                : defaults.defaultMode,
            fluidRate: defaults.rate,
            fluidRateHint: defaults.rateHint,
            fluidRateMin: defaults.rateProfile.min,
            fluidRateMax: defaults.rateProfile.max,
            fluidRateStep: defaults.rateProfile.step,
            fluidProfileConflict: next.conflict,
            clinicalRuleKey: next.clinicalRuleKey,
            clinicalRuleVersion: next.clinicalRuleVersion,
            clinicalRuleSourceIds: next.clinicalRuleSourceIds,
          }
        })}
        confirmLabel={fluidEntryMode === "VOLUME" ? copy.fluid.addBag : copy.fluid.startFluid}
        manualEntryOnly={!guidanceEnabled}
        confirmDisabled={fp.fluidProfileConflict || (fluidEntryMode === "VOLUME"
          ? !fp.dose
          : !fp.fluidRate || Number(fp.fluidRate) <= 0)}
        onConfirm={onCommit}
      />
    </div>
  )
}
