import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { IntraopTimetable, type TimetableData } from "@/components/IntraopTimetable"
import type { ActiveInfusion } from "@/lib/intraop-log-event"
import {
  INTRAOP_COLUMN_MINUTES,
  intraopInstantForColumn,
} from "@lospor/core/intraop-engine"

type Props = {
  startTime: Date | null
  totalColumns: number
  page: number
  timetable: TimetableData
  endTime?: string
  patientWeightKg?: number
  patientHeightCm?: number
  patientSex?: string
  resumeCase?: () => void
  activeInfusions: ActiveInfusion[]
  onPageChange: (updater: (page: number) => number) => void
  onColumnCountChange: (columns: number) => void
  onTimetableChange: (data: TimetableData) => void
  onSetEntryTs: (value: string | null) => void
  onManageInfusion: (infusion: ActiveInfusion) => void
}

const PAGE_COLS = 12

function timeAtCol(base: Date, col: number) {
  return intraopInstantForColumn(base, col)
}

export function IntraopChartTab({
  startTime,
  totalColumns,
  page,
  timetable,
  endTime,
  patientWeightKg,
  patientHeightCm,
  patientSex,
  resumeCase,
  activeInfusions,
  onPageChange,
  onColumnCountChange,
  onTimetableChange,
  onSetEntryTs,
  onManageInfusion,
}: Props) {
  const totalPages = Math.ceil(totalColumns / PAGE_COLS)
  const safePage = Math.min(page, totalPages - 1)
  const offset = safePage * PAGE_COLS
  function pageLabel() {
    const h0 = (startTime ? startTime.getHours() * 60 + startTime.getMinutes() : 480)
      + offset * INTRAOP_COLUMN_MINUTES
    const h1 = h0 + PAGE_COLS * INTRAOP_COLUMN_MINUTES
    const fmt = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`
    return `${fmt(h0)}-${fmt(h1)}`
  }

  return (
    <View style={{ flex:1 }}>
      <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
        paddingHorizontal:14, paddingVertical:8, backgroundColor:"#0a0f1a",
        borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
        <TouchableOpacity onPress={() => onPageChange(p => Math.max(0, p-1))}
          disabled={safePage === 0} style={{ padding:8 }}>
          <Text style={{ color: safePage===0 ? "#1e2d40" : "#94a3b8", fontSize:18 }}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"600" }}>
          Hour {safePage+1}  {pageLabel()}
        </Text>
        <TouchableOpacity onPress={() => {
            if (safePage < totalPages - 1) onPageChange(p => p+1)
            else { onColumnCountChange(totalColumns + PAGE_COLS); onPageChange(() => totalPages) }
          }} style={{ padding:8 }}>
          <Text style={{ color:"#94a3b8", fontSize:18 }}>{">"}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection:"row", justifyContent:"flex-end",
        paddingHorizontal:14, paddingVertical:6, backgroundColor:"#0a0f1a" }}>
        <TouchableOpacity onPress={() => onPageChange(() => totalPages - 1)}
          style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:6,
            backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644" }}>
          <Text style={{ color:"#93c5fd", fontSize:11 }}>Jump to now</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:12 }}>
        <IntraopTimetable
          startTime={startTime
            ? `${String(startTime.getHours()).padStart(2,"0")}:${String(startTime.getMinutes()).padStart(2,"0")}`
            : "08:00"}
          colCount={PAGE_COLS}
          colOffset={offset}
          onColCountChange={n => onColumnCountChange(offset + n)}
          data={timetable}
          onChange={onTimetableChange}
          showActions={false}
          endTime={endTime}
          patientWeightKg={patientWeightKg}
          patientHeightCm={patientHeightCm}
          patientSex={patientSex}
          onResumeCase={resumeCase}
          onInfusionBarTap={(infId, col) => {
            const base = startTime ?? new Date()
            const ts = timeAtCol(base, col).toISOString()
            onSetEntryTs(ts)
            const activeInf = activeInfusions.find(x => x.infId === infId)
            if (activeInf) onManageInfusion(activeInf)
          }}
        />
      </ScrollView>
    </View>
  )
}
