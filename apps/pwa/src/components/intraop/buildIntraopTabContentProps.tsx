import type { ComponentProps, MutableRefObject } from "react"
import { VascularTab } from "@/components/intraop/tabs/VascularTab"
import type { IntraopTabContentHostProps } from "@/components/intraop/IntraopTabContentHost"
import { formatComplications } from "@/lib/intraop-complications"
import { timeAtCol } from "@/lib/intraop-projection"
import { buildRowSummary } from "@/lib/intraop-running"
import { confirmAction } from "@/lib/notify"
import { techniqueColor } from "@/lib/intraop-technique"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { VitalsEntry } from "@/components/IntraopTimetable"

type Host = IntraopTabContentHostProps

/** The host props are a union now, so pick the branch and read its content. */
type ContentFor<T extends Host["tab"]> = Extract<Host, { tab: T }>["content"]

type LogProps = ContentFor<"log">
type TechniqueProps = ContentFor<"technique">
type TimingProps = ContentFor<"timing">
type PositionProps = ContentFor<"position">
type MonitoringProps = ContentFor<"monitoring">
type AirwayProps = ContentFor<"airway">
type PremedicationProps = ContentFor<"premedication">
type EventsProps = ContentFor<"events">
type VascularProps = ComponentProps<typeof VascularTab>

export type IntraopTabContentBuilderProps = {
  screenWidth: LogProps["screenWidth"]
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
  activeAgent: LogProps["activeAgent"]
  activeGas: LogProps["activeGas"]
  startRef: MutableRefObject<Date | null>
  isWatching: LogProps["isWatching"]
  verticalTimetableRef: LogProps["listRef"]
  undoLastEvent: LogProps["onUndo"]
  setUndoEv: (event: null) => void
  setExpandedRow: LogProps["onSetExpandedRow"]
  eventLabel: EventsProps["eventLabel"]
  setInfActTgt: (infusion: Parameters<LogProps["onManageInfusion"]>[0]) => void
  setInfActRate: (rate: string) => void
  setInfActOpen: (open: boolean) => void
  setInfActTs: (timestamp: string | null) => void
  openFluidEnd: LogProps["onEndFluid"]
  openGasSettings: (timestamp: string, gas: NonNullable<LogProps["activeGas"]>, mode: "change") => void
  tc: TechniqueProps["tc"]
  stopAgent: () => void
  openRowQuickAdd: LogProps["onQuickAdd"]
  jumpVerticalTimetableToNow: LogProps["onJumpToNow"]
  openEndCase: LogProps["onEndCase"]
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
  setAwNotes: AirwayProps["setAwNotes"]
  saveAirwaySection: AirwayProps["saveAirwaySection"]
  awExpandedDevice: AirwayProps["awExpandedDevice"]
  setAwExpandedDevice: AirwayProps["setAwExpandedDevice"]
  awExpandedWasComplete: AirwayProps["awExpandedWasComplete"]
  AIRWAY_TOOLS: AirwayProps["airwayTools"]
  AIRWAY_DEVICES: AirwayProps["airwayDevices"]
  awVentExpanded: AirwayProps["awVentExpanded"]
  setAwVentExpanded: AirwayProps["setAwVentExpanded"]
  vascularAccesses: VascularProps["vascularAccesses"]
  setVascularAccesses: VascularProps["setVascularAccesses"]
  saveVascularAccesses: VascularProps["saveVascularAccesses"]
  vascularSaving: VascularProps["vascularSaving"]
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
  setCompOpen: (open: boolean) => void
  eventActions: EventsProps["onEventActions"]
  promptDelete: EventsProps["onPromptDelete"]
  prevVitalFor: EventsProps["previousVitalFor"]
  logEventText?: LogProps["eventText"]
  logBuildSummary?: LogProps["buildSummary"]
}

