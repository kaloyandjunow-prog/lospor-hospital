import { fluidsTabTotals } from "./fluids-tab-totals"
import { jetSheet } from "@/lib/jet-sheet"
import type { ComponentProps, MutableRefObject } from "react"
import { VascularTab } from "@/components/intraop/tabs/VascularTab"
import type { IntraopTabContentHostProps } from "@/components/intraop/IntraopTabContentHost"
// Core's own totals, not the case-detail wrapper: that wrapper narrows `rate`
// to string, while a live timetable's rate is NumericText. Core accepts both.
import {
  type WeightBasisMap,
} from "@lospor/core/intraop-totals"
import { formatComplications } from "@/lib/intraop-complications"
import { tciPatientFromPreop } from "@/lib/intraop-preop-summary"; import { timeAtCol } from "@/lib/intraop-projection"
import { buildRowSummary } from "@/lib/intraop-running"
import { confirmAction } from "@/lib/notify"
import { techniqueColor } from "@/lib/intraop-technique"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { VitalsEntry } from "@/components/IntraopTimetable"
import { formatMessage } from "@/i18n/locale"
import { projectLabDraws, type LabResult } from "@lospor/core/labs"

type Host = IntraopTabContentHostProps

/** The host props are a union now, so pick the branch and read its content. */
type ContentFor<T extends Host["tab"]> = Extract<Host, { tab: T }>["content"]
type LogProps = ContentFor<"log">
type TechniqueProps = ContentFor<"technique">
type TimingProps = ContentFor<"timing">
type PositionProps = ContentFor<"position">
type MonitoringProps = ContentFor<"monitoring">
type EquipmentProps = ContentFor<"equipment">
type AirwayProps = ContentFor<"airway">
type PremedicationProps = ContentFor<"premedication">
type EventsProps = ContentFor<"events">
type FluidsProps = ContentFor<"fluids">
type VascularProps = ComponentProps<typeof VascularTab>

