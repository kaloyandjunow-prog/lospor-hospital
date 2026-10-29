import type { Dispatch, SetStateAction } from "react"

import type { IntraopSheetsHostProps } from "@/components/intraop/IntraopSheetsHost"
import {
  buildIntraopMedicationSheetProps,
  type IntraopMedicationSheetBuilderProps,
} from "@/components/intraop/buildIntraopMedicationSheetProps"
import { formatDateHHMM } from "@/lib/intraop-projection"
import { slotIsoTimestamp } from "@/lib/intraop-row-quick-add"
import { buildPostopRoute } from "@/lib/postop-route"
import { premedicationSheetProps } from "@/components/intraop/premedication-sheet-props"
import type { ClinicalStringKey } from "@/lib/preferences-context"

type SlotProps = IntraopSheetsHostProps["slot"]
type EditEventProps = IntraopSheetsHostProps["editEvent"]
type ComplicationsProps = IntraopSheetsHostProps["complications"]
type StartAtProps = IntraopSheetsHostProps["startAt"]
type EndCaseProps = IntraopSheetsHostProps["endCase"]
type PremedicationLibraryProps = IntraopSheetsHostProps["premedicationLibrary"]

export type IntraopSheetsBuilderProps = IntraopMedicationSheetBuilderProps & {
  slotOpen: SlotProps["visible"]
  slotTs: Date | null
  timeStr: string
  slotEventSearch: SlotProps["eventSearch"]
  slotCompExpanded: SlotProps["complicationExpanded"]
  CLINICAL_EVENT_CATS: SlotProps["eventCategories"]
  COMPLICATION_GROUPS: ComplicationsProps["groups"]
  COMPLICATION_ITEMS: SlotProps["extraComplicationLabels"]
  isGACase: SlotProps["isGACase"]
  setSlotOpen: (open: boolean) => void
  setSlotEventSearch: SlotProps["onEventSearchChange"]
  setSlotCompExpanded: (value: boolean | ((previous: boolean) => boolean)) => void
  openSlotEvent: SlotProps["onSelectEvent"]
  openDrug: (timestamp?: string) => void
  openAgent: (timestamp?: string) => void
  activeAgents: SlotProps["activeAgents"]
  stopAgent: (name?: string, rowTs?: string | null) => void
  stopGasSettings: (rowTs?: string | null) => void
  openGasSettings: (timestamp?: string) => void
  editOpen: EditEventProps["visible"]
  editEv: EditEventProps["event"]
  editDose: EditEventProps["dose"]
  editTime: EditEventProps["time"]
  setEditOpen: (open: boolean) => void
  setEditDose: EditEventProps["onDoseChange"]
  setEditTime: EditEventProps["onTimeChange"]
  confirmEdit: EditEventProps["onConfirm"]
  compOpen: ComplicationsProps["visible"]
  setCompOpen: (open: boolean) => void
  COMPLICATION_TC_TITLES: Record<string, ClinicalStringKey>
  selectedComplications: ComplicationsProps["selected"]
  compGroupExpanded: ComplicationsProps["expanded"]
  compSaving: ComplicationsProps["saving"]
  toggleComplicationGroup: ComplicationsProps["onToggleGroup"]
  toggleComplication: ComplicationsProps["onToggleItem"]
  setSelectedComplications: (selected: string[]) => void
  saveComplications: ComplicationsProps["onSave"]
  startAtOpen: StartAtProps["visible"]
  startAtInput: StartAtProps["value"]
  setStartAtOpen: (open: boolean) => void
  setStartAtInput: StartAtProps["onChange"]
  startAtDay: Pick<StartAtProps, "dayKey" | "todayKey" | "onDayChange">
  startCaseAt: StartAtProps["onStart"]
  endCaseOpen: EndCaseProps["visible"]
  setEndCaseOpen: (open: boolean) => void
  endCaseRunningItems: EndCaseProps["items"]
  afterEndItems: NonNullable<EndCaseProps["afterEnd"]>
  resolveAfterEnd: NonNullable<EndCaseProps["onResolveAfterEnd"]>
  endCaseDecisions: EndCaseProps["decisions"]
  setEndCaseDecisions: (
    value: EndCaseProps["decisions"] | ((previous: EndCaseProps["decisions"]) => EndCaseProps["decisions"])
  ) => void
  finaliseCase: EndCaseProps["onFinalize"]
  premedPickOpen: PremedicationLibraryProps["visible"]
  premedPickPhase: PremedicationLibraryProps["phase"]
  PREMED_LIBRARY: PremedicationLibraryProps["categories"]
  premedPickCat: PremedicationLibraryProps["openCategory"]
  premedPickDrug: PremedicationLibraryProps["drug"]
  premedPickDose: PremedicationLibraryProps["dose"]
  premedPickRoute: PremedicationLibraryProps["route"]
  setPremedPickOpen: (open: boolean) => void
  setPremedPickCat: Dispatch<SetStateAction<PremedicationLibraryProps["openCategory"]>>
  setPremedPickDrug: Dispatch<SetStateAction<PremedicationLibraryProps["drug"]>>
  setPremedPickDose: PremedicationLibraryProps["onDoseChange"]
  setPremedPickRoute: PremedicationLibraryProps["onRouteChange"]
  addSelectedPremedication: PremedicationLibraryProps["onAdd"]
  caseEnded: boolean
  continuedPostopItems: string[]
  tc: (key: ClinicalStringKey) => string
  router: { replace: (route: string) => void }
  id: string
}

