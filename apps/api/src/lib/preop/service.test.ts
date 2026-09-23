import { describe, expect, it, vi } from "vitest"
import { PreopAnswerState, PreopProfileStatus } from "@/generated/prisma/client"
import { BUNDLED_PREOP_QUESTIONS } from "./catalog"
import {
  pinPreopProfile,
  PreopContractError,
  publishPreopProfile,
  savePreopAnswers,
  type PreopDb,
} from "./service"
import { reviewPreopSuggestion } from "./suggestions"

type TestQuestion = {
  key: string
  applicability?: string[]
  required?: boolean
}

type TestProfile = {
  id: string
  version: number
  catalogVersion: string
  status: PreopProfileStatus
  publishedAt: Date
  questions: Array<{
    questionId: string
    enabled: boolean
    required: boolean
    sortOrder: number
    question: {
      stableKey: string
      labelEn: string
      labelBg: string
      answerType: string
      applicability: string[]
      allowUnknown: boolean
      allowNotApplicable: boolean
      conditionalRuleKey: string | null
      omopDomain: string | null
      omopConceptId: number | null
      omopSourceCode: string | null
      options: Array<{
        key: string
        labelEn: string
        labelBg: string
        omopConceptId: number | null
        omopVocabulary: string | null
        omopSourceCode: string | null
      }>
    }
  }>
}

function testProfile(version: number, questions: TestQuestion[]): TestProfile {
  return {
    id: `profile-${version}`,
    version,
    catalogVersion: "1.4.7",
    status: PreopProfileStatus.PUBLISHED,
    publishedAt: new Date("2026-09-23T00:00:00Z"),
    questions: questions.map((item, sortOrder) => ({
      questionId: `question-${item.key}`,
      enabled: true,
      required: item.required ?? false,
      sortOrder,
      question: {
        stableKey: item.key,
        labelEn: item.key,
        labelBg: item.key,
        answerType: "CHOICE",
        applicability: item.applicability ?? [],
        allowUnknown: false,
        allowNotApplicable: false,
        conditionalRuleKey: null,
        omopDomain: null,
        omopConceptId: null,
        omopSourceCode: null,
        options: [
          { key: "YES", labelEn: "Yes", labelBg: "Да", omopConceptId: 4188539, omopVocabulary: "SNOMED", omopSourceCode: null },
          { key: "NO", labelEn: "No", labelBg: "Не", omopConceptId: 4188540, omopVocabulary: "SNOMED", omopSourceCode: null },
        ],
      },
    })),
  }
}

function catalogRows() {
  return new Map(BUNDLED_PREOP_QUESTIONS.map(item => [
    item.stableKey,
    {
      stableKey: item.stableKey,
      catalogVersion: item.catalogVersion,
      section: item.section,
      applicability: item.applicability,
      answerType: item.answerType,
      labelEn: item.labelEn,
      labelBg: item.labelBg,
      requiredDefault: item.requiredDefault,
      allowUnknown: item.allowUnknown,
      allowNotApplicable: item.allowNotApplicable,
      conditionalRuleKey: item.conditionalRuleKey ?? null,
      omopDomain: item.omopDomain ?? null,
      omopConceptId: item.omopConceptId ?? null,
      omopVocabulary: item.omopVocabulary ?? null,
      omopSourceCode: item.omopSourceCode ?? null,
      options: item.options.map((option, sortOrder) => ({
        ...option,
        omopConceptId: option.omopConceptId ?? null,
        omopVocabulary: option.omopVocabulary ?? null,
        omopSourceCode: option.omopSourceCode ?? null,
        sortOrder,
      })),
    },
  ]))
}

