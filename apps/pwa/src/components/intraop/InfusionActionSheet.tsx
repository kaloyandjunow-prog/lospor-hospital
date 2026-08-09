import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import type { ActiveInfusion } from "@/lib/intraop-log-event"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

type Range = { min: number; max: number; step: number }
type RouteProfileLite = {
  min: number; max: number; step: number
  quickValues?: number[]; concentrationOptions?: string[]; unit?: string
}

export function InfusionActionSheet({
  visible, onClose, target, ratePresets, newRate, setNewRate, onChangeRate, onStop,
  laConcentrations = {}, newConcentration, setNewConcentration, ranges = {}, routeProfiles = {},
  pediatricMode = false,
}: {
  visible: boolean
  onClose: () => void
  target: ActiveInfusion | null
  ratePresets: Record<string, string[]>
  newRate: string
  setNewRate: (v: string) => void
  onChangeRate: (target: ActiveInfusion, rate: string, concentration?: string) => void
  onStop: (target: ActiveInfusion) => void
  laConcentrations?: Record<string, string[]>
  newConcentration?: string
  setNewConcentration?: (c: string | undefined) => void
  ranges?: Record<string, Range>
  // Per-route dose surfaces, keyed by infusion name then route. When the running
  // infusion has a route with a profile (e.g. Lidocaine PD/IT in mL/hr +
  // concentration), the rate-change controls use it instead of the flat range.
  routeProfiles?: Record<string, Record<string, RouteProfileLite>>
  pediatricMode?: boolean
}) {
  const { tc, language } = usePreferences()
  const infusionLabel = (name: string) => displayClinicalCode("option:INTRAOP_INFUSION", name, language, { label: name })

  // Resolve the per-route dose surface for the running infusion, falling back to
  // the flat per-name range/quick/concentration when there's no route profile.
  const prof = target?.route ? routeProfiles[target.name]?.[target.route] : undefined
  const range: Range = prof
    ? { min: prof.min, max: prof.max, step: prof.step }
    : (target ? ranges[target.name] : undefined) ?? { min: 0, max: 100, step: 1 }
  const quickValues = prof?.quickValues ?? (target ? ratePresets[target.name]?.map(Number) : undefined)
  const concentrationOptions = prof?.concentrationOptions ?? (target ? laConcentrations[target.name] : undefined)

  return (
    <Sheet visible={visible} onClose={onClose} title={target ? infusionLabel(target.name) : tc("trRowInfusion")}>
      {target && (
        <View style={{ gap:12 }}>
          {pediatricMode ? (
            <Text style={{ color:"#fbbf24", fontSize:12, lineHeight:17 }}>
              {language === "bg"
                ? "\u041f\u0435\u0434\u0438\u0430\u0442\u0440\u0438\u0447\u043d\u0438\u0442\u0435 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u0438 \u0438 \u043a\u043e\u043d\u0446\u0435\u043d\u0442\u0440\u0430\u0446\u0438\u0438 \u0432\u0441\u0435 \u043e\u0449\u0435 \u043d\u0435 \u0441\u0430 \u043a\u043b\u0438\u043d\u0438\u0447\u043d\u043e \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0438. \u0412\u044a\u0432\u0435\u0434\u0435\u0442\u0435 \u0440\u044a\u0447\u043d\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u0438 \u0441\u0442\u043e\u0439\u043d\u043e\u0441\u0442\u0438."
                : "Pediatric rates and concentrations are not clinically approved yet. Enter manually verified values."}
            </Text>
          ) : null}
          <Text style={{ color:"#94a3b8", fontSize:13 }}>
            Current: {target.rate} {target.unit}{target.concentration ? ` · ${target.concentration}` : ""}
          </Text>
          <DoseSelector
            color="#3b82f6"
            quickValues={quickValues}
            value={newRate} onValueChange={setNewRate}
            {...range}
            valuePlaceholder="New rate"
            unitSuffix={target.unit}
            concentrationOptions={concentrationOptions}
            concentration={newConcentration ?? target.concentration}
            onConcentrationChange={setNewConcentration}
            confirmLabel={`Change to ${newRate} ${target.unit}`}
            onConfirm={() => onChangeRate(target, newRate, newConcentration)}
            confirmDisabled={!newRate}
          />
          <TouchableOpacity
            onPress={() => onStop(target)}
            style={{ backgroundColor:"#1e1414", borderRadius:10, padding:14, alignItems:"center",
              borderWidth:1, borderColor:"#ef444444" }}>
            <Text style={{ color:"#ef4444", fontWeight:"700" }}>{tc("trStop")} {tc("trRowInfusion").toLowerCase()}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Sheet>
  )
}
