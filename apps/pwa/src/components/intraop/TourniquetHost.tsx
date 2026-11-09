import { useMemo, useState, useSyncExternalStore } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import Svg, { G, Path, Rect } from "react-native-svg"
import { bodyBandFor, tourniquetBody, tourniquetSiteLabel, type TourniquetSite } from "@lospor/core/tourniquet-body"
import { TOURNIQUET_MINUTES, tourniquetStatus } from "@lospor/core/intraop-suggestions"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import { tourniquetSheet } from "@/lib/tourniquet-sheet"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { Sheet } from "./Sheet"

/** The tourniquet body picker, opened from a column's Tourniquet on / off (10.2.0). */
export function TourniquetHost({ log, save, ageDays, sex, clockOf }: {
  log: LogEvent[]
  save: SaveIntraopEvent
  ageDays: number | null
  sex?: string | null
  clockOf: (iso: string) => string
}) {
  const request = useSyncExternalStore(tourniquetSheet.subscribe, tourniquetSheet.current, tourniquetSheet.current)
  if (!request) return null
  return <TourniquetSheet key={request.ts + request.label} request={request} log={log} save={save} ageDays={ageDays} sex={sex} clockOf={clockOf} />
}

const WIDTH = 300
const HEIGHT = 400

export function TourniquetSheet({ request, log, save, ageDays, sex, clockOf }: {
  request: NonNullable<ReturnType<typeof tourniquetSheet.current>>
  log: LogEvent[]
  save: SaveIntraopEvent
  ageDays: number | null
  sex?: string | null
  clockOf: (iso: string) => string
}) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const lang = language === "bg" ? "bg" : "en"
  const on = request.label === "Tourniquet on"
  const band = bodyBandFor({ ageDays, sex })
  const body = useMemo(() => tourniquetBody(band, WIDTH, HEIGHT), [band])
  const statuses = tourniquetStatus(log as never, request.ts)
  const child = band === "infant" || band === "child"
  const warn = (child ? TOURNIQUET_MINUTES.child : TOURNIQUET_MINUTES.adult).warning
  const [picked, setPicked] = useState<TourniquetSite | null>(null)
  const running = (site: string) => statuses.find(status => status.site === site)?.running === true
  const close = () => tourniquetSheet.close()

  return (
    <Sheet visible onClose={close} title={tc(on ? "tqTitleOn" : "tqTitleOff")} full footer={
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ flex: 1, color: shade("#cbd5e1") }}>{picked ? tourniquetSiteLabel(picked, lang) : tc("tqNothing")}</Text>
        <TouchableOpacity testID="tourniquet-save" disabled={!picked} onPress={() => {
          if (!picked) return
          void save({ type: "clinical_event", label: request.label, color: request.color, site: picked } as never, request.ts)
          close()
        }} style={{ minHeight: 52, paddingHorizontal: 22, borderRadius: 12, justifyContent: "center", backgroundColor: picked ? shade("#f59e0b") : shade("#262626") }}>
          <Text style={{ color: picked ? shade("#1a1206") : shade("#64748b"), fontWeight: "800" }}>{tc("tqSave")} · {clockOf(request.ts)}</Text>
        </TouchableOpacity>
      </View>
    }>
      <Text style={{ color: shade("#94a3b8"), fontSize: 12, marginBottom: 6 }}>{tc(on ? "tqHintOn" : "tqHintOff")}</Text>
      <View style={{ width: WIDTH, height: HEIGHT, alignSelf: "center" }}>
        <Svg width={WIDTH} height={HEIGHT}>
          {body.outlines.map((d, index) => <Path key={index} d={d} fill={shade("#141414")} stroke={shade("#aab4c3")} strokeWidth={1.6} strokeLinejoin="round" />)}
          {body.details.map((d, index) => <Path key={`d${index}`} d={d} fill="none" stroke={shade("#6b7686")} strokeWidth={1.1} strokeLinecap="round" />)}
          {body.spots.map(spot => {
            const status = statuses.find(item => item.site === spot.site)
            const isOn = status?.running === true
            const hot = isOn && status.minutes >= warn
            const chosen = picked === spot.site
            const stroke = chosen ? shade("#60a5fa") : hot ? shade("#f87171") : isOn ? shade("#fbbf24") : shade("#7c8899")
            const fill = chosen ? shade("#1e3a5f") : hot ? shade("#7f1d1d") : isOn ? shade("#3b2f0b") : "none"
            return (
              <G key={spot.site} rotation={spot.angle} origin={`${spot.x}, ${spot.y}`}>
                <Rect x={spot.x - spot.w / 2} y={spot.y - spot.h / 2} width={spot.w} height={spot.h} rx={Math.min(5, spot.h / 3)}
                  fill={fill} stroke={stroke} strokeWidth={1.8} strokeDasharray={isOn || chosen ? undefined : "4 3"} />
              </G>
            )
          })}
        </Svg>
        {body.spots.map(spot => {
          const allowed = on ? !running(spot.site) : running(spot.site)
          const w = Math.max(spot.w + 10, 44)
          const h = Math.max(spot.h + 10, 44)
          return (
            <TouchableOpacity key={spot.site} testID={`tourniquet-spot-${spot.site}`} disabled={!allowed} accessibilityLabel={tourniquetSiteLabel(spot.site, lang)}
              onPress={() => setPicked(spot.site)}
              style={{ position: "absolute", left: spot.x - w / 2, top: spot.y - h / 2, width: w, height: h, transform: [{ rotate: `${spot.angle}deg` }] }} />
          )
        })}
      </View>
      {statuses.filter(status => status.site !== "unknown").map(status => (
        <View key={status.site} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: !status.running ? shade("#22c55e") : status.minutes >= warn ? shade("#ef4444") : shade("#fbbf24") }} />
          <Text style={{ flex: 1, color: shade("#e2e8f0") }}>{tourniquetSiteLabel(status.site, lang)}</Text>
          <Text style={{ color: status.running && status.minutes >= warn ? shade("#fca5a5") : shade("#94a3b8"), fontVariant: ["tabular-nums"] }}>
            {tc("tqSince").replace("{time}", clockOf(status.since)).replace("{minutes}", String(status.minutes))}
          </Text>
        </View>
      ))}
    </Sheet>
  )
}
