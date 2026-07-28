export { VENT_ASSISTED, VENT_CONTROLLED, expandedVentilationPanelForModes, type VentilationPanel } from "@lospor/core/ventilation"
import {
  AIRWAY_DEVICES_WITH_SUBOPTIONS,
  CORMACK_LEHANE_GRADES,
} from "@lospor/core/intraop"

const CL_GRADE_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"]
export const CL_GRADES = CORMACK_LEHANE_GRADES.map((code, index) => ({
  code,
  color: CL_GRADE_COLORS[index],
}))

export const AIRWAY_HAS_SUBOPTIONS: readonly string[] = AIRWAY_DEVICES_WITH_SUBOPTIONS
