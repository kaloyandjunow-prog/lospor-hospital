export type Template = {
  id: string; labelKey: string; descKey: string
  techniques: string[]
  monitoring: Partial<Record<string, boolean>>
  airwayDevices: string[]
  airwayTools?: string[]
}

export const TEMPLATES: Template[] = [
  {
    id: "std-ga",
    labelKey: "intraop.timeline.templates.standardGaLabel",
    descKey: "intraop.timeline.templates.standardGaDesc",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
    airwayDevices: ["ORAL_ETT"],
  },
  {
    id: "tiva",
    labelKey: "intraop.timeline.templates.tivaLabel",
    descKey: "intraop.timeline.templates.tivaDesc",
    techniques: ["GENERAL_TIVA"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true, bis: true },
    airwayDevices: ["ORAL_ETT"],
  },
  {
    id: "spinal-cs",
    labelKey: "intraop.timeline.templates.spinalLabel",
    descKey: "intraop.timeline.templates.spinalDesc",
    techniques: ["SPINAL_SINGLE"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true },
    airwayDevices: ["FACE_MASK"],
  },
  {
    id: "paed-inhal",
    labelKey: "intraop.timeline.templates.pediatricLabel",
    descKey: "intraop.timeline.templates.pediatricDesc",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true },
    airwayDevices: ["FACE_MASK"],
  },
  {
    id: "awake-foi",
    labelKey: "intraop.timeline.templates.awakeFoiLabel",
    descKey: "intraop.timeline.templates.awakeFoiDesc",
    techniques: ["GENERAL_INHALATION"],
    monitoring: { ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true },
    airwayDevices: ["ORAL_ETT"],
    airwayTools: ["FOB", "AWAKE"],
  },
]
