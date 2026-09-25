import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, request, test, type APIRequestContext, type BrowserContext } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"

const PREOP = {
  ageYears: 44,
  sex: "MALE" as const,
  heightCm: 180,
  weightKg: 82,
  diagnoses: [{ label: "Laparoscopic cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
}

type Suggestion = {
  id: string
  status: string
  proposedState: string
  stableKey?: string
  ruleId: string
  ruleVersion: string
  linkedDiagnosisId?: string | null
  evidence?: Record<string, unknown>
}

type Answer = {
  state?: string
  source?: string
  provenance?: Record<string, unknown> | null
  question?: { stableKey?: string }
}

type ProfileQuestion = {
  stableKey: string
  enabled: boolean
  required: boolean
  sortOrder: number
}

type Profile = {
  questions: ProfileQuestion[]
}

async function createCase(context: BrowserContext, suffix: string, diagnosis = "Laparoscopic cholelithiasis") {
  const response = await context.request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      patientNumber: "PREOP-RELATIONAL-" + suffix + "-" + Date.now(),
      preop: { ...PREOP, diagnoses: [{ label: diagnosis }] },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json() as { id: string }).id
}

async function deleteCase(context: BrowserContext, caseId: string) {
  await context.request.delete("/api/cases/" + caseId, { headers: JSON_HEADERS }).catch(() => {})
}

async function readPreop(api: APIRequestContext, caseId: string) {
  const response = await api.get("/api/cases/" + caseId)
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json() as { preop?: Record<string, unknown> }).preop ?? {}
}

function answerFor(preop: Record<string, unknown>, stableKey: string): Answer | undefined {
  const answers = Array.isArray(preop.assessmentAnswers)
    ? preop.assessmentAnswers as Answer[]
    : []
  return answers.find(answer => answer.question?.stableKey === stableKey)
}

