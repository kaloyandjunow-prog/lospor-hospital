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
//  2. **The case code changes.** Codes are per-user sequences, so a case moving
//     between owners is renumbered — `previousCaseCode` -> `caseCode`. A printed
//     sheet carrying the old code is how a chart stops matching its record, so
//     the renumbering is asserted explicitly rather than assumed.

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

/** "2026-0007" -> 7. Codes are a per-user sequence within the year. */
function codeNumber(caseCode: string): number {
  return Number(caseCode.split("-")[1])
}

type Ctx = { request: { post: (u: string, o: unknown) => Promise<{ status: () => number; text: () => Promise<string>; json: () => Promise<{ id: string; caseCode: string }> }> } }

async function createCase(context: Ctx) {
  const res = await context.request.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(res.status(), await res.text()).toBe(201)
  return res.json()
}

/**
 * Gives both people a case carrying the same code, which is the only situation
 * in which a transfer renumbers anything.
 *
 * It has to be constructed rather than assumed. Codes are per-user sequences,
 * so they start equal but drift apart as each person accumulates cases — and
 * this test used to depend on a shared database where the drift happened to
 * line up. Sequences advance by exactly one and never skip, so walking whichever
 * person is behind forward always terminates on the other's number.
 */
async function giveBothTheSameCode(a: Ctx, b: Ctx) {
  const created: { context: Ctx; id: string }[] = []
  let latestA = await createCase(a)
  created.push({ context: a, id: latestA.id })
  let latestB = await createCase(b)
  created.push({ context: b, id: latestB.id })

  for (let guard = 0; guard < 40 && latestA.caseCode !== latestB.caseCode; guard += 1) {
    if (codeNumber(latestA.caseCode) < codeNumber(latestB.caseCode)) {
      latestA = await createCase(a)
      created.push({ context: a, id: latestA.id })
    } else {
      latestB = await createCase(b)
      created.push({ context: b, id: latestB.id })
    }
  }
  expect(latestA.caseCode, "could not align the two case sequences").toBe(latestB.caseCode)
  return { latestA, latestB, created }
}

test("a head of department can assign a case within their institution, and it is renumbered", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "admin"], async ctx => {
    // Renumbering only happens when the recipient already holds the moving
    // case's code, so the collision is constructed rather than hoped for. This
    // test used to rely on a shared database where the two sequences happened
    // to line up; against a fresh one nothing clashed and it failed on a system
    // that was behaving correctly.
    const { latestB, created: setup } = await giveBothTheSameCode(
      ctx["admin"] as Ctx,
      ctx["member-a"] as Ctx,
    )
    const { id, caseCode: originalCode } = latestB

    try {
      const adminId = await userIdOf(ctx["admin"])

      const moved = await ctx["hod-a"].request.post(`/api/cases/${id}/transfer`, {
        headers: JSON_HEADERS, data: { toUserId: adminId },
      })
      expect(moved.status(), await moved.text()).toBe(200)

      const body = await moved.json()
      expect(body.instant).toBe(true)
      // Renumbered onto the new owner's sequence, and the old code reported back
      // so a printed sheet can be reconciled.
      expect(body.previousCaseCode).toBe(originalCode)
      expect(body.caseCode).not.toBe(originalCode)

      // The new owner can now open it.
      expect((await ctx["admin"].request.get(`/api/cases/${id}`)).status()).toBe(200)
    } finally {
      // The moved case may sit with either owner depending on where the test
      // stopped, and the alignment cases belong to whoever created them.
      await ctx["admin"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
      for (const { context, id: created } of setup) {
        await (context as unknown as { request: { delete: (u: string, o: unknown) => Promise<unknown> } })
          .request.delete(`/api/cases/${created}`, { headers: JSON_HEADERS }).catch(() => {})
      }
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
      headers: JSON_HEADERS, data: { preop: PREOP },
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
      headers: JSON_HEADERS, data: { preop: PREOP },
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
      headers: JSON_HEADERS, data: { preop: PREOP },
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
      headers: JSON_HEADERS, data: { preop: PREOP },
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
