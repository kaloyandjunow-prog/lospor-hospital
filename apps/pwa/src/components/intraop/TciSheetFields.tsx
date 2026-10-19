import { useState, type ReactNode } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import {
  TCI_DRUG_SPECS, TCI_MODEL_DRUG, TCI_MODEL_LABELS, tciDrugFor, tciModelProblems, tciModelsFor, tciPreview,
  type TciDrug, type TciModel, type TciPatient, type TciSite,
} from "@lospor/core/tci"
import type { InfusionRecord } from "@lospor/core/infusion-entry"
import type { PumpTotalUnit } from "@lospor/core/intraop-types"
import { syringeOptions, formatSyringe } from "@lospor/core/infusion-volume"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { VitalStepper } from "@/components/VitalStepper"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

type Choice = { model: TciModel; site: TciSite; opioids: boolean }

function Chip({ label, on, disabled, onPress, color, testID }: { label: string; on: boolean; disabled?: boolean; onPress: () => void; color: string; testID?: string }) {
  const shade = useShade()
  return (
    <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={onPress}
      style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: color + "55", backgroundColor: on ? color : color + "1a", opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: on ? shade("#fff") : color, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  )
}

function firstUsable(drug: TciDrug, pediatric: boolean, patient: TciPatient | null): Choice | null {
  const model = tciModelsFor(drug, pediatric).find(m => !patient || !tciModelProblems(m, patient).some(p => p.kind === "unavailable"))
  return model ? { model, site: "EFFECT", opioids: true } : null
}

/**
 * The start sheet's infusion fields, or -- for propofol, remifentanil,
 * sufentanil and alfentanil -- a choice of Rate or TCI (2026-10-18). TCI
 * picks the model, Cp or Ce, Eleveld's opioid switch, the syringe and the
 * target entered like a dose, and reads out what it will ask of the pump.
 */
