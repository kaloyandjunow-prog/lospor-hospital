import React, { useState, useMemo } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  TextInput,
} from "react-native"
import { useOptionLibrary } from "@/lib/use-option-library"
import { confirmAction } from "@/lib/notify"
import { calcSuggestedDose as calcDose } from "@/lib/dose-calc"
import type {
  AgentSegment,
  GasSettingsSegment,
  TimetableData,
  TimetableDrug,
  TimetableFluid,
  TimetableInfusion,
  VitalsEntry,
} from "@lospor/core/intraop-types"
import { packLaneRows } from "@lospor/core/timetable"
import { baseProfilesMap, doseCalcMap } from "@lospor/core/option-library"
import { metadataString } from "@lospor/core/option-contracts"
import { gasSettingsAtColumn } from "@lospor/core/intraop-summary"
import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"
import { displayClinicalCode, displayGasMix } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

// ─── Types (API-compatible with web timetable) ────────────────────────────────

export type {
  AgentSegment,
  GasSettingsSegment,
  TimetableData,
  TimetableDrug,
  TimetableFluid,
  TimetableInfusion,
  VitalsEntry,
}
export function emptyTimetable(): TimetableData {
  return { vitals: [], drugs: [], fluids: [], infusions: [], agents: [], gasSettings: [] }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COL_W   = 56  // px per 5-min column
const LABEL_W = 72  // label column width
const EXTEND  = 30 / INTRAOP_COLUMN_MINUTES

// ─── Data libraries ───────────────────────────────────────────────────────────

type DrugChoice = { name: string; unit: string }
type DrugCategory = { cat: string; color: string; drugs: DrugChoice[] }
type InfusionChoice = { name: string; unit: string; color: string }
type FluidChoice = { name: string; cat: string; color: string }
type AgentChoice = { name: string; color: string }

const OPTION_COLORS = [
  "#3b82f6", "#a855f7", "#f59e0b", "#10b981", "#ef4444",
  "#14b8a6", "#f97316", "#0891b2", "#ec4899", "#6366f1",
]

const FLUID_COLORS: Record<string, string> = {
  Crystalloids: "#06b6d4",
  Colloids: "#818cf8",
  "Blood products": "#fb7185",
  Other: "#94a3b8",
}

const VITAL_DEFS: { key: keyof VitalsEntry; label: string; color: string }[] = [
  {key:"systolic",  label:"BP Sys", color:"#ef4444"},
  {key:"diastolic", label:"BP Dia", color:"#f87171"},
  {key:"heartRate", label:"HR",     color:"#22c55e"},
  {key:"spO2",      label:"SpO2",  color:"#06b6d4"},
  {key:"etco2",     label:"EtCO2", color:"#f59e0b"},
  {key:"temp",      label:"Temp",   color:"#a78bfa"},
  {key:"bgl",       label:"Serum/peripheral glucose", color:"#34d399"},
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Lane-packing for parallel fluids (mirrors web computeFluidRows) ─────────
interface FluidLaneRow { label: string; color: string; segs: TimetableFluid[] }

function computeFluidRows(fluids: TimetableFluid[]): FluidLaneRow[] {
  const byCat = new Map<string, TimetableFluid[]>()
  for (const f of fluids) {
    const cat = f.category || f.name  // group by category if available, else by name
    const normalised = f.endCol < f.startCol ? { ...f, endCol: f.startCol } : f
    const list = byCat.get(cat) ?? []; list.push(normalised); byCat.set(cat, list)
  }
  const rows: FluidLaneRow[] = []
  for (const [cat, catFluids] of byCat) {
    const lanes = packLaneRows(catFluids)
    const color = catFluids[0]?.color ?? "#94a3b8"
    lanes.forEach((lane, idx) => {
      rows.push({ label: idx === 0 ? cat : `${cat} ${idx + 1}`, color, segs: lane })
    })
  }
  return rows
}

function colToTime(startTime: string, col: number): string {
  const m = startTime.match(/^(\d+):(\d+)$/)
  const h = m ? parseInt(m[1]) : 0, mm = m ? parseInt(m[2]) : 0
  const total = h * 60 + mm + col * INTRAOP_COLUMN_MINUTES
  return `${String(Math.floor(total / 60) % 24).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`
}

function uid() { return Math.random().toString(36).slice(2,9) }

// ─── Vitals chart ────────────────────────────────────────────────────────────

const CHART_H   = 180
const Y_MAX     = 220
const GRID_VALS = [40, 80, 120, 160, 200]

const CHART_SERIES: { key: keyof VitalsEntry; color: string; dash?: boolean }[] = [
  { key: "systolic",  color: "#ef4444" },
  { key: "diastolic", color: "#ef4444", dash: true },
  { key: "heartRate", color: "#22c55e" },
  { key: "spO2",      color: "#06b6d4" },
  { key: "etco2",     color: "#f59e0b" },
]

function VitalsChart({ vitals, cols }: { vitals: VitalsEntry[]; cols: number[] }) {
  const colCount = cols.length
  const totalW   = LABEL_W + colCount * COL_W

  function yp(val: number) { return CHART_H * (1 - val / Y_MAX) }
  function xp(localIdx: number) { return LABEL_W + localIdx * COL_W + COL_W / 2 }

  type Pt = { x: number; y: number }
  function seriesPoints(key: keyof VitalsEntry): Pt[] {
    return cols.flatMap((col, localIdx) => {
      const val = vitals[col]?.[key]
      return val != null ? [{ x: xp(localIdx), y: yp(val as number) }] : []
    })
  }

  function Segment({ from, to, color, dashed }: { from: Pt; to: Pt; color: string; dashed?: boolean }) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    const thickness = dashed ? 1 : 2
    return (
      <View
        style={{
          position: "absolute",
          left: from.x + dx / 2 - length / 2,
          top: from.y + dy / 2 - thickness / 2,
          width: length,
          height: thickness,
          backgroundColor: color,
          opacity: dashed ? 0.55 : 0.95,
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    )
  }

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: "#2e2e2e" }}>
      <View style={{ width: totalW, height: CHART_H, position: "relative" }}>
        {GRID_VALS.map(v => {
          const y = yp(v)
          return (
            <React.Fragment key={v}>
              <View style={{ position: "absolute", left: LABEL_W, top: y, width: totalW - LABEL_W, height: 1, backgroundColor: "#1e2530" }} />
              <Text style={{ position: "absolute", left: 24, top: y - 6, width: LABEL_W - 30, color: "#475569", fontSize: 8, textAlign: "right" }}>{v}</Text>
            </React.Fragment>
          )
        })}
        {cols.map((col, localIdx) => localIdx % 3 === 2 ? (
          <View key={col} style={{ position: "absolute", left: xp(localIdx) + COL_W / 2, top: 0, width: 1, height: CHART_H, backgroundColor: "#1e2530", opacity: 0.6 }} />
        ) : null)}
        {CHART_SERIES.map(({ key, color, dash }) => {
          const pts = seriesPoints(key)
          return (
            <React.Fragment key={`${key}-lines`}>
              {pts.slice(1).map((pt, i) => (
                <Segment key={i} from={pts[i]} to={pt} color={color} dashed={dash} />
              ))}
            </React.Fragment>
          )
        })}
        {CHART_SERIES.map(({ key, color, dash }) => {
          const pts = seriesPoints(key)
          return (
            <React.Fragment key={`${key}-dots`}>
              {pts.map((pt, i) => (
                <View key={i} style={{ position: "absolute", left: pt.x - 4, top: pt.y - 4, width: 8, height: 8, borderRadius: 999, backgroundColor: color, opacity: dash ? 0.7 : 1 }} />
              ))}
            </React.Fragment>
          )
        })}
      </View>
    </View>
  )
}

