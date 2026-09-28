import { beforeAll, describe, expect, it } from "vitest"
import {
  hasOfflineVocabulary,
  offlineVocabularyVersion,
  searchOfflineVocabulary,
} from "./offline-vocabulary"

// The first lookup dynamically imports and evaluates the real generated ICD-10
// module (39,613 rows; roughly 12 MB of TypeScript). On a busy release runner
// that cold load can legitimately exceed Vitest's 5-second per-test default,
// even though subsequent searches take milliseconds. Warm it once under an
// explicit boundary so functional assertions are not coupled to worker load.
beforeAll(async () => {
  await offlineVocabularyVersion()
}, 30_000)

describe("offline clinical vocabulary", () => {
  it("covers diagnoses, procedures and home medications", () => {
    expect(hasOfflineVocabulary("icd10")).toBe(true)
    expect(hasOfflineVocabulary("procedure")).toBe(true)
    expect(hasOfflineVocabulary("medication")).toBe(true)
  })

  it("finds a home medication with no network, as the server would (9.13.3)", async () => {
    // The server and the phone search Core's one medication list with Core's
    // one search: the same query gives the same products in the same order.
    const outcome = await searchOfflineVocabulary("medication", "ramipril", "en")
    expect(outcome?.source).toBe("offline")
    expect(outcome?.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const { searchMedications } = await import("@lospor/core/medications")
    const { medicationRows } = await import("@lospor/core/vocabulary/medications")
    const server = searchMedications(medicationRows(), "ramipril")
    expect(outcome?.results.map(tag => tag.sub ?? tag.label)).toEqual(server.map(row => row.name))
    expect(outcome?.results.every(tag => tag.atcCode === "C09AA05" || tag.atcCode?.startsWith("C09"))).toBe(true)
    expect(outcome?.results[0]).toMatchObject({ inn: expect.stringMatching(/ramipril/i), vocabularyVersion: outcome?.version })
  })

  it("finds a diagnosis with no network, in both languages", async () => {
    const en = await searchOfflineVocabulary("icd10", "diabetes", "en")
    expect(en?.results.length).toBeGreaterThan(0)
    const bg = await searchOfflineVocabulary("icd10", "диабет", "bg")
    expect(bg?.results.length).toBeGreaterThan(0)
  })

  it("finds a procedure with no network", async () => {
    const found = await searchOfflineVocabulary("procedure", "cholecystectomy", "en")
    expect(found?.results.map(r => r.label)).toContain("Cholecystectomy")
  })

  /**
   * The tag shape is the contract with the save path: it flows through
   * preop-payload into PreopDiagnosis rows. If an offline pick were shaped
   * differently it would persist differently, which is exactly the silent
   * divergence this whole change exists to avoid.
   */
  it("produces tags shaped like the network path's", async () => {
    const offline = await searchOfflineVocabulary("icd10", "I21", "bg")
    const [tag] = offline?.results ?? []
    expect(tag).toBeDefined()
    expect(tag).toMatchObject({
      code: expect.any(String),
      label: expect.any(String),
      sub: expect.any(String),
      system: "ICD-10",
      labelEn: expect.any(String),
    })
  })

  it("reports which copy answered, and its version", async () => {
    const found = await searchOfflineVocabulary("icd10", "asthma", "en")
    expect(found?.source).toBe("offline")
    expect(found?.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(await offlineVocabularyVersion()).toBe(found?.version)
  })

  it("returns nothing below the minimum query length rather than everything", async () => {
    expect((await searchOfflineVocabulary("icd10", "I", "en"))?.results).toEqual([])
    expect((await searchOfflineVocabulary("procedure", "ch", "en"))?.results).toEqual([])
  })
})

describe("offline provenance reaches the saved payload", () => {
  it("keeps vocabularyVersion on the diagnoses sent to the server", async () => {
    const { buildPreopPayload } = await import("./preop-payload")
    const offline = await searchOfflineVocabulary("icd10", "I21", "bg")
    const tag = offline!.results[0]!

    const payload = buildPreopPayload({ diagnoses: [tag] } as never) as {
      diagnoses?: { vocabularyVersion?: string }[]
    }

    // If this drops, every offline-coded case becomes untraceable — and because
    // PreopDiagnosis.code has no foreign key, a stale code is stored silently
    // rather than rejected. The API's item schema is .passthrough(), so the
    // field survives into diagnosesJson with no migration.
    expect(payload.diagnoses?.[0]?.vocabularyVersion).toBe(offline!.version)
  })
})
