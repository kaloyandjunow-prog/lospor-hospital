"use client"

import {
  TCI_DRUG_SPECS, TCI_MODEL_LABELS, tciModelProblems, tciModelsFor, tciPreview,
  type TciDrug, type TciModel, type TciPatient, type TciSite,
} from "@lospor/core/tci"
import { DoseSelector } from "./DoseSelector"
import { useIntraopUiCopy } from "./ui-copy"
import { DISPLAY_CLINICAL_DOSE_GUIDANCE } from "@/lib/clinical-guidance-policy"

export type TciChoice = { model: TciModel; site: TciSite; opioids: boolean }

/** The first model that applies to this patient, effect-site, with opioids. */
export function defaultTciChoice(drug: TciDrug, pediatric: boolean, patient: TciPatient | null): TciChoice | null {
  const models = tciModelsFor(drug, pediatric)
  const usable = models.find(model => !patient || !tciModelProblems(model, patient).some(problem => problem.kind === "unavailable"))
  return usable ? { model: usable, site: "EFFECT", opioids: true } : null
}

/**
 * A target-controlled infusion in the start flyout (2026-10-18): the model,
 * the site it targets (Cp or Ce), Eleveld's opioid switch, the syringe, and
 * the target entered like a dose. What it will ask of the pump is read out
 * before it starts; a model that cannot apply to this patient says why.
 */
export function TciFields({ drug, pediatric, patient, choice, onChoice, target, onTarget, syringes, syringe, onSyringe, onConfirm }: {
  drug: TciDrug
  pediatric: boolean
  patient: TciPatient | null
  choice: TciChoice
  onChoice: (next: TciChoice) => void
  target: number
  onTarget: (value: number) => void
  syringes: string[]
  syringe?: string
  onSyringe: (value: string | undefined) => void
  onConfirm: () => void
}) {
  const copy = useIntraopUiCopy()
  const spec = TCI_DRUG_SPECS[drug]
  const models = tciModelsFor(drug, pediatric)
  const problems = patient ? tciModelProblems(choice.model, patient) : []
  const unusable = problems.some(problem => problem.kind === "unavailable")
  const preview = tciPreview({ ...choice, target, concentration: syringe, patient })
  const blocked = !patient ? null : unusable ? copy.tci.unusable : !(target > 0) ? copy.tci.needsTarget : null
  const pill = (on: boolean) => `min-h-7 whitespace-nowrap text-[10px] font-semibold px-2 py-1 rounded-full border transition-all ${on ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"}`
  return (
    <div data-testid="tci-fields" className="space-y-2">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{copy.tci.model}</p>
        <div className="flex flex-wrap gap-1">
          {models.map(model => {
            const off = !!patient && tciModelProblems(model, patient).some(problem => problem.kind === "unavailable")
            return (
              <button key={model} type="button" aria-pressed={choice.model === model} disabled={off} title={off ? copy.tci.unusable : undefined}
                onClick={() => onChoice({ ...choice, model })} className={`${pill(choice.model === model)} disabled:opacity-40`}>
                {TCI_MODEL_LABELS[model]}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {(["PLASMA", "EFFECT"] as const).map(site => (
          <button key={site} type="button" aria-pressed={choice.site === site} onClick={() => onChoice({ ...choice, site })} className={pill(choice.site === site)}>
            {site === "PLASMA" ? copy.tci.plasma : copy.tci.effect}
          </button>
        ))}
        {choice.model === "ELEVELD_PROPOFOL" && (
          <label className="ml-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={choice.opioids} onChange={event => onChoice({ ...choice, opioids: event.target.checked })} />
            {copy.tci.opioids}
          </label>
        )}
      </div>
      {!patient && <p role="alert" className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{copy.tci.needsPatient}</p>}
      {problems.filter(problem => problem.kind === "outside").map((problem, index) => problem.kind === "outside" && (
        <p key={index} className="text-[10px] text-amber-600 dark:text-amber-400">
          ⚠ {copy.tci.outside(TCI_MODEL_LABELS[choice.model], problem.covariate === "age" ? copy.tci.age : copy.tci.weight, problem.min, problem.max)}
        </p>
      ))}
      <DoseSelector
        accent="blue"
        concentrationOptions={syringes.length ? syringes : undefined}
        concentrationLabel={copy.syringe}
        concentration={syringe}
        onConcentrationChange={onSyringe}
        quickValues={spec.target.quickValues}
        value={String(target)}
        onValueChange={value => onTarget(parseFloat(value) || 0)}
        valuePlaceholder={copy.tci.target}
        min={spec.target.min} max={spec.target.max} step={spec.target.step}
        unitSuffix={`${choice.site === "EFFECT" ? "Ce" : "Cp"} ${spec.units.target}`}
        extraHint={preview ? copy.tci.preview(preview.firstTenMinutes, preview.perHourAfter, preview.units.amount) : undefined}
        showGuidance={DISPLAY_CLINICAL_DOSE_GUIDANCE}
        confirmLabel={copy.tci.start}
        confirmDisabled={!!blocked || !(target > 0)}
        confirmBlockedReason={blocked ?? (!(target > 0) ? copy.tci.needsTarget : undefined)}
        onConfirm={onConfirm}
      />
    </div>
  )
}

/** Rate or TCI, for a drug that has TCI models. */
export function TciModeSwitch({ tci, onRate, onTci }: { tci: boolean; onRate: () => void; onTci: () => void }) {
  const copy = useIntraopUiCopy()
  const pill = (on: boolean) => `flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${on ? "bg-blue-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`
  return (
    <div role="group" aria-label={copy.tci.mode} className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-[#2a2a2a]">
      <button type="button" aria-pressed={!tci} onClick={onRate} className={pill(!tci)}>{copy.tci.rateMode}</button>
      <button type="button" aria-pressed={tci} onClick={onTci} className={pill(tci)}>{copy.tci.tciMode}</button>
    </div>
  )
}
