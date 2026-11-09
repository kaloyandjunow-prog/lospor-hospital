import { useState, useSyncExternalStore } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { JET_VENTILATION } from "@lospor/core/gas-ranges"
import { VitalStepper } from "@/components/VitalStepper"
import { DEFAULT_JET_SETTINGS, jetAt, jetSheet, type JetSettings } from "@/lib/jet-sheet"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { Sheet } from "./Sheet"

/** The jet sheet, opened from a column's Jet button at that column's time (10.2.0). */
export function JetHost({ log, save, clockOf }: { log: LogEvent[]; save: SaveIntraopEvent; clockOf: (iso: string) => string }) {
  const ts = useSyncExternalStore(jetSheet.subscribe, jetSheet.current, jetSheet.current)
  if (!ts) return null
  const { running, last } = jetAt(log, ts)
  return <JetSheet key={ts} ts={ts} running={running} initial={running ?? last ?? DEFAULT_JET_SETTINGS} save={save} clockOf={clockOf} />
}

/**
 * Driving pressure on a 0-4 bar stepper (typed to 6), the rate from 15 / 100 /
 * 150 / 300 or typed to 600/min, and FiO2. Start, a change from this time, or
 * Stop: saved as Core jet_start / jet_change / jet_stop events.
 */
export function JetSheet({ ts, running, initial, save, clockOf }: {
  ts: string
  running: JetSettings | null
  initial: JetSettings
  save: SaveIntraopEvent
  clockOf: (iso: string) => string
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [settings, setSettings] = useState<JetSettings>(initial)
  const set = (patch: Partial<JetSettings>) => setSettings(prev => ({ ...prev, ...patch }))
  const close = () => jetSheet.close()
  const label = { color: shade("#94a3b8"), fontSize: 12, fontWeight: "700" as const, marginBottom: 4, marginTop: 10 }

  return (
    <Sheet visible onClose={close} title={`${tc("jetRow")} · ${clockOf(ts)}`} footer={
      <View style={{ flexDirection: "row", gap: 8 }}>
        {running ? (
          <TouchableOpacity testID="jet-stop" onPress={() => { void save({ type: "jet_stop" } as never, ts); close() }}
            style={{ flex: 1, minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: shade("#ef444488") }}>
            <Text style={{ color: shade("#fca5a5"), fontWeight: "800" }}>{tc("jetStop")}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity testID="jet-apply" onPress={() => {
          void save({ type: running ? "jet_change" : "jet_start", jetPressureBar: settings.pressureBar, jetRate: settings.rate, fio2: settings.fio2 } as never, ts)
          close()
        }} style={{ flex: 1, minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: shade("#0d9488") }}>
          <Text style={{ color: shade("#f0fdfa"), fontWeight: "800" }}>{running ? tc("jetApply") : tc("jetStart")}</Text>
        </TouchableOpacity>
      </View>
    }>
      <Text style={label}>{tc("jetPressure")}</Text>
      <VitalStepper value={settings.pressureBar} onChange={value => set({ pressureBar: value ?? 0 })} min={JET_VENTILATION.pressure.min}
        max={JET_VENTILATION.pressure.sliderMax} manualMax={JET_VENTILATION.pressure.typedMax} step={JET_VENTILATION.pressure.step} precision={1} unit="bar" />
      <Text style={label}>{tc("jetRate")}</Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
        {JET_VENTILATION.rate.quick.map(rate => (
          <TouchableOpacity key={rate} testID={`jet-rate-${rate}`} onPress={() => set({ rate })}
            style={{ flex: 1, minHeight: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1,
              borderColor: settings.rate === rate ? shade("#14b8a6") : shade("#334155"), backgroundColor: settings.rate === rate ? shade("#14b8a6") + "33" : shade("#1c1c1c") }}>
            <Text style={{ color: settings.rate === rate ? shade("#99f6e4") : shade("#e2e8f0"), fontWeight: "800" }}>{rate}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <VitalStepper value={settings.rate} onChange={value => set({ rate: Math.round(value ?? JET_VENTILATION.rate.min) })} min={JET_VENTILATION.rate.min}
        max={JET_VENTILATION.rate.typedMax} step={1} unit="/min" />
      <Text style={label}>FiO₂</Text>
      <VitalStepper value={settings.fio2} onChange={value => set({ fio2: value ?? 100 })} min={JET_VENTILATION.fio2.min} max={JET_VENTILATION.fio2.max} step={1} unit="%" />
    </Sheet>
  )
}
