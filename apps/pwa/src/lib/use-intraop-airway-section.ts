import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import { buildAirwaySectionPatch, isAirwayDeviceComplete, syncAirwayDeviceSelection } from "@/lib/intraop-airway-section"
import { usePreferences } from "@/lib/preferences-context"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>
type AirwayDeviceConfirmed = (
  device: string,
  previousDevices: readonly string[],
  airwayPatch: Record<string, unknown>,
) => boolean | void
type AirwayDeviceRemoved = (device: string) => void | Promise<void>

export function useIntraopAirwaySection(
  caseLoaded: boolean,
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
  onAirwayDeviceConfirmed?: AirwayDeviceConfirmed,
  onAirwayDeviceRemoved?: AirwayDeviceRemoved,
) {
  const { tc } = usePreferences()
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
  // Why there is no airway device: arrived intubated, or no airway
  // intervention at all. Web held these in React state and never saved them.
  const [awPresentsIntubated, setAwPresentsIntubated] = useState(false)
  const [awNotApplicable, setAwNotApplicable] = useState(false)
  const [airwaySectionSaving, setAirwaySectionSaving] = useState(false)
  const airwaySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const airwayPatch = useMemo(() => buildAirwaySectionPatch({
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
    awPresentsIntubated,
    awNotApplicable,
  }), [
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
    awPresentsIntubated,
    awNotApplicable,
    awOralCuffed,
    awOralTubeSize,
    awTools,
    awVentModes,
  ])
  const airwayKey = JSON.stringify(airwayPatch)
  // The airway section as the server last had it (loaded or saved). The
  // autosave compares content against this, not callback identity: it used to
  // re-send all ~20 airway fields on every open of the intraop screen, because
  // a new `tc` or callback looked like an edit.
  const savedAirwayKeyRef = useRef<string | null>(null)
  const previousDevicesRef = useRef<string[] | null>(null)

  // Legacy airway devices predate the Smart picker, but they represent the
  // same clinical facts. Keep the last persisted list as the baseline. The
  // clinical event and this section patch are submitted together from
  // saveAirwaySection; firing an event from an effect made the two writes race
  // and left the PWA with a local retry / 409 conflict.
  useEffect(() => {
    if (!caseLoaded) {
      previousDevicesRef.current = null
      return
    }
    if (previousDevicesRef.current === null) previousDevicesRef.current = awDevices
  }, [awDevices, caseLoaded])

  const saveAirwaySection = useCallback(async () => {
    setAirwaySectionSaving(true)
    try {
      const previous = previousDevicesRef.current ?? []
      const added = awDevices.filter(device => !previous.includes(device))
      let needsSectionPatch = added.length === 0 || !onAirwayDeviceConfirmed
      let baseline = [...previous]
      if (added.length > 0 && onAirwayDeviceConfirmed) {
        for (const device of added) {
          // Each device has its own event decision. A mixed batch (for example
          // an ETT handled atomically and an airway adjunct handled by the
          // section save) must not let the first `true` suppress the latter.
          if (onAirwayDeviceConfirmed(device, baseline, airwayPatch) !== true) needsSectionPatch = true
          baseline = [...baseline, device]
        }
      }
      if (onAirwayDeviceRemoved) {
        await Promise.all(previous
          .filter(item => !awDevices.includes(item))
          .map(device => onAirwayDeviceRemoved(device)))
      }
      if (needsSectionPatch) await patchIntraopSection(airwayPatch)
      previousDevicesRef.current = [...awDevices]
      savedAirwayKeyRef.current = JSON.stringify(airwayPatch)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      notify(errorLabel, tc("airwaySaveFailed"))
    } finally {
      setAirwaySectionSaving(false)
    }
  }, [airwayPatch, awDevices, errorLabel, onAirwayDeviceConfirmed, onAirwayDeviceRemoved, patchIntraopSection, tc])

  const saveAirwayRef = useRef(saveAirwaySection)
  useEffect(() => { saveAirwayRef.current = saveAirwaySection }, [saveAirwaySection])

  useEffect(() => {
    if (!caseLoaded) return
    // The first loaded state is the server's copy, not an edit.
    if (savedAirwayKeyRef.current === null) {
      savedAirwayKeyRef.current = airwayKey
      return
    }
    if (airwayKey === savedAirwayKeyRef.current) return
    if (airwaySaveTimerRef.current) clearTimeout(airwaySaveTimerRef.current)
    airwaySaveTimerRef.current = setTimeout(() => {
      airwaySaveTimerRef.current = null
      void saveAirwayRef.current()
    }, 600)
  }, [caseLoaded, airwayKey])

  // Leaving the screen inside the 600 ms pause used to drop the change.
  useEffect(() => () => {
    if (!airwaySaveTimerRef.current) return
    clearTimeout(airwaySaveTimerRef.current)
    airwaySaveTimerRef.current = null
    void saveAirwayRef.current()
  }, [])

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
    awPresentsIntubated,
    setAwPresentsIntubated,
    awNotApplicable,
    setAwNotApplicable,
    airwaySectionSaving,
    saveAirwaySection,
  }
}
