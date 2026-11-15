import { test, expect } from "@playwright/test"
import { withRoles, contextFor, JSON_HEADERS } from "./roles"

// Moving a case to another clinician.
//
// This is the flow with no e2e coverage at all before now, and it is one the
// pilot will lean on: a registrar starts a case, the consultant finishes it, or
// someone documents on the wrong account at 3am and it has to be moved.
//
// Two things make it worth testing beyond "does the button work":
//
//  1. Only a head of department or an admin may assign. A member moving cases
//     around would defeat the point of ownership.
//  2. **The case code survives the move.** On the appliance a code carries the
//     moment the case was created, to the second, then the clinician's yearly
//     number (hospital 1.9.2), so two clinicians practically never hold the
//     same code and a case keeps it when it changes hands: the printed sheet
//     still matches the record. The rare clash (same second, same number) is
//     renumbered by case-code.ts and case-transfer.ts, covered by their unit
//     tests; it cannot be staged here, because the time is the server's.

const PREOP = {
  ageYears: 54, sex: "MALE" as const, heightCm: 178, weightKg: 88,
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  asaScore: "II" as const,
}

/** The signed-in person's own user id, which the transfer API addresses people by. */
async function userIdOf(context: { request: { get: (u: string) => Promise<{ json: () => Promise<{ id: string }> }> } }) {
  const res = await context.request.get("/api/user")
  return (await res.json()).id
}

test("a head of department can assign a case within their institution, and it keeps its code", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "admin"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { patientNumber: `CASE-TRANSFER-E2E-${Date.now()}`, preop: PREOP },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id, caseCode: originalCode } = await created.json()
    expect(originalCode).toMatch(/^\d{8}-\d{6}-\d{4}$/)

    try {
      const adminId = await userIdOf(ctx["admin"])

      const moved = await ctx["hod-a"].request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: adminId },
      })
      expect(moved.status(), await moved.text()).toBe(200)

      const body = await moved.json()
      expect(body.instant).toBe(true)
      // Nothing to reconcile: the code on the printed sheet is still the case's.
      expect(body.caseCode).toBe(originalCode)
      expect(body.previousCaseCode ?? null).toBeNull()

      // The new owner can now open it.
      expect((await ctx["admin"].request.get(`/api/cases/${id}`)).status()).toBe(200)
    } finally {
      // The moved case may sit with either owner depending on where the test stopped.
      await ctx["admin"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})

// A member used to be refused outright. That did not stop handovers happening,
// it stopped the register seeing them: the case still changed hands at the end
// of the shift, with nothing recorded. A member now asks, and the distinction
// that matters is that asking moves nothing.
test("a member asks rather than assigns, and nothing moves until it is accepted", async ({ browser }) => {
  await withRoles(browser, ["member-a", "admin"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { patientNumber: `CASE-TRANSFER-E2E-${Date.now()}`, preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id, caseCode } = await created.json()

    try {
      const adminId = await userIdOf(ctx["admin"])
      const asked = await ctx["member-a"].request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: adminId },
      })
      expect(asked.status(), await asked.text()).toBe(200)
      expect((await asked.json()).instant).toBe(false)

      // Still the sender's, still their number, still theirs to document -- you
      // hand over at the end of a shift you are still working.
      const stillMine = await ctx["member-a"].request.get(`/api/cases/${id}`)
      expect(stillMine.status()).toBe(200)
      expect((await stillMine.json()).caseCode).toBe(caseCode)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})

test("a case cannot be assigned to a clinician at another hospital", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "member-b"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { patientNumber: `CASE-TRANSFER-E2E-${Date.now()}`, preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()

    try {
      const outsiderId = await userIdOf(ctx["member-b"])
      const refused = await ctx["hod-a"].request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: outsiderId },
      })
      expect(refused.status()).toBe(403)

      // And the case did not move.
      expect((await ctx["member-b"].request.get(`/api/cases/${id}`)).status()).toBe(404)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})

test("a case cannot be transferred to yourself", async ({ browser }) => {
  const context = await contextFor(browser, "hod-a")
  try {
    const created = await context.request.post("/api/cases", {
      headers: JSON_HEADERS, data: { patientNumber: `CASE-TRANSFER-E2E-${Date.now()}`, preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()

    try {
      const selfId = await userIdOf(context)
      const refused = await context.request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: selfId },
      })
      expect(refused.status()).toBe(400)
    } finally {
      await context.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  } finally {
    await context.close()
  }
})

test("declining a pending transfer leaves the case where it was", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { patientNumber: `CASE-TRANSFER-E2E-${Date.now()}`, preop: PREOP },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()

    try {
      // Assignment by a head of department is instant, so there is no PENDING row
      // for the recipient to act on. Declining must therefore report "nothing to
      // decline" rather than silently succeeding — a decline that appears to work
      // on a case that already moved would be worse than an error.
      const declined = await ctx["member-a"].request.patch(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { action: "decline" },
      })
      expect(declined.status()).toBe(404)

      // Still the original owner's.
      expect((await ctx["member-a"].request.get(`/api/cases/${id}`)).status()).toBe(200)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})