export function buildIntraopSheetsProps(props: IntraopSheetsBuilderProps): IntraopSheetsHostProps {
  const {
    activeAgents, activeGas, slotOpen, slotTs, timeStr, slotEventSearch, slotCompExpanded,
    CLINICAL_EVENT_CATS, COMPLICATION_GROUPS, COMPLICATION_ITEMS, isGACase, setSlotOpen, setSlotEventSearch,
    setSlotCompExpanded, openSlotEvent, openDrug, openAgent, stopAgent, stopGasSettings,
    openGasSettings,
    editOpen, editEv, editDose, editTime, setEditOpen, setEditDose, setEditTime, confirmEdit,
    compOpen, setCompOpen, COMPLICATION_TC_TITLES, selectedComplications, compGroupExpanded,
    compSaving, toggleComplicationGroup, toggleComplication, setSelectedComplications,
    saveComplications, startAtOpen, startAtInput, setStartAtOpen, setStartAtInput, startCaseAt,
    startAtDay,
    endCaseOpen, setEndCaseOpen, endCaseRunningItems, afterEndItems, resolveAfterEnd, endCaseDecisions, setEndCaseDecisions,
    finaliseCase, premedPickOpen, premedPickPhase, PREMED_LIBRARY, premedPickCat,
    premedPickDrug, premedPickDose, premedPickRoute, setPremedPickOpen, setPremedPickCat,
    setPremedPickDrug, setPremedPickDose, setPremedPickRoute, addSelectedPremedication,
    caseEnded, continuedPostopItems, tc, router, id,
  } = props

  return {
    slot: {
      visible: slotOpen,
      title: `${slotTs ? formatDateHHMM(slotTs) : timeStr}`,
      eventSearch: slotEventSearch,
      complicationExpanded: slotCompExpanded,
      eventCategories: CLINICAL_EVENT_CATS,
      extraComplicationLabels: COMPLICATION_ITEMS,
      isGACase,
      activeAgents,
      activeGas,
      onClose: () => { setSlotOpen(false); setSlotEventSearch(""); setSlotCompExpanded(false) },
      onEventSearchChange: setSlotEventSearch,
      onToggleComplications: () => setSlotCompExpanded((value) => !value),
      onSelectEvent: openSlotEvent,
      onBrowseDrugs: () => { const ts = slotIsoTimestamp(slotTs); setSlotOpen(false); openDrug(ts) },
      // Stops are recorded at the row the sheet was opened from.
      onStopAgent: name => { setSlotOpen(false); stopAgent(name, slotIsoTimestamp(slotTs)) },
      onOpenAgent: () => { const ts = slotIsoTimestamp(slotTs); setSlotOpen(false); openAgent(ts) },
      onStopGas: () => { setSlotOpen(false); stopGasSettings(slotIsoTimestamp(slotTs)) },
      onOpenGas: () => { const ts = slotIsoTimestamp(slotTs); setSlotOpen(false); openGasSettings(ts) },
    },
    ...buildIntraopMedicationSheetProps(props),
    editEvent: {
      visible: editOpen,
      event: editEv,
      dose: editDose,
      time: editTime,
      onClose: () => setEditOpen(false),
      onDoseChange: setEditDose,
      onTimeChange: setEditTime,
      onConfirm: confirmEdit,
    },
    complications: {
      visible: compOpen,
      onClose: () => setCompOpen(false),
      groups: COMPLICATION_GROUPS,
      titleForGroup: group => COMPLICATION_TC_TITLES[group.id] ? tc(COMPLICATION_TC_TITLES[group.id]) : group.title,
      selected: selectedComplications,
      expanded: compGroupExpanded,
      saving: compSaving,
      onToggleGroup: toggleComplicationGroup,
      onToggleItem: toggleComplication,
      onClear: () => setSelectedComplications([]),
      onSave: saveComplications,
    },
    startAt: {
      visible: startAtOpen,
      value: startAtInput,
      onClose: () => setStartAtOpen(false),
      onChange: setStartAtInput,
      ...startAtDay,
      onStart: startCaseAt,
    },
    endCase: {
      visible: endCaseOpen,
      onClose: () => setEndCaseOpen(false),
      items: endCaseRunningItems,
      afterEnd: afterEndItems,
      onResolveAfterEnd: resolveAfterEnd,
      decisions: endCaseDecisions,
      continueLabel: tc("continuePostop"),
      onDecision: (key, decision) => setEndCaseDecisions((previous) => ({ ...previous, [key]: decision })),
      onFinalize: finaliseCase,
    },
    premedicationLibrary: premedicationSheetProps({
      open: premedPickOpen, phase: premedPickPhase, library: PREMED_LIBRARY, category: premedPickCat,
      drug: premedPickDrug, dose: premedPickDose, route: premedPickRoute, setOpen: setPremedPickOpen,
      setCategory: setPremedPickCat, setDrug: setPremedPickDrug, setDose: setPremedPickDose,
      setRoute: setPremedPickRoute, onAdd: addSelectedPremedication,
    }, { preop: props.preop, prospectiveGuidanceEnabled: props.prospectiveGuidanceEnabled, backLabel: tc("back") }),
    postopContinue: caseEnded ? {
      continuedItems: continuedPostopItems,
      continueLabel: tc("continuePostop"),
      onContinue: () => {
        router.replace(buildPostopRoute(id, continuedPostopItems))
      },
    } : undefined,
  }
}
