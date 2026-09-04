import "server-only"

import { prisma } from "@/lib/prisma"

import { claimNextEhrDelivery, completeEhrDelivery } from "./ehr-delivery"
import { buildEhrDeliveryPayload } from "./ehr-delivery-payload"
import { renderPrintableRecord } from "./ehr-printable-record"
import { resolveEhrAccessToken } from "./ehr-fhir-auth"
import { documentReferenceFor, postFhirResource } from "./ehr-transport-fhir"
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

    // Only the protocol carries a document. A safety message and the case
    // signals are structured and have no printable form.
    let documentHtml: string | null = null
    if (payload.kind === "PROTOCOL") {
      const rendered = await renderPrintableRecord({
        caseId: claim.caseId, deliveryId: claim.id,
      })
      if (!rendered.ok) {
        await completeEhrDelivery(prisma, {
          id: claim.id, outcome: "failed",
          permanent: rendered.permanent, errorCode: rendered.errorCode,
        })
        result.failed += 1
        continue
      }
      documentHtml = rendered.html
    }

    try {
      if (access.transport === "FOLDER") {
        await dropOutboundMessage({
          deliveryId: payload.deliveryId,
          kind: payload.kind,
          header: { patient: payload.patient, ...(payload.header as object) },
          documentHtml,
        })
      } else if (access.transport === "FHIR") {
        const endpoint = access.endpoint
        if (!endpoint) {
          // Configured for FHIR with nowhere to send. An operator has to fix
          // it; retrying will not.
          await completeEhrDelivery(prisma, {
            id: claim.id, outcome: "failed", permanent: true, errorCode: "ENDPOINT_NOT_CONFIGURED",
          })
          result.failed += 1
          continue
        }

        const resource = documentHtml
          ? documentReferenceFor({
              patient: payload.patient,
              contentHtml: documentHtml,
              createdAt: new Date().toISOString(),
              title: "Anaesthesia protocol",
            })
          : {
              // A structured message with no document: carried as a Basic
              // resource so a receiver that files everything still gets it,
              // rather than being dropped for having no FHIR shape of its own.
              resourceType: "Basic",
              code: { text: payload.kind },
              extension: [{
                url: "https://lospor.org/fhir/StructureDefinition/ehr-message",
                valueString: JSON.stringify({ patient: payload.patient, ...(payload.header as object) }),
              }],
            }

        // A static token is passed straight through; client credentials are
        // exchanged and cached. The transport only ever sees a bearer string.
        const auth = await resolveEhrAccessToken(
          access.authMode === "OAUTH2_CLIENT_CREDENTIALS"
            ? {
                mode: "OAUTH2_CLIENT_CREDENTIALS",
                tokenUrl: access.tokenUrl ?? "",
                clientId: access.clientId ?? "",
                clientSecret: access.credential,
                scope: access.scope,
              }
            : { mode: "STATIC_BEARER", credential: access.credential },
        )
        if (!auth.ok) {
          await completeEhrDelivery(prisma, {
            id: claim.id, outcome: "failed",
            permanent: auth.permanent, errorCode: auth.errorCode,
          })
          result.failed += 1
          continue
        }

        const sent = await postFhirResource(resource, {
          endpoint, credential: auth.token,
        })
        if (!sent.ok) {
          await completeEhrDelivery(prisma, {
            id: claim.id, outcome: "failed",
            permanent: sent.permanent, errorCode: sent.errorCode,
          })
          result.failed += 1
          continue
        }
      } else {
        // Only reachable from a policy row written before this transport was
        // withdrawn, since nothing accepts the value as input any more. Failed
        // permanently rather than quietly marked sent: a site whose messages
        // are going nowhere has to be told.
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
