import { test, expect } from "../apps/web/node_modules/@playwright/test"
import { withRoles, JSON_HEADERS } from "../apps/web/e2e/roles"

/**
 * Hospital-only read overlay acceptance coverage.
 *
 * This is deliberately an API-plus-browser test rather than a pure unit test:
 * the policy comes from the migrated database, the list is the real dashboard
 * endpoint, the detail request schedules the audit row, and the browser must
 * choose the read-only detail route for a non-writable colleague case.
 */
test("same-hospital cases are readable but remain read-only and audited", async ({ browser }) => {
  await withRoles(browser, ["member-a", "member-a2", "member-b", "research", "admin"], async contexts => {
    const memberA = contexts["member-a"].request
    const memberA2 = contexts["member-a2"].request
    const memberB = contexts["member-b"].request
    const research = contexts.research.request
    const admin = contexts.admin.request
    const suffix = Date.now()

    const createCase = async (request: typeof memberA, label: string) => {
      const response = await request.post("/api/cases", {
        headers: JSON_HEADERS,
        data: {
          patientNumber: `CASE-VISIBILITY-${label}-${suffix}`,
          clinicalMode: "ADULT",
          preop: { ageYears: 34, sex: "MALE", weightKg: 80 },
        },
      })
      expect(response.status(), await response.text()).toBe(201)
      return (await response.json()) as { id: string }
    }

    const colleagueCase = await createCase(memberA, "COLLEAGUE")
    // Create the reader's own case first, then the colleague case already has
    // the later timestamp. The server's preferred group must still win.
    const ownCase = await createCase(memberA2, "OWN")

    try {
      const listResponse = await memberA2.get("/api/cases?take=200")
      expect(listResponse.ok(), await listResponse.text()).toBeTruthy()
      const list = await listResponse.json() as {
        cases: Array<{ id: string }>
        hospitalWide?: boolean
      }
      expect(list.hospitalWide).toBe(true)
      const ids = list.cases.map(item => item.id)
      expect(ids).toContain(colleagueCase.id)
      expect(ids).toContain(ownCase.id)
      expect(ids.indexOf(ownCase.id)).toBeLessThan(ids.indexOf(colleagueCase.id))

      const detailResponse = await memberA2.get(`/api/cases/${colleagueCase.id}`)
      expect(detailResponse.status(), await detailResponse.text()).toBe(200)
      const detail = await detailResponse.json() as {
        capabilities: { canRead: boolean; canWrite: boolean; isCreator: boolean; isAssignee: boolean }
      }
      expect(detail.capabilities).toEqual({
        canRead: true,
        canWrite: false,
        isCreator: false,
        isAssignee: false,
      })

      const writeAttempt = await memberA2.post(`/api/cases/${colleagueCase.id}/submit-for-review`, {
        headers: JSON_HEADERS,
      })
      expect(writeAttempt.status(), await writeAttempt.text()).toBe(403)

      const page = await contexts["member-a2"].newPage()
      try {
        await page.goto("/dashboard")
        await expect(page.locator(`a[href="/cases/${colleagueCase.id}"]`)).toHaveCount(1)
        await expect(page.locator(`a[href="/cases/new?continue=${colleagueCase.id}"]`)).toHaveCount(0)
      } finally {
        await page.close()
      }

      expect((await memberB.get(`/api/cases/${colleagueCase.id}`)).status()).toBe(404)
      expect((await research.get(`/api/cases/${colleagueCase.id}`)).status()).toBe(403)

      await expect.poll(async () => {
        const auditResponse = await admin.get("/api/admin/audit-logs?action=CASE_VIEWED")
        if (!auditResponse.ok()) return false
        const audit = await auditResponse.json() as {
          logs: Array<{ action: string; user?: { name?: string } }>
        }
        return audit.logs.some(log => log.action === "CASE_VIEWED" && log.user?.name === "Member Alpha Two")
      }, { timeout: 10_000 }).toBe(true)
    } finally {
      const colleagueDelete = await memberA.delete(`/api/cases/${colleagueCase.id}`, { headers: JSON_HEADERS })
      expect(colleagueDelete.ok(), `colleague cleanup failed: ${colleagueDelete.status()}`).toBeTruthy()
      const ownDelete = await memberA2.delete(`/api/cases/${ownCase.id}`, { headers: JSON_HEADERS })
      expect(ownDelete.ok(), `own cleanup failed: ${ownDelete.status()}`).toBeTruthy()
    }
  })
})
