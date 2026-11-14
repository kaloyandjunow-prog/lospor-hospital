import { NextRequest, NextResponse } from "next/server"
import {
  externalAiCapabilityState,
  externalAiProviderAccess,
} from "@/lib/hospital/external-ai-policy"
import { scanLabImage } from "@/lib/lab-scan"
import { getAuthUser } from "@/lib/mobile-auth"
import { canWriteCase } from "@/lib/access-control"
import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { corsHeaders } from "@/lib/cors"
import { emitStatusEvent } from "@/lib/hospital/status-events"
import { labScanFailureResponse } from "@/lib/hospital/lab-scan-failure"
import { storedLabScanLocal } from "@/lib/hospital/lab-scan-settings"

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
const MAX_BYTES = 10_485_760 // 10 MB
const MAX_BASE64_CHARS = Math.ceil(MAX_BYTES * 4 / 3)
const MISTRAL_TIMEOUT_MS = Number(process.env.MISTRAL_TIMEOUT_MS ?? 45_000)

// The scan itself -- prompt, provider call, conversion from the printed unit --
// is upstream's scanLabImage (API 10.4.1): photos are read upright and row by
// row. This route keeps the appliance's own gates: the sealed Status policy and
// credential, the model chosen in Status, and Status events on failure.

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // The policy/credential gate runs before the base64 clinical image is read.
  const aiState = await externalAiCapabilityState()
  if (!aiState.enabled) {
    return NextResponse.json({
      error: aiState.reason === "DISABLED_BY_DEPLOYMENT"
        ? "AI features are disabled by this deployment"
        : "AI provider is not configured",
      code: aiState.reason,
    }, { status: 503 })
  }

  const user = await getAuthUser(req)
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (contentLength > MAX_BYTES * 1.4) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 })
  }

  const rl = await rateLimit(`ai-labs:${user.id}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429, headers: { "Retry-After": String(rl.retryAfter) },
    })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 })

  const existing = await prisma.case.findUnique({
    where: { id },
    select: {
      userId: true,
      // The case's own institution, which canReadCase requires for a head of
      // department -- it compares record.institutionId, and the owner-institution
      // fallback was deliberately removed. Selecting only the owner left this
      // undefined, so every same-institution HOD was refused scanning on a
      // colleague's case while the list view showed it to them.
      institutionId: true,
      createdById: true,
      user: { select: { institutionId: true } },
      preop: { select: { aiOptIn: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canWriteCase(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let imageBase64: string
  let mimeType: string
  try {
    const body = await req.json()
    imageBase64 = body.imageBase64
    mimeType = body.mimeType
    if (typeof imageBase64 !== "string" || !imageBase64) throw new Error("missing imageBase64")
    if (!(MIME_TYPES as readonly string[]).includes(mimeType)) throw new Error("invalid mimeType")
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 })
  }

  // Per-case consent, read from the record and never from the request. It is
  // checked after the size guard on purpose: an oversized image is rejected as
  // oversized, so the caller is not told to fix consent when the real fault is
  // the payload.
  //
  // Deployment permission is a separate question, already answered above by the
  // sealed policy. This is the second key: whether this patient's case agreed.
  if (!existing.preop?.aiOptIn) {
    return NextResponse.json({ error: "AI advice not enabled for this case" }, { status: 403 })
  }

  const aiAccess = await externalAiProviderAccess()
  if (!aiAccess.enabled) {
    return NextResponse.json({
      error: aiAccess.reason === "DISABLED_BY_DEPLOYMENT"
        ? "AI features are disabled by this deployment"
        : "AI provider is not configured",
      code: aiAccess.reason,
    }, { status: 503 })
  }
  const outcome = await scanLabImage({
    apiKey: aiAccess.apiKey,
    model: aiAccess.visionModel,
    imageBase64,
    mimeType,
    // The hospital's own lab names and note, set in Status (1.9.1).
    local: await storedLabScanLocal(),
    timeoutMs: MISTRAL_TIMEOUT_MS,
  })
  if (!outcome.ok) return labScanFailureResponse(outcome)
  if (outcome.unreadable) {
    // Model output can contain clinical content; report only a fixed code.
    console.warn("[ai/read-labs] AI_PROVIDER_INVALID_RESPONSE")
    void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
      feature: "read-labs", failureKind: "invalid-response",
    })
  }
  const results = outcome.results

  // A successful send of a laboratory report photograph to an external
  // provider must leave a record. Previously only failures emitted anything,
  // so the one outcome that actually moved an identifying image off the
  // appliance was the one that left no trace. The image itself is never
  // logged -- only that the transfer happened, by whom, and how many rows came
  // back.
  await logAudit(user.id, "AI_LAB_SCAN", id, { optIn: true, rowCount: results.length })

  return NextResponse.json({ results })
}
