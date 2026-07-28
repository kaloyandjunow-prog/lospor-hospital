import { useCallback, useEffect, useRef, useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import { buildAirwaySectionPatch, isAirwayDeviceComplete, syncAirwayDeviceSelection } from "@/lib/intraop-airway-section"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

export function useIntraopAirwaySection(
  caseLoaded: boolean,
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const [awTools, setAwTools] = useState<string[]>([])
  const [awDevices, setAwDevices] = useState<string[]>([])
  const [awLmaSize, setAwLmaSize] = useState<string | null>(null)
  const [awOralTubeSize, setAwOralTubeSize] = useState<string | null>(null)
  const [awOralCuffed, setAwOralCuffed] = useState<boolean | null>(null)
  const [awNasalTubeSize, setAwNasalTubeSize] = useState<string | null>(null)
  const [awNasalCuffed, setAwNasalCuffed] = useState<boolean | null>(null)
  const [awDltType, setAwDltType] = useState<"Carlens" | "Robertshaw" | null>(null)
  const [awDltSide, setAwDltSide] = useState<"Left" | "Right" | null>(null)
  const [awDltSize, setAwDltSize] = useState<number | null>(null)
  const [awEbSize, setAwEbSize] = useState<number | null>(null)
  const [awExpandedDevice, setAwExpandedDevice] = useState<string | null>(null)
  const awExpandedWasComplete = useRef(false)
  const [awClGrade, setAwClGrade] = useState("")
  const [awVentModes, setAwVentModes] = useState<string[]>([])
  const [awVentExpanded, setAwVentExpanded] = useState<"assisted" | "controlled" | null>(null)
  const [awNotes, setAwNotes] = useState("")
  const [airwaySectionSaving, setAirwaySectionSaving] = useState(false)
  const airwaySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const awInitializedRef = useRef(false)

  const saveAirwaySection = useCallback(async () => {
    setAirwaySectionSaving(true)
    try {
      await patchIntraopSection(buildAirwaySectionPatch({
        awTools,
        awDevices,
        awLmaSize,
        awOralTubeSize,
        awOralCuffed,
        awNasalTubeSize,
        awNasalCuffed,
        awDltType,
        awDltSide,
        awDltSize,
        awEbSize,
        awClGrade,
        awVentModes,
        awNotes,
      }))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      notify(errorLabel, "Could not save airway data.")
    } finally {
      setAirwaySectionSaving(false)
    }
  }, [
    awClGrade,
    awDevices,
    awDltSide,
    awDltSize,
    awDltType,
    awEbSize,
    awLmaSize,
    awNasalCuffed,
    awNasalTubeSize,
    awNotes,
    awOralCuffed,
    awOralTubeSize,
    awTools,
    awVentModes,
    errorLabel,
    patchIntraopSection,
  ])

  useEffect(() => {
    if (!caseLoaded) return
    if (!awInitializedRef.current) {
      awInitializedRef.current = true
      return
    }
    if (airwaySaveTimerRef.current) clearTimeout(airwaySaveTimerRef.current)
    airwaySaveTimerRef.current = setTimeout(() => { void saveAirwaySection() }, 600)
    return () => { if (airwaySaveTimerRef.current) clearTimeout(airwaySaveTimerRef.current) }
  }, [caseLoaded, saveAirwaySection])

  useEffect(() => {
    if (!awExpandedDevice) return
    const complete = isAirwayDeviceComplete(awExpandedDevice, {
      awLmaSize,
      awOralTubeSize,
      awOralCuffed,
      awNasalTubeSize,
      awNasalCuffed,
      awDltType,
      awDltSide,
      awDltSize,
      awEbSize,
    })
    setAwDevices(prev => syncAirwayDeviceSelection(prev, awExpandedDevice, complete))
    if (complete && !awExpandedWasComplete.current) setAwExpandedDevice(null)
  }, [awLmaSize, awOralTubeSize, awOralCuffed, awNasalTubeSize, awNasalCuffed, awDltType, awDltSide, awDltSize, awEbSize, awExpandedDevice])

  return {
    awTools,
    setAwTools,
    awDevices,
    setAwDevices,
    awLmaSize,
    setAwLmaSize,
    awOralTubeSize,
    setAwOralTubeSize,
    awOralCuffed,
    setAwOralCuffed,
    awNasalTubeSize,
    setAwNasalTubeSize,
    awNasalCuffed,
    setAwNasalCuffed,
    awDltType,
    setAwDltType,
    awDltSide,
    setAwDltSide,
    awDltSize,
    setAwDltSize,
    awEbSize,
    setAwEbSize,
    awExpandedDevice,
    setAwExpandedDevice,
    awExpandedWasComplete,
    awClGrade,
    setAwClGrade,
    awVentModes,
    setAwVentModes,
    awVentExpanded,
    setAwVentExpanded,
    awNotes,
    setAwNotes,
    airwaySectionSaving,
    saveAirwaySection,
  }
}
