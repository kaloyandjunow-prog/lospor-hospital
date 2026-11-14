import { NextResponse } from "next/server"
import { labScanTestSchema } from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"
import { externalAiCapabilityState, externalAiProviderAccess } from "@/lib/hospital/external-ai-policy"
import { labScanFailureResponse } from "@/lib/hospital/lab-scan-failure"
import { logAudit } from "@/lib/audit"
import { scanLabImage } from "@/lib/lab-scan"
import { prisma } from "@/lib/prisma"

const MISTRAL_TIMEOUT_MS = Number(process.env.MISTRAL_TIMEOUT_MS ?? 45_000)
/** A 10 MB image as base64, and the settings beside it. */
const MAX_BODY_BYTES = 14_500_000

/** The same words the case scan uses, which already read in Bulgarian. */
function unavailable(reason: string | null) {
  return NextResponse.json({
    error: reason === "DISABLED_BY_DEPLOYMENT"
      ? "AI features are disabled by this deployment"
      : "AI provider is not configured",
    code: reason,
  }, { status: 503, headers: ACCOUNT_CONTROL_HEADERS })
}

/**
 * A test scan from Status (1.9.1): the uploaded image is read with the
 * settings as they stand in the form, saved or not, by the same scan a
 * clinician's case uses. Nothing is stored but an audit entry; the rows go
 * back to Status only.
 *
 * It sends an image to the external provider, so it is held to what the case
 * scan is: the hospital's external-AI policy on and a credential set. There is
 * no case and so no case consent; Status says to use a report without patient
 * details.
 */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const state = await externalAiCapabilityState()
    if (!state.enabled) return unavailable(state.reason)
    const input = labScanTestSchema.parse(await boundedJson(request, MAX_BODY_BYTES))
    const access = await externalAiProviderAccess()
    if (!access.enabled) return unavailable(access.reason)
    const outcome = await scanLabImage({
      apiKey: access.apiKey,
      model: access.visionModel,
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      local: { aliases: input.aliases, instructions: input.instructions },
      timeoutMs: MISTRAL_TIMEOUT_MS,
    })
    if (!outcome.ok) return labScanFailureResponse(outcome)
    // The image left the appliance: that is recorded, as for a case scan, by the operator.
    const installation = await prisma.hospitalInstallation.findUnique({ where: { id: "local" }, select: { applianceOperatorUserId: true } })
    if (installation?.applianceOperatorUserId) {
      await logAudit(installation.applianceOperatorUserId, "AI_LAB_SCAN", "status-test-scan", {
        test: true, rowCount: outcome.results.length, aliasCount: input.aliases.length, instructionsLength: input.instructions.trim().length,
      })
    }
    return NextResponse.json({ results: outcome.results, unreadable: outcome.unreadable, model: access.visionModel }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