async function waitForSuggestion(
  api: APIRequestContext,
  caseId: string,
  stableKey: string,
): Promise<Suggestion> {
  let found: Suggestion | undefined
  await expect.poll(async () => {
    const response = await api.post("/api/cases/" + caseId + "/preop-suggestions", {
      headers: JSON_HEADERS,
    })
    if (!response.ok()) return null
    const body = await response.json() as { suggestions?: Suggestion[] }
    found = body.suggestions?.find(item => item.stableKey === stableKey)
      ?? body.suggestions?.find(item => item.ruleId === "DX_SMOKING")
    return found ?? null
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).not.toBeNull()
  if (!found) throw new Error("Expected preoperative suggestion was not generated")
  return found
}

/**
 * Changes the appliance profile the way Status does: through the internal
 * control plane, with the Status account-control token the E2E API is started
 * with. Clinicians and the public API cannot write the profile.
 */
async function saveProfile(questions: ProfileQuestion[]) {
  const token = readFileSync(path.join(__dirname, "fixtures", "status-account-control-token"), "utf8").trim()
  const control = await request.newContext({ baseURL: process.env.E2E_API_BASE })
  try {
    const response = await control.post("/v1/internal/hospital/control-plane/preop-profile", {
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      data: { questions, reason: "E2E: switch preoperative questions on and off" },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    return await response.json() as Profile
  } finally {
    await control.dispose()
  }
}

async function readProfile(api: APIRequestContext) {
  const response = await api.get("/api/preop/profile")
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as Profile
}

function withEnabled(profile: Profile, keys: string[], enabled: boolean): ProfileQuestion[] {
  return profile.questions.map(({ stableKey, enabled: current, required, sortOrder }) => ({
    stableKey,
    enabled: keys.includes(stableKey) ? enabled : current,
    required: keys.includes(stableKey) && !enabled ? false : required,
    sortOrder,
  }))
}

function asSaved(profile: Profile): ProfileQuestion[] {
  return profile.questions.map(({ stableKey, enabled, required, sortOrder }) => ({ stableKey, enabled, required, sortOrder }))
}

const A2 = "A2_REDUCED_EXERCISE_TOLERANCE"
const A3 = "A3_UNINTENTIONAL_WEIGHT_LOSS"

test.describe("relational preoperative assessment E2E", () => {
  test("accepted suggestions create provenance while a clinician answer remains authoritative", async ({ browser }) => {
    const context = await contextFor(browser, "member-a")
    const caseId = await createCase(context, "SUGGESTION-ACCEPT", "Smoking")
    try {
      const suggestion = await waitForSuggestion(context.request, caseId, "BASE_SMOKING")
      expect(suggestion).toMatchObject({
        status: "PENDING",
        proposedState: "YES",
        ruleId: "DX_SMOKING",
        ruleVersion: "1.4.7.1",
      })
      expect(suggestion.linkedDiagnosisId).toEqual(expect.any(String))
      expect(suggestion.evidence).toEqual(expect.objectContaining({
        evidenceType: "coded_diagnosis_or_comorbidity",
      }))

      const review = await context.request.patch(
        "/api/cases/" + caseId + "/preop-suggestions/" + suggestion.id,
        { headers: JSON_HEADERS, data: { status: "ACCEPTED" } },
      )
      expect(review.ok(), await review.text()).toBeTruthy()

      await expect.poll(async () => answerFor(await readPreop(context.request, caseId), "BASE_SMOKING")?.state, {
        timeout: 20_000,
      }).toBe("YES")
      const accepted = answerFor(await readPreop(context.request, caseId), "BASE_SMOKING")
      expect(accepted).toMatchObject({
        source: "suggestion",
        provenance: expect.objectContaining({
          suggestionId: suggestion.id,
          ruleId: "DX_SMOKING",
          ruleVersion: "1.4.7.1",
          linkedDiagnosisId: suggestion.linkedDiagnosisId,
        }),
      })
    } finally {
      await deleteCase(context, caseId)
      await context.close()
    }

    const clinicianContext = await contextFor(browser, "member-a")
    const clinicianCaseId = await createCase(clinicianContext, "SUGGESTION-CLINICIAN-WINS", "Smoking")
    try {
      // A baseline question is answered through its own form field.
      const saved = await clinicianContext.request.patch("/api/cases/" + clinicianCaseId, {
        headers: JSON_HEADERS,
        data: { preop: { smoking: false } },
      })
      expect(saved.ok(), await saved.text()).toBeTruthy()
      const suggestion = await waitForSuggestion(clinicianContext.request, clinicianCaseId, "BASE_SMOKING")
      const review = await clinicianContext.request.patch(
        "/api/cases/" + clinicianCaseId + "/preop-suggestions/" + suggestion.id,
        { headers: JSON_HEADERS, data: { status: "ACCEPTED" } },
      )
      expect(review.ok(), await review.text()).toBeTruthy()
      await expect.poll(async () => answerFor(await readPreop(clinicianContext.request, clinicianCaseId), "BASE_SMOKING")?.state)
        .toBe("NO")
      expect(answerFor(await readPreop(clinicianContext.request, clinicianCaseId), "BASE_SMOKING")?.source)
        .toBe("clinician")
    } finally {
      await deleteCase(clinicianContext, clinicianCaseId)
      await clinicianContext.close()
    }
  })

  test("rejecting a suggestion does not manufacture a NO answer", async ({ browser }) => {
    const context = await contextFor(browser, "member-a")
    const caseId = await createCase(context, "SUGGESTION-REJECT", "Smoking")
    try {
      const suggestion = await waitForSuggestion(context.request, caseId, "BASE_SMOKING")
      const review = await context.request.patch(
        "/api/cases/" + caseId + "/preop-suggestions/" + suggestion.id,
        { headers: JSON_HEADERS, data: { status: "REJECTED" } },
      )
      expect(review.ok(), await review.text()).toBeTruthy()

      const suggestions = await (await context.request.get("/api/cases/" + caseId + "/preop-suggestions")).json() as Suggestion[]
      expect(suggestions.find(item => item.id === suggestion.id)).toMatchObject({ status: "REJECTED" })
      const answer = answerFor(await readPreop(context.request, caseId), "BASE_SMOKING")
      expect(answer?.state).not.toBe("NO")
    } finally {
      await deleteCase(context, caseId)
      await context.close()
    }
  })

  test("a case in progress follows the profile when a question is switched on and off", async ({ browser }) => {
    const admin = await contextFor(browser, "admin")
    const original = await readProfile(admin.request)
    const answered = await createCase(admin, "PROFILE-ON-OFF-ANSWERED")
    const unanswered = await createCase(admin, "PROFILE-ON-OFF-UNANSWERED")
    try {
      // Switched on mid-case: asked from the next save, as NOT_ASKED until answered.
      await saveProfile(withEnabled(original, [A2, A3], true))
      const onSave = await admin.request.patch("/api/cases/" + unanswered, {
        headers: JSON_HEADERS,
        data: { preop: { allergies: false } },
      })
      expect(onSave.ok(), await onSave.text()).toBeTruthy()
      expect(answerFor(await readPreop(admin.request, unanswered), A2)).toMatchObject({ state: "NOT_ASKED" })

      const firstSave = await admin.request.patch("/api/cases/" + answered, {
        headers: JSON_HEADERS,
        data: {
          preop: {
            allergies: false,
            preopAnswers: [
              { stableKey: A2, state: "YES", optionKey: "YES" },
              { stableKey: A3, state: "YES", optionKey: "YES" },
            ],
          },
        },
      })
      expect(firstSave.ok(), await firstSave.text()).toBeTruthy()
      const answeredPreop = await readPreop(admin.request, answered)
      expect(answerFor(answeredPreop, A2)).toMatchObject({ state: "YES" })
      expect(answerFor(answeredPreop, A3)).toMatchObject({ state: "YES" })

      const exportResponse = await admin.request.get(
        "/api/export/omop?caseId=" + answered + "&format=json&force=true",
      )
      expect(exportResponse.ok(), await exportResponse.text()).toBeTruthy()
      const bundle = await exportResponse.json() as {
        observation?: Array<Record<string, unknown>>
        condition_occurrence?: Array<Record<string, unknown>>
      }
      expect(bundle.observation).toContainEqual(expect.objectContaining({
        observation_source_value: "LOSPOR:PREOP_" + A2,
        observation_concept_id: 0,
        value_as_concept_id: 4188539,
      }))
      // The baseline answer is exported once, from its answer row.
      expect(bundle.observation?.filter(row => row.observation_source_value === "LOSPOR:ALLERGY_PRESENT")).toEqual([
        expect.objectContaining({ value_as_concept_id: 4188540 }),
      ])
      // Unanswered questions export nothing.
      expect(bundle.observation).not.toContainEqual(expect.objectContaining({
        observation_source_value: "LOSPOR:LATEX_ALLERGY",
      }))
      expect(bundle.condition_occurrence).toContainEqual(expect.objectContaining({
        condition_concept_id: 40491502,
      }))

      // Switched off mid-case: the unanswered row goes on the next save, the
      // answer already given stays.
      await saveProfile(withEnabled(original, [A2, A3], false))
      for (const caseId of [answered, unanswered]) {
        const offSave = await admin.request.patch("/api/cases/" + caseId, {
          headers: JSON_HEADERS,
          data: { preop: { allergies: true } },
        })
        expect(offSave.ok(), await offSave.text()).toBeTruthy()
      }
      expect(answerFor(await readPreop(admin.request, unanswered), A2)).toBeUndefined()
      const kept = await readPreop(admin.request, answered)
      expect(answerFor(kept, A2)).toMatchObject({ state: "YES" })
      expect(answerFor(kept, A3)).toMatchObject({ state: "YES" })
    } finally {
      await saveProfile(asSaved(original)).catch(() => {})
      await deleteCase(admin, answered)
      await deleteCase(admin, unanswered)
      await admin.close()
    }
  })

  test("clinicians cannot write the profile", async ({ browser }) => {
    const context = await contextFor(browser, "admin")
    try {
      const attempt = await context.request.post("/api/preop/profile", {
        headers: JSON_HEADERS,
        data: { questions: [] },
      })
      expect(attempt.ok()).toBeFalsy()
    } finally {
      await context.close()
    }
  })
})