// ─── Sub-modals ───────────────────────────────────────────────────────────────

function BottomSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex:1, backgroundColor:"rgba(0,0,0,0.5)" }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={{ backgroundColor:"#1c1c1c", borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:40, maxHeight:"80%" }}>
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <Text style={{ color:"#fff", fontSize:16, fontWeight:"600" }}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color:"#64748b", fontSize:16 }}>x</Text>
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </Modal>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TimetableProps {
  startTime:        string
  colCount:         number
  onColCountChange: (n: number) => void
  data:             TimetableData
  onChange:         (d: TimetableData) => void
  showAgents?:      boolean
  colOffset?:       number   // first column index (for paginated chart view)
  showActions?:     boolean  // false hides the add-drug/infusion/fluid/agent bar
  /** Called when an infusion bar cell is tapped - parent uses this to set entryTs before opening manage modal */
  onInfusionBarTap?: (infId: string, col: number) => void
  onGasCellTap?:    (col: number, segment: GasSettingsSegment | null) => void
  onGasStop?:       (segment: GasSettingsSegment) => void
  endTime?:         string   // ISO string or HH:MM - dims cells past the end
  onResumeCase?:    () => void
  patientWeightKg?: number
  patientHeightCm?: number
  patientSex?:      string
}

type AddTab = "drug" | "infusion" | "fluid" | "agent"

