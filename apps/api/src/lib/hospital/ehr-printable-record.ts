import "server-only"

import crypto from "node:crypto"
import { SignJWT } from "jose"

/**
 * The document a hospital files.
 *
 * It is the printable record — the same page a clinician prints — fetched by
 * the API from the web service and passed on as-is. That is the whole reason
 * this is not a second document generated separately: a summary maintained
 * beside the print page drifts from it, and nobody notices until a hospital is
 * filing something the anaesthetist has never seen.
 *
 * Fetched over the internal network rather than the public domain, so it works
 * before TLS is configured, does not depend on the reverse proxy, and never
 * leaves the appliance on its way from one container to another.
 */

const INTERNAL_WEB_URL = process.env.LOSPOR_WEB_INTERNAL_URL ?? "http://web:3000"

function secret() {
  const value = process.env.LOSPOR_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!value) throw new Error("LOSPOR_AUTH_SECRET or NEXTAUTH_SECRET is required")
  return new TextEncoder().encode(value)
}

/**
 * A print token for the adapter itself.
 *
 * Two minutes rather than the five a clinician's token gets: this one is used
 * immediately by the process that minted it and never travels to a browser, so
 * the window only has to cover one internal request.
 *
 * The subject is the delivery rather than a user, because no user asked for
 * this — the audit trail should not name a clinician who was not involved.
 */
async function adapterPrintToken(caseId: string, deliveryId: string): Promise<string> {
  return new SignJWT({ caseId, userId: `ehr-adapter:${deliveryId}`, type: "print" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secret())
}

export type PrintableRecordResult =
  | { ok: true; html: string }
  | { ok: false; permanent: boolean; errorCode: string }

/**
 * Render the printable record for one case.
 *
 * A failure here is transient by assumption: the web container restarting, or
 * not up yet after an update. The message stays queued and the backoff decides
 * when to try again — a protocol that arrives late is a great deal better than
 * one dropped because a container was cycling.
 */
export async function renderPrintableRecord(
  input: {
    caseId: string
    deliveryId: string
    lang?: "en" | "bg"
    timeoutMs?: number
    fetchImpl?: typeof fetch
    baseUrl?: string
  },
): Promise<PrintableRecordResult> {
  const base = (input.baseUrl ?? INTERNAL_WEB_URL).replace(/\/$/, "")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000)

  try {
    const token = await adapterPrintToken(input.caseId, input.deliveryId)
    const query = new URLSearchParams({ print_token: token })
    if (input.lang) query.set("lang", input.lang)

    const send = input.fetchImpl ?? fetch
    const response = await send(
      `${base}/cases/${encodeURIComponent(input.caseId)}/print?${query.toString()}`,
      { signal: controller.signal },
    )

    if (!response.ok) {
      // A 404 means the case is gone; nothing will bring it back.
      return {
        ok: false,
        permanent: response.status === 404,
        errorCode: `PRINT_HTTP_${response.status}`,
      }
    }

    const html = await response.text()
    if (!html.trim()) {
      return { ok: false, permanent: false, errorCode: "PRINT_EMPTY" }
    }
    return { ok: true, html }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return {
      ok: false,
      permanent: false,
      errorCode: aborted ? "PRINT_TIMEOUT" : "PRINT_UNREACHABLE",
    }
  } finally {
    clearTimeout(timer)
  }
}
