"use client"

import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { currentFluidRate } from "@/lib/fluid-entry-ui"
import { portalHost } from "@/lib/portal-host"
import { useIntraopUiCopy } from "./ui-copy"
import type { TimetableFluid } from "@/types/timetable"

export type FluidStopState = { id: string; volInput: string; rect: DOMRect; fullBag: boolean | null; /** The menu's stop, which writes the stop at the cell's time with the volume. */ finish?: (extra?: Record<string, unknown>) => void }

/**
 * What a stopped fluid gave: by rate, the calculated volume to correct; a bag, whether it all ran or how much.
 * Asked by the menu's Stop and by the end grip; it hands the volume back and the host writes the stop.
 */
export function FluidStopDialog({ fluid, name, state, onChange, onCancel, onConfirm }: {
  fluid: TimetableFluid
  name: string
  state: FluidStopState
  onChange: (patch: Partial<Pick<FluidStopState, "volInput" | "fullBag">>) => void
  onCancel: () => void
  onConfirm: (amount: number) => void
}) {
  const uiCopy = useIntraopUiCopy()
  const t = useTranslations("intraop.timetable")
  const isRate = fluid.fluidEntryMode === "RATE"
  const bagVol = Number(fluid.bagVolumeMl ?? fluid.volume) || 500
  const curAmt = Number(state.volInput) || 0
  const rect = state.rect
  return createPortal(
    <div className="fixed z-50 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2"
          style={{ top: rect.bottom + 6, left: Math.min(rect.right - 200, window.innerWidth - 210), width: 200 }}
          onClick={e => e.stopPropagation()}>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            {name}{isRate
              ? ` · ${currentFluidRate(fluid) ?? fluid.rate ?? ""} mL/h`
              : bagVol ? ` · ${uiCopy.timetable.bagSuffix(bagVol)}` : ""}
          </p>
          {isRate ? (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {uiCopy.endCase.calculatedVolume}
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step={1}
                  aria-label={uiCopy.timetable.actualFluidVolumeAria}
                  value={state.volInput}
                  onChange={event => onChange({ volInput: event.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs outline-none focus:border-cyan-400 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]"
                />
                <span className="text-xs font-semibold text-slate-400">mL</span>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-100 mb-2">{t("wasFullBagInfused")}</p>
              <div className="flex gap-2 mb-2">
                <button type="button"
                  onClick={() => onChange({ fullBag: true, volInput: String(bagVol) })}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border-2 transition-colors ${state.fullBag === true ? "bg-teal-500 border-teal-500 text-white" : "border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"}`}>
                  ✓ {uiCopy.timetable.fullBagYes}
                </button>
                <button type="button"
                  onClick={() => onChange({ fullBag: false, volInput: "0" })}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border-2 transition-colors ${state.fullBag === false ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}>
                  {uiCopy.timetable.partialNo}
                </button>
              </div>
            </>
          )}
          {!isRate && state.fullBag === false && (
            <div className="space-y-1.5 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">{t("amountLabel")}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={bagVol}
                    step={1}
                    aria-label={uiCopy.timetable.partialBagVolumeAria}
                    value={state.volInput}
                    onChange={event => onChange({ volInput: event.target.value })}
                    className="w-16 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-xs font-semibold outline-none focus:border-cyan-400 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]"
                  />
                  <span className="text-xs text-slate-400">mL</span>
                </div>
              </div>
              <input type="range" min={0} max={bagVol} step={50}
                value={curAmt}
                onChange={e => onChange({ volInput: e.target.value })}
                className="w-full accent-teal-500 cursor-pointer" />
            </div>
          )}
          <div className="flex gap-1.5 justify-end pt-1">
            <button type="button" onClick={() => onCancel()}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
              {uiCopy.cancel}
            </button>
            <button type="button"
              disabled={!isRate && state.fullBag === null}
              onClick={() => onConfirm(curAmt)}
              className="text-xs font-bold bg-red-500 text-white px-2.5 py-1 rounded-lg hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed">
              {uiCopy.timetable.confirmDiscontinue}
            </button>
          </div>
        </div>,
    portalHost(),
  )
}
