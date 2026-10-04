import { useCallback } from "react"
import { allergyConflicts, allergyRecords, type AllergyMatchLevel } from "@lospor/core/allergy-drug-check"
import type { AllergyAck } from "@lospor/core/intraop-types"
import { confirmAction } from "@/lib/notify"
import type { ClinicalStringKey } from "@/lib/preferences-context"

const LEVEL_KEY: Record<AllergyMatchLevel, ClinicalStringKey> = {
  same_substance: "allergySameSubstance",
  same_class: "allergySameClass",
  cross_reaction: "allergyCrossReaction",
}

/**
 * What the check decided: give it (with the acknowledgement to record, when
 * there was something to acknowledge), or do not give it at all.
 */
export type AllergyVerdict = { give: true; allergyAck?: AllergyAck[] } | { give: false }

/** Answers at once when nothing clashes; waits for the clinician only when it asks. */
export type AllergyCheck = (drug: { name: string; atcCode?: string; inn?: string }) => AllergyVerdict | Promise<AllergyVerdict>

/** A check that lets everything through, for callers with no allergies to check against. */
export const NO_ALLERGY_CHECK: AllergyCheck = () => ({ give: true })

/**
 * Run `given` once the check says give. Synchronous when the check answered at
 * once, so a drug that clashes with nothing is saved in the same tap.
 */
export function whenGiven(verdict: AllergyVerdict | Promise<AllergyVerdict>, given: (allergyAck?: AllergyAck[]) => void): void {
  const go = (v: AllergyVerdict) => { if (v.give) given(v.allergyAck) }
  if (verdict instanceof Promise) void verdict.then(go)
  else go(verdict)
}

/**
 * The case's recorded allergies, checked when a drug is given (1.5.0).
 *
 * A drug or an infusion that clashes with an allergy -- typed in preop or
 * accepted from the hospital system -- asks first: "Give anyway" records the
 * acknowledgement on the dose, "Don't give" gives nothing. Never blocks. The
 * drug and infusion sheets call this before they show or save anything, so a
 * declined infusion never appears as running.
 */
export function useAllergyCheck(
  preop: { allergies?: boolean | null; allergyDetails?: unknown } | null | undefined,
  tc: (key: ClinicalStringKey) => string,
): AllergyCheck {
  return useCallback(drug => {
    const conflicts = allergyConflicts(allergyRecords(preop), drug)
    if (conflicts.length === 0) return { give: true }
    return askAboutClash(drug.name, conflicts, tc)
  }, [preop, tc])
}

async function askAboutClash(
  name: string,
  conflicts: ReturnType<typeof allergyConflicts>,
  tc: (key: ClinicalStringKey) => string,
): Promise<AllergyVerdict> {
    const lines = conflicts.map(conflict =>
      `• ${conflict.allergy}${conflict.source === "ehr" ? ` (${tc("allergyFromEhr")})` : ""} — ${tc(LEVEL_KEY[conflict.level])}`)
    const give = await confirmAction(
      `⚠ ${tc("allergyAlertTitle")}: ${name}`,
      `${lines.join("\n")}\n\n${tc("allergyAckNote")}`,
      { destructive: true, confirmLabel: tc("allergyGiveAnyway"), cancelLabel: tc("allergyDontGive") },
    )
    return give
      ? { give: true, allergyAck: conflicts.map(conflict => ({ allergy: conflict.allergy, level: conflict.level })) }
      : { give: false }
}
