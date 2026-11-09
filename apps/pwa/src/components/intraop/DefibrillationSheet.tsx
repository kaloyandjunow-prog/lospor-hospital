import { useRef, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { DEFIBRILLATION_MAX_J, DEFIBRILLATION_MIN_J, clampDefibrillationEnergy, isValidDefibrillationEnergy } from "@lospor/core/defibrillation"
import type { EnergyKnobSkin } from "@lospor/core/clinical-preferences"
import { EnergyKnobView } from "./EnergyKnobView"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { Sheet } from "./Sheet"


type Props = {
  visible: boolean
  /** The slot's time, shown in the title. */
  timeLabel: string
  shockNumber: number
  /** The paediatric reference energy, or null (adults, no weight): the sheet then starts empty. */
  prefillJoules: number | null
  onClose: () => void
  onSave: (energyJ: number, synchronized: boolean) => void
  /** The knob's look (10.2.0); the clinician's own choice unless given. */
  skin?: EnergyKnobSkin
}

/**
 * A shock (10.1.0): a dial for the energy with a large readout and − / +
 * buttons for anyone who can't use the dial, and two separate buttons for
 * synchronised or not. Nothing is assumed: synchronisation is never
 * preselected and the sheet does not save until both are set.
 */
export function DefibrillationSheet({ visible, timeLabel, shockNumber, prefillJoules, onClose, onSave, skin: skinProp }: Props) {
  const shade = useShade()
  const { tc, energyKnobSkin } = usePreferences()
  const skin = skinProp ?? energyKnobSkin ?? "A"
  const [energy, setEnergy] = useState<number | null>(prefillJoules)
  const [synchronized, setSynchronized] = useState<boolean | null>(null)
  const energyRef = useRef(energy)
  energyRef.current = energy

  const step = (delta: number) => setEnergy(clampDefibrillationEnergy((energyRef.current ?? (delta > 0 ? DEFIBRILLATION_MIN_J - 1 : DEFIBRILLATION_MIN_J + 1)) + delta))
  const ready = isValidDefibrillationEnergy(energy) && synchronized != null
  const accent = shade("#f59e0b")

  const stepButton = (delta: number, label: string) => (
    <Pressable key={label} testID={`defib-step-${delta}`} accessibilityRole="button" accessibilityLabel={`${tc("defibEnergy")} ${label}`}
      onPress={() => step(delta)}
      style={{ minWidth: 56, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
        backgroundColor: shade("#1c1c1c"), borderWidth: 1, borderColor: shade("#334155") }}>
      <Text style={{ color: shade("#f8fafc"), fontSize: 18, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
  const syncButton = (value: boolean, label: string) => {
    const active = synchronized === value
    return (
      <Pressable testID={value ? "defib-sync" : "defib-unsync"} accessibilityRole="button" accessibilityState={{ selected: active }}
        onPress={() => setSynchronized(value)}
        style={{ flex: 1, minHeight: 56, borderRadius: 12, alignItems: "center", justifyContent: "center",
          backgroundColor: active ? accent + "33" : shade("#1c1c1c"), borderWidth: 2, borderColor: active ? accent : shade("#334155") }}>
        <Text style={{ color: active ? shade("#fde68a") : shade("#cbd5e1"), fontSize: 15, fontWeight: "800" }}>{label}</Text>
      </Pressable>
    )
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={`${tc("defibTitle")} · ${timeLabel} · ${formatMessage(tc("defibShockNumber"), { n: shockNumber })}`} full>
      <View style={{ alignItems: "center", marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, paddingHorizontal: 20, paddingVertical: 4, borderRadius: 12, backgroundColor: shade("#050505"), borderWidth: 1, borderColor: shade("#262626"), marginBottom: 6 }}>
          <Text testID="defib-readout" style={{ color: energy == null ? shade("#64748b") : shade("#fbbf24"), fontSize: 48, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
            {energy ?? "—"}
          </Text>
          <Text style={{ color: shade("#a16207"), fontSize: 14, fontWeight: "700" }}>J</Text>
        </View>
        <EnergyKnobView skin={skin} energy={energy} onChange={setEnergy} label={tc("defibEnergy")} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {stepButton(-10, "−10")}
          {stepButton(-1, "−1")}
          {stepButton(1, "+1")}
          {stepButton(10, "+10")}
        </View>
        <Text style={{ color: shade("#64748b"), fontSize: 11, marginTop: 6 }}>{DEFIBRILLATION_MIN_J}–{DEFIBRILLATION_MAX_J} J</Text>
      </View>
      {prefillJoules != null ? (
        <Text testID="defib-prefill-hint" style={{ color: shade("#fbbf24"), fontSize: 12, marginBottom: 12 }}>
          {formatMessage(tc("defibPrefillHint"), { ref: `${prefillJoules} J` })}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
        {syncButton(false, tc("defibUnsync"))}
        {syncButton(true, tc("defibSync"))}
      </View>
      <Pressable testID="defib-save" disabled={!ready} accessibilityState={{ disabled: !ready }}
        onPress={() => { if (ready) onSave(energy!, synchronized!) }}
        style={{ minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center",
          backgroundColor: ready ? accent : shade("#1c1c1c"), borderWidth: 1, borderColor: ready ? accent : shade("#334155") }}>
        <Text style={{ color: ready ? shade("#111111") : shade("#64748b"), fontSize: 15, fontWeight: "800" }}>
          {!isValidDefibrillationEnergy(energy) ? tc("defibSetEnergy") : synchronized == null ? tc("defibChooseSync") : tc("defibSave")}
        </Text>
      </Pressable>
    </Sheet>
  )
}
