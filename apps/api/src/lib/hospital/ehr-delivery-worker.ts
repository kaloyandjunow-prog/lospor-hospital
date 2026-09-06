import "server-only"

import { prisma } from "@/lib/prisma"

import { claimNextEhrDelivery, completeEhrDelivery } from "./ehr-delivery"
import { buildEhrDeliveryPayload } from "./ehr-delivery-payload"
import { renderPrintableRecord } from "./ehr-printable-record"
import { ehrAuthConfigFor, forgetEhrAccessToken, resolveEhrAccessToken } from "./ehr-fhir-auth"
import { documentReferenceFor, postFhirResource } from "./ehr-transport-fhir"
import { dropOutboundMessage } from "./ehr-transport-folder"
import { ehrTransportAccess, ehrTransportCapabilityState } from "./ehr-transport-policy"

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

  // A cheap gate: is a transport configured at all? This reads the policy
  // without opening the sealed credential, so nothing is decrypted for a pass
  // that has no work to do.
  const capability = await ehrTransportCapabilityState()
  if (!capability.enabled) return result

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

    // Reopened for this message rather than once for the batch.
    //
    // Two reasons, and the second is the one that made this a defect rather
    // than a preference. An operator who disables the transport, or corrects
    // an endpoint, mid-batch would otherwise have the next four messages sent
    // under the configuration they just replaced. And the credential is
    // plaintext for as long as it is held: a batch contains a puppeteer render
    // per protocol message, so holding it across five of them keeps the
    // hospital's secret in memory for the whole pass. ehrTransportAccess's own
    // contract says to call it "right before the outbound call ... so plaintext
    // exists only for that one operation"; this is what honouring it looks
    // like.
    const access = await ehrTransportAccess()
    if (!access.enabled) {
      // Configuration changed underneath the batch. The claim is released
      // rather than failed: nothing is wrong with the message.
      await completeEhrDelivery(prisma, {
        id: claim.id, outcome: "failed", errorCode: access.reason,
      })
      result.skipped += 1
      continue
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
          // Configured for FHIR with nowhere to send.
          //
          // This used to fail the message permanently, and permanent means
          // destroyed: nothing moves a delivery out of FAILED, and
          // queueFinalizationDeliveries is idempotent on (finalizationId,
          // kind) regardless of status, so even re-finalising the same case
          // would not produce another. Only an amendment, which mints a new
          // finalization, ever would -- so a case nobody amended was silently
          // never sent.
          //
          // The rule the transport draws is right: do not retry what retrying
          // cannot fix. A missing endpoint is not that. It is a site
          // configuration fault, and it is fixed the moment an operator types
          // the address in, so the message is held and retried instead.
          //
          // Belt and braces: ehrTransportAccess now reports FHIR as disabled
          // without an endpoint, so this should be unreachable. It stays
          // because being wrong here destroys a record, and being wrong in the
          // other direction costs one retry.
          await completeEhrDelivery(prisma, {
            id: claim.id, outcome: "failed", errorCode: "ENDPOINT_NOT_CONFIGURED",
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
              // The receiving hospital matches on its own namespaces. Asked
              // once, for the inbound patient check, and used both ways.
              identifierSystems: {
                recordNumber: access.recordNumberSystem,
                national: access.nationalIdentifierSystem,
              },
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
        const authConfig = ehrAuthConfigFor(access)
        const auth = await resolveEhrAccessToken(authConfig)
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
          // A token can stop working before it expires -- revoked at the
          // hospital's end, or invalidated by a change there. Forgetting it is
          // what stops the next four messages in this batch, and every batch
          // until it would have expired anyway, replaying the same dead token
          // and failing for a reason one exchange would have fixed.
          if (sent.errorCode === "HTTP_401" || sent.errorCode === "HTTP_403") {
            forgetEhrAccessToken(authConfig)
          }
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
