import { NextResponse } from "next/server"
import type { LabScanOutcome } from "@/lib/lab-scan"
import { mistralModelUnavailable } from "@/lib/hospital/external-ai-models"
import { emitStatusEvent } from "@/lib/hospital/status-events"

/**
 * The appliance's answer to a lab scan that did not return rows (1.9.1): a
 * Status event naming the kind of failure, and a response with no provider
 * text in it. Shared by the case's scan and Status's test scan, so both fail
 * the same way and both show up in Status the same way.
 *
 * The provider's body is never logged or returned: provider errors can echo
 * the clinical payload.
 */
export async function labScanFailureResponse(
  outcome: Exclude<LabScanOutcome, { ok: true }>,
): Promise<NextResponse> {
  // One feature for both: Status events name read-labs, a test scan included.
  // Fixed log lines only (verify:provenance's runtime log privacy boundary).
  const feature = "read-labs"
  if (outcome.kind === "timeout") {
    console.error("[ai/read-labs] AI_PROVIDER_TIMEOUT")
    void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", { feature, failureKind: "timeout" })
    return NextResponse.json({ error: "Lab scan timed out. Please crop the image tighter or try again." }, { status: 504 })
  }
  if (outcome.kind === "network") {
    console.error("[ai/read-labs] AI_PROVIDER_NETWORK_FAILED")
    void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", { feature, failureKind: "network" })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
  const status = outcome.response.status
  console.error("[ai/read-labs] Mistral error:", status)
  if (await mistralModelUnavailable(outcome.response)) {
    void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", { feature, failureKind: "model-unavailable" })
    return NextResponse.json({
      error: "The configured AI model is no longer offered by Mistral. Hospital IT must choose another in Status.",
      code: "EXTERNAL_AI_MODEL_UNAVAILABLE",
    }, { status: 503 })
  }
  void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", { feature, failureKind: "provider", httpStatus: status })
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}