export type IntraopTabContentBuilderProps = {
  screenWidth: LogProps["screenWidth"]
  caseEnded: boolean // ended: nothing runs on in the chart after the end
  attention?: LogProps["attention"] // Core intraop-attention, shown above the chart
  tab: Host["tab"]
  undoEv: LogProps["undoEvent"]
  chartRows: LogProps["chartRows"]
  chartStart: LogProps["chartStart"]
  currentCol: LogProps["currentCol"]
  expandedRow: LogProps["expandedRow"]
  nowSlotPercent: LogProps["nowSlotPercent"]
  timetable: LogProps["timetable"]
  eventRows: LogProps["eventRows"]
  activeInfusions: LogProps["activeInfusions"]
  activeFluids: LogProps["activeFluids"]
  activeAgents: LogProps["activeAgents"]
  activeGas: LogProps["activeGas"]
  startRef: MutableRefObject<Date | null>
  endedAtRef: MutableRefObject<Date | null>; caseTimezone: string | null
  isWatching: LogProps["isWatching"]
  verticalTimetableRef: LogProps["listRef"]
  undoLastEvent: LogProps["onUndo"]
  setUndoEv: (event: null) => void; removalUndo: LogProps["removalUndo"] // last delete, for its Undo (9.14.2)
  setExpandedRow: LogProps["onSetExpandedRow"]
  eventLabel: EventsProps["eventLabel"]
  setInfActTgt: (infusion: Parameters<LogProps["onManageInfusion"]>[0]) => void
  setInfActRate: (rate: string) => void
  setInfActOpen: (open: boolean) => void
  setInfActTs: (timestamp: string | null) => void
  openFluidEnd: (fluid: Parameters<LogProps["onEndFluid"]>[0], rowTs?: string | null) => void
  openGasSettings: (timestamp: string, gas: NonNullable<LogProps["activeGas"]>, mode: "change") => void
  tc: TechniqueProps["tc"]
  stopAgent: (name?: string, rowTs?: string | null) => void
  openRowQuickAdd: LogProps["onQuickAdd"]
  jumpVerticalTimetableToNow: LogProps["onJumpToNow"]
  openEndCase: LogProps["onEndCase"]
  openChartView: LogProps["onViewChart"]
  preop: ContentFor<"equipment">["preop"]
  techPath: TechniqueProps["techPath"]
  setTechPath: TechniqueProps["setTechPath"]
  TECHNIQUE_TREE: TechniqueProps["techniqueTree"]
  techniques: TechniqueProps["techniques"]
  setTechniques: TechniqueProps["setTechniques"]
  saveTechniques: TechniqueProps["saveTechniques"]
  techniqueLabel: TechniqueProps["techniqueLabel"]
  otherTechText: TechniqueProps["otherTechText"]
  setOtherTechText: TechniqueProps["setOtherTechText"]
  caseMonthYear: TimingProps["caseMonthYear"]
  setCaseMonthYear: TimingProps["setCaseMonthYear"]
  caseStartTime: TimingProps["caseStartTime"]
  setCaseStartTime: TimingProps["setCaseStartTime"]
  caseEndTime: TimingProps["caseEndTime"]
  setCaseEndTime: TimingProps["setCaseEndTime"]
  caseEndNextDay: TimingProps["caseEndNextDay"]
  setCaseEndNextDay: TimingProps["setCaseEndNextDay"]
  timingSaving: TimingProps["timingSaving"]
  saveTiming: TimingProps["saveTiming"]
  positions: PositionProps["positions"]
  setPositions: PositionProps["setPositions"]
  savePositions: PositionProps["savePositions"]
  fieldSaving: PositionProps["fieldSaving"]
  POSITIONS_LIST: PositionProps["positionsList"]
  monitoring: MonitoringProps["monitoring"]
  setMonitoring: MonitoringProps["setMonitoring"]
  saveMonitoring: MonitoringProps["saveMonitoring"]
  MONITORING_OPTS: MonitoringProps["monitoringOpts"]
  advMonOpen: MonitoringProps["advMonOpen"]
  setAdvMonOpen: MonitoringProps["setAdvMonOpen"]
  awTools: AirwayProps["awTools"]
  setAwTools: AirwayProps["setAwTools"]
  awClGrade: AirwayProps["awClGrade"]
  setAwClGrade: AirwayProps["setAwClGrade"]
  awDevices: AirwayProps["awDevices"]
  setAwDevices: AirwayProps["setAwDevices"]
  awLmaSize: AirwayProps["awLmaSize"]
  setAwLmaSize: AirwayProps["setAwLmaSize"]
  awOralTubeSize: AirwayProps["awOralTubeSize"]
  setAwOralTubeSize: AirwayProps["setAwOralTubeSize"]
  awOralCuffed: AirwayProps["awOralCuffed"]
  setAwOralCuffed: AirwayProps["setAwOralCuffed"]
  awNasalTubeSize: AirwayProps["awNasalTubeSize"]
  setAwNasalTubeSize: AirwayProps["setAwNasalTubeSize"]
  awNasalCuffed: AirwayProps["awNasalCuffed"]
  setAwNasalCuffed: AirwayProps["setAwNasalCuffed"]
  awDltType: AirwayProps["awDltType"]
  setAwDltType: AirwayProps["setAwDltType"]
  awDltSide: AirwayProps["awDltSide"]
  setAwDltSide: AirwayProps["setAwDltSide"]
  awDltSize: AirwayProps["awDltSize"]
  setAwDltSize: AirwayProps["setAwDltSize"]
  awEbSize: AirwayProps["awEbSize"]
  setAwEbSize: AirwayProps["setAwEbSize"]
  awVentModes: AirwayProps["awVentModes"]
  setAwVentModes: AirwayProps["setAwVentModes"]
  awNotes: AirwayProps["awNotes"]
  awPresentsIntubated: AirwayProps["awPresentsIntubated"]
  setAwPresentsIntubated: AirwayProps["setAwPresentsIntubated"]
  awNotApplicable: AirwayProps["awNotApplicable"]
  setAwNotApplicable: AirwayProps["setAwNotApplicable"]
  onAirwayInterventionSelected: AirwayProps["onAirwayInterventionSelected"]
  onNoAirwayInterventionSelected: AirwayProps["onNoAirwayInterventionSelected"]
  setAwNotes: AirwayProps["setAwNotes"]
  saveAirwaySection: AirwayProps["saveAirwaySection"]
  awExpandedDevice: AirwayProps["awExpandedDevice"]
  setAwExpandedDevice: AirwayProps["setAwExpandedDevice"]
  awExpandedWasComplete: AirwayProps["awExpandedWasComplete"]
  AIRWAY_TOOLS: AirwayProps["airwayTools"]
  AIRWAY_DEVICES: AirwayProps["airwayDevices"]
  /** Smart selection (10.2.0), when the clinician uses it. */
  airwaySmart?: AirwayProps["smart"]
  awVentExpanded: AirwayProps["awVentExpanded"]
  setAwVentExpanded: AirwayProps["setAwVentExpanded"]
  vascularAccesses: VascularProps["vascularAccesses"]
  setVascularAccesses: VascularProps["setVascularAccesses"]
  saveVascularAccesses: VascularProps["saveVascularAccesses"]
  vascularSaving: VascularProps["vascularSaving"]
  /** Smart selection for vascular access (10.2.0), when the clinician uses it. */
  vascularSmart?: VascularProps["smart"]
  monitoringSmart?: MonitoringProps["smart"]
  equipmentSmart?: EquipmentProps["smart"]
  techniqueSmart?: TechniqueProps["smart"]
  vascSiteColor: VascularProps["vascSiteColor"]
  VASC_TREE: VascularProps["vascTree"]
  vascDefaultUnit: VascularProps["vascDefaultUnit"]
  VASC_PREEXISTING_QUICK: VascularProps["vascPreexistingQuick"]
  premedEveningText: PremedicationProps["premedEveningText"]
  setPremedEveningText: PremedicationProps["setPremedEveningText"]
  premedMorningText: PremedicationProps["premedMorningText"]
  setPremedMorningText: PremedicationProps["setPremedMorningText"]
  savePremedication: PremedicationProps["savePremedication"]
  openPremedPicker: PremedicationProps["openPremedPicker"]
  log: EventsProps["log"]
  selectedComplications: EventsProps["selectedComplications"]
  complicationsNotes: EventsProps["complicationsNotes"]
  setComplicationsNotes: EventsProps["onComplicationsNotesChange"]
  saveComplications: () => void
  removeLegacyComplication: EventsProps["onRemoveLegacyComplication"]
  eventActions: EventsProps["onEventActions"]
  promptDelete: EventsProps["onPromptDelete"]
  prevVitalFor: EventsProps["previousVitalFor"]
  logEventText?: LogProps["eventText"]
  logBuildSummary?: LogProps["buildSummary"]
  caseIbw: number | null
  caseTbw: number | null
  /** Body surface area for per-m² infusions; null when height or weight is missing. */
  caseBsa?: number | null
  infusionWeightBasis: WeightBasisMap
  /** Lab results of the case; drawn on the chart and in the event log by time. */
  labResults: LabResult[]
  openLabs: (takenAt: string) => void
  urineMl: FluidsProps["urineMl"]
  setUrineMl: FluidsProps["setUrineMl"]
  bloodLossMl: FluidsProps["bloodLossMl"]
  setBloodLossMl: FluidsProps["setBloodLossMl"]
  fluidsScreen?: FluidsProps["screen"]
  eventLogScreen?: EventsProps["eventLogScreen"]
}

