import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS, type Role } from "./roles"

// Handing a case on, the way a department actually does it.
//
// A registrar assesses a patient, the consultant takes the list, and whoever is
// on when the case runs finishes the record. Until now the middle step had no
// route through the system: only a head of department could move a case, and
// only downwards. The handover still happened — it just happened nowhere the
// register could see, which is the failure this suite exists to stop returning.
//
// The rule exercised throughout: a member *asks*, and nothing moves until the
// recipient accepts. A head of department *assigns*, and it moves at once.

const PREOP = {
  ageYears: 61, sex: "FEMALE" as const, heightCm: 164, weightKg: 71,
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  asaScore: "II" as const,
}

type Response = {
  status: () => number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

type Ctx = {
  request: {
    get: (u: string, o?: unknown) => Promise<Response>
    post: (u: string, o: unknown) => Promise<Response>
    patch: (u: string, o: unknown) => Promise<Response>
    delete: (u: string, o?: unknown) => Promise<Response>
  }
}

const userIdOf = async (ctx: Ctx): Promise<string> =>
  ((await (await ctx.request.get("/api/user")).json()) as { id: string }).id

async function createCase(ctx: Ctx): Promise<{ id: string; caseCode: string }> {
  const res = await ctx.request.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(res.status(), await res.text()).toBe(201)
  return await res.json() as { id: string; caseCode: string }
}

const handOver = (ctx: Ctx, id: string, toUserId: string) =>
  ctx.request.post(`/api/cases/${id}/transfer`, { headers: JSON_HEADERS, data: { toUserId } })

const resolve = (ctx: Ctx, id: string, action: "accept" | "decline" | "cancel") =>
  ctx.request.patch(`/api/cases/${id}/transfer`, { headers: JSON_HEADERS, data: { action } })

const canOpen = async (ctx: Ctx, id: string) => (await ctx.request.get(`/api/cases/${id}`)).status()

const historyOf = async (ctx: Ctx, id: string) =>
  (await (await ctx.request.get(`/api/cases/${id}/transfers`)).json()) as { status: string }[]

/** Deletes a case as whoever currently holds it, so no spec leaks one. */
async function discard(contexts: Record<string, Ctx>, roles: Role[], id: string) {
  for (const role of roles) {
    await contexts[role]?.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
  }
}

// The journey the whole feature was built for.
test("a case travels registrar to consultant to the clinician who finishes it", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "member-a2"], async raw => {
    const ctx = raw as unknown as Record<string, Ctx>
    const { id, caseCode } = await createCase(ctx["member-a"])

    try {
      // 1. The registrar who did the pre-assessment asks the consultant.
      const asked = await handOver(ctx["member-a"], id, await userIdOf(ctx["hod-a"]))
      expect(asked.status(), await asked.text()).toBe(200)
      expect((await asked.json() as { instant: boolean }).instant).toBe(false)

      // Nothing has moved. This is the point of asking rather than assigning:
      // the sender is usually still documenting the case they are handing on.
      expect(await canOpen(ctx["member-a"], id)).toBe(200)

      // 2. The consultant accepts.
      const accepted = await resolve(ctx["hod-a"], id, "accept")
      expect(accepted.status(), await accepted.text()).toBe(200)
      const body = await accepted.json() as { accepted: boolean; caseCode: string }
      expect(body.accepted).toBe(true)

      // Whether it was renumbered depends on whether the consultant already
      // held that number, so only the year is asserted — a case performed this
      // year must never be renumbered into a different one.
      expect(body.caseCode.slice(0, 4)).toBe(caseCode.slice(0, 4))

      // 3. The consultant passes it to whoever is on the list. A head of
      //    department assigns, so this one lands at once.
      const assigned = await handOver(ctx["hod-a"], id, await userIdOf(ctx["member-a2"]))
      expect(assigned.status(), await assigned.text()).toBe(200)
      expect((await assigned.json() as { instant: boolean }).instant).toBe(true)

      // 4. And they can open it to finish it.
      expect(await canOpen(ctx["member-a2"], id)).toBe(200)

      // 5. The journey is readable afterwards by the people who were on it,
      //    which is what makes it an audit trail rather than a log.
      expect((await historyOf(ctx["member-a2"], id)).map(r => r.status))
        .toEqual(["ACCEPTED", "ACCEPTED"])
    } finally {
      await discard(ctx, ["member-a", "hod-a", "member-a2"], id)
    }
  })
})

test("declining leaves the case exactly where it was", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a"], async raw => {
    const ctx = raw as unknown as Record<string, Ctx>
    const { id, caseCode } = await createCase(ctx["member-a"])

    try {
      await handOver(ctx["member-a"], id, await userIdOf(ctx["hod-a"]))
      const declined = await resolve(ctx["hod-a"], id, "decline")
      expect(declined.status(), await declined.text()).toBe(200)

      const mine = await ctx["member-a"].request.get(`/api/cases/${id}`)
      expect(mine.status()).toBe(200)
      // Not renumbered by a handover that never happened.
      expect((await mine.json() as { caseCode: string }).caseCode).toBe(caseCode)

      // And it can be offered again, which a refusal that left the row pending
      // would have quietly prevented.
      const again = await handOver(ctx["member-a"], id, await userIdOf(ctx["hod-a"]))
      expect(again.status(), await again.text()).toBe(200)
    } finally {
      await discard(ctx, ["member-a", "hod-a"], id)
    }
  })
})

