import "server-only"

/**
 * The FHIR transport.
 *
 * Unlike folder drop, this reaches out of the appliance. It needs no new
 * container and no new network — the API is already on `application`, which is
 * how Central delivery reaches Central — but it does need a new *destination*
 * on a box whose entire posture is "cannot phone anywhere except Central". That
 * is a firewall change the hospital's security people will review, which is why
 * the endpoint is stored in the clear: the first question anyone asks about an
 * integration is which server it talks to, and answering it should not require
 * the seal key.
 *
 * What this module does not do is decide *whether* to retry. It reports what
 * happened and the queue decides, because the same 502 means "try later" from a
 * proxy and "this will never work" from a misconfigured route, and only the
 * attempt history can tell them apart.
 */

export type FhirSendOutcome =
  | { ok: true; status: number; location?: string }
  /** Retrying will fail identically: the message or the configuration is wrong. */
  | { ok: false; permanent: true; status?: number; errorCode: string }
  /** Worth trying again: the far side is unreachable or busy. */
  | { ok: false; permanent: false; status?: number; errorCode: string }

/**
 * Which failures are worth repeating.
 *
 * 4xx means the far side understood and refused — a malformed resource, an
 * unknown patient, a scope the credential does not have. Repeating that is
 * noise, and on a clinical interface engine repeated rejects raise alerts that
 * make somebody switch the integration off.
 *
 * The exceptions earn their place: 408 and 429 are explicitly "not now", and
 * 401/403 can be a credential that has just been rotated on their side rather
 * than one that is wrong, so they get the backoff rather than a permanent stop.
 */
export function classifyFhirStatus(status: number): { permanent: boolean; errorCode: string } {
  if (status >= 200 && status < 300) return { permanent: false, errorCode: "" }
  if (status === 408 || status === 429) return { permanent: false, errorCode: `HTTP_${status}` }
  if (status === 401 || status === 403) return { permanent: false, errorCode: `HTTP_${status}` }
  if (status >= 400 && status < 500) return { permanent: true, errorCode: `HTTP_${status}` }
  return { permanent: false, errorCode: `HTTP_${status}` }
}

/**
 * A DocumentReference carrying the printable record.
 *
 * The protocol goes as a document because that is what a hospital files, and
 * the coded header travels beside it rather than inside it — the same split the
 * folder transport makes, for the same reason: a site that only files documents
 * should not have to parse anything, and one that only parses structure should
 * not have to open the HTML.
 */
export function documentReferenceFor(input: {
  patient: { identifierType: string; identifier: string }
  contentHtml: string
  createdAt: string
  title: string
}): Record<string, unknown> {
  return {
    resourceType: "DocumentReference",
    status: "current",
    // "Anaesthesia record" in LOINC. Sites that do not recognise it still get
    // the title and the attachment.
    type: {
      coding: [{ system: "http://loinc.org", code: "34122-2", display: "Anesthesia records" }],
      text: input.title,
    },
    subject: {
      identifier: {
        system: input.patient.identifierType === "EGN"
          ? "urn:oid:1.3.6.1.4.1.55897.1.2"
          : "urn:oid:1.3.6.1.4.1.55897.1.1",
        value: input.patient.identifier,
      },
    },
    date: input.createdAt,
    content: [{
      attachment: {
        contentType: "text/html",
        // Base64 rather than a URL: a hospital system reading this may have no
        // route back to the appliance, and a document that cannot be fetched is
        // not a document.
        data: Buffer.from(input.contentHtml, "utf8").toString("base64"),
        title: input.title,
      },
    }],
  }
}

export type FhirClientOptions = {
  endpoint: string
  /** Opened from the sealed credential immediately before egress. */
  credential: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * POST one resource.
 *
 * The credential is passed in already opened, and never logged. Response bodies
 * are never logged either: a FHIR server's error can quote the resource back,
 * and the resource is the patient's record.
 */
export async function postFhirResource(
  resource: Record<string, unknown>,
  options: FhirClientOptions,
): Promise<FhirSendOutcome> {
  const base = options.endpoint.replace(/\/$/, "")
  const type = String(resource.resourceType ?? "")
  if (!type) return { ok: false, permanent: true, errorCode: "RESOURCE_TYPE_MISSING" }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)

  try {
    const send = options.fetchImpl ?? fetch
    const response = await send(`${base}/${type}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
        Accept: "application/fhir+json",
        Authorization: `Bearer ${options.credential}`,
      },
      body: JSON.stringify(resource),
      signal: controller.signal,
    })

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        location: response.headers.get("location") ?? undefined,
      }
    }
    const { permanent, errorCode } = classifyFhirStatus(response.status)
    return { ok: false, permanent, status: response.status, errorCode }
  } catch (error) {
    // A timeout, a DNS failure, a refused connection, a certificate the
    // appliance does not trust. All transient by assumption: a hospital's
    // internal CA being installed later is a normal course of events.
    const aborted = error instanceof Error && error.name === "AbortError"
    return {
      ok: false,
      permanent: false,
      errorCode: aborted ? "TIMEOUT" : "UNREACHABLE",
    }
  } finally {
    clearTimeout(timer)
  }
}
