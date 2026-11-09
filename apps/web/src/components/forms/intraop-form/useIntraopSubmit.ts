import { useState, type RefObject } from "react"
import type { UseFormGetValues } from "react-hook-form"
import { evaluateIntraopReadiness, type ClinicalIssueCode } from "@lospor/core/clinical-validation"
import { buildIntraopSubmission, intraopTimeErrors } from "@/lib/intraop-submit"
import type { TimetableData, IntraopLogEvent } from "@/components/IntraopTimetable"
import { INTRAOP_ISSUE_KEYS } from "../intraop-issue-copy"
import type { IntraopData, IntraopFormFields } from "../intraopSchema"

/**
 * Continue, manual save and submit. Continue checks readiness first: blockers
 * stop it, warnings ask once, and a clean record goes straight through.
 */
export function useIntraopSubmit({ getValues, timetable, eventLog, startTime, presentsIntubated, airwayNA, onSubmit, onAutoSave, setActiveTab, timelineSectionRef, t }: {
  getValues: UseFormGetValues<IntraopFormFields>
  timetable: TimetableData
  eventLog?: IntraopLogEvent[]
  startTime: string
  presentsIntubated: boolean
  airwayNA: boolean
  onSubmit: (data: IntraopData) => void
  onAutoSave?: (data: IntraopData) => void
  setActiveTab: (tab: string) => void
  timelineSectionRef: RefObject<HTMLDivElement | null>
  t: (key: string) => string
}) {
  const [manualSaved, setManualSaved] = useState(false)
  const [timeErrors, setTimeErrors] = useState<{ startTime?: boolean; endTime?: boolean }>({})
  const [incompleteItems, setIncompleteItems] = useState<string[] | null>(null)
  const [canContinueIncomplete, setCanContinueIncomplete] = useState(true)
  const localizeIssue = (code: ClinicalIssueCode) => {
    const messageKey = INTRAOP_ISSUE_KEYS[code]
    return messageKey ? t(messageKey) : code
  }

  function handleSubmitWithTimetable(formData: IntraopData) {
    // Columns are chart positions; the API stores wall-clock times. The
    // conversion lives in @/lib/intraop-submit, where it has a test.
    const { vitals, drugsAdministered } = buildIntraopSubmission(timetable, startTime)
    // The chart itself is never sent: its events are already saved one by one.
    onSubmit({ ...formData, vitals, drugsAdministered })
  }

  function doSubmit() {
    // Bypass react-hook-form's Zod resolver — handleContinue already validates
    // the mandatory fields (startTime, endTime). Calling handleSubmit() here
    // causes Zod to reject fields it can't parse (e.g. null-vs-undefined
    // mismatches on Json array fields), which silently blocks navigation.
    handleSubmitWithTimetable(getValues() as IntraopData)
  }

  function handleContinue() {
    const vals = getValues()
    const readiness = evaluateIntraopReadiness({
      ...vals,
      airwayDevices: presentsIntubated || airwayNA
        ? ["DOCUMENTED_WITHOUT_NEW_DEVICE"]
        : vals.airwayDevices,
      timetableData: timetable,
      keyEvents: eventLog,
    } as Record<string, unknown>)
    const errs = intraopTimeErrors(readiness.blockers.map(issue => issue.code))
    setTimeErrors(errs)

    if (readiness.blockers.length > 0) {
      setCanContinueIncomplete(false)
      setIncompleteItems(readiness.blockers.map(issue => localizeIssue(issue.code)))
      if (errs.startTime || errs.endTime) {
        setActiveTab("overview")
        setTimeout(() => timelineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
      }
      return
    }

    if (readiness.warnings.length > 0) {
      setCanContinueIncomplete(true)
      setIncompleteItems(readiness.warnings.map(issue => localizeIssue(issue.code)))
      return
    }

    doSubmit()
  }

  function handleManualSave() {
    if (!onAutoSave) return
    onAutoSave({ ...getValues() })
    setManualSaved(true)
    setTimeout(() => setManualSaved(false), 2000)
  }

  return { handleContinue, doSubmit, handleManualSave, handleSubmitWithTimetable, manualSaved, timeErrors, setTimeErrors, incompleteItems, setIncompleteItems, canContinueIncomplete }
}
