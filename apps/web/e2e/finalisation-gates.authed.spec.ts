import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS } from "./roles"

// What the server refuses to finalise.
//
// Finalising is the moment a case stops being a draft and becomes the record.
// The client used to be the only thing checking it was complete: the server
// confirmed a preoperative row existed and nothing more, so a half-filled
// assessment finalised through the API. 8.3 moved that judgement to the server.
//
// The blockers list matters as much as the refusal. An incomplete assessment
// usually has several gaps, and reporting them one at a time makes finishing a
// case a guessing game.

const INCOMPLETE_PREOP = { ageYears: 52, sex: "MALE" as const }

const COMPLETE_PREOP = {
  ageYears: 52, sex: "MALE" as const, heightCm: 175, weightKg: 80,
  // The canonical shape both clients send. The plain `diagnosis` /
  // `plannedProcedure` strings are accepted when a case is created but are not
  // part of the patch mapper, so sending them here would silently do nothing.
  diagnoses:  [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14,
  mallampati: "II" as const,
  asaScore: "II" as const,
}

// A fixed date, well in the past: nothing here depends on "now", and a case
// dated today would drift into whatever the dashboard counts as active.
const STARTED_AT = "2026-03-04T07:30:00.000Z"
const ENDED_AT   = "2026-03-04T09:05:00.000Z"

test("the server refuses to finalise an incomplete case, and says everything that is missing", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const api = ctx["member-a"].request

    const created = await api.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { preop: INCOMPLETE_PREOP },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()

    try {
      // ── an assessment with the required sections unfilled ──────────────
      const refused = await api.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS })
      expect(refused.status()).toBe(422)
      const body = await refused.json()
      expect(body.reason).toBe("incomplete_preop")
      expect(Array.isArray(body.blockers)).toBeTruthy()
      // More than one, and each names the section it belongs to. Height and
      // weight, procedure, vitals, airway and ASA are all still missing.
      expect(body.blockers.length).toBeGreaterThan(1)
      // `path` is an array — a clinical issue can point at several fields.
      const preopPaths = body.blockers
        .filter((item: { code: string }) => item.code === "incomplete_preop")
        .flatMap((item: { path: string[] }) => item.path)
      expect(preopPaths).toContain("preop.demographics")
      expect(preopPaths).toContain("preop.case_details")
      expect(preopPaths).toContain("preop.risk_scores")

      // ── complete the assessment; the intraoperative record is now the gap ─
      const filled = await api.patch(`/api/cases/${id}`, {
        headers: JSON_HEADERS,
        data: { preop: COMPLETE_PREOP },
      })
      expect(filled.ok(), await filled.text()).toBeTruthy()

      const noIntraop = await api.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS })
      expect(noIntraop.status()).toBe(422)
      const intraopBody = await noIntraop.json()
      expect(intraopBody.blockers.map((item: { code: string }) => item.code))
        .not.toContain("incomplete_preop")
      expect(intraopBody.reason).toBe("missing_start_time")

      // ── an intraoperative record without a technique is still refused ───
      const timesOnly = await api.patch(`/api/cases/${id}`, {
        headers: JSON_HEADERS,
        data: { intraop: { startedAt: STARTED_AT, endedAt: ENDED_AT, timezone: "Europe/Sofia" } },
      })
      expect(timesOnly.ok(), await timesOnly.text()).toBeTruthy()
      const noTechnique = await api.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS })
      expect(noTechnique.status()).toBe(422)
      expect((await noTechnique.json()).reason).toBe("missing_technique")

      // ── a partial Aldrete score is refused: four components is not a score ─
      const partial = await api.patch(`/api/cases/${id}`, {
        headers: JSON_HEADERS,
        data: {
          intraop: { techniques: ["GENERAL"] },
          postop: {
            aldreteActivity: 2, aldreteRespiration: 2,
            aldreteCirculation: 2, aldreteConsciousness: 2,
            disposition: "WARD",
          },
        },
      })
      expect(partial.ok(), await partial.text()).toBeTruthy()
      const missingAldrete = await api.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS })
      expect(missingAldrete.status()).toBe(422)
      expect((await missingAldrete.json()).reason).toBe("missing_aldrete")

      // ── the fifth component completes it ───────────────────────────────
      const scored = await api.patch(`/api/cases/${id}`, {
        headers: JSON_HEADERS,
        data: { postop: { aldreteSpO2: 2 } },
      })
      expect(scored.ok(), await scored.text()).toBeTruthy()

      const finalised = await api.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS })
      expect(finalised.status(), await finalised.text()).toBe(200)
      expect((await finalised.json()).status).toBe("COMPLETE")

      // Finalising twice is refused rather than silently repeated.
      const again = await api.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS })
      expect(again.status()).toBe(409)
    } catch (error) {
      // Only reachable while the case is still a draft — a finalised case
      // cannot be deleted, which is the point of finalising.
      await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
      throw error
    }
    // The finalised case is deliberately left behind; `npm run e2e:seed`
    // clears the cast's cases at the start of the next run.
  })
})
