import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS } from "./roles"
import { E2E_INSTITUTION_A, E2E_INSTITUTION_B } from "./credentials"

// Whose case is it, and who can open it.
//
// The rule, in the clinician's words: a case belongs to the department it was
// recorded in. It stays visible to the person who wrote it wherever they go
// next, and it stays visible to the head of the department it was recorded in —
// but it never becomes visible to the head of a department they join later.
//
// This used to be false. A head of department's scope included an owner
// fallback, so when a clinician moved, every case they had ever recorded moved
// with them into the new head's view. That is what these assertions pin down.

const PREOP = { ageYears: 44, sex: "FEMALE" as const, heightCm: 166, weightKg: 71 }

test("a case belongs to the department it was recorded in, not to its author's current one", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "hod-b", "admin"], async ctx => {
    const memberA = ctx["member-a"].request
    const hodA    = ctx["hod-a"].request
    const hodB    = ctx["hod-b"].request
    const admin   = ctx["admin"].request

    const created = await memberA.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()

    try {
      // Stamped at creation with the author's institution at that moment.
      const detail = await memberA.get(`/api/cases/${id}`)
      expect(detail.ok()).toBeTruthy()
      expect((await detail.json()).institutionId).toBe(E2E_INSTITUTION_A)

      // The head of the department it was recorded in sees it.
      expect((await hodA.get(`/api/cases/${id}`)).status()).toBe(200)

      // The other hospital's head does not. 404 rather than 403: the scope is
      // the query, so an outsider cannot tell the case exists.
      expect((await hodB.get(`/api/cases/${id}`)).status()).toBe(404)

      // An administrator sees everything, by design and auditably.
      expect((await admin.get(`/api/cases/${id}`)).status()).toBe(200)

      // ── the author moves to the other hospital ────────────────────────
      const asked = await memberA.post("/api/user/institution-request", {
        headers: JSON_HEADERS,
        data: { institutionId: E2E_INSTITUTION_B },
      })
      expect(asked.status(), await asked.text()).toBe(201)
      const request = await asked.json()
      const approved = await hodB.post(`/api/admin/institution-requests/${request.id}`, {
        headers: JSON_HEADERS,
        data: { decision: "APPROVE" },
      })
      expect(approved.status(), await approved.text()).toBe(200)

      try {
        // The case did not travel. Its stamp is unchanged...
        const stillA = await memberA.get(`/api/cases/${id}`)
        expect(stillA.status()).toBe(200)
        expect((await stillA.json()).institutionId).toBe(E2E_INSTITUTION_A)

        // ...the author still sees their own work...
        const list = await memberA.get("/api/cases?take=200").then(r => r.json())
        expect(list.cases.map((row: { id: string }) => row.id)).toContain(id)

        // ...the head they left keeps sight of what was recorded there...
        expect((await hodA.get(`/api/cases/${id}`)).status()).toBe(200)

        // ...and the head they joined gains nothing retrospectively.
        expect((await hodB.get(`/api/cases/${id}`)).status()).toBe(404)
      } finally {
        // Put member-a back in institution A.
        const home = await memberA.post("/api/user/institution-request", {
          headers: JSON_HEADERS,
          data: { institutionId: E2E_INSTITUTION_A },
        }).then(r => r.json())
        const restored = await hodA.post(`/api/admin/institution-requests/${home.id}`, {
          headers: JSON_HEADERS,
          data: { decision: "APPROVE" },
        })
        expect(restored.status(), await restored.text()).toBe(200)
      }
    } finally {
      const del = await memberA.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
      expect(del.ok(), `cleanup delete failed: ${del.status()}`).toBeTruthy()
    }
  })
})

test("a member sees their own cases and not a colleague's", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a"], async ctx => {
    const memberA = ctx["member-a"].request
    const hodA    = ctx["hod-a"].request

    // Recorded by the head of department, in the same institution as member-a.
    const created = await hodA.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()

    try {
      // Sharing an institution is not sharing a caseload: a member sees only
      // what they recorded. Seniority runs one way.
      expect((await memberA.get(`/api/cases/${id}`)).status()).toBe(404)
      expect((await hodA.get(`/api/cases/${id}`)).status()).toBe(200)
    } finally {
      const del = await hodA.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
      expect(del.ok(), `cleanup delete failed: ${del.status()}`).toBeTruthy()
    }
  })
})
