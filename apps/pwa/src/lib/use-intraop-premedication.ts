import { useEffect, useRef, useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import type { IntraopTab } from "@/lib/intraop-tabs"
import type { PremDrug } from "@/lib/intraop-types"
import { addOrReplacePremedicationEntry, buildPremedicationPatch, formatPremedicationEntry } from "@/lib/intraop-premedication"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

export function useIntraopPremedication(
  tab: IntraopTab,
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const [premedEveningText, setPremedEveningText] = useState("")
  const [premedMorningText, setPremedMorningText] = useState("")
  const [premedSaving, setPremedSaving] = useState(false)
  const prevTabRef = useRef<IntraopTab>("equipment")
  const savePremedicationRef = useRef<(overrides?: { evening?: string | null; morning?: string | null }) => Promise<void>>(async () => {})

  const [premedPickOpen, setPremedPickOpen] = useState(false)
  const [premedPickPhase, setPremedPickPhase] = useState<"evening" | "morning">("evening")
  const [premedPickCat, setPremedPickCat] = useState<string | null>(null)
  const [premedPickDrug, setPremedPickDrug] = useState<PremDrug | null>(null)
  const [premedPickDose, setPremedPickDose] = useState("")
  const [premedPickRoute, setPremedPickRoute] = useState("PO")

  async function savePremedication(overrides?: { evening?: string | null; morning?: string | null }) {
    setPremedSaving(true)
    try {
      await patchIntraopSection(buildPremedicationPatch(premedEveningText, premedMorningText, overrides))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      notify(errorLabel, "Could not save premedication.")
    } finally {
      setPremedSaving(false)
    }
  }

  savePremedicationRef.current = savePremedication

  useEffect(() => {
    if (prevTabRef.current === "premedication" && tab !== "premedication") {
      void savePremedicationRef.current()
    }
    prevTabRef.current = tab
  }, [tab])

  function openPremedPicker(phase: "evening" | "morning") {
    setPremedPickPhase(phase)
    setPremedPickCat(null)
    setPremedPickDrug(null)
    setPremedPickDose("")
    setPremedPickRoute("PO")
    setPremedPickOpen(true)
  }

  function addSelectedPremedication() {
    if (!premedPickDrug || !premedPickDose) return
    const entry = formatPremedicationEntry(premedPickDrug, premedPickDose, premedPickRoute)
    const drugName = premedPickDrug.name
    if (premedPickPhase === "evening") {
      const next = addOrReplacePremedicationEntry(premedEveningText, drugName, entry)
      setPremedEveningText(next)
      setTimeout(() => savePremedication({ evening: next }), 200)
    } else {
      const next = addOrReplacePremedicationEntry(premedMorningText, drugName, entry)
      setPremedMorningText(next)
      setTimeout(() => savePremedication({ morning: next }), 200)
    }
    setPremedPickOpen(false)
    setPremedPickDrug(null)
    setPremedPickCat(null)
  }

  return {
    premedEveningText,
    setPremedEveningText,
    premedMorningText,
    setPremedMorningText,
    premedSaving,
    savePremedication,
    openPremedPicker,
    premedPickOpen,
    setPremedPickOpen,
    premedPickPhase,
    premedPickCat,
    setPremedPickCat,
    premedPickDrug,
    setPremedPickDrug,
    premedPickDose,
    setPremedPickDose,
    premedPickRoute,
    setPremedPickRoute,
    addSelectedPremedication,
  }
}
