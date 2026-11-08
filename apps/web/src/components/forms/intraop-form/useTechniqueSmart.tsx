import { useEffect, useRef } from "react"
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form"
import { parseTechniqueSides, techniqueSidesFor, techniquesAfterTciStart, type TechniqueSide } from "@lospor/core/technique-smart"
import type { LogEvent } from "@lospor/core/intraop-types"
import { TechniqueSmart } from "@/components/intraop/TechniqueSmart"
import type { buildTree as buildTechniqueTree } from "@/components/TechniqueTree"
import type { TimetableData } from "@/components/IntraopTimetable"
import { useTechniqueScreen } from "@/lib/use-technique-screen"
import { useRecentTechniques } from "@/lib/use-recent-techniques"
import type { IntraopFormFields } from "../intraopSchema"

/**
 * Smart selection for technique (10.2.0): search, the preop plan, the usual ones and the side of a block. The saved
 * data is the list of technique codes with the side beside it; finding and sides are Core's (technique-smart). Also
 * the TCI rule: starting a TCI infusion adds its technique, whether from this form or from the event log.
 */
export function useTechniqueSmart({ control, setValue, timetable, onTimetableChange, techniques, timelineLog, readOnly, techniqueTree, plannedTechniques }: {
  control: Control<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  timetable: TimetableData
  onTimetableChange: (after: TimetableData) => boolean | void
  techniques: string[]
  timelineLog: readonly LogEvent[]
  readOnly: boolean
  techniqueTree: ReturnType<typeof buildTechniqueTree>
  plannedTechniques: string[] | undefined
}) {
  const techniqueScreen = useTechniqueScreen()
  const recentTechniques = useRecentTechniques()
  const techniqueSides = parseTechniqueSides(useWatch({ control, name: "techniqueSides" }))
  function applyTechniques(next: string[], sides: Record<string, TechniqueSide>, added: string[]) {
    setValue("techniques", next, { shouldDirty: true })
    setValue("techniqueSides", sides, { shouldDirty: true })
    recentTechniques.remember(added)
  }
  function onTimetableChangeWithTci(after: TimetableData) {
    const beforeIds = new Set((timetable.infusions ?? []).map(infusion => infusion.startEventId ?? infusion.id))
    const newTci = (after.infusions ?? []).find(infusion =>
      !beforeIds.has(infusion.startEventId ?? infusion.id)
      && techniquesAfterTciStart(techniques, infusion.tciModel).length > techniques.length,
    )
    const committed = onTimetableChange(after)
    if (!committed || !newTci) return
    setValue("techniques", techniquesAfterTciStart(techniques, newTci.tciModel), { shouldDirty: true })
  }
  // The timetable callback covers a start made from this form. The event log
  // effect covers a start that was already present when the form opened or was
  // written by another device, so the account-wide TCI rule is convergent.
  const seenTciStartIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (readOnly) return
    const starts = timelineLog.filter(event => event.type === "infusion_start" && event.tciModel)
    const fresh = starts.filter(event => !seenTciStartIds.current.has(event.id))
    if (fresh.length === 0) return
    for (const event of fresh) seenTciStartIds.current.add(event.id)
    const next = fresh.reduce((current, event) => techniquesAfterTciStart(current, event.tciModel), techniques)
    if (next.length === techniques.length) return
    setValue("techniques", next, { shouldDirty: true })
    setValue("techniqueSides", techniqueSidesFor(next, techniqueSides), { shouldDirty: true })
  }, [readOnly, setValue, techniqueSides, techniques, timelineLog])
  const techniqueNode = techniqueScreen === "smart" && !readOnly ? (
    <TechniqueSmart techniques={techniques} sides={techniqueSides} onChange={applyTechniques} tree={techniqueTree}
      planned={plannedTechniques ?? []} recents={recentTechniques.recents} />
  ) : undefined
  return { techniqueNode, onTimetableChangeWithTci }
}
