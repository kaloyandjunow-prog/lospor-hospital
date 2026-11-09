import { Sheet } from "@/components/intraop/Sheet"
import { AirwayExchangeSheet } from "@/components/intraop/AirwayExchangeSheet"
import { AirwaySmartPanel } from "@/components/intraop/AirwaySmartPanel"
import { VascularSmartPanel } from "@/components/intraop/VascularSmartPanel"
import { cardEventOps } from "@lospor/core/intraop-suggestions"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import type { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import type { usePhoneAirwaySmart, usePhoneVascularSmart } from "./use-phone-smart-airway-vascular"
import type { usePhoneVascularEvents } from "@/lib/use-phone-vascular-smart"

type Exchange = ReturnType<typeof usePhoneAirwayExchange>

/**
 * The sheets the timeline opens on its own: a vascular line or an airway device
 * charted there opens its panel with that time set, and a reintubation or
 * airway exchange asks which device went in.
 */
export function IntraopSmartSheets({ isWatching, tc, vascularEvents, vascularCase, vascularLines, applyVascularLines, airwayExchange, smartCase, airwayLabel, saveAirwayEntries, AIRWAY_DEVICES }: {
  isWatching: boolean
  tc: (key: never) => string
  vascularEvents: ReturnType<typeof usePhoneVascularEvents>
  vascularCase: ReturnType<typeof usePhoneVascularSmart>["vascularCase"]
  vascularLines: () => VascularLine[]
  applyVascularLines: (next: VascularLine[], event?: never) => void
  airwayExchange: Exchange
  smartCase: ReturnType<typeof usePhoneAirwaySmart>["smartCase"]
  airwayLabel: (code: string) => string
  saveAirwayEntries: (next: Parameters<Exchange["save"]>[0], event?: Parameters<Exchange["save"]>[1]) => void
  AIRWAY_DEVICES: React.ComponentProps<typeof AirwayExchangeSheet>["devices"]
}) {
  if (isWatching) return null
  const say = tc as (key: string) => string
  return (
    <>
      {vascularEvents.request ? (
        <Sheet visible onClose={() => vascularEvents.setRequest(null)} title={say(vascularEvents.request.type === "PERIPHERAL" ? "vsmPeripheral" : vascularEvents.request.type === "ARTERIAL" ? "vsmArterial" : "vsmCentral")} full allowInline={false}>
          <VascularSmartPanel {...vascularCase} request={vascularEvents.request} lines={vascularLines()}
            onSave={(next, event) => { vascularEvents.setRequest(null); if (event) applyVascularLines(next, event as never); else applyVascularLines(next) }} onClose={() => vascularEvents.setRequest(null)} />
        </Sheet>
      ) : null}
      {airwayExchange.smartOpen ? (
        <Sheet visible onClose={() => airwayExchange.setSmartOpen(null)} title={airwayLabel(airwayExchange.smartOpen.device)} full allowInline={false}>
          <AirwaySmartPanel {...smartCase} request={{ device: airwayExchange.smartOpen.device, at: airwayExchange.smartOpen.at, source: "timeline", eventId: airwayExchange.smartOpen.eventId, eventLabel: airwayExchange.smartOpen.eventLabel }} entries={airwayExchange.entries()}
            onSave={(next, event) => { airwayExchange.setSmartOpen(null); saveAirwayEntries(next, event) }} onClose={() => airwayExchange.setSmartOpen(null)} />
        </Sheet>
      ) : null}
      {airwayExchange.dialog ? (
        <AirwayExchangeSheet entries={airwayExchange.entries()} devices={AIRWAY_DEVICES} reason={airwayExchange.dialog.reason} at={airwayExchange.dialog.at}
          onClose={() => airwayExchange.setDialog(null)}
          onSave={next => {
            const dialog = airwayExchange.dialog
            const complication = dialog?.complication
            const at = airwayExchange.dialog?.at ?? new Date().toISOString()
            const cardEvent = complication ? cardEventOps(complication as never, "Reintubation", "reintubate", at, new Date().toISOString()).add[0] : null
            saveAirwayEntries(next, cardEvent ? {
              id: cardEvent.id,
              label: cardEvent.label ?? "Reintubation",
              ts: cardEvent.ts,
              suggestion: cardEvent.suggestion,
            } : undefined)
          }} />
      ) : null}
    </>
  )
}