describe("preoperative profile and answer persistence", () => {
  it("pins the active version and requires explicit adoption for a newer one", async () => {
    let active = testProfile(1, [{ key: "BASE_ALLERGIES" }])
    let pinState: { profileId: string; profileVersion: number } | null = null
    const db = {
      preopCaseProfilePin: {
        findUnique: vi.fn(async () => pinState),
        create: vi.fn(async () => {
          pinState = { profileId: active.id, profileVersion: active.version }
          return pinState
        }),
        update: vi.fn(async ({ data }: { data: { profileId: string; profileVersion: number } }) => {
          pinState = { profileId: data.profileId, profileVersion: data.profileVersion }
          return pinState
        }),
      },
      preopAssessmentProfile: {
        findFirst: vi.fn(async () => active),
        findUnique: vi.fn(async () => active),
      },
      preopAssessmentAuditEvent: { create: vi.fn(async () => ({})) },
    } as unknown as PreopDb

    const first = await pinPreopProfile(db, "case-1", "clinician-1")
    expect(first.profile.version).toBe(1)

    active = testProfile(2, [{ key: "BASE_ALLERGIES" }])
    await expect(pinPreopProfile(db, "case-1", "clinician-1", 2)).rejects.toMatchObject({
      code: "PREOP_PROFILE_CHANGE_REQUIRES_EXPLICIT_ADOPTION",
    })

    const adopted = await pinPreopProfile(db, "case-1", "clinician-1", 2, true)
    expect(adopted.profile.version).toBe(2)
    expect((pinState as { profileVersion: number } | null)?.profileVersion).toBe(2)
    expect(db.preopAssessmentAuditEvent.create).toHaveBeenCalledTimes(2)
  })

  it("clears the other population and writes optional omissions as NOT_ASKED", async () => {
    const profile = testProfile(1, [
      { key: "BASE_ALLERGIES", required: true },
      { key: "A2_REDUCED_EXERCISE_TOLERANCE", applicability: ["ADULT"] },
      { key: "P1_PREMATURITY_NICU", applicability: ["PEDIATRIC"] },
    ])
    const deleted: unknown[] = []
    const writes: Array<Record<string, unknown>> = []
    const db = {
      preopCaseProfilePin: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ profileId: profile.id, profileVersion: profile.version })),
      },
      preopAssessmentProfile: { findFirst: vi.fn(async () => profile) },
      preopAssessmentAuditEvent: { create: vi.fn(async () => ({})) },
      preopAssessmentAnswer: {
        deleteMany: vi.fn(async ({ where }: { where: unknown }) => { deleted.push(where); return { count: 1 } }),
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => { writes.push(create); return create }),
      },
    } as unknown as PreopDb

    await savePreopAnswers(db, {
      caseId: "case-1",
      preopId: "preop-1",
      actorId: "clinician-1",
      preop: { clinicalMode: "PEDIATRIC" },
      answers: [{ stableKey: "BASE_ALLERGIES", state: PreopAnswerState.YES, optionKey: "YES" }],
    })

    expect(deleted).toContainEqual({ preopId: "preop-1", questionId: { in: ["question-A2_REDUCED_EXERCISE_TOLERANCE"] } })
    expect(writes).toHaveLength(3)
    expect(writes.find(row => row.questionId === "question-P1_PREMATURITY_NICU")).toMatchObject({
      state: PreopAnswerState.NOT_ASKED,
      source: "schema",
    })

    await expect(savePreopAnswers(db, {
      caseId: "case-1",
      preopId: "preop-1",
      actorId: "clinician-1",
      preop: { clinicalMode: "PEDIATRIC" },
      answers: [],
    })).rejects.toMatchObject({ code: "REQUIRED_PREOP_QUESTION_UNANSWERED" })
  })

  it("creates a new immutable published version and retires the prior one", async () => {
    let active: TestProfile | null = null
    const created: TestProfile[] = []
    const rows = catalogRows()
    const db = {
      preopQuestionDefinition: {
        findUnique: vi.fn(async ({ where }: { where: { stableKey: string } }) => rows.get(where.stableKey)),
        create: vi.fn(async () => ({})),
      },
      preopAssessmentProfile: {
        findFirst: vi.fn(async ({ select }: { select?: { version: boolean } } = {}) => select ? (active ? { version: active.version } : null) : active),
        updateMany: vi.fn(async () => {
          if (active) active.status = PreopProfileStatus.RETIRED
          return { count: active ? 1 : 0 }
        }),
        create: vi.fn(async ({ data }: { data: { version: number; questions: { create: Array<{ question: { connect: { stableKey: string } }; enabled: boolean; required: boolean; sortOrder: number }> } } }) => {
          active = testProfile(data.version, data.questions.create.map(row => ({
            key: row.question.connect.stableKey,
            required: row.required,
          })))
          active.questions.forEach((row, index) => {
            row.enabled = data.questions.create[index]?.enabled ?? true
            row.sortOrder = data.questions.create[index]?.sortOrder ?? index
          })
          created.push(active)
          return active
        }),
      },
    } as unknown as PreopDb

    const requested = [{ stableKey: "BASE_ALLERGIES", enabled: true, required: false, sortOrder: 0 }]
    const first = await publishPreopProfile(db, "admin-1", requested)
    const second = await publishPreopProfile(db, "admin-1", requested)

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect(created).toHaveLength(2)
    expect(created[0]?.status).toBe(PreopProfileStatus.RETIRED)
    expect(created[1]?.status).toBe(PreopProfileStatus.PUBLISHED)
  })

  it("rejects unknown, duplicate, and disabled-required profile questions", async () => {
    const rows = catalogRows()
    const db = {
      preopQuestionDefinition: {
        findUnique: vi.fn(async ({ where }: { where: { stableKey: string } }) => rows.get(where.stableKey)),
        create: vi.fn(async () => ({})),
      },
      preopAssessmentProfile: { findFirst: vi.fn(async () => null), create: vi.fn() },
    } as unknown as PreopDb

    for (const requested of [
      [{ stableKey: "NOT_IN_CATALOG", enabled: true, required: false, sortOrder: 0 }],
      [
        { stableKey: "BASE_ALLERGIES", enabled: true, required: false, sortOrder: 0 },
        { stableKey: "BASE_ALLERGIES", enabled: true, required: false, sortOrder: 1 },
      ],
      [{ stableKey: "BASE_ALLERGIES", enabled: false, required: true, sortOrder: 0 }],
    ]) {
      await expect(publishPreopProfile(db, "admin-1", requested)).rejects.toBeInstanceOf(PreopContractError)
    }
  })
})