export function buildIntraopTabContentProps(props: IntraopTabContentBuilderProps): IntraopTabContentHostProps {
  const {
    labResults, openLabs, screenWidth, attention, caseEnded, tab, undoEv, chartRows, chartStart, currentCol, expandedRow, nowSlotPercent,
    timetable, eventRows, activeInfusions, activeFluids, activeAgents, activeGas, startRef,
    isWatching, verticalTimetableRef, undoLastEvent, setUndoEv, removalUndo, setExpandedRow, eventLabel,
    setInfActTgt, setInfActRate, setInfActOpen, setInfActTs, openFluidEnd, openGasSettings, tc, stopAgent,
    openRowQuickAdd, jumpVerticalTimetableToNow, openEndCase, openChartView, preop,
    techPath, setTechPath,
    TECHNIQUE_TREE, techniques, setTechniques, saveTechniques, techniqueLabel, otherTechText,
    setOtherTechText, caseMonthYear, setCaseMonthYear, caseStartTime, setCaseStartTime,
    caseEndTime, setCaseEndTime, caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming, endedAtRef, caseTimezone,
    positions, setPositions, savePositions, fieldSaving, POSITIONS_LIST, monitoring,
    setMonitoring, saveMonitoring, MONITORING_OPTS, advMonOpen, setAdvMonOpen, awTools,
    setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices, awLmaSize, setAwLmaSize,
    awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed, awNasalTubeSize,
    setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed, awDltType, setAwDltType,
    awDltSide, setAwDltSide, awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes,
    setAwVentModes, awNotes, setAwNotes, awPresentsIntubated, setAwPresentsIntubated,
    awNotApplicable, setAwNotApplicable, onAirwayInterventionSelected, onNoAirwayInterventionSelected, saveAirwaySection, awExpandedDevice,
    setAwExpandedDevice, awExpandedWasComplete, AIRWAY_TOOLS, AIRWAY_DEVICES, airwaySmart,
    awVentExpanded, setAwVentExpanded, vascularAccesses, setVascularAccesses,
    saveVascularAccesses, vascularSaving, vascularSmart, monitoringSmart, equipmentSmart, techniqueSmart, vascSiteColor, VASC_TREE, vascDefaultUnit,
    VASC_PREEXISTING_QUICK, premedEveningText, setPremedEveningText, premedMorningText,
    setPremedMorningText, savePremedication, openPremedPicker, log, selectedComplications,
    complicationsNotes, setComplicationsNotes, saveComplications, removeLegacyComplication, eventActions,
    promptDelete, prevVitalFor,
    logEventText, logBuildSummary,
    caseIbw, caseTbw, caseBsa = null, infusionWeightBasis, urineMl, setUrineMl, bloodLossMl, setBloodLossMl, fluidsScreen, eventLogScreen,
  } = props

  // One case per tab, and only the active one runs. Building all eleven groups
  // meant constructing hundreds of keys and closures per render — including the
  // timetable's — for content that was never mounted.
  const labDraws = () => startRef.current ? projectLabDraws(labResults, { start: chartStart }) : []

  switch (tab) {
    case "log": return { tab, content: {
      attention,
      labDraws: labDraws(),
      onOpenLabs: openLabs,
      screenWidth,
      undoEvent: undoEv,
      chartRows,
      rowHeight: 60,
      chartStart,
      currentCol,
      expandedRow,
      nowSlotPercent,
      timetable,
      eventRows,
      activeInfusions,
      activeFluids,
      activeAgents,
      activeGas,
      started: !!startRef.current, projectRunning: !caseEnded, tciPatient: tciPatientFromPreop(preop),
      isWatching,
      listRef: verticalTimetableRef,
      onUndo: undoLastEvent,
      onDismissUndo: () => setUndoEv(null), removalUndo,
      onSetExpandedRow: setExpandedRow,
      eventText: logEventText ?? ((ev: LogEvent) => eventLabel(ev).text),
      buildSummary: logBuildSummary ?? ((vital: VitalsEntry | undefined, rowEvents: LogEvent[]) => buildRowSummary(vital, rowEvents, ev => eventLabel(ev).text)),
      onManageInfusion: (inf, col) => { setInfActTs(col != null ? timeAtCol(chartStart, col).toISOString() : null); setInfActTgt(inf); setInfActRate(inf.rate); setInfActOpen(true) },
      // Stops and changes are recorded at the row they were entered in.
      onEndFluid: (fluid, col) => openFluidEnd(fluid, col != null ? timeAtCol(chartStart, col).toISOString() : null),
      onEditGas: c => { if (activeGas) openGasSettings(timeAtCol(chartStart, c).toISOString(), activeGas, "change") },
      onEditJet: c => jetSheet.open(timeAtCol(chartStart, c).toISOString()),
      onStopAgent: (name, col) => {
        void confirmAction(
          formatMessage(tc("stopAgentQuestion"), { name }),
          undefined,
          { destructive: true, confirmLabel: tc("stopLabel"), cancelLabel: tc("cancelLabel") },
        )
          .then(ok => { if (ok) stopAgent(name, col != null ? timeAtCol(chartStart, col).toISOString() : null) })
      },
      onQuickAdd: openRowQuickAdd,
      onJumpToNow: jumpVerticalTimetableToNow,
      onEndCase: openEndCase,
      onViewChart: openChartView,
    } }

    case "equipment": return { tab, content: {
      preop, surgeryStart: startRef.current, caseTimezone, smart: equipmentSmart,
    } }

    case "technique": return { tab, content: {
      techPath,
      setTechPath,
      techniqueTree: TECHNIQUE_TREE,
      techniques,
      setTechniques,
      saveTechniques,
      techniqueColor,
      techniqueLabel,
      otherTechText,
      setOtherTechText,
      tc,
      smart: techniqueSmart,
    } }

    case "timing": return { tab, content: {
      caseMonthYear,
      setCaseMonthYear,
      caseStartTime,
      setCaseStartTime,
      caseEndTime,
      setCaseEndTime,
      caseEndNextDay,
      setCaseEndNextDay,
      timingSaving,
      saveTiming, startRef, endedAtRef, caseTimezone,
      tc,
    } }

    case "position": return { tab, content: {
      positions, setPositions, savePositions, fieldSaving, positionsList: POSITIONS_LIST,
    } }

    case "monitoring": return { tab, content: {
      monitoring, setMonitoring, saveMonitoring, fieldSaving,
      monitoringOpts: MONITORING_OPTS, advMonOpen, setAdvMonOpen, smart: monitoringSmart,
    } }

    case "airway": return { tab, content: {
      awTools, setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices,
      awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed,
      setAwOralCuffed, awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed,
      setAwNasalCuffed, awDltType, setAwDltType, awDltSide, setAwDltSide,
      awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes, setAwVentModes,
      awNotes, setAwNotes, awPresentsIntubated, setAwPresentsIntubated,
      awNotApplicable, setAwNotApplicable, saveAirwaySection, awExpandedDevice, setAwExpandedDevice,
      awExpandedWasComplete, airwayTools: AIRWAY_TOOLS, airwayDevices: AIRWAY_DEVICES,
      awVentExpanded, setAwVentExpanded, smart: airwaySmart, onAirwayInterventionSelected, onNoAirwayInterventionSelected,
    } }

    case "vascular": return { tab, content: (
      <VascularTab
        vascularAccesses={vascularAccesses}
        setVascularAccesses={setVascularAccesses}
        saveVascularAccesses={saveVascularAccesses}
        vascularSaving={vascularSaving}
        smart={vascularSmart}
        vascSiteColor={vascSiteColor}
        vascTree={VASC_TREE}
        vascDefaultUnit={vascDefaultUnit}
        vascPreexistingQuick={VASC_PREEXISTING_QUICK}
        tc={tc}
      />
    ) }

    case "premedication": return { tab, content: {
      premedEveningText,
      setPremedEveningText,
      premedMorningText,
      setPremedMorningText,
      savePremedication,
      tc,
      openPremedPicker,
      ordered: preop?.premedicationOrders,
    } }

    case "fluids": return { tab, content: {
      ...fluidsTabTotals({ timetable, preop, caseIbw, caseTbw, caseBsa, infusionWeightBasis, tc, attention }),
      urinaryCatheter: monitoring.includes("urinaryCatheter"),
      urineMl,
      setUrineMl,
      bloodLossMl,
      setBloodLossMl,
      screen: fluidsScreen ?? "smart",
      tc,
    } }

    case "events": return { tab, content: {
      log,
      labDraws: labDraws(),
      onOpenLabs: openLabs,
      selectedComplications,
      complicationsNotes,
      onComplicationsNotesChange: setComplicationsNotes,
      onComplicationsNotesBlur: () => { if (formatComplications(selectedComplications, complicationsNotes) !== null) saveComplications() },
      onRemoveLegacyComplication: removeLegacyComplication,
      onEventActions: eventActions,
      onPromptDelete: promptDelete,
      eventLabel,
      previousVitalFor: prevVitalFor,
      eventLogScreen: eventLogScreen ?? "smart",
    } }
  }
}
