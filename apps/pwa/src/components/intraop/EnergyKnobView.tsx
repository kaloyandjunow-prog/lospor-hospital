import { useEffect, useMemo, useRef } from "react"
import { createGestureHandle } from "@/lib/gesture-lock"
import { HELD_CONTROL_STYLE } from "@/lib/gesture-style"
import { PanResponder, View } from "react-native"
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg"
import {
  DEFIBRILLATION_KNOB_SWEEP,
  DEFIBRILLATION_SELECTOR_STOPS,
  defibrillationEnergyAtAngle,
  defibrillationKnobAngle,
  defibrillationSelectorAngle,
  defibrillationSelectorStopAt,
} from "@lospor/core/defibrillation"
import type { EnergyKnobSkin } from "@lospor/core/clinical-preferences"
import { useShade } from "@/theme/shade"

/**
 * The shock energy knob (10.2.0) in the skin each clinician picks in
 * Settings: A a defibrillator knob over a ticked scale, B a metal knob in a
 * ring of lights (one per 10 J), C a selector that snaps to its marked stops.
 * Turned by finger; the ±1 / ±10 buttons beside it set any 1-360 J.
 */
const START = -DEFIBRILLATION_KNOB_SWEEP / 2

export function knobAngle(skin: EnergyKnobSkin, energy: number | null): number {
  if (energy == null) return START
  return skin === "C" ? defibrillationSelectorAngle(energy) : defibrillationKnobAngle(energy)
}

/** The energy a touch at (x, y) sets on a knob of `size`: anywhere on A and B, the nearest stop on C. */
export function knobEnergyAt(skin: EnergyKnobSkin, x: number, y: number, size: number): number {
  const angle = Math.atan2(x - size / 2, size / 2 - y) * 180 / Math.PI
  return skin === "C" ? defibrillationSelectorStopAt(angle) : defibrillationEnergyAtAngle(angle)
}

function polar(c: number, deg: number, r: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180
  return [c + r * Math.cos(a), c + r * Math.sin(a)]
}

