import {
  calculateFluidVolumeMl,
  normalizeFluidEntryMode,
} from "@lospor/core/intraop-fluids"

import type { ActiveFluid, FluidEntryMode } from "@/lib/intraop-log-event"

export {
  FLUID_RATE_SLIDER,
  calculatePediatricMaintenanceRateMlPerHour,
  isBloodProductFluid,
  isMaintenanceCompatibleFluid,
  resolveFluidEntryModeProfile,
  resolvePediatricMaintenanceWeightKg,
} from "@lospor/core/intraop-fluids"

export function fluidEntryModeOf(fluid: Pick<ActiveFluid, "fluidEntryMode">): FluidEntryMode {
  return normalizeFluidEntryMode(fluid.fluidEntryMode)
}

/** Resolve the one volume that totals and stop events should persist. */
export function calculatedFluidVolumeMl(
  fluid: ActiveFluid,
  endTs: Date | string | number = new Date(),
): number {
  return calculateFluidVolumeMl({
    fluidEntryMode: fluidEntryModeOf(fluid),
    bagVolumeMl: fluid.bagVolumeMl,
    administeredVolumeMl: fluid.administeredVolumeMl,
    legacyVolume: fluid.volume,
    startTs: fluid.startTs,
    endTs,
    rate: fluid.initialRate ?? fluid.rate,
    rateChanges: fluid.rateChanges,
  })
}

export function fluidEntryValueLabel(fluid: ActiveFluid): string {
  return fluidEntryModeOf(fluid) === "RATE"
    ? `${fluid.rate ?? "-"} ${fluid.unit ?? "mL/h"}`
    : `${fluid.bagVolumeMl ?? fluid.volume} mL`
}