describe("preoperative suggestion review persistence", () => {
  const suggestion = {
    id: "suggestion-1",
    preopId: "preop-1",
    questionId: "question-A3_UNINTENTIONAL_WEIGHT_LOSS",
    profileVersion: 1,
    proposedState: PreopAnswerState.YES,
    proposedOptionKey: null,
    proposedValueText: null,
    proposedValueNumber: null,
    ruleId: "DIAGNOSIS_WEIGHT_LOSS",
    ruleVersion: "1.4.7.1",
    linkedDiagnosisId: "diagnosis-1",
    preop: { caseId: "case-1" },
    question: {},
  }

  it("accepts a suggestion into a suggestion-sourced answer with diagnosis provenance", async () => {
    const answerWrites: Array<Record<string, unknown>> = []
    const db = {
      preopAssessmentSuggestion: {
        findUnique: vi.fn(async () => suggestion),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...suggestion, ...data })),
      },
      preopAssessmentAnswer: {
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => { answerWrites.push(create); return create }),
      },
      preopCaseProfilePin: { findUnique: vi.fn(async () => ({ profileId: "profile-1" })) },
    } as unknown as PreopDb

    const result = await reviewPreopSuggestion(db, { caseId: "case-1", suggestionId: "suggestion-1", reviewerId: "clinician-1", status: "ACCEPTED" })

    expect(result.status).toBe("ACCEPTED")
    expect(answerWrites[0]).toMatchObject({ source: "suggestion", state: PreopAnswerState.YES })
    expect(answerWrites[0]?.provenance).toMatchObject({ linkedDiagnosisId: "diagnosis-1", suggestionId: "suggestion-1" })
  })

  it("lets a clinician answer win and rejecting does not create a NO answer", async () => {
    const upsert = vi.fn()
    const findFirst = vi.fn<() => Promise<{ source: string } | null>>(async () => ({ source: "clinician" }))
    const db = {
      preopAssessmentSuggestion: {
        findUnique: vi.fn(async () => suggestion),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...suggestion, ...data })),
      },
      preopAssessmentAnswer: { findFirst, upsert },
      preopCaseProfilePin: { findUnique: vi.fn(async () => ({ profileId: "profile-1" })) },
    } as unknown as PreopDb

    await reviewPreopSuggestion(db, { caseId: "case-1", suggestionId: "suggestion-1", reviewerId: "clinician-1", status: "ACCEPTED" })
    expect(upsert).not.toHaveBeenCalled()

    findFirst.mockResolvedValue(null)
    await reviewPreopSuggestion(db, { caseId: "case-1", suggestionId: "suggestion-1", reviewerId: "clinician-1", status: "REJECTED" })
    expect(upsert).not.toHaveBeenCalled()
  })
})