function arc(c: number, from: number, to: number, r: number): string {
  const [x1, y1] = polar(c, from, r)
  const [x2, y2] = polar(c, to, r)
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

export function EnergyKnobView({ skin, energy, onChange, size = 240, testID = "defib-knob", label }: {
  skin: EnergyKnobSkin
  energy: number | null
  onChange: (energy: number) => void
  size?: number
  testID?: string
  label: string
}) {
  const shade = useShade()
  const skinRef = useRef(skin)
  skinRef.current = skin
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const hold = useMemo(createGestureHandle, [])
  useEffect(() => hold.end, [hold])
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Turning the knob is a horizontal gesture too; the tab swipe above must not take it over halfway.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: event => { hold.start(); onChangeRef.current(knobEnergyAt(skinRef.current, event.nativeEvent.locationX, event.nativeEvent.locationY, size)) },
    onPanResponderMove: event => onChangeRef.current(knobEnergyAt(skinRef.current, event.nativeEvent.locationX, event.nativeEvent.locationY, size)),
    onPanResponderRelease: () => hold.end(),
    onPanResponderTerminate: () => hold.end(),
  }), [hold, size])
  const c = size / 2
  const angle = knobAngle(skin, energy)
  const knob = size * 0.27
  const amber = shade("#f59e0b")
  const lit = (value: number) => energy != null && value <= energy

  return (
    <View {...responder.panHandlers} testID={testID} accessibilityLabel={label} accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: 360, now: energy ?? undefined }} style={[{ width: size, height: size }, HELD_CONTROL_STYLE]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="knobDark" cx="38%" cy="30%" r="70%">
            <Stop offset="0" stopColor={shade("#4a4a4a")} />
            <Stop offset="0.5" stopColor={shade("#262626")} />
            <Stop offset="1" stopColor={shade("#141414")} />
          </RadialGradient>
          <RadialGradient id="knobMetal" cx="38%" cy="30%" r="75%">
            <Stop offset="0" stopColor={shade("#f3f4f6")} />
            <Stop offset="0.55" stopColor={shade("#9ca3af")} />
            <Stop offset="1" stopColor={shade("#4b5563")} />
          </RadialGradient>
        </Defs>
        {skin === "A" && (
          <G>
            <Path d={arc(c, START, -START, size * 0.33)} stroke={shade("#1f2937")} strokeWidth={8} fill="none" strokeLinecap="round" />
            {energy != null ? <Path d={arc(c, START, Math.max(START + 0.5, angle), size * 0.33)} stroke={amber} strokeWidth={8} fill="none" strokeLinecap="round" /> : null}
            {Array.from({ length: 37 }, (_, i) => {
              const value = Math.min(1 + i * 10, 360)
              const major = i % 5 === 0 || value === 360
              const a = defibrillationKnobAngle(value)
              const [x1, y1] = polar(c, a, size * (major ? 0.37 : 0.38))
              const [x2, y2] = polar(c, a, size * 0.41)
              return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={major ? 2.5 : 1.5} strokeLinecap="round" stroke={lit(value) ? shade("#fbbf24") : shade("#475569")} />
            })}
            {[1, 50, 100, 150, 200, 250, 300, 360].map(value => {
              const [x, y] = polar(c, defibrillationKnobAngle(value), size * 0.46)
              return <SvgText key={value} x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight="700" fill={lit(value) ? shade("#fde68a") : shade("#64748b")}>{value}</SvgText>
            })}
            <G rotation={angle} origin={`${c}, ${c}`}>
              <Circle cx={c} cy={c} r={knob} fill={shade("#1c1c1c")} stroke={shade("#333333")} strokeWidth={6} strokeDasharray="3 3" />
              <Circle cx={c} cy={c} r={knob * 0.8} fill="url(#knobDark)" />
              <Rect x={c - 4} y={c - knob * 0.92} width={8} height={knob * 0.5} rx={4} fill={shade("#fafafa")} />
            </G>
          </G>
        )}
        {skin === "B" && (
          <G>
            <Circle cx={c} cy={c} r={size * 0.45} fill={shade("#0d0d0d")} />
            {Array.from({ length: 37 }, (_, i) => {
              const value = Math.min(1 + i * 10, 360)
              const [x, y] = polar(c, defibrillationKnobAngle(value), size * 0.39)
              return <Circle key={i} cx={x} cy={y} r={size * 0.02} fill={lit(value) ? shade("#fbbf24") : shade("#1f1f1f")} />
            })}
            <G rotation={angle} origin={`${c}, ${c}`}>
              <Circle cx={c} cy={c} r={knob} fill="url(#knobMetal)" stroke={shade("#e5e7eb")} strokeWidth={2} />
              <Circle cx={c} cy={c} r={knob * 0.84} fill="url(#knobMetal)" opacity={0.8} />
              <Rect x={c - 4} y={c - knob * 0.9} width={8} height={knob * 0.4} rx={4} fill={amber} />
            </G>
          </G>
        )}
        {skin === "C" && (
          <G>
            {(() => {
              const r1 = size * 0.33, r2 = size * 0.485
              const [ax, ay] = polar(c, START - 8, r2), [bx, by] = polar(c, -START + 8, r2)
              const [cx2, cy2] = polar(c, -START + 8, r1), [dx, dy] = polar(c, START - 8, r1)
              return <Path d={`M ${ax} ${ay} A ${r2} ${r2} 0 1 1 ${bx} ${by} L ${cx2} ${cy2} A ${r1} ${r1} 0 1 0 ${dx} ${dy} Z`} fill={shade("#2a2116")} stroke={amber} strokeWidth={2.5} strokeLinejoin="round" />
            })()}
            {DEFIBRILLATION_SELECTOR_STOPS.map(stop => {
              const [x, y] = polar(c, defibrillationSelectorAngle(stop), size * 0.42)
              const selected = stop === energy
              return (
                <G key={stop}>
                  {selected ? <Rect x={x - 15} y={y - 9} width={30} height={18} rx={4} fill={amber} /> : null}
                  <SvgText x={x} y={y + 4} textAnchor="middle" fontSize={selected ? 12 : 10} fontWeight="800" fill={selected ? shade("#1a1206") : shade("#fcd9a0")}>{stop}</SvgText>
                </G>
              )
            })}
            <Circle cx={c} cy={c} r={knob * 1.06} fill={shade("#0b0b0b")} />
            <G rotation={angle} origin={`${c}, ${c}`}>
              <Circle cx={c} cy={c} r={knob} fill={shade("#2e2e2e")} stroke={shade("#3a3a3a")} strokeWidth={6} strokeDasharray="4 4" />
              <Circle cx={c} cy={c} r={knob * 0.88} fill="url(#knobDark)" />
              <Rect x={c - knob * 0.2} y={c - knob * 0.88} width={knob * 0.4} height={knob * 1.76} rx={knob * 0.2} fill={shade("#4a4a4a")} />
              <Rect x={c - knob * 0.06} y={c - knob * 0.8} width={knob * 0.12} height={knob * 0.26} rx={3} fill={amber} />
            </G>
          </G>
        )}
      </Svg>
    </View>
  )
}
