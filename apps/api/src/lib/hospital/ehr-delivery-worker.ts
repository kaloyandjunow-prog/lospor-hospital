import "server-only"

import { prisma } from "@/lib/prisma"

import { claimNextEhrDelivery, completeEhrDelivery } from "./ehr-delivery"
import { buildEhrDeliveryPayload } from "./ehr-delivery-payload"
import { dropOutboundMessage } from "./ehr-transport-folder"
import { ehrTransportAccess } from "./ehr-transport-policy"

/**
 * Send what is due.
 *
 * Driven by the same shape as Central delivery: a worker container polls a
 * bearer-token internal endpoint, and the work happens here. There is no
 * scheduler in the appliance, so nothing runs unless something asks.
 *
 * One message per pass per claim, and each claim is independent — a case whose
 * payload cannot be built must not stop the case behind it.
 */

export type EhrWorkerResult = {
  sent: number
  failed: number
  skipped: number
}

export async function processDueEhrDeliveries(
  limit = 5,
  worker = "ehr-delivery-worker",
): Promise<EhrWorkerResult> {
  const result: EhrWorkerResult = { sent: 0, failed: 0, skipped: 0 }

  const access = await ehrTransportAccess()
  if (!access.enabled) return result

  for (let i = 0; i < limit; i += 1) {
    const claim = await claimNextEhrDelivery(prisma, { worker })
    if (!claim) break

    const payload = await buildEhrDeliveryPayload(prisma, { deliveryId: claim.id })

    // A message with no payload cannot be built by retrying: the snapshot is
    // unreadable or the finalization is gone. Retrying would fail identically.
    if (!payload) {
      await completeEhrDelivery(prisma, {
        id: claim.id, outcome: "failed", permanent: true, errorCode: "PAYLOAD_UNAVAILABLE",
      })
      result.failed += 1
      continue
    }

    // Without a record number the hospital cannot file this against anything.
    // Also permanent: the identifier is not going to become decryptable later,
    // and a message the receiver cannot route is worse than none.
    if (!payload.patient) {
      await completeEhrDelivery(prisma, {
        id: claim.id, outcome: "failed", permanent: true, errorCode: "PATIENT_REFERENCE_UNAVAILABLE",
      })
      result.failed += 1
      continue
    }

    try {
      if (access.transport === "FOLDER") {
        await dropOutboundMessage({
          deliveryId: payload.deliveryId,
          kind: payload.kind,
          header: { patient: payload.patient, ...(payload.header as object) },
        })
      } else {
        // FHIR and HL7 v2 land here next. Until then a configured site is told
        // its transport is not implemented rather than having its messages
        // quietly marked sent.
        await completeEhrDelivery(prisma, {
          id: claim.id, outcome: "failed", permanent: true, errorCode: "TRANSPORT_NOT_IMPLEMENTED",
        })
        result.skipped += 1
        continue
      }

      await completeEhrDelivery(prisma, { id: claim.id, outcome: "sent" })
      result.sent += 1
    } catch {
      // Transient by assumption: a full disk, a volume not mounted yet. The
      // backoff decides when to try again, and the attempt cap decides when to
      // stop.
      console.error("[ehr] EHR_DELIVERY_SEND_FAILED")
      await completeEhrDelivery(prisma, {
        id: claim.id, outcome: "failed", errorCode: "SEND_FAILED",
      })
      result.failed += 1
    }
  }

  return result
}
