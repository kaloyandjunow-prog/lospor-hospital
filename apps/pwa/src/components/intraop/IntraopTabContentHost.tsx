import type { ComponentProps, ReactNode } from "react"

import { AirwayTab } from "@/components/intraop/tabs/AirwayTab"
import { EquipmentTab } from "@/components/intraop/tabs/EquipmentTab"
import { MonitoringTab } from "@/components/intraop/tabs/MonitoringTab"
import { PositionTab } from "@/components/intraop/tabs/PositionTab"
import { PremedicationTab } from "@/components/intraop/tabs/PremedicationTab"
import { TechniqueTab } from "@/components/intraop/tabs/TechniqueTab"
import { TimingTab } from "@/components/intraop/tabs/TimingTab"
import { IntraopChartTab } from "@/components/intraop/IntraopChartTab"
import { IntraopEventsTab } from "@/components/intraop/IntraopEventsTab"
import { IntraopTimetableTab } from "@/components/intraop/IntraopTimetableTab"
import type { IntraopTab } from "@/lib/intraop-tabs"

export type IntraopTabContentHostProps = {
  tab: IntraopTab
  log: ComponentProps<typeof IntraopTimetableTab>
  equipment: ComponentProps<typeof EquipmentTab>
  technique: ComponentProps<typeof TechniqueTab>
  timing: ComponentProps<typeof TimingTab>
  position: ComponentProps<typeof PositionTab>
  monitoring: ComponentProps<typeof MonitoringTab>
  airway: ComponentProps<typeof AirwayTab>
  vascular: ReactNode
  premedication: ComponentProps<typeof PremedicationTab>
  events: ComponentProps<typeof IntraopEventsTab>
  chart: ComponentProps<typeof IntraopChartTab>
}

export function IntraopTabContentHost({
  tab,
  log,
  equipment,
  technique,
  timing,
  position,
  monitoring,
  airway,
  vascular,
  premedication,
  events,
  chart,
}: IntraopTabContentHostProps) {
  if (tab === "log") return <IntraopTimetableTab {...log} />
  if (tab === "equipment") return <EquipmentTab {...equipment} />
  if (tab === "technique") return <TechniqueTab {...technique} />
  if (tab === "timing") return <TimingTab {...timing} />
  if (tab === "position") return <PositionTab {...position} />
  if (tab === "monitoring") return <MonitoringTab {...monitoring} />
  if (tab === "airway") return <AirwayTab {...airway} />
  if (tab === "vascular") return <>{vascular}</>
  if (tab === "premedication") return <PremedicationTab {...premedication} />
  if (tab === "events") return <IntraopEventsTab {...events} />
  if (tab === ("chart" as IntraopTab)) return <IntraopChartTab {...chart} />
  return null
}
