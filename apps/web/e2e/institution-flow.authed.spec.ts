import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS } from "./roles"
import { E2E_INSTITUTION_A, E2E_INSTITUTION_B } from "./credentials"

// Spelled out rather than imported from @lospor/core/account: the package ships
// raw TypeScript and Playwright does not transpile node_modules. If this string
// ever diverges from the constant, this spec is where it shows up.
const NO_INSTITUTION_ID = "no-institution"

// Moving between departments, end to end and with the wrong people watching.
//
// The rule 8.3 introduced: choosing an institution at registration is
// self-service, but *changing* it is not, because membership is what lets a head
// of department see a clinician's cases. Approving a move is therefore the
// receiving department's decision — not the one being left, and not the person
// moving. Leaving is the exception: it grants nobody anything, so it applies at
// once.
//
// member-b does the moving. If this spec fails part-way it can leave them in the
// wrong institution; `npm run e2e:seed` puts the cast back.

test("a move needs the receiving department's approval; leaving does not", async ({ browser }) => {
  await withRoles(browser, ["member-b", "hod-a", "hod-b"], async ctx => {
    const memberB = ctx["member-b"].request
    const hodA    = ctx["hod-a"].request
    const hodB    = ctx["hod-b"].request

    const before = await memberB.get("/api/user").then(r => r.json())
    expect(before.institutionId).toBe(E2E_INSTITUTION_B)

    // ── ask to join institution A ─────────────────────────────────────────
    const asked = await memberB.post("/api/user/institution-request", {
      headers: JSON_HEADERS,
      data: { institutionId: E2E_INSTITUTION_A },
    })
    expect(asked.status(), await asked.text()).toBe(201)
    const request = await asked.json()
    expect(request.status).toBe("PENDING")
    expect(request.requestedInstitutionId).toBe(E2E_INSTITUTION_A)
    // Where they came from is recorded now, not derived at approval time — by
    // then their institution is already the new one.
    expect(request.previousInstitutionId).toBe(E2E_INSTITUTION_B)

    // Nothing has moved yet.
    const during = await memberB.get("/api/user").then(r => r.json())
    expect(during.institutionId).toBe(E2E_INSTITUTION_B)

    // ── the queue: the receiving head sees it, the current head does not ──
    const queueA = await hodA.get("/api/admin/institution-requests").then(r => r.json())
    expect(queueA.map((row: { id: string }) => row.id)).toContain(request.id)

    // hod-b is the head of the department member-b is *leaving*. Their consent
    // is not what is being asked for, and the request must not appear to them.
    const queueB = await hodB.get("/api/admin/institution-requests").then(r => r.json())
    expect(queueB.map((row: { id: string }) => row.id)).not.toContain(request.id)

    // ── and cannot be resolved by the wrong head ──────────────────────────
    // 404, not 403: the scope is part of the lookup, so a head asking about a
    // request outside their institution learns nothing about whether it exists.
    const wrongHead = await hodB.post(`/api/admin/institution-requests/${request.id}`, {
      headers: JSON_HEADERS,
      data: { decision: "APPROVE" },
    })
    expect(wrongHead.status()).toBe(404)

    const stillPending = await memberB.get("/api/user").then(r => r.json())
    expect(stillPending.institutionId).toBe(E2E_INSTITUTION_B)

    // A second request while one is pending is refused.
    const duplicate = await memberB.post("/api/user/institution-request", {
      headers: JSON_HEADERS,
      data: { institutionId: E2E_INSTITUTION_A },
    })
    expect(duplicate.status()).toBe(409)

    // ── the receiving head approves ───────────────────────────────────────
    const approved = await hodA.post(`/api/admin/institution-requests/${request.id}`, {
      headers: JSON_HEADERS,
      data: { decision: "APPROVE" },
    })
    expect(approved.status(), await approved.text()).toBe(200)
    expect((await approved.json()).status).toBe("APPROVED")

    const moved = await memberB.get("/api/user").then(r => r.json())
    expect(moved.institutionId).toBe(E2E_INSTITUTION_A)

    // Resolving it twice is refused rather than silently repeated.
    const again = await hodA.post(`/api/admin/institution-requests/${request.id}`, {
      headers: JSON_HEADERS,
      data: { decision: "REJECT" },
    })
    expect(again.status()).toBe(409)

    // ── leaving applies immediately, with nobody's approval ───────────────
    const left = await memberB.post("/api/user/institution-request", {
      headers: JSON_HEADERS,
      data: { institutionId: NO_INSTITUTION_ID },
    })
    expect(left.status(), await left.text()).toBe(201)
    const leaveRecord = await left.json()
    expect(leaveRecord.applied).toBe(true)
    expect(leaveRecord.status).toBe("APPROVED")
    expect(leaveRecord.previousInstitutionId).toBe(E2E_INSTITUTION_A)

    const unaffiliated = await memberB.get("/api/user").then(r => r.json())
    expect(unaffiliated.institutionId).toBe(NO_INSTITUTION_ID)

    // Leaving left no queue behind for anyone to act on.
    const queueAfter = await hodA.get("/api/admin/institution-requests").then(r => r.json())
    expect(queueAfter.map((row: { id: string }) => row.id)).not.toContain(leaveRecord.id)

    // ── put member-b back where the seeder left them ──────────────────────
    const goingHome = await memberB.post("/api/user/institution-request", {
      headers: JSON_HEADERS,
      data: { institutionId: E2E_INSTITUTION_B },
    })
    expect(goingHome.status()).toBe(201)
    const home = await goingHome.json()
    const restored = await hodB.post(`/api/admin/institution-requests/${home.id}`, {
      headers: JSON_HEADERS,
      data: { decision: "APPROVE" },
    })
    expect(restored.status(), await restored.text()).toBe(200)
    expect((await memberB.get("/api/user").then(r => r.json())).institutionId).toBe(E2E_INSTITUTION_B)
  })
})

test("a member cannot see or resolve the department queue", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const queue = await ctx["member-a"].request.get("/api/admin/institution-requests")
    expect(queue.status()).toBe(403)
  })
})

test("asking to join the institution you are already in is refused", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const same = await ctx["member-a"].request.post("/api/user/institution-request", {
      headers: JSON_HEADERS,
      data: { institutionId: E2E_INSTITUTION_A },
    })
    expect(same.status()).toBe(409)
  })
})

test("an institution that does not exist is refused", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const nowhere = await ctx["member-a"].request.post("/api/user/institution-request", {
      headers: JSON_HEADERS,
      data: { institutionId: "no-such-institution-e2e" },
    })
    expect(nowhere.status()).toBe(404)
  })
})