test("the sender can withdraw a handover nobody answered", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a"], async raw => {
    const ctx = raw as unknown as Record<string, Ctx>
    const { id } = await createCase(ctx["member-a"])

    try {
      await handOver(ctx["member-a"], id, await userIdOf(ctx["hod-a"]))

      // Only the sender may withdraw. For the recipient this is not a different
      // error — there is simply no pending transfer of theirs to cancel.
      expect((await resolve(ctx["hod-a"], id, "cancel")).status()).toBe(404)

      const withdrawn = await resolve(ctx["member-a"], id, "cancel")
      expect(withdrawn.status(), await withdrawn.text()).toBe(200)

      // Withdrawn, not declined. A trail recording both the same way could not
      // say whether a colleague refused the case or the sender thought better
      // of it, and those are the two things anyone would ask.
      expect((await historyOf(ctx["member-a"], id)).map(r => r.status)).toEqual(["CANCELLED"])

      // Freed for someone else.
      expect((await handOver(ctx["member-a"], id, await userIdOf(ctx["hod-a"]))).status()).toBe(200)
    } finally {
      await discard(ctx, ["member-a", "hod-a"], id)
    }
  })
})

test("a case can only be waiting on one person at a time", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "member-a2"], async raw => {
    const ctx = raw as unknown as Record<string, Ctx>
    const { id } = await createCase(ctx["member-a"])

    try {
      expect((await handOver(ctx["member-a"], id, await userIdOf(ctx["hod-a"]))).status()).toBe(200)

      // Two people cannot both be waiting to be told the case is theirs:
      // whichever accepted second would find it already renumbered under
      // someone else. A partial unique index enforces this in the database as
      // well; this is the readable error in front of it.
      const second = await handOver(ctx["member-a"], id, await userIdOf(ctx["member-a2"]))
      expect(second.status()).toBe(409)
      expect(await second.json()).toMatchObject({ code: "TRANSFER_ALREADY_PENDING" })
    } finally {
      await discard(ctx, ["member-a", "hod-a", "member-a2"], id)
    }
  })
})

test("a member cannot hand a case to another hospital", async ({ browser }) => {
  await withRoles(browser, ["member-a", "member-b"], async raw => {
    const ctx = raw as unknown as Record<string, Ctx>
    const { id } = await createCase(ctx["member-a"])

    try {
      // Relaxing who may hand over must not relax what may be handed over. A
      // case stays at the hospital that recorded it: moving it would rewrite
      // the printed protocol, the OMOP care_site, and the patient-link identity
      // the export pseudonym is built from.
      const refused = await handOver(ctx["member-a"], id, await userIdOf(ctx["member-b"]))
      expect(refused.status()).toBe(403)
      expect(await refused.json()).toMatchObject({ code: "CROSS_INSTITUTION_TRANSFER" })
    } finally {
      await discard(ctx, ["member-a"], id)
    }
  })
})

test("a handover cannot be accepted after the case is finalised", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a"], async raw => {
    const ctx = raw as unknown as Record<string, Ctx>
    const api = ctx["member-a"].request
    const { id } = await createCase(ctx["member-a"])

    try {
      // Offered while it was still a draft — this is the race the check exists
      // for: the case is finalised *after* the handover is sitting there
      // waiting, which is entirely ordinary if the recipient is not on shift.
      await handOver(ctx["member-a"], id, await userIdOf(ctx["hod-a"]))

      // Everything the server requires before it will finalise. Built rather
      // than skipped over: this test is the only end-to-end cover for a defect
      // that let a finalised case change hands, and a skipped test would pass
      // by not running.
      const record = await api.patch(`/api/cases/${id}`, {
        headers: JSON_HEADERS,
        data: {
          preop: {
            heightCm: 164, weightKg: 71,
            bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14,
            mallampati: "II",
          },
          intraop: {
            startedAt: "2026-03-04T07:30:00.000Z",
            endedAt: "2026-03-04T09:05:00.000Z",
            timezone: "Europe/Sofia",
            techniques: ["GENERAL"],
          },
          postop: {
            aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2,
            aldreteConsciousness: 2, aldreteSpO2: 2, disposition: "WARD",
          },
        },
      })
      expect(record.status(), await record.text()).toBeLessThan(300)

      const finalised = await api.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS })
      expect(finalised.status(), await finalised.text()).toBe(200)

      // A finalized case is an attested record, and accepting a handover would
      // reassign it underneath its own attestation. POST has always refused
      // this; PATCH did not, until it was given the same check.
      expect((await resolve(ctx["hod-a"], id, "accept")).status()).toBe(409)

      // Unfinalise and it becomes possible again, so the refusal is about the
      // case being attested rather than about the handover being stale.
      const reopened = await api.post(`/api/cases/${id}/unfinalize`, { headers: JSON_HEADERS })
      expect(reopened.status(), await reopened.text()).toBe(200)
      expect((await resolve(ctx["hod-a"], id, "accept")).status()).toBe(200)
    } finally {
      await api.post(`/api/cases/${id}/unfinalize`, { headers: JSON_HEADERS }).catch(() => {})
      await discard(ctx, ["member-a", "hod-a"], id)
    }
  })
})
