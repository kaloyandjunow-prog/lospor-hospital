import type { MutableRefObject } from "react"
import { SuggestionSheetHost } from "@/components/intraop/SuggestionSheetHost"
import { buildPhoneSuggestionSheets } from "@/lib/phone-suggestion-sheets"
import { defibrillationSheet } from "@/lib/defibrillation-knob"
import { accessKindOf, replaceFailedLine, vascularLineText, type VascularLine } from "@lospor/core/vascular-access-lines"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import type { useIntraopCaseLifecycle } from "@/lib/use-intraop-case-lifecycle"
import type { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import type { VascularEntry } from "@/lib/intraop-types"

type Build = Parameters<typeof buildPhoneSuggestionSheets>[0]

/** Running agents and infusions that a card can offer to deepen, as rows that open their own sheet. */
type Active = {
  activeGas: { carrierGas?: string | null } | null | undefined
  activeAgents: { name: string }[]
  activeInfusions: { name: string; infId: string; rate?: unknown }[]
}

/**
 * The sheets a suggestion card opens on the phone (10.2.0), prefilled from the card. The intraop screen owns the
 * sheets themselves; this wires each card action to the one that opens.
 */
export function PhoneSuggestionSheetsHost({ attention, isWatching, pendingSuggestion, sheetArgs, openLabs, openGasSettings, openAgent, active, eventLabel, setInfActTgt, setInfActRate, setInfActOpen, save, airwayExchange, vascularAccesses, setVascularAccesses, saveVascularAccesses }: {
  attention: ReturnType<typeof useIntraopCaseLifecycle>["attention"]
  isWatching: boolean
  pendingSuggestion: MutableRefObject<string | null>
  /** The setters and option lists the card sheets are prefilled through. */
  sheetArgs: Pick<Build, "setEntryTs" | "drugCats" | "openDrugPreset" | "infusions" | "setInfRate" | "setInfOpen" | "fluids" | "log" | "openFluid" | "setFlVol" | "setFlEntryMode" | "setFlRate"> & { setInfDrug: unknown; setFlFluid: unknown }
  openLabs: (ts: string) => void
  openGasSettings: (...args: never[]) => void
  openAgent: () => void
  active: Active
  eventLabel: (event: LogEvent) => { text: string }
  setInfActTgt: (target: never) => void
  setInfActRate: (rate: string) => void
  setInfActOpen: (open: boolean) => void
  save: SaveIntraopEvent
  airwayExchange: ReturnType<typeof usePhoneAirwayExchange>
  vascularAccesses: VascularEntry[]
  setVascularAccesses: (next: VascularEntry[]) => void
  saveVascularAccesses: (next: VascularEntry[]) => unknown
}) {
  if (!attention || isWatching) return null
  const { activeGas, activeAgents, activeInfusions } = active
  return (
    <SuggestionSheetHost attention={attention} sheets={buildPhoneSuggestionSheets({
      ...sheetArgs,
      setInfDrug: sheetArgs.setInfDrug as never,
      setFlFluid: sheetArgs.setFlFluid as never,
      pending: pendingSuggestion,
      nowIso: () => new Date().toISOString(),
      clockOf: attention.clockOf,
      openShock: () => defibrillationSheet.open(new Date().toISOString()),
      openLab: () => openLabs(new Date().toISOString()),
      openGas: (fio2, fgf, air) => (openGasSettings as (...a: unknown[]) => void)(undefined, { fgf, carrierGas: air ? "air" : activeGas?.carrierGas ?? null, fio2 }, activeGas ? "change" : "start"),
      deepenTargets: () => [
        ...activeAgents.map(agent => ({ key: `agent-${agent.name}`, label: eventLabel({ id: "a", ts: "", type: "agent_start", name: agent.name } as LogEvent).text || agent.name, open: () => openAgent() })),
        ...activeInfusions.filter(inf => ["Propofol", "Remifentanil", "Sufentanil", "Dexmedetomidine"].includes(inf.name)).map(inf => ({
          key: `inf-${inf.infId}`, label: inf.name, open: () => { setInfActTgt(inf as never); setInfActRate(String(inf.rate ?? "")); setInfActOpen(true) },
        })),
      ],
      saveEvent: event => { void save(event as never) },
      extras: {
        openAirway: complication => airwayExchange.setDialog({ reason: "reintubation", at: new Date().toISOString(), complication }),
        linesOf: kind => vascularAccesses.map((line, index) => ({ line: line as unknown as VascularLine, index }))
          .filter(({ line }) => accessKindOf(line.site) === kind)
          .map(({ line, index }) => ({ id: String(index), label: vascularLineText(line, { failed: "", time: () => "" }), failed: line.failed === true })),
        markLineFailed: (lineId, at) => {
          const next = replaceFailedLine(vascularAccesses as unknown as VascularLine[], Number(lineId), at) as unknown as VascularEntry[]
          setVascularAccesses(next)
          void saveVascularAccesses(next)
        },
      },
      displayName: event => eventLabel(event).text || event.name || "",
    })} />
  )
}