export function IntraopTimetable({ startTime, colCount, onColCountChange, data, onChange, showAgents, colOffset = 0, showActions = true, onInfusionBarTap, onGasCellTap, onGasStop, endTime, onResumeCase: _onResumeCase, patientWeightKg, patientHeightCm, patientSex }: TimetableProps) {
  const { tc, language } = usePreferences()
  const drugLabel = (name: string) => displayClinicalCode("option:INTRAOP_DRUG", name, language, { label: name })
  const infusionLabel = (name: string) => displayClinicalCode("option:INTRAOP_INFUSION", name, language, { label: name })
  const fluidLabel = (name: string) => displayClinicalCode("option:INTRAOP_FLUID", name, language, { label: name })
  const agentLabel = (name: string) => displayClinicalCode("option:INHALATIONAL_AGENT", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  const fluidLaneLabel = (name: string) => {
    const suffix = name.match(/ \d+$/)?.[0] ?? ""
    const category = suffix ? name.slice(0, -suffix.length) : name
    return `${groupLabel(category)}${suffix}`
  }

  const cols = useMemo(() => Array.from({ length: colCount }, (_, i) => i + colOffset), [colCount, colOffset])

  const endCol = useMemo(() => {
    if (!endTime) return null
    // endTime arrives as full ISO string "2000-01-01THH:MM:00.000Z" - extract HH:MM via UTC
    let hhmm = endTime
    if (endTime.includes("T")) {
      const d = new Date(endTime)
      if (!isNaN(d.getTime())) {
        hhmm = `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
      }
    }
    const [eh, em] = hhmm.split(":").map(Number)
    const [sh, sm] = startTime.split(":").map(Number)
    const diffMins = (eh * 60 + em) - (sh * 60 + sm)
    return Math.max(0, Math.floor(diffMins / INTRAOP_COLUMN_MINUTES))
  }, [endTime, startTime])

  // Chart toggle
  const [chartVisible, setChartVisible] = useState(true)

  // Column selection (the "now" / focus column)
  const [selCol, setSelCol] = useState(0)

  // Add modal: Drug | Infusion | Fluid | Agent tabs
  const [addOpen, setAddOpen]     = useState(false)
  const [addTab, setAddTab]       = useState<"drug"|"infusion"|"fluid"|"agent">("drug")

  // Drug steps: cat -> pick -> dose
  const [drugCat, setDrugCat]     = useState<string | null>(null)
  const [drugStep, setDrugStep]   = useState<"pick"|"dose">("pick")
  const [pickedDrug, setPickedDrug] = useState<{ name:string; unit:string } | null>(null)
  const [drugDose, setDrugDose]   = useState("")
  const [drugHint, setDrugHint]   = useState("")

  // Infusion
  const [selInfDrug, setSelInfDrug] = useState<InfusionChoice | null>(null)
  const [infRate, setInfRate]       = useState("")
  const [infUnit, setInfUnit]       = useState("")

  // Fluid
  const [selFluid, setSelFluid]   = useState<FluidChoice | null>(null)
  const [fluidVol, setFluidVol]   = useState("500")

  // Agent
  const [selAgent, setSelAgent]   = useState<AgentChoice | null>(null)

  // Vitals modal
  const [vModal, setVModal]       = useState<{ colIdx:number; key:keyof VitalsEntry } | null>(null)
  const [vVal, setVVal]           = useState("")

  // Bar options (delete / extend)
  const [selBar, setSelBar]       = useState<{ type:"infusion"|"fluid"|"agent"|"gas"; id:string } | null>(null)
  const [barOpts, setBarOpts]     = useState(false)

  // Drug dose autofill
  const { options: drugLibOptions } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusionLibOptions } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: fluidLibOptions } = useOptionLibrary("INTRAOP_FLUID")
  const { options: agentLibOptions } = useOptionLibrary("INHALATIONAL_AGENT")
  const drugDoseCalculations = useMemo(
    () => doseCalcMap(drugLibOptions),
    [drugLibOptions],
  )
  const drugCategories = useMemo<DrugCategory[]>(() => {
    const groups = new Map<string, DrugCategory>()
    for (const option of drugLibOptions) {
      const group = option.group ?? "Other"
      if (!groups.has(group)) {
        groups.set(group, {
          cat: group,
          color: OPTION_COLORS[groups.size % OPTION_COLORS.length],
          drugs: [],
        })
      }
      groups.get(group)!.drugs.push({
        name: option.label,
        unit: metadataString(option.metadata, "unit") ?? "mg",
      })
    }
    return [...groups.values()]
  }, [drugLibOptions])
  const infusionChoices = useMemo<InfusionChoice[]>(() => {
    const profiles = baseProfilesMap(infusionLibOptions)
    return infusionLibOptions.map(option => ({
      name: option.label,
      unit: profiles[option.label]?.unit ?? "mg/hr",
      color: option.color?.startsWith("#") ? option.color : "#64748b",
    }))
  }, [infusionLibOptions])
  const fluidChoices = useMemo<FluidChoice[]>(() => fluidLibOptions.map(option => ({
    name: option.label,
    cat: option.group ?? "Other",
    color: FLUID_COLORS[option.group ?? "Other"] ?? "#94a3b8",
  })), [fluidLibOptions])
  const fluidCategories = useMemo(
    () => [...new Set(fluidChoices.map(option => option.cat))],
    [fluidChoices],
  )
  const agentChoices = useMemo<AgentChoice[]>(() => agentLibOptions.map((option, index) => ({
    name: option.label,
    color: OPTION_COLORS[(index + 1) % OPTION_COLORS.length],
  })), [agentLibOptions])

  function drugColor(name: string): string {
    return drugCategories.find(category =>
      category.drugs.some(drug => drug.name === name),
    )?.color ?? "#64748b"
  }

  function calcSuggestedDose(name: string): { dose: string; hint: string } {
    const option = drugLibOptions.find(candidate =>
      candidate.value === name.toUpperCase()
      || candidate.label === name,
    )
    const entry = option
      ? drugDoseCalculations[option.label]
      : undefined
    return calcDose(entry, undefined, { weightKg: patientWeightKg, heightCm: patientHeightCm, sex: patientSex })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function openAdd(tab: typeof addTab, col?: number) {
    if (!showActions) return
    if (col !== undefined) setSelCol(col)
    setAddTab(tab)
    setDrugCat(null); setDrugStep("pick"); setPickedDrug(null); setDrugDose(""); setDrugHint("")
    setSelInfDrug(null); setInfRate(""); setInfUnit("")
    setSelFluid(null); setFluidVol("500")
    setSelAgent(null)
    setAddOpen(true)
  }

  function closeAdd() {
    setAddOpen(false)
    setDrugCat(null); setDrugStep("pick"); setPickedDrug(null); setDrugDose(""); setDrugHint("")
  }

  function confirmDrug() {
    if (!pickedDrug || !drugDose) return
    onChange({ ...data, drugs: [...data.drugs, { colIdx: selCol, name: pickedDrug.name, dose: drugDose, unit: pickedDrug.unit }] })
    setDrugDose(""); setDrugHint(""); setDrugStep("pick"); setPickedDrug(null); setDrugCat(null)
    setAddOpen(false)
  }

  function deleteDrug(colIdx: number, name: string, dose: string) {
    void confirmAction("Delete drug", `Remove ${dose} ${drugLabel(name)}?`, { destructive: true, confirmLabel: "Delete", cancelLabel: "Cancel" })
      .then(ok => {
        if (ok) onChange({ ...data, drugs: data.drugs.filter(d => !(d.colIdx === colIdx && d.name === name && d.dose === dose)) })
      })
  }

  function confirmInfusion() {
    if (!selInfDrug || !infRate) return
    const unit = infUnit || selInfDrug.unit
    onChange({ ...data, infusions: [...data.infusions, { id: uid(), name: selInfDrug.name, rate: infRate, unit, startCol: selCol, endCol: selCol + EXTEND, color: selInfDrug.color }] })
    closeAdd()
  }

  function confirmFluid() {
    if (!selFluid) return
    onChange({ ...data, fluids: [...data.fluids, { id: uid(), name: selFluid.name, category: selFluid.cat, volume: fluidVol, color: selFluid.color, startCol: selCol, endCol: selCol + EXTEND }] })
    closeAdd()
  }

  function confirmAgent() {
    if (!selAgent) return
    const existing = data.agents.find(a => a.name === selAgent.name)
    if (existing) {
      // Extend existing agent to selCol if it ends before
      onChange({ ...data, agents: data.agents.map(a => a.name === selAgent.name ? { ...a, endCol: Math.max(a.endCol, selCol + EXTEND) } : a) })
    } else {
      onChange({ ...data, agents: [...data.agents, { name: selAgent.name, color: selAgent.color, startCol: selCol, endCol: selCol + EXTEND }] })
    }
    closeAdd()
  }

  function openVitals(colIdx: number, key: keyof VitalsEntry) {
    if (!showActions) return
    setVModal({ colIdx, key })
    setVVal(String(data.vitals[colIdx]?.[key] ?? ""))
  }

  function confirmVitals() {
    if (!vModal) return
    const num = parseFloat(vVal)
    const newVitals = [...data.vitals]
    while (newVitals.length <= vModal.colIdx) newVitals.push({})
    newVitals[vModal.colIdx] = { ...newVitals[vModal.colIdx], [vModal.key]: isNaN(num) ? undefined : num }
    onChange({ ...data, vitals: newVitals })
    setVModal(null)
  }

  function extendBar(type: "infusion"|"fluid"|"agent"|"gas", id: string) {
    if (type === "gas") return
    if (type === "infusion") {
      onChange({ ...data, infusions: data.infusions.map(inf => inf.id === id ? { ...inf, endCol: inf.endCol + EXTEND } : inf) })
    } else if (type === "fluid") {
      onChange({ ...data, fluids: data.fluids.map(f => f.id === id ? { ...f, endCol: f.endCol + EXTEND } : f) })
    } else {
      onChange({ ...data, agents: data.agents.map(a => a.name === id ? { ...a, endCol: a.endCol + EXTEND } : a) })
    }
  }

  function deleteBar(type: "infusion"|"fluid"|"agent"|"gas", id: string) {
    if (type === "gas") return
    if (type === "infusion") {
      onChange({ ...data, infusions: data.infusions.filter(inf => inf.id !== id) })
    } else if (type === "fluid") {
      onChange({ ...data, fluids: data.fluids.filter(f => f.id !== id) })
    } else {
      onChange({ ...data, agents: data.agents.filter(a => a.name !== id) })
    }
    setBarOpts(false); setSelBar(null)
  }

  function tapBar(type: "infusion"|"fluid"|"agent"|"gas", id: string, col?: number) {
    if (type === "gas") return
    if (type === "infusion" && col !== undefined) onInfusionBarTap?.(id, col)
    setSelBar({ type, id }); setBarOpts(true)
  }

  function gasSegmentAt(col: number): GasSettingsSegment | null {
    return (data.gasSettings ?? []).find(g => col >= g.startCol && col <= g.endCol) ?? null
  }

  // ── Grid rendering helpers ────────────────────────────────────────────────

  const CELL_H = 36
  const DRUGS_MIN_H = 44

  function LabelCell({ label, color }: { label: string; color?: string }) {
    return (
      <View style={{ width: LABEL_W, justifyContent:"center", paddingLeft:6, borderRightWidth:1, borderRightColor:"#2e2e2e" }}>
        <Text style={{ color: color ?? "#64748b", fontSize:10, fontWeight:"600" }} numberOfLines={1}>{label}</Text>
      </View>
    )
  }

  // Render a single bar row (infusion / fluid / agent) using cell-based coloring
  function BarRow({ label, labelColor, id, startCol, endCol: barEndCol, barColor, rate, name, type, rateChanges }: {
    label: string; labelColor: string; id: string
    startCol: number; endCol: number; barColor: string
    rate?: string; name?: string
    type: "infusion"|"fluid"|"agent"|"gas"
    rateChanges?: { col: number; rate: string; unit: string }[]
  }) {
    const isSelected = selBar?.id === id && selBar?.type === type
    const sortedRateChanges = rateChanges ? [...rateChanges].sort((a, b) => a.col - b.col) : []
    return (
      <View style={{ flexDirection:"row", height: CELL_H, borderBottomWidth:1, borderBottomColor:"#2e2e2e" }}>
        <LabelCell label={label} color={labelColor} />
        {cols.map(col => {
          const inRange  = col >= startCol && col <= barEndCol
          const isFirst  = col === startCol
          const isLast   = col === barEndCol
          const isPastEnd = endCol !== null && col > endCol
          const bg = inRange
            ? (isPastEnd ? barColor + (isSelected ? "55" : "22") : barColor + (isSelected ? "ee" : "55"))
            : isPastEnd ? "rgba(0,0,0,0.25)" : "transparent"
          // Determine the current rate segment label for this column
          const prevChange = sortedRateChanges.filter(rc => rc.col <= col).pop()
          const activeRate = prevChange ? `${prevChange.rate} ${prevChange.unit}` : rate
          const isRateSegStart = inRange && (
            col === startCol ||
            sortedRateChanges.some(rc => rc.col === col)
          )
          return (
            <TouchableOpacity
              key={col}
              onPress={() => inRange && type !== "gas" ? tapBar(type, id, col) : undefined}
              style={{ width: COL_W, height: CELL_H, backgroundColor: bg, justifyContent:"center", alignItems:"center",
                borderTopLeftRadius: isFirst ? 6 : 0, borderBottomLeftRadius: isFirst ? 6 : 0,
                borderTopRightRadius: isLast ? 6 : 0, borderBottomRightRadius: isLast ? 6 : 0,
                borderLeftWidth: inRange && sortedRateChanges.some(rc => rc.col === col) ? 2 : 0,
                borderLeftColor: barColor,
              }}
            >
              {isRateSegStart && (
                <Text style={{ color: barColor, fontSize: 9, fontWeight:"700" }} numberOfLines={1}>
                  {activeRate ?? name ?? label}
                </Text>
              )}
              {type !== "gas" && isLast && !isFirst && !isRateSegStart && (
                <TouchableOpacity onPress={() => extendBar(type, id)} hitSlop={{ top:6, bottom:6, left:6, right:6 }}>
                  <Text style={{ color: barColor, fontSize: 12, fontWeight:"800" }}>+</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )
        })}
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ borderRadius:12, overflow:"hidden", borderWidth:1, borderColor:"#2e2e2e", backgroundColor:"#111111" }}>

      {/* ── Chart toggle ──────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={() => setChartVisible(v => !v)}
        style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center",
          paddingHorizontal:12, paddingVertical:6, borderBottomWidth:1, borderBottomColor:"#2e2e2e",
          backgroundColor:"#0a0f1a" }}
      >
        <Text style={{ color:"#64748b", fontSize:10, fontWeight:"600", letterSpacing:1, textTransform:"uppercase" }}>Vitals Chart</Text>
        <Text style={{ color:"#475569", fontSize:12 }}>{chartVisible ? "^" : "v"}</Text>
      </TouchableOpacity>

      {/* Horizontal scrollable grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>

          {/* ── Vitals chart ────────────────────────────────────────── */}
          {chartVisible && (
            <VitalsChart vitals={data.vitals} cols={cols} />
          )}

          {/* ── Time header ─────────────────────────────────────── */}
          <View style={{ flexDirection:"row", height:30, backgroundColor:"#0f172a", borderBottomWidth:1, borderBottomColor:"#2e2e2e" }}>
            <LabelCell label="Time" />
            {cols.map(col => {
              const isLabel = col % 3 === 0
              const isSelected = col === selCol
              return (
                <TouchableOpacity
                  key={col}
                  onPress={() => { if (showActions) { setSelCol(col); openAdd("drug", col) } }}
                  style={{ width: COL_W, height:30, justifyContent:"center", alignItems:"center",
                    backgroundColor: isSelected ? "#1e3a5f" : "transparent",
                    borderRightWidth: col % 3 === 2 ? 1 : 0, borderRightColor:"#2e2e2e",
                    position:"relative",
                  }}
                >
                  <Text style={{ color: isSelected ? "#93c5fd" : "#475569", fontSize: isLabel ? 9 : 7 }}>
                    {isLabel ? colToTime(startTime, col) : "-"}
                  </Text>
                  {col === endCol && (
                    <View style={{ position:"absolute", right:0, top:0, bottom:0, width:2, backgroundColor:"#22c55e", zIndex:10 }} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          {/* ── Vitals rows ──────────────────────────────────────── */}
          {VITAL_DEFS.map(vd => (
            <View key={vd.key} style={{ flexDirection:"row", height: CELL_H, borderBottomWidth:1, borderBottomColor:"#1e2530" }}>
              <LabelCell label={vd.label} color={vd.color} />
              {cols.map(col => {
                const val = data.vitals[col]?.[vd.key]
                const isSelected = col === selCol
                const isPastEnd = endCol !== null && col > endCol
                return (
                  <TouchableOpacity
                    key={col}
                    onPress={() => openVitals(col, vd.key)}
                    style={{ width: COL_W, height: CELL_H, justifyContent:"center", alignItems:"center",
                      backgroundColor: isPastEnd ? "rgba(0,0,0,0.25)" : isSelected ? "#1e3a5f22" : "transparent",
                      borderRightWidth: col % 3 === 2 ? 1 : 0, borderRightColor:"#1e2530",
                    }}
                  >
                    <Text style={{ color: val != null ? vd.color : "#334155", fontSize: val != null ? 11 : 9, fontWeight: val != null ? "600" : "400" }}>
                      {val != null ? String(val) : "-"}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}

          {/* ── Drugs row ────────────────────────────────────────── */}
          <View style={{ flexDirection:"row", minHeight: DRUGS_MIN_H, borderBottomWidth:1, borderBottomColor:"#2e2e2e", borderTopWidth:1, borderTopColor:"#2e2e2e", backgroundColor:"#0a0a0a" }}>
            <View style={{ width: LABEL_W, justifyContent:"flex-start", paddingTop:6, paddingLeft:6, borderRightWidth:1, borderRightColor:"#2e2e2e" }}>
              <Text style={{ color:"#64748b", fontSize:10, fontWeight:"600" }}>Drugs</Text>
            </View>
            {cols.map(col => {
              const drugs = data.drugs.filter(d => d.colIdx === col)
              const isSelected = col === selCol
              return (
                <View
                  key={col}
                  style={{ width: COL_W, minHeight: DRUGS_MIN_H, paddingTop:4, paddingBottom:4, paddingHorizontal:2,
                    backgroundColor: isSelected ? "#1e3a5f22" : "transparent",
                    borderRightWidth: col % 3 === 2 ? 1 : 0, borderRightColor:"#2e2e2e",
                  }}
                >
                  {drugs.map((d, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => deleteDrug(d.colIdx, d.name, d.dose)}
                      style={{ backgroundColor: drugColor(d.name) + "33", borderRadius:4, paddingHorizontal:2, paddingVertical:2, marginBottom:2, borderWidth:1, borderColor: drugColor(d.name) + "66" }}
                    >
                      <Text style={{ color: drugColor(d.name), fontSize:8, fontWeight:"700" }} numberOfLines={1}>
                        {d.name.slice(0,8)}
                      </Text>
                      <Text style={{ color: "#cbd5e1", fontSize:7 }}>{d.dose}{d.unit}</Text>
                    </TouchableOpacity>
                  ))}
                  {showActions && (
                    <TouchableOpacity
                      onPress={() => { setSelCol(col); openAdd("drug", col) }}
                      style={{ flex:1, justifyContent:"center", alignItems:"center", minHeight:16 }}
                    >
                      <Text style={{ color: drugs.length === 0 ? "#1e2d40" : "#0f1f33", fontSize:14 }}>+</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </View>

          {/* ── Agent bars ───────────────────────────────────────── */}
          {(showAgents || data.agents.length > 0) && data.agents.map(a => (
            <BarRow key={a.name} label={tc("trRowAgent")} labelColor="#a78bfa"
              id={a.name} type="agent" startCol={a.startCol} endCol={a.endCol}
              barColor={a.color ?? "#a78bfa"} name={agentLabel(a.name)}
            />
          ))}

          {/* ── Infusion bars ─────────────────────────────────────── */}
          {(showAgents || (data.gasSettings ?? []).length > 0) && (
            <View style={{ flexDirection:"row", height: CELL_H, borderBottomWidth:1, borderBottomColor:"#2e2e2e" }}>
              <LabelCell label="Gas" color="#818cf8" />
              {cols.map(col => {
                const seg = gasSegmentAt(col)
                const isStart = seg?.startCol === col
                const isEnd = !!seg && seg.endCol === col
                const settings = seg ? gasSettingsAtColumn(seg, col) : null
                const isLabel = !!settings && (isStart || settings.changeCol === col)
                const isPastEnd = endCol !== null && col > endCol
                return (
                  <TouchableOpacity
                    key={col}
                    onPress={() => onGasCellTap?.(col, seg)}
                    style={{
                      width: COL_W,
                      height: CELL_H,
                      justifyContent:"center",
                      alignItems:"center",
                      backgroundColor: seg
                        ? isPastEnd ? "#818cf822" : "#818cf855"
                        : isPastEnd ? "rgba(0,0,0,0.25)" : "transparent",
                      borderRightWidth: col % 3 === 2 ? 1 : 0,
                      borderRightColor:"#2e2e2e",
                      borderLeftWidth: settings?.changeCol === col ? 2 : 0,
                      borderLeftColor:"#818cf8",
                    }}
                  >
                    {seg && isLabel ? (
                      <Text style={{ color:"#c4b5fd", fontSize:8, fontWeight:"700" }} numberOfLines={1}>
                        FGF {settings.fgf} · {displayGasMix(settings, language)}
                      </Text>
                    ) : !seg ? (
                      <Text style={{ color:"#1e2d40", fontSize:12 }}>+</Text>
                    ) : null}
                    {seg && isEnd && !seg.stopped && onGasStop ? (
                      <TouchableOpacity
                        onPress={(event) => { event.stopPropagation?.(); onGasStop(seg) }}
                        hitSlop={{ top:6, bottom:6, left:6, right:6 }}
                        style={{ position:"absolute", right:2, top:2, borderRadius:6, backgroundColor:"#1e1010", paddingHorizontal:3, paddingVertical:1 }}
                      >
                        <Text style={{ color:"#ef4444", fontSize:8, fontWeight:"800" }}>Stop</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}


          {data.infusions.map(inf => (
            <BarRow key={inf.id} label={infusionLabel(inf.name)} labelColor={inf.color}
              id={inf.id} type="infusion" startCol={inf.startCol} endCol={inf.endCol}
              barColor={inf.color ?? "#3b82f6"} rate={`${inf.rate} ${inf.unit}`}
              rateChanges={inf.rateChanges?.map(change => ({ ...change, rate: String(change.rate) }))}
            />
          ))}

          {/* ── Fluid bars - lane-packed by category for parallel display ── */}
          {computeFluidRows(data.fluids).map(row => (
            row.segs.map(fl => (
              <BarRow key={fl.id} label={fluidLaneLabel(row.label)} labelColor={row.color}
                id={fl.id} type="fluid" startCol={fl.startCol} endCol={fl.endCol}
                barColor={fl.color} rate={`${fl.volume}mL`}
              />
            ))
          ))}

        </View>
      </ScrollView>

      {/* ── Action bar ─────────────────────────────────────────────── */}
      {showActions && <View style={{ flexDirection:"row", padding:10, gap:8, flexWrap:"wrap", borderTopWidth:1, borderTopColor:"#2e2e2e" }}>
        {(["drug","infusion","fluid","agent"] satisfies AddTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => openAdd(tab)}
            style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:"#1c1c1c", borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:"#2e2e2e" }}
          >
            <Text style={{ color:"#94a3b8", fontSize:12 }}>
              + {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => onColCountChange(colCount + 12)}
          style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:"#1e3a5f", borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:"#3b82f6" }}
        >
          <Text style={{ color:"#93c5fd", fontSize:12 }}>+ 1 hour</Text>
        </TouchableOpacity>
      </View>}

      {/* ── Add modal ────────────────────────────────────────────────── */}
      <BottomSheet
        visible={addOpen}
        onClose={closeAdd}
        title={`Add at ${colToTime(startTime, selCol)}`}
      >
        {/* Tab row */}
        <View style={{ flexDirection:"row", gap:6, marginBottom:16 }}>
          {(["drug","infusion","fluid","agent"] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setAddTab(tab)}
              style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                backgroundColor: addTab === tab ? "#2563eb" : "#111111",
                borderWidth:1, borderColor: addTab === tab ? "#2563eb" : "#2e2e2e",
              }}
            >
              <Text style={{ color: addTab === tab ? "#fff" : "#64748b", fontSize:11, fontWeight:"600", textTransform:"capitalize" }}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* DRUG TAB */}
        {addTab === "drug" && (
          drugStep === "pick" && drugCat === null ? (
            /* Level 1: category landing */
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
              {drugCategories.map(cat => (
                <TouchableOpacity
                  key={cat.cat}
                  onPress={() => setDrugCat(cat.cat)}
                  style={{ flex:1, minWidth:"45%", paddingVertical:14, borderRadius:12, alignItems:"center",
                    backgroundColor: cat.color + "22", borderWidth:1, borderColor: cat.color + "55" }}
                >
                  <Text style={{ color: cat.color, fontSize:13, fontWeight:"700" }}>{groupLabel(cat.cat)}</Text>
                  <Text style={{ color:"#475569", fontSize:10, marginTop:2 }}>{cat.drugs.length} drugs</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : drugStep === "pick" ? (
            /* Level 2: drugs within selected category */
            <View>
              <TouchableOpacity onPress={() => setDrugCat(null)} style={{ marginBottom:12 }}>
                <Text style={{ color:"#64748b", fontSize:14 }}>← Back</Text>
              </TouchableOpacity>
              <ScrollView style={{ maxHeight:260 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6 }}>
                  {(drugCategories.find(c => c.cat === drugCat)?.drugs ?? []).map(d => {
                    const suggested = calcSuggestedDose(d.name)
                    const catColor = drugCategories.find(c => c.cat === drugCat)?.color ?? "#64748b"
                    return (
                      <TouchableOpacity
                        key={d.name}
                        onPress={() => { setPickedDrug(d); setDrugDose(suggested.dose); setDrugHint(suggested.hint); setDrugStep("dose") }}
                        style={{ backgroundColor: catColor + "22", borderRadius:8, paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor: catColor + "55" }}
                      >
                        <Text style={{ color: catColor, fontSize:12, fontWeight:"600" }}>{drugLabel(d.name)}</Text>
                        <Text style={{ color:"#64748b", fontSize:10 }}>{suggested.dose ? `~${suggested.dose} ${d.unit}` : d.unit}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>
            </View>
          ) : (
            /* Level 3: dose entry */
            <View>
              <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:16 }}>
                <TouchableOpacity onPress={() => setDrugStep("pick")}>
                  <Text style={{ color:"#64748b", fontSize:14 }}>← Back</Text>
                </TouchableOpacity>
                <Text style={{ color: drugColor(pickedDrug?.name ?? ""), fontSize:16, fontWeight:"700" }}>{pickedDrug ? drugLabel(pickedDrug.name) : ""}</Text>
              </View>
              <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:6 }}>Dose ({pickedDrug?.unit})</Text>
              <TextInput
                style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12, fontSize:18, borderWidth:1, borderColor:"#2e2e2e", marginBottom: drugHint ? 6 : 16 }}
                placeholder={`Enter dose in ${pickedDrug?.unit}`}
                placeholderTextColor="#334155"
                keyboardType="decimal-pad"
                value={drugDose}
                onChangeText={setDrugDose}
                autoFocus
              />
              {!!drugHint && (
                <Text style={{ color:"#475569", fontSize:11, marginBottom:14, textAlign:"right" }}>{drugHint}</Text>
              )}
              <TouchableOpacity
                onPress={confirmDrug}
                disabled={!drugDose}
                style={{ backgroundColor: drugDose ? "#2563eb" : "#1e2d40", borderRadius:10, padding:14, alignItems:"center" }}
              >
                <Text style={{ color:"#fff", fontWeight:"700" }}>Add {pickedDrug ? drugLabel(pickedDrug.name) : ""} {drugDose}{pickedDrug?.unit}</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* INFUSION TAB */}
        {addTab === "infusion" && (
          <View>
            <Text style={{ color:"#64748b", fontSize:11, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Select drug</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:14 }}>
              <View style={{ flexDirection:"row", gap:8 }}>
                {infusionChoices.map(d => (
                  <TouchableOpacity
                    key={d.name}
                    onPress={() => { setSelInfDrug(d); setInfUnit(d.unit) }}
                    style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10, backgroundColor: selInfDrug?.name === d.name ? d.color : d.color + "22", borderWidth:1, borderColor: d.color + "66" }}
                  >
                    <Text style={{ color: selInfDrug?.name === d.name ? "#fff" : d.color, fontSize:12, fontWeight:"600" }}>{infusionLabel(d.name)}</Text>
                    <Text style={{ color:"#94a3b8", fontSize:9 }}>{d.unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {selInfDrug && (
              <>
                <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:6 }}>Rate ({selInfDrug.unit})</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12, fontSize:18, borderWidth:1, borderColor:"#2e2e2e", marginBottom:14 }}
                  placeholder="e.g. 0.1"
                  placeholderTextColor="#334155"
                  keyboardType="decimal-pad"
                  value={infRate}
                  onChangeText={setInfRate}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={confirmInfusion}
                  disabled={!infRate}
                  style={{ backgroundColor: infRate ? selInfDrug.color : "#1e2d40", borderRadius:10, padding:14, alignItems:"center" }}
                >
                  <Text style={{ color:"#fff", fontWeight:"700" }}>Start {infusionLabel(selInfDrug.name)} {infRate} {selInfDrug.unit}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* FLUID TAB */}
        {addTab === "fluid" && (
          <View>
            <ScrollView style={{ maxHeight:200 }} showsVerticalScrollIndicator={false}>
              {fluidCategories.map(cat => (
                <View key={cat} style={{ marginBottom:10 }}>
                  <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{groupLabel(cat)}</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6 }}>
                    {fluidChoices.filter(f => f.cat === cat).map(f => (
                      <TouchableOpacity
                        key={f.name}
                        onPress={() => setSelFluid(f)}
                        style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, backgroundColor: selFluid?.name === f.name ? f.color : f.color + "22", borderWidth:1, borderColor: f.color + "55" }}
                      >
                        <Text style={{ color: selFluid?.name === f.name ? "#fff" : f.color, fontSize:12, fontWeight:"600" }}>{fluidLabel(f.name)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            {selFluid && (
              <View style={{ marginTop:12 }}>
                <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:6 }}>Volume (mL)</Text>
                <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
                  {["250","500","1000"].map(v => (
                    <TouchableOpacity key={v} onPress={() => setFluidVol(v)}
                      style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center", backgroundColor: fluidVol === v ? selFluid.color : selFluid.color + "22", borderWidth:1, borderColor: selFluid.color + "55" }}>
                      <Text style={{ color: fluidVol === v ? "#fff" : selFluid.color, fontSize:12, fontWeight:"600" }}>{v} mL</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={{ flex:1, backgroundColor:"#111111", color:"#fff", borderRadius:8, paddingVertical:8, paddingHorizontal:8, fontSize:12, borderWidth:1, borderColor:"#2e2e2e", textAlign:"center" }}
                    placeholder="Other"
                    placeholderTextColor="#334155"
                    keyboardType="numeric"
                    value={["250","500","1000"].includes(fluidVol) ? "" : fluidVol}
                    onChangeText={setFluidVol}
                  />
                </View>
                <TouchableOpacity
                  onPress={confirmFluid}
                  style={{ backgroundColor: selFluid.color, borderRadius:10, padding:14, alignItems:"center" }}
                >
                  <Text style={{ color:"#fff", fontWeight:"700" }}>Add {fluidLabel(selFluid.name)} {fluidVol} mL</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* AGENT TAB */}
        {addTab === "agent" && (
          <View>
            <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:12 }}>Select volatile agent</Text>
            <View style={{ flexDirection:"row", gap:10, marginBottom:16 }}>
              {agentChoices.map(a => (
                <TouchableOpacity
                  key={a.name}
                  onPress={() => setSelAgent(a)}
                  style={{ flex:1, paddingVertical:14, borderRadius:12, alignItems:"center",
                    backgroundColor: selAgent?.name === a.name ? a.color : a.color + "22",
                    borderWidth:2, borderColor: a.color,
                  }}
                >
                  <Text style={{ color: selAgent?.name === a.name ? "#fff" : a.color, fontSize:13, fontWeight:"700" }}>{agentLabel(a.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selAgent && (
              <TouchableOpacity
                onPress={confirmAgent}
                style={{ backgroundColor: selAgent.color, borderRadius:10, padding:14, alignItems:"center" }}
              >
                <Text style={{ color:"#fff", fontWeight:"700" }}>Add {agentLabel(selAgent.name)} from {colToTime(startTime, selCol)}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>

      {/* ── Vitals edit modal ─────────────────────────────────────────── */}
      <BottomSheet
        visible={!!vModal}
        onClose={() => setVModal(null)}
        title={`${VITAL_DEFS.find(v => v.key === vModal?.key)?.label} at ${vModal ? colToTime(startTime, vModal.colIdx) : ""}`}
      >
        <TextInput
          style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:14, fontSize:22, fontWeight:"600", borderWidth:1, borderColor:"#2e2e2e", marginBottom:16, textAlign:"center" }}
          placeholder="Enter value"
          placeholderTextColor="#334155"
          keyboardType="decimal-pad"
          value={vVal}
          onChangeText={setVVal}
          autoFocus
        />
        <View style={{ flexDirection:"row", gap:8 }}>
          <TouchableOpacity
            onPress={() => { onChange({ ...data, vitals: data.vitals.map((v,i) => i === vModal?.colIdx ? { ...v, [vModal.key]: undefined } : v) }); setVModal(null) }}
            style={{ flex:1, backgroundColor:"#1c1c1c", borderRadius:10, padding:14, alignItems:"center", borderWidth:1, borderColor:"#2e2e2e" }}
          >
            <Text style={{ color:"#64748b", fontWeight:"600" }}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmVitals}
            style={{ flex:2, backgroundColor:"#2563eb", borderRadius:10, padding:14, alignItems:"center" }}
          >
            <Text style={{ color:"#fff", fontWeight:"700" }}>Save</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Bar options modal ─────────────────────────────────────────── */}
      <BottomSheet
        visible={barOpts && !!selBar}
        onClose={() => { setBarOpts(false); setSelBar(null) }}
        title="Bar options"
      >
        {selBar && (
          <View style={{ gap:10 }}>
            <TouchableOpacity
              onPress={() => { extendBar(selBar.type, selBar.id); setBarOpts(false); setSelBar(null) }}
              style={{ backgroundColor:"#1e3a5f", borderRadius:10, padding:14, alignItems:"center", borderWidth:1, borderColor:"#3b82f6" }}
            >
              <Text style={{ color:"#93c5fd", fontWeight:"700" }}>Extend +30 min</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => deleteBar(selBar.type, selBar.id)}
              style={{ backgroundColor:"#1e1414", borderRadius:10, padding:14, alignItems:"center", borderWidth:1, borderColor:"#7f1d1d" }}
            >
              <Text style={{ color:"#ef4444", fontWeight:"700" }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>

    </View>
  )
}