export function TciOrRate({ name, pediatric, patient, color, syringe, setSyringe, onConfirm, children }: {
  name: string
  pediatric: boolean
  patient: TciPatient | null
  color: string
  syringe?: string
  setSyringe?: (value: string | undefined) => void
  onConfirm: (record: InfusionRecord) => void
  children: ReactNode
}) {
  const { tc } = usePreferences()
  const shade = useShade()
  const drug = tciDrugFor(name)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [target, setTarget] = useState("")
  if (!drug || !tciModelsFor(drug, pediatric).length) return <>{children}</>
  const spec = TCI_DRUG_SPECS[drug]
  const problems = choice && patient ? tciModelProblems(choice.model, patient) : []
  const unusable = problems.some(problem => problem.kind === "unavailable")
  const value = Number(target)
  const preview = choice ? tciPreview({ ...choice, target: value, concentration: syringe, patient }) : null
  const blocked = unusable ? tc("tciUnusable") : !(value > 0) ? tc("tciNeedsTarget") : null
  return (
    <View testID="tci-or-rate" style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip testID="tci-mode-rate" label={tc("tciRateMode")} on={!choice} onPress={() => setChoice(null)} color={color} />
        <Chip testID="tci-mode-tci" label={tc("tciTciMode")} on={!!choice} color={color}
          onPress={() => { const next = firstUsable(drug, pediatric, patient); if (next) { setChoice(next); setTarget(String(spec.target.prefill)) } }} />
      </View>
      {!choice ? children : (
        <View testID="tci-fields" style={{ gap: 10 }}>
          <Text style={{ color: shade("#64748b"), fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>{tc("tciModel")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tciModelsFor(drug, pediatric).map(model => (
              <Chip key={model} testID={`tci-model-${model}`} label={TCI_MODEL_LABELS[model]} on={choice.model === model} color={color}
                disabled={!!patient && tciModelProblems(model, patient).some(problem => problem.kind === "unavailable")}
                onPress={() => setChoice({ ...choice, model })} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["PLASMA", "EFFECT"] as const).map(site => (
              <Chip key={site} testID={`tci-site-${site}`} label={tc(site === "PLASMA" ? "tciPlasma" : "tciEffect")} on={choice.site === site} color={color} onPress={() => setChoice({ ...choice, site })} />
            ))}
            {choice.model === "ELEVELD_PROPOFOL" ? (
              <Chip testID="tci-opioids" label={tc("tciOpioids")} on={choice.opioids} color={color} onPress={() => setChoice({ ...choice, opioids: !choice.opioids })} />
            ) : null}
          </View>
          {!patient ? <Text accessibilityRole="alert" style={{ color: shade("#fbbf24"), fontSize: 12 }}>{tc("tciNeedsPatient")}</Text> : null}
          {problems.map((problem, index) => problem.kind === "outside" ? (
            <Text key={index} style={{ color: shade("#fbbf24"), fontSize: 12 }}>
              ⚠ {formatMessage(tc("tciOutside"), { model: TCI_MODEL_LABELS[choice.model], covariate: tc(problem.covariate === "age" ? "tciAge" : "tciWeight"), min: problem.min ?? "", max: problem.max ?? "" })}
            </Text>
          ) : null)}
          <DoseSelector
            color={color}
            concentrationOptions={syringeOptions(name).map(formatSyringe)}
            concentrationLabel={tc("infusionSyringe")}
            concentration={syringe}
            onConcentrationChange={setSyringe}
            quickValues={spec.target.quickValues}
            value={target}
            onValueChange={setTarget}
            min={spec.target.min} max={spec.target.max} step={spec.target.step}
            unitSuffix={`${choice.site === "EFFECT" ? "Ce" : "Cp"} ${spec.units.target}`}
            valuePlaceholder={tc("tciTarget")}
            extraHint={preview ? formatMessage(tc("tciPreview"), { first: preview.firstTenMinutes, hourly: preview.perHourAfter, unit: preview.units.amount }) : undefined}
            confirmLabel={tc("tciStart")}
            confirmDisabled={!!blocked}
            confirmBlockedReason={blocked ?? undefined}
            onConfirm={() => onConfirm({ rate: value, unit: spec.units.target, tci: choice })}
          />
        </View>
      )}
    </View>
  )
}

/** What a TCI total rests on, beside the amount: the pump, the model, or why there is none. */
export function tciTotalNote(
  tci: { calculated: number | null; pump: number | null; unavailable?: "patient" | "model"; pumpNeedsStrength?: true },
  unit: string,
  tc: (key: "tciTotalPump" | "tciTotalCalculated" | "tciTotalNeedsPatient" | "tciTotalUnusable" | "tciTotalPumpNeedsStrength") => string,
): string {
  if (tci.pump != null) return formatMessage(tc("tciTotalPump"), { calculated: tci.calculated ?? "—", unit })
  if (tci.pumpNeedsStrength) return tc("tciTotalPumpNeedsStrength")
  if (tci.calculated != null) return tc("tciTotalCalculated")
  return tc(tci.unavailable === "patient" ? "tciTotalNeedsPatient" : "tciTotalUnusable")
}

/** A TCI infusion's change: the new target, in its model's range. */
export function tciTargetSurface(model: TciModel | undefined) {
  if (!model) return null
  const spec = TCI_DRUG_SPECS[TCI_MODEL_DRUG[model]]
  return { min: spec.target.min, max: spec.target.max, step: spec.target.step, quickValues: spec.target.quickValues, unit: spec.units.target, amountUnit: spec.units.amount }
}

/**
 * The pump's own total for a TCI stop (2026-10-18): optional; when entered it
 * counts instead of the model's calculation. In mL, or in the drug's amount.
 */
export function PumpTotalField({ amountUnit, color, onChange }: {
  amountUnit: "mg" | "mcg"
  color: string
  onChange: (pump?: { value: number; unit: PumpTotalUnit }) => void
}) {
  const { tc } = usePreferences()
  const shade = useShade()
  const [value, setValue] = useState<number | null>(null)
  const [unit, setUnit] = useState<PumpTotalUnit>("mL")
  const report = (next: number | null, nextUnit: PumpTotalUnit) => onChange(next != null && next >= 0 ? { value: next, unit: nextUnit } : undefined)
  return (
    <View testID="pump-total-field" style={{ gap: 8 }}>
      <Text style={{ color: shade("#64748b"), fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>{tc("tciPumpTotal")}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["mL", amountUnit] as const).map(option => (
          <Chip key={option} label={option} on={unit === option} color={color} onPress={() => { setUnit(option); report(value, option) }} />
        ))}
      </View>
      <VitalStepper value={value} onChange={next => { setValue(next); report(next, unit) }} min={0} max={unit === "mL" ? 5000 : 100_000} step={unit === "mL" ? 0.1 : 1} precision={unit === "mL" ? 1 : 0} unit={unit} placeholder="-" />
      <Text style={{ color: shade("#64748b"), fontSize: 11 }}>{tc("tciPumpTotalHint")}</Text>
    </View>
  )
}
