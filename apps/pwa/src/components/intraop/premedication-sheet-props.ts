import type { ComponentProps, Dispatch, SetStateAction } from "react"
import type { PremedicationLibrarySheet } from "@/components/intraop/PremedicationLibrarySheet"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import {
  buildPediatricPremedLibrary,
  pediatricPremedDoseForRoute,
  premedPatientFromPreop,
  type PediatricPremedDrug,
} from "@/lib/pediatric-premedication-library"
import { adultPremedForRoute } from "@/lib/premed-route-dose"

type SheetProps = ComponentProps<typeof PremedicationLibrarySheet>

export type PremedicationSheetState = {
  open: boolean
  phase: SheetProps["phase"]
  library: SheetProps["categories"]
  category: SheetProps["openCategory"]
  drug: SheetProps["drug"]
  dose: SheetProps["dose"]
  route: SheetProps["route"]
  setOpen: (open: boolean) => void
  setCategory: Dispatch<SetStateAction<SheetProps["openCategory"]>>
  setDrug: Dispatch<SetStateAction<SheetProps["drug"]>>
  setDose: (value: string) => void
  setRoute: (value: string) => void
  onAdd: () => void
}

/**
 * The premedication library sheet for one patient, shared by the intraop
 * record and the preop order (1.7.0) so the two offer the same drugs at the
 * same doses.
 */
export function premedicationSheetProps(state: PremedicationSheetState, context: {
  preop: IntraopPreopSummary | null | undefined
  prospectiveGuidanceEnabled: boolean
  backLabel: string
}): SheetProps {
  const { preop, prospectiveGuidanceEnabled } = context
  const pediatricMode = preop?.clinicalMode === "PEDIATRIC"
  return {
    visible: state.open,
    phase: state.phase,
    // Paediatric mode used to get an empty list. It now gets the same library
    // rebuilt from this child's weight and age, minus the drugs that have no
    // paediatric rule — never the adult amounts.
    categories: pediatricMode ? buildPediatricPremedLibrary(state.library, preop) : state.library,
    openCategory: state.category,
    drug: state.drug,
    dose: state.dose,
    route: state.route,
    backLabel: context.backLabel,
    onClose: () => { state.setOpen(false); state.setCategory(null); state.setDrug(null) },
    onToggleCategory: category => state.setCategory(previous => previous === category ? null : category),
    onSelectDrug: drug => {
      state.setDrug(drug)
      // A paediatric entry now arrives with a dose computed for this child, so
      // it prefills like the adult one. Anything the rules would not calculate
      // — withheld, no rule, no weight — still starts blank and has to be
      // entered by hand.
      const annotation = (drug as PediatricPremedDrug).pediatric
      // An adult drug is shown as it applies to its default route.
      const adult = pediatricMode ? null : adultPremedForRoute(drug, drug.defaultRoute, preop?.weight)
      if (adult) state.setDrug(adult.drug)
      state.setDose(
        !prospectiveGuidanceEnabled || (pediatricMode && annotation?.kind !== "calculated")
          ? ""
          : adult ? adult.dose : String(drug.dose),
      )
      state.setRoute(drug.defaultRoute)
    },
    onBackToLibrary: () => state.setDrug(null),
    onDoseChange: state.setDose,
    onRouteChange: route => {
      state.setRoute(route)
      if (!prospectiveGuidanceEnabled) {
        state.setDose("")
        return
      }
      // Changing route changes the dose: oral midazolam is 0.5 mg/kg, IV is
      // 0.05. Leaving the previous number in place would be a tenfold error
      // waiting to be pressed.
      if (!state.drug) return
      if (!pediatricMode) {
        // Adults too: the route's own dose replaces the old one, typed or not.
        const adult = adultPremedForRoute(state.drug, route, preop?.weight)
        state.setDrug(adult.drug)
        state.setDose(adult.dose)
        return
      }
      const next = pediatricPremedDoseForRoute(state.drug, route, premedPatientFromPreop(preop))
      state.setDose(next.status === "calculated" ? String(next.dose) : "")
    },
    onAdd: state.onAdd,
    prospectiveGuidanceEnabled,
    pediatricMode,
  }
}
