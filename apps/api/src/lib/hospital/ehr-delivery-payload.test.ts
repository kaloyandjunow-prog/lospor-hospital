import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  encryptPatientIdentifier,
  patientIdentifierHash,
} from "./patient-identity"
import {
  buildEhrDeliveryPayload,
  type EhrDeliveryPayloadClient,
} from "./ehr-delivery-payload"

process.env.HOSPITAL_PATIENT_HMAC_KEY ??= Buffer.alloc(32, 1).toString("base64")
process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY ??= Buffer.alloc(32, 2).toString("base64")

/**
 * What actually leaves for one queued message.
 *
 * The two properties worth holding: it describes the version that was attested
 * to rather than the case as it stands now, and it never leaves without the
 * record number the hospital files it against.
 */

const INSTITUTION = "inst-1"
const RECORD_NUMBER = "42"

function link() {
  const identifierHash = patientIdentifierHash(INSTITUTION, RECORD_NUMBER, {
    identifierType: "IZ", identifierYear: 2026, hashVersion: 2,
  })
  const encrypted = encryptPatientIdentifier(RECORD_NUMBER, {
    institutionId: INSTITUTION, identifierHash,
  })
  return {
    identifierType: "IZ",
    identifierCiphertext: encrypted.ciphertext,
    identifierNonce: encrypted.nonce,
    identifierAuthTag: encrypted.authTag,
    identifierHash,
    institutionId: INSTITUTION,
    keyVersion: 2,
  }
}

function client(input: {
  kind?: string
  snapshot?: unknown
  snapshotDocument?: string
  patientLink?: unknown
} = {}) {
  const snapshotDocument = input.snapshotDocument ?? JSON.stringify(input.snapshot ?? {
    intraop: { bloodLossMl: 250, urineMl: 400, startedAt: "2026-09-02T07:30:00.000Z" },
    postop: { aldreteTotal: 10, disposition: "WARD" },
  })
  return {
    ehrDelivery: {
      findFirst: vi.fn(async () => ({
        id: "d-1", kind: input.kind ?? "PROTOCOL", caseId: "case-1",
        finalizationId: "fin-1", sequence: 1,
      })),
    },
    caseFinalization: {
      findFirst: vi.fn(async () => ({
        id: "fin-1", sequence: 1,
        finalizedAt: new Date("2026-09-02T10:00:00.000Z"),
        snapshotDocument,
        supersedesFinalizationId: null,
      })),
    },
    case: {
      findFirst: vi.fn(async () => ({
        patientLink: "patientLink" in input ? input.patientLink : link(),
      })),
    },
  } as never as EhrDeliveryPayloadClient
}

describe("the message describes the version that was attested to", () => {
  it("reads the finalization snapshot, not the live record", async () => {
    // A case can be unfinalized and corrected after a message is queued.
    // Reading the live tables would send a version nobody signed, while the
    // appliance's own hashed evidence said something else.
    const payload = await buildEhrDeliveryPayload(client(), { deliveryId: "d-1" })
    const header = payload?.header as { fluids: { bloodLoss: unknown } }

    expect(header.fluids.bloodLoss).toEqual({ recorded: true, value: 250, unit: "mL" })
  })

  it("carries which finalization it is, so a correction supersedes cleanly", async () => {
    const payload = await buildEhrDeliveryPayload(client(), { deliveryId: "d-1" })
    const header = payload?.header as { finalization: { sequence: number } }

    expect(header.finalization.sequence).toBe(1)
  })

  it("refuses to send when the snapshot cannot be read", async () => {
    // A corrupted attestation. Whatever the hospital received would not be the
    // document the hash attests to, so nothing is sent.
    vi.spyOn(console, "error").mockImplementation(() => {})
    const payload = await buildEhrDeliveryPayload(
      client({ snapshotDocument: "{not json" }), { deliveryId: "d-1" },
    )

    expect(payload).toBeNull()
  })

  it("keeps not-recorded out of the header as not-recorded", async () => {
    const payload = await buildEhrDeliveryPayload(
      client({ snapshot: { intraop: {}, postop: {} } }), { deliveryId: "d-1" },
    )
    const header = payload?.header as { fluids: { bloodLoss: unknown } }

    expect(header.fluids.bloodLoss).toEqual({ recorded: false, unit: "mL" })
  })
})

describe("the record number the hospital files it against", () => {
  it("recovers it from the stored ciphertext", async () => {
    // A hash is enough to find a patient again; it is not enough to tell a
    // hospital system which of its own records to file a protocol against.
    // That is why PatientLink stores an encrypted identifier and not only a
    // digest.
    const payload = await buildEhrDeliveryPayload(client(), { deliveryId: "d-1" })

    expect(payload?.patient).toEqual({ identifierType: "IZ", identifier: RECORD_NUMBER })
  })

  it("reports none rather than throwing when a case has no link", async () => {
    const payload = await buildEhrDeliveryPayload(
      client({ patientLink: null }), { deliveryId: "d-1" },
    )

    expect(payload?.patient).toBeNull()
  })

  it("survives an identifier that cannot be decrypted", async () => {
    // One unreadable case must not stop the queue.
    vi.spyOn(console, "error").mockImplementation(() => {})
    const broken = { ...link(), identifierAuthTag: Buffer.alloc(16, 9).toString("base64") }

    const payload = await buildEhrDeliveryPayload(
      client({ patientLink: broken }), { deliveryId: "d-1" },
    )

    expect(payload?.patient).toBeNull()
    expect(payload).not.toBeNull()
  })
})

describe("a safety message carries the findings, not the whole record", () => {
  it("sends the airway finding and nothing else", async () => {
    const payload = await buildEhrDeliveryPayload(client({
      kind: "SAFETY_FINDINGS",
      snapshot: { preop: { mallampati: "I" }, intraop: { cormackLehane: "IV" } },
    }), { deliveryId: "d-1" })
    const header = payload?.header as { findings: { kind: string; anticipated: boolean }[] }

    expect(header.findings).toHaveLength(1)
    expect(header.findings[0]).toMatchObject({ kind: "airway", anticipated: false })
  })

  it("does not read a snapshot for a start signal, because there is none", async () => {
    const db = client({ kind: "CASE_START" })
    const payload = await buildEhrDeliveryPayload(db, { deliveryId: "d-1" })

    expect(payload?.kind).toBe("CASE_START")
    expect(db.caseFinalization.findFirst).not.toHaveBeenCalled()
  })
})
