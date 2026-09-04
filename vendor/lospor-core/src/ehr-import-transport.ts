import type { EhrReviewPlan } from "./ehr-import-review"

/**
 * Talking to the import route, for whichever front end is asking.
 *
 * Named transport rather than client because "client" already means the web,
 * mobile and PWA apps in this codebase, and this is the HTTP layer beneath all
 * three of them.
 *
 * Every other decision in this feature is already made once and shared — what
 * a hospital may propose, which items are pre-selected, how an accepted value
 * is applied. The two clients were the exception: each had its own copy of the
 * request, the response reading and the ordering, differing only in which
 * fetch function it passed. That is how the two ends of a clinical feature
 * drift, and the drift is invisible until one client reads a refusal the other
 * treats as an empty answer.
 *
 * So the fetcher is a parameter and everything above it lives here. The web app
 * passes `fetch`; the mobile and PWA build passes their authenticated wrapper.
 * Neither decides what a 409 means.
 */

export type EhrImportOffer = {
  importId: string
  maskedIdentifier: string
  receivedAt: string
  plan: EhrReviewPlan
}

export type EhrImportLookup =
  /** The hospital holds something, and none of it is in the record yet. */
  | { status: "offer"; offer: EhrImportOffer }
  /** The server answered, and there is nothing for this patient. */
  | { status: "none" }
  /**
   * The record number matched more than one patient.
   *
   * Its own state rather than a flavour of "unavailable", because it is the one
   * outcome the clinician can act on: the number is wrong, or it needs the
   * other identifier. Collapsing it into a generic failure would send somebody
   * to check the network when they should be checking the number.
   */
  | { status: "ambiguous" }
  /** Offline, unreachable, or refused. Manual entry is unaffected. */
  | { status: "unavailable"; code?: string }

/**
 * Whatever each client uses to reach its own API.
 *
 * Typed structurally rather than as the DOM `fetch`: Core carries no DOM
 * assumptions, and the two shapes below are all this module actually touches.
 * A real `fetch`, and each client wrapper around one, satisfies them.
 */
export type EhrResponse = { status: number; json: () => Promise<unknown> }
export type EhrRequestInit = { method?: string; headers?: Record<string, string>; body?: string }
export type EhrFetcher = (path: string, init?: EhrRequestInit) => Promise<EhrResponse>

export function ehrImportPath(caseId: string, query?: Record<string, string>): string {
  const base = `/api/cases/${encodeURIComponent(caseId)}/ehr-import`
  if (!query) return base
  // Built by hand rather than with URLSearchParams, which Core cannot assume
  // exists any more than it can assume `fetch`.
  const search = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
  return `${base}?${search}`
}

/**
 * Turn a response into the one shape both clients render from.
 *
 * Separated from the request so it can be tested without a network, and so the
 * status classification is stated once: 409 with PATIENT_AMBIGUOUS is a
 * clinical answer, every other non-2xx is a failure, and a 200 carrying
 * `pending: false` is the hospital saying it has nothing.
 */
export function readEhrImportResponse(
  status: number,
  body: Record<string, unknown> | null,
): EhrImportLookup {
  const code = typeof body?.code === "string" ? body.code : undefined

  if (status === 409) {
    return code === "PATIENT_AMBIGUOUS" ? { status: "ambiguous" } : { status: "unavailable", code }
  }
  if (status < 200 || status >= 300) return { status: "unavailable", code }
  if (!body?.pending) return { status: "none" }

  return {
    status: "offer",
    offer: {
      importId: String(body.importId ?? ""),
      maskedIdentifier: String(body.maskedIdentifier ?? ""),
      receivedAt: String(body.receivedAt ?? ""),
      plan: body.plan as EhrReviewPlan,
    },
  }
}

/**
 * Ask the hospital system what it holds for this patient.
 *
 * The record number goes into the query of one request and is gone. It never
 * reaches local storage, a draft, an error message or a log — which is why it
 * is a parameter here rather than something this module reads from a form.
 */
export async function lookupEhrImport(
  fetcher: EhrFetcher,
  input: { caseId: string; identifier: string; identifierType?: "IZ" | "EGN" },
): Promise<EhrImportLookup> {
  const identifier = input.identifier.trim()
  if (!input.caseId || !identifier) return { status: "none" }

  let response: EhrResponse
  try {
    response = await fetcher(ehrImportPath(input.caseId, {
      identifier,
      identifierType: input.identifierType ?? "IZ",
    }))
  } catch {
    // Offline, or the appliance is unreachable. Not an error worth a dialog:
    // manual entry is the path that always works and is already on screen.
    return { status: "unavailable" }
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  return readEhrImportResponse(response.status, body)
}

/**
 * Record what the clinician decided.
 *
 * Called **after** the accepted values have been written through the ordinary
 * case save, never before. A failure between the two leaves the import pending
 * and self-corrects, because a value already in the case comes back
 * `unchanged`; recording first would mark an item decided that never reached
 * the record.
 *
 * That ordering is the reason this function lives here rather than in each
 * client: it is a rule about clinical safety, not about rendering, and a client
 * that got it backwards would silently lose a proposal.
 */
export async function recordEhrDecisions(
  fetcher: EhrFetcher,
  input: {
    caseId: string
    importId: string
    acceptedKeys?: string[]
    declinedKeys?: string[]
  },
): Promise<void> {
  await fetcher(ehrImportPath(input.caseId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importId: input.importId,
      acceptedKeys: input.acceptedKeys ?? [],
      declinedKeys: input.declinedKeys ?? [],
    }),
  }).catch(() => undefined)
}
