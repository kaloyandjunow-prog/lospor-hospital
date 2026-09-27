import React from "react"
import { act } from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"
import type { PreopAssessmentProfile, PreopProfileQuestion } from "@lospor/core/preop-assessment"

// The hospital's preop profile on the phone (9.11.0, coverage review 9.13.0):
// the last profile seen is followed offline, a NO takes its follow-ups with
// it, an accepted suggestion becomes the answer, and a switched-off baseline
// question hides its field and the scores that need it.

const api = vi.hoisted(() => ({
  profile: null as unknown,
  suggestions: [] as unknown[],
  offline: false,
  patched: [] as string[],
  kv: new Map<string, string>(),
}))

vi.mock("./api", () => ({
  apiJson: vi.fn(async (path: string) => {
    if (api.offline) throw new TypeError("offline")
    if (path === "/api/preop/profile") return api.profile
    return api.suggestions
  }),
  apiFetch: vi.fn(async (path: string) => { api.patched.push(path); return { ok: true } }),
}))
vi.mock("./clinical-sync-kv", () => ({
  clinicalSyncKv: {
    get: async (key: string) => api.kv.get(key) ?? null,
    set: async (key: string, value: string) => { api.kv.set(key, value) },
  },
}))

import { usePreopProfile } from "./use-preop-profile"

const question = (stableKey: string, extra: Partial<PreopProfileQuestion> = {}): PreopProfileQuestion => ({
  stableKey, enabled: true, required: false, sortOrder: 1, section: "history", formSection: "anamnesis",
  parentKey: null, labelEn: stableKey, labelBg: stableKey, answerType: "BOOLEAN", applicability: ["ADULT", "PEDIATRIC"],
  allowUnknown: true, allowNotApplicable: false, conditionalRuleKey: null, ...extra,
} as PreopProfileQuestion)

const profile = (questions: PreopProfileQuestion[]): PreopAssessmentProfile => ({
  id: "p", version: 1, catalogVersion: "9.13.0", status: "PUBLISHED", publishedAt: null, questions,
})

type Answer = { stableKey: string; state: string; optionKey?: string | null }

async function mount(caseId: string | null = "case-1") {
  let answers: Answer[] = []
  let hook!: ReturnType<typeof usePreopProfile>
  const form = { getAnswers: () => answers as never, setAnswers: (next: Answer[]) => { answers = next } }
  function Harness() {
    hook = usePreopProfile({ caseId, pediatric: false, values: {}, form: form as never })
    return null
  }
  await act(async () => { render(<Harness />) })
  await act(async () => { await Promise.resolve() })
  return { hook: () => hook, answers: () => answers, setAnswers: (next: Answer[]) => { answers = next } }
}

beforeEach(() => {
  api.profile = null
  api.suggestions = []
  api.offline = false
  api.patched = []
  api.kv.clear()
})

describe("the preop profile on the phone", () => {
  it("offline, follows the last profile it saw rather than showing everything", async () => {
    api.profile = profile([question("BASE_SMOKING", { enabled: false })])
    await mount()
    api.offline = true
    const { hook } = await mount()
    expect(hook().profile?.questions[0].stableKey).toBe("BASE_SMOKING")
    expect(hook().shownField("smoking")).toBe(false)
    // Apfel needs smoking: it is shown as not available, never computed without it.
    expect(hook().scoreAvailable("APFEL")).toBe(false)
    expect(hook().scoreAvailable("RCRI")).toBe(true)
  })

  it("never seen a profile: every field shows, as on a fresh appliance", async () => {
    api.offline = true
    const { hook } = await mount()
    expect(hook().profile).toBeNull()
    expect(hook().shownField("smoking")).toBe(true)
  })

  it("an answer other than YES takes the question's follow-ups with it", async () => {
    api.profile = profile([question("A7"), question("A7_DVT", { parentKey: "A7" }), question("A9")])
    const { hook, answers, setAnswers } = await mount()
    setAnswers([{ stableKey: "A7", state: "YES" }, { stableKey: "A7_DVT", state: "YES" }, { stableKey: "A9", state: "NO" }])
    act(() => { hook().answerQuestion("A7", { stableKey: "A7", state: "NO" } as never) })
    expect(answers().map(item => item.stableKey).sort()).toEqual(["A7", "A9"])
    act(() => { hook().answerQuestion("A9", null) })
    expect(answers().map(item => item.stableKey)).toEqual(["A7"])
  })

  it("an accepted suggestion becomes the answer; a rejected one does not", async () => {
    api.profile = profile([question("A5")])
    api.suggestions = [
      { id: "s1", status: "PENDING", proposedState: "YES", question: { stableKey: "A5" } },
      { id: "s2", status: "ACCEPTED", proposedState: "NO", question: { stableKey: "A6" } },
    ]
    const { hook, answers } = await mount()
    expect(hook().suggestions.map(item => item.id)).toEqual(["s1"])
    await act(async () => { await hook().reviewSuggestion("s1", "REJECTED") })
    expect(answers()).toEqual([])
    await act(async () => { await hook().reviewSuggestion("s1", "ACCEPTED") })
    expect(answers()).toEqual([{ stableKey: "A5", state: "YES", optionKey: "YES" }])
    expect(api.patched.every(path => path.endsWith("/preop-suggestions/s1"))).toBe(true)
  })
})
