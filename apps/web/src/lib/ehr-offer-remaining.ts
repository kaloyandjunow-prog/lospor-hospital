import { visibleReviewItems } from "@lospor/core/ehr-import-review"
import type { EhrImportOffer } from "@lospor/core/ehr-import-transport"

/**
 * What is left of an offer once some of it was accepted on this screen (1.4.17).
 *
 * The appliance keeps an import open until every item is decided, so a
 * clinician who takes two values and leaves the rest finds the rest still
 * waiting when they ask again. The screen used to drop any second offer of an
 * import it had accepted from -- a guard against accepting the same items twice
 * before the case was saved -- and so dropped the rest as well, then said the
 * hospital held nothing for the patient.
 *
 * Now only the accepted items are hidden (as `unchanged`, the state the server
 * gives an item the case already holds). What remains is not ticked: the
 * clinician already left it once. Null when nothing is left to decide.
 */
export function offerWithoutAccepted(
  offer: EhrImportOffer,
  acceptedKeys: ReadonlySet<string>,
): EhrImportOffer | null {
  const plan = {
    ...offer.plan,
    items: offer.plan.items.map(item =>
      acceptedKeys.has(item.itemKey) ? { ...item, state: "unchanged" as const } : item),
    preselectedKeys: [],
  }
  return visibleReviewItems(plan).length ? { ...offer, plan } : null
}

/** Whether an offer holds anything to decide at all. */
export function offerHasQuestions(offer: EhrImportOffer): boolean {
  return visibleReviewItems(offer.plan).length > 0
}
