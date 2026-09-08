import "server-only"

import { buildSafetyFindings, hasSafetyFindings } from "@lospor/core/ehr-safety-findings"

import { ehrTransportCapabilityState } from "./ehr-transport-policy"
import { queueFinalizationDeliveries, type EhrDeliveryClient } from "./ehr-delivery"

/**
 * The one line of appliance behaviour that reaches into finalization.
 *
 * It lives here rather than in case-audit.ts so the vendored file carries a
 * single call rather than the policy lookup, the findings decision and the
 * queueing — every line added there is a line that has to survive the next
 * vendor merge.
 *
 * Best-effort by construction. A site with no adapter configured queues
 * nothing, and a fault in the adapter must never fail a finalization: the
 * attested record is what matters, and a clinician who cannot finalize because
 * an integration is misconfigured has been handed a worse problem than the one
 * the integration solves.
 */
export async function queueEhrDeliveriesSafe(
  db: EhrDeliveryClient,
  input: {
    caseId: string
    institutionId: string | null
    finalizationId: string
    sequence: number
    finalizedAt: Date
    supersedesFinalizationId: string | null
    preop: unknown
    intraop: unknown
  },
): Promise<void> {
  try {
    // An adapter's identifier scope is the institution, so a case without one
    // has no hospital system to send to.
    if (!input.institutionId) return

    const state = await ehrTransportCapabilityState()
    if (!state.enabled || !state.transport) return

    const findings = buildSafetyFindings({
      preop: input.preop as Parameters<typeof buildSafetyFindings>[0]["preop"],
      intraop: input.intraop as Parameters<typeof buildSafetyFindings>[0]["intraop"],
    })

    await queueFinalizationDeliveries(db, {
      institutionId: input.institutionId,
      caseId: input.caseId,
      finalizationId: input.finalizationId,
      sequence: input.sequence,
      finalizedAt: input.finalizedAt,
      transport: state.transport,
      hasSafetyFindings: hasSafetyFindings(findings),
      supersedesFinalizationId: input.supersedesFinalizationId,
    })
  } catch {
    // Never logged with detail: a failure here can only be about this case, and
    // the record itself is already written and attested.
    console.error("[ehr] EHR_DELIVERY_QUEUE_FAILED")
  }
}
