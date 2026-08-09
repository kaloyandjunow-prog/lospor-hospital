import { useState } from "react"
import type {
  DrugFormulation,
  LogEvent,
} from "@/lib/intraop-log-event"

type DrugCat = { cat: string; color: string; drugs: { name: string; unit: string }[] }
type DrugOption = { name: string; unit: string }
type InfusionOption = { name: string; unit: string; color: string }
type CodedIdentity = { drugId?: string; atcCode?: string; inn?: string }
export type DrugRuleSelection = {
  key: string
  version: string
  sourceIds: string[]
  roundTo?: number | null
}

export type DrugEntryDraft = {
  pick: DrugOption | null
  dose: string
  route?: string
  concentration?: string
  customConcentration?: string
  formulation?: DrugFormulation
  rule?: DrugRuleSelection
}

function emptyDrugDraft(): DrugEntryDraft {
  return { pick: null, dose: "" }
}

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
  const [drugDraft, setDrugDraft] = useState<DrugEntryDraft>(emptyDrugDraft)

  const drugPick = drugDraft.pick
  const drugDose = drugDraft.dose
  const drugRoute = drugDraft.route
  const drugConcentration = drugDraft.concentration
  const drugCustomConcentration = drugDraft.customConcentration
  const drugFormulation = drugDraft.formulation
  const drugRule = drugDraft.rule

  function setDrugPick(pick: DrugOption | null) {
    setDrugDraft(current => ({ ...current, pick }))
  }

  function setDrugDose(dose: string) {
    setDrugDraft(current => ({ ...current, dose }))
  }

  function setDrugRoute(route: string | undefined) {
    setDrugDraft(current => ({ ...current, route }))
  }

  function setDrugConcentration(concentration: string | undefined) {
    setDrugDraft(current => ({ ...current, concentration }))
  }

  function setDrugCustomConcentration(customConcentration: string | undefined) {
    setDrugDraft(current => ({ ...current, customConcentration }))
  }

  function setDrugFormulation(formulation: DrugFormulation | undefined) {
    setDrugDraft(current => ({ ...current, formulation }))
  }

  function applyDrugSelection(selection: DrugEntryDraft) {
    setDrugDraft(selection)
  }

  function openDrug(ts?: string) {
    setEntryTs(ts ?? null)
    setDrugCat(null)
    setDrugDraft(emptyDrugDraft())
    setDrugOpen(true)
  }

  // Close + reset the sheet synchronously, THEN fire the save (unawaited) so the
  // menu collapses immediately and a second tap can't add a duplicate while the
  // network save is in flight. `save` owns sync-state + offline queue + errors.
  function confirmDrug() {
    if (!drugPick || !drugDose) return
    const codes = drugCodes[drugPick.name]
    const rt = drugRule ? drugRule.roundTo ?? 0 : doseCalcs[drugPick.name]?.roundTo ?? 1
    const shouldRound = drugRule ? rt > 0 : rt > 1
    const finalDose = shouldRound && !isNaN(Number(drugDose))
      ? String(Math.round(Number(drugDose) / rt) * rt)
      : drugDose
    const drug = drugPick, cat = drugCat, route = drugRoute, conc = drugConcentration
    const formulation = drugFormulation, rule = drugRule
    setDrugOpen(false)
    setDrugCat(null)
    setDrugDraft(emptyDrugDraft())
    void save({ type: "drug", name: drug.name, dose: finalDose, unit: drug.unit,
      category: cat?.cat, color: cat?.color as string, drugRoute: route, concentration: conc, formulation,
      drugId: codes?.drugId, atcCode: codes?.atcCode, inn: codes?.inn,
      clinicalRuleKey: rule?.key, clinicalRuleVersion: rule?.version,
      clinicalRuleSourceIds: rule?.sourceIds })
  }


  function startDrugAsInfusion() {
    if (!drugPick) return
    const infMatch = infDrugs.find(d => d.name === drugPick.name)
    if (!infMatch) return
    // Transfer to infusion sheet pre-selected with this drug
    setDrugOpen(false)
    setDrugCat(null)
    setDrugDraft(emptyDrugDraft())
    setInfDrug(infMatch); setInfRate(infusionRatePresets[infMatch.name]?.[0] ?? ""); setInfOpen(true)
  }

  function openDrugPreset(name: string, dose = "") {
    for (const cat of drugCats) {
      const found = cat.drugs.find(d => d.name === name)
      if (found) {
        setDrugCat(cat)
        setDrugDraft({ pick: found, dose })
        setDrugOpen(true)
        return
      }
    }
    openDrug()
  }

  return {
    drugOpen, setDrugOpen, drugCat, setDrugCat, drugPick, setDrugPick, drugDose, setDrugDose,
    drugRoute, setDrugRoute, drugConcentration, setDrugConcentration,
    drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
    drugRule, applyDrugSelection,
    openDrug, confirmDrug, startDrugAsInfusion, openDrugPreset,
  }
}
