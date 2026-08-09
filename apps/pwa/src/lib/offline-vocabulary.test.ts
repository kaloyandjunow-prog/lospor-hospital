import { describe, expect, it } from "vitest"
import {
  hasOfflineVocabulary,
  offlineVocabularyVersion,
  searchOfflineVocabulary,
} from "./offline-vocabulary"

describe("offline clinical vocabulary", () => {
  it("covers diagnoses and procedures but not medications", async () => {
    expect(hasOfflineVocabulary("icd10")).toBe(true)
    expect(hasOfflineVocabulary("procedure")).toBe(true)
    // The intraop option library already ships a drug fallback; a second one
    // here would be a second drug list that can disagree with it.
    expect(hasOfflineVocabulary("medication")).toBe(false)
    expect(await searchOfflineVocabulary("medication", "propofol", "en")).toBeNull()
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
