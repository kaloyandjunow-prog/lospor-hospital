import { NextRequest, NextResponse } from "next/server"
import {
  externalAiCapabilityState,
  externalAiProviderAccess,
} from "@/lib/hospital/external-ai-policy"
import { corsHeaders } from "@/lib/cors"
import { getAuthUser } from "@/lib/mobile-auth"
import { canAccessCase } from "@/lib/access-control"
import { fetchMistralChatCompletions } from "@/lib/mistral"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { emitStatusEvent } from "@/lib/hospital/status-events"
import { logAudit } from "@/lib/audit"

const MISTRAL_TIMEOUT_MS = Number(process.env.MISTRAL_TIMEOUT_MS ?? 45_000)

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Resolve before loading a case or reading the clinical monitor image.
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
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = await rateLimit(`vitals-scan:${user.id}`, 30, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit reached. Try again later." }, {
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
  if (!canAccessCase(user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Consent check from the database -- it ignores any client-supplied aiOptIn.
  //
  // This route sends a photograph of a monitor screen to an external provider.
  // No text redaction is possible on an image and none is attempted, so it is
  // at least as sensitive as the advice routes that have always been gated --
  // yet it was reachable with the AI opt-in unticked, while the consent text
  // beside that tickbox promises no names or free text ever leave.
  if (!existing.preop?.aiOptIn) {
    return NextResponse.json({ error: "AI advice not enabled for this case" }, { status: 403 })
  }

  let image: string
  let mimeType = "image/jpeg"
  try {
    const body = await req.json()
    image = body.image
    if (typeof body.mimeType === "string" && /^image\/(jpeg|png|webp|gif|heif|avif|bmp|tiff)$/.test(body.mimeType)) {
      mimeType = body.mimeType
    }
    if (!image || typeof image !== "string") throw new Error("missing image")
  } catch {
    return NextResponse.json({ error: "Expected { image: '<base64>' }" }, { status: 400 })
  }

  // Compressed 1600 px monitor photos are normally well below this limit.
  if (image.length > 5_600_000) {
    return NextResponse.json({ error: "Image too large. Please use a lower quality or crop the image." }, { status: 413 })
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
  const apiKey = aiAccess.apiKey

  // Without this a hung provider connection holds the request open
  // indefinitely; the other two AI routes have always had one.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MISTRAL_TIMEOUT_MS)
  try {
    const res = await fetchMistralChatCompletions(apiKey, {
      // Pinned, not floating. Everything else in the appliance is fixed to a
      // digest or checksum; "mistral-small-latest" let one clinical behaviour
      // change without a release, and it read the same env var as read-labs
      // while defaulting to a different model.
      model: process.env.MISTRAL_VISION_MODEL ?? "pixtral-12b-2409",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${image}` },
            },
            {
              type: "text",
              text: "Extract numeric vital sign readings from this patient monitor screen. Return ONLY valid JSON in exactly this format: {\"systolic\":null,\"diastolic\":null,\"heartRate\":null,\"spO2\":null,\"etco2\":null,\"temp\":null,\"rr\":null}. Replace null with the numeric value for each parameter you can clearly read. Return null for any parameter not visible or not legible. No explanation, no markdown, no extra text.",
            },
          ],
        },
      ],
      max_tokens: 120,
      temperature: 0,
    }, { signal: controller.signal })

    if (!res.ok) {
      // Provider bodies may echo clinical output or request data; do not read them.
      console.error("[vitals-scan] AI_PROVIDER_RESPONSE_FAILED")
      void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
        feature: "vitals-scan", failureKind: "provider", httpStatus: res.status,
      })
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 })
    }

    const json = await res.json()
    const raw = json.choices?.[0]?.message?.content?.trim() ?? ""

    // Extract JSON from response (Mistral sometimes wraps in markdown)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
        feature: "vitals-scan", failureKind: "invalid-response",
      })
      return NextResponse.json({ error: "Could not parse monitor readings" }, { status: 422 })
    }

    const vitals = JSON.parse(match[0]) as {
      systolic: number | null
      diastolic: number | null
      heartRate: number | null
      spO2: number | null
      etco2: number | null
      temp: number | null
      rr: number | null
    }

    // These are broad physical plausibility bounds, not age-specific normal
    // ranges. Core supplies the soft pediatric interpretation after extraction.
    //
    // The previous form only nulled values that were numerically out of range,
    // and a non-number fails every comparison silently -- {"systolic": "not
    // visible"} is neither < 20 nor > 300, so it reached the client as a string
    // and into a vitals field. Anything that is not a finite number is
    // discarded.
    const plausible = (value: unknown, min: number, max: number): number | null =>
      typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
        ? value
        : null

    const checked = {
      systolic: plausible(vitals.systolic, 20, 300),
      diastolic: plausible(vitals.diastolic, 10, 200),
      heartRate: plausible(vitals.heartRate, 10, 350),
      spO2: plausible(vitals.spO2, 20, 100),
      etco2: plausible(vitals.etco2, 2, 150),
      temp: plausible(vitals.temp, 25, 45),
      rr: plausible(vitals.rr, 1, 150),
    }

    // A successful send of a patient monitor photograph to an external provider
    // must leave a record. Previously only failures emitted a status event, so
    // the one outcome that actually moved an image off the appliance was the
    // one that left no trace anywhere.
    await logAudit(user.id, "AI_VITALS_SCAN", id, { optIn: true })

    return NextResponse.json(checked)
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[vitals-scan] AI_PROVIDER_TIMEOUT")
      void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
        feature: "vitals-scan", failureKind: "timeout",
      })
      return NextResponse.json({ error: "Monitor scan timed out. Please try again." }, { status: 504 })
    }
    const failureKind = err instanceof SyntaxError ? "invalid-response" : "network"
    console.error("[vitals-scan] AI_PROVIDER_REQUEST_FAILED")
    void emitStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
      feature: "vitals-scan", failureKind,
    })
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
