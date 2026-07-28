import { useState } from "react"
import type { LogEvent } from "@/lib/intraop-log-event"

type DrugCat = { cat: string; color: string; drugs: { name: string; unit: string }[] }
type DrugOption = { name: string; unit: string }
type InfusionOption = { name: string; unit: string; color: string }
type CodedIdentity = { drugId?: string; atcCode?: string; inn?: string }

// Bolus drug entry. startDrugAsInfusion hands off to the infusion domain
// (closes this sheet, opens the infusion one pre-selected with the same
// drug) — a genuine cross-domain action, which is why this hook takes the
// infusion hook's setters as parameters rather than mobile duplicating that
// transition logic, or the infusion hook reaching back into this one.
export function useDrugEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  drugCats: DrugCat[],
  infDrugs: InfusionOption[],
  setInfDrug: (d: InfusionOption | null) => void,
  setInfRate: (v: string) => void,
  setInfOpen: (v: boolean) => void,
  // Coded identity by drug name, sourced from the OptionLibrary catalog —
  // empty today (catalog isn't populated yet), but once it is, this is what
  // carries drugId/atcCode/inn into the saved event instead of dropping it.
  drugCodes: Record<string, CodedIdentity> = {},
  infusionRatePresets: Record<string, string[]> = {},
  doseCalcs: Record<string, { roundTo?: number }> = {},
) {
  const [drugOpen, setDrugOpen] = useState(false)
  const [drugCat, setDrugCat]   = useState<DrugCat | null>(null)
  const [drugPick, setDrugPick] = useState<DrugOption | null>(null)
  const [drugDose, setDrugDose] = useState("")
  const [drugRoute, setDrugRoute] = useState<string | undefined>(undefined)
  const [drugConcentration, setDrugConcentration] = useState<string | undefined>(undefined)

  function openDrug(ts?: string) {
    setEntryTs(ts ?? null)
    setDrugCat(null); setDrugPick(null); setDrugDose(""); setDrugRoute(undefined); setDrugConcentration(undefined); setDrugOpen(true)
  }

  // Close + reset the sheet synchronously, THEN fire the save (unawaited) so the
  // menu collapses immediately and a second tap can't add a duplicate while the
  // network save is in flight. `save` owns sync-state + offline queue + errors.
  function confirmDrug() {
    if (!drugPick || !drugDose) return
    const codes = drugCodes[drugPick.name]
    const rt = doseCalcs[drugPick.name]?.roundTo ?? 1
    const finalDose = rt > 1 && !isNaN(Number(drugDose))
      ? String(Math.round(Number(drugDose) / rt) * rt)
      : drugDose
    const drug = drugPick, cat = drugCat, route = drugRoute, conc = drugConcentration
    setDrugOpen(false); setDrugCat(null); setDrugPick(null); setDrugDose(""); setDrugRoute(undefined); setDrugConcentration(undefined)
    void save({ type: "drug", name: drug.name, dose: finalDose, unit: drug.unit,
      category: cat?.cat, color: cat?.color as string, drugRoute: route, concentration: conc,
      drugId: codes?.drugId, atcCode: codes?.atcCode, inn: codes?.inn })
  }

  function startDrugAsInfusion() {
    if (!drugPick) return
    const infMatch = infDrugs.find(d => d.name === drugPick.name)
    if (!infMatch) return
    // Transfer to infusion sheet pre-selected with this drug
    setDrugOpen(false); setDrugCat(null); setDrugPick(null); setDrugDose(""); setDrugRoute(undefined); setDrugConcentration(undefined)
    setInfDrug(infMatch); setInfRate(infusionRatePresets[infMatch.name]?.[0] ?? ""); setInfOpen(true)
  }

  function openDrugPreset(name: string, dose = "") {
    for (const cat of drugCats) {
      const found = cat.drugs.find(d => d.name === name)
      if (found) {
        setDrugCat(cat)
        setDrugPick(found)
        setDrugDose(dose)
        setDrugOpen(true)
        return
      }
    }
    openDrug()
  }

  return {
    drugOpen, setDrugOpen, drugCat, setDrugCat, drugPick, setDrugPick, drugDose, setDrugDose,
    drugRoute, setDrugRoute, drugConcentration, setDrugConcentration,
    openDrug, confirmDrug, startDrugAsInfusion, openDrugPreset,
  }
}