export function buildIntraopTabContentProps(props: IntraopTabContentBuilderProps): IntraopTabContentHostProps {
  const {
    screenWidth, tab, undoEv, chartRows, chartStart, currentCol, expandedRow, nowSlotPercent,
    timetable, eventRows, activeInfusions, activeFluids, activeAgent, activeGas, startRef,
    isWatching, verticalTimetableRef, undoLastEvent, setUndoEv, setExpandedRow, eventLabel,
    setInfActTgt, setInfActRate, setInfActOpen, setInfActTs, openFluidEnd, openGasSettings, tc, stopAgent,
    openRowQuickAdd, jumpVerticalTimetableToNow, openEndCase, preop,
    techPath, setTechPath,
    TECHNIQUE_TREE, techniques, setTechniques, saveTechniques, techniqueLabel, otherTechText,
    setOtherTechText, caseMonthYear, setCaseMonthYear, caseStartTime, setCaseStartTime,
    caseEndTime, setCaseEndTime, caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming,
    positions, setPositions, savePositions, fieldSaving, POSITIONS_LIST, monitoring,
    setMonitoring, saveMonitoring, MONITORING_OPTS, advMonOpen, setAdvMonOpen, awTools,
    setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices, awLmaSize, setAwLmaSize,
    awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed, awNasalTubeSize,
    setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed, awDltType, setAwDltType,
    awDltSide, setAwDltSide, awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes,
    setAwVentModes, awNotes, setAwNotes, saveAirwaySection, awExpandedDevice,
    setAwExpandedDevice, awExpandedWasComplete, AIRWAY_TOOLS, AIRWAY_DEVICES,
    awVentExpanded, setAwVentExpanded, vascularAccesses, setVascularAccesses,
    saveVascularAccesses, vascularSaving, vascSiteColor, VASC_TREE, vascDefaultUnit,
    VASC_PREEXISTING_QUICK, premedEveningText, setPremedEveningText, premedMorningText,
    setPremedMorningText, savePremedication, openPremedPicker, log, selectedComplications,
    complicationsNotes, setComplicationsNotes, saveComplications, setCompOpen, eventActions,
    promptDelete, prevVitalFor,
    logEventText, logBuildSummary,
  } = props

  // One case per tab, and only the active one runs. Building all eleven groups
  // meant constructing hundreds of keys and closures per render — including the
  // timetable's — for content that was never mounted.
  switch (tab) {
    case "log": return { tab, content: {
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
      activeAgent,
      activeGas,
      started: !!startRef.current,
      isWatching,
      listRef: verticalTimetableRef,
      onUndo: undoLastEvent,
      onDismissUndo: () => setUndoEv(null),
      onSetExpandedRow: setExpandedRow,
      eventText: logEventText ?? ((ev: LogEvent) => eventLabel(ev).text),
      buildSummary: logBuildSummary ?? ((vital: VitalsEntry | undefined, rowEvents: LogEvent[]) => buildRowSummary(vital, rowEvents, ev => eventLabel(ev).text)),
      onManageInfusion: (inf, col) => { setInfActTs(col != null ? timeAtCol(chartStart, col).toISOString() : null); setInfActTgt(inf); setInfActRate(inf.rate); setInfActOpen(true) },
      onEndFluid: openFluidEnd,
      onEditGas: c => { if (activeGas) openGasSettings(timeAtCol(chartStart, c).toISOString(), activeGas, "change") },
      onStopAgent: () => {
        if (activeAgent) void confirmAction(`Stop ${activeAgent.name}?`, undefined, { destructive: true, confirmLabel: "Stop", cancelLabel: tc("cancelLabel") })
          .then(ok => { if (ok) stopAgent() })
      },
      onQuickAdd: openRowQuickAdd,
      onJumpToNow: jumpVerticalTimetableToNow,
      onEndCase: openEndCase,
    } }

    case "equipment": return { tab, content: {
      preop,
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
      saveTiming,
      startRef,
      tc,
    } }

    case "position": return { tab, content: {
      positions, setPositions, savePositions, fieldSaving, positionsList: POSITIONS_LIST,
    } }

    case "monitoring": return { tab, content: {
      monitoring, setMonitoring, saveMonitoring, fieldSaving,
      monitoringOpts: MONITORING_OPTS, advMonOpen, setAdvMonOpen,
    } }

    case "airway": return { tab, content: {
      awTools, setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices,
      awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed,
      setAwOralCuffed, awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed,
      setAwNasalCuffed, awDltType, setAwDltType, awDltSide, setAwDltSide,
      awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes, setAwVentModes,
      awNotes, setAwNotes, saveAirwaySection, awExpandedDevice, setAwExpandedDevice,
      awExpandedWasComplete, airwayTools: AIRWAY_TOOLS, airwayDevices: AIRWAY_DEVICES,
      awVentExpanded, setAwVentExpanded,
    } }

    case "vascular": return { tab, content: (
      <VascularTab
        vascularAccesses={vascularAccesses}
        setVascularAccesses={setVascularAccesses}
        saveVascularAccesses={saveVascularAccesses}
        vascularSaving={vascularSaving}
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
    } }

    case "events": return { tab, content: {
      log,
      selectedComplications,
      complicationsNotes,
      onComplicationsNotesChange: setComplicationsNotes,
      onComplicationsNotesBlur: () => { if (formatComplications(selectedComplications, complicationsNotes) !== null) saveComplications() },
      onOpenComplications: () => setCompOpen(true),
      onEventActions: eventActions,
      onPromptDelete: promptDelete,
      eventLabel,
      previousVitalFor: prevVitalFor,
    } }
  }
}
