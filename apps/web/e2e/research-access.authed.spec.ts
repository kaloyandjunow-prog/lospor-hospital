import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS } from "./roles"
import { E2E_HOD_A_EMAIL, E2E_INSTITUTION_A } from "./credentials"

// Research access, and its ceiling.
//
// A register only justifies itself if the data can be studied, and only stays
// trustworthy if studying it does not mean reading individual patients' charts.
// So the grant is layered: counting is one permission, opening the underlying
// cases is another, and taking a copy away is a third. The E2E researcher holds
// only the first — an aggregate grant over one hospital.
//
// Two things carry the weight here. An aggregate query must never hand back
// case rows, and a small cohort must come back as a range rather than an exact
// number: "3 patients" in a single department is close to naming somebody.

const EMPTY_COHORT = { cohort: { version: 1 as const, filters: {} } }
const STATUS_ACCOUNT_CONTROL_TOKEN = "e2e-status-account-control-token-not-secret-2026"
const STATUS_HEADERS = { Authorization: `Bearer ${STATUS_ACCOUNT_CONTROL_TOKEN}` }

test("an aggregate grant counts without seeing anybody", async ({ browser }) => {
  await withRoles(browser, ["research"], async ctx => {
    const api = ctx["research"].request

    const metadata = await api.get("/api/research/metadata")
    expect(metadata.ok(), await metadata.text()).toBeTruthy()

    const query = await api.post("/api/research/query", {
      headers: JSON_HEADERS,
      data: EMPTY_COHORT,
    })
    expect(query.ok(), await query.text()).toBeTruthy()
    const result = await query.json()

    // No exact total for a grant that may not inspect cases...
    expect(result.matchingCases).toBeNull()
    // ...but a disclosure that says how much it is willing to say.
    expect(result.matchingCaseCount).toBeTruthy()
    expect(typeof result.matchingCaseCount.lowerBound).toBe("number")
    expect(typeof result.matchingCaseCount.suppressed).toBe("boolean")
    // Either an exact zero, or a range — never a bare precise count.
    if (!result.matchingCaseCount.exact) {
      expect(result.matchingCaseCount.value).toBeNull()
    } else {
      expect(result.matchingCaseCount.value).toBe(0)
    }

    // An aggregate query returns aggregates. Not one case row, ever.
    expect(result.cases).toEqual([])
    expect(result.pagination).toBeNull()
    expect(Array.isArray(result.metrics)).toBeTruthy()
  })
})

test("a filter that cannot match returns nothing rather than everything", async ({ browser }) => {
  await withRoles(browser, ["research"], async ctx => {
    // A filter the server silently ignored would hand back the whole register
    // while the researcher believed they were looking at a narrow cohort — the
    // worst kind of wrong, because the number still looks plausible.
    const impossible = await ctx["research"].request.post("/api/research/query", {
      headers: JSON_HEADERS,
      data: { cohort: { version: 1, filters: { ageYears: { min: 200 } } } },
    })
    expect(impossible.ok(), await impossible.text()).toBeTruthy()
    const disclosure = (await impossible.json()).matchingCaseCount
    // Zero is disclosed exactly: there is nobody to identify.
    expect(disclosure.value).toBe(0)
    expect(disclosure.exact).toBe(true)
    expect(disclosure.suppressed).toBe(false)
  })
})

test("an unknown filter is rejected rather than quietly ignored", async ({ browser }) => {
  await withRoles(browser, ["research"], async ctx => {
    // Same danger as above, reached by a typo instead of a range: a cohort
    // definition the server does not understand must fail loudly.
    const nonsense = await ctx["research"].request.post("/api/research/query", {
      headers: JSON_HEADERS,
      data: { cohort: { version: 1, filters: { notARealFilter: ["x"] } } },
    })
    expect(nonsense.status()).toBe(400)
    expect((await nonsense.json()).code).toBe("INVALID_RESEARCH_QUERY")
  })
})

test("an aggregate grant cannot open individual cases or export", async ({ browser }) => {
  await withRoles(browser, ["research"], async ctx => {
    const api = ctx["research"].request

    const inspect = await api.post("/api/research/cases/query", {
      headers: JSON_HEADERS,
      data: EMPTY_COHORT,
    })
    expect(inspect.status()).toBe(403)
    expect((await inspect.json()).code).toBe("RESEARCH_PERMISSION_REQUIRED")

    const exported = await api.post("/api/research/exports", {
      headers: JSON_HEADERS,
      data: { ...EMPTY_COHORT, format: "CSV" },
    })
    expect(exported.status()).toBe(403)
  })
})

test("an ordinary clinician has no research access at all", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const refused = await ctx["member-a"].request.get("/api/research/metadata")
    expect(refused.status()).toBe(403)
    // Named, so the difference between "not granted yet" and "not allowed to do
    // this particular thing" is visible to whoever has to grant it.
    expect((await refused.json()).code).toBe("RESEARCH_ACCESS_REQUIRED")
  })
})

// Departmental authority is clinical, not research authority. A head of
// department receives no implicit research permission; Status must grant the
// exact scope separately before any research endpoint can be used.
test("a head of department has no research access without an explicit grant", async ({ browser }) => {
  await withRoles(browser, ["hod-a"], async ctx => {
    const refused = await ctx["hod-a"].request.get("/api/research/metadata")
    expect(refused.status()).toBe(403)
    expect((await refused.json()).code).toBe("RESEARCH_ACCESS_REQUIRED")
  })
})

test("Status grants and revokes an HOD's exact research scope immediately", async ({ browser, request }) => {
  await withRoles(browser, ["hod-a"], async ctx => {
    const before = await ctx["hod-a"].request.get("/api/research/metadata")
    expect(before.status()).toBe(403)

    const directoryResponse = await request.get("/api/internal/hospital/accounts", {
      headers: STATUS_HEADERS,
    })
    expect(directoryResponse.ok(), await directoryResponse.text()).toBeTruthy()
    const directory = await directoryResponse.json() as {
      accounts: Array<{ id: string; email: string }>
    }
    const hod = directory.accounts.find(account => account.email === E2E_HOD_A_EMAIL)
    expect(hod).toBeDefined()

    let issuedId: string | null = null
    let revoked = false
    try {
      const issuedResponse = await request.post(
        "/api/internal/hospital/control-plane/research/grants",
        {
          headers: STATUS_HEADERS,
          data: {
            userId: hod!.id,
            institutionId: E2E_INSTITUTION_A,
            allInstitutions: false,
            purpose: "Disposable E2E aggregate research grant",
            expiryDays: 1,
            canQuery: true,
            canInspectCases: false,
            canExportCsv: false,
            canExportJson: false,
            canExportOmop: false,
            canShare: false,
          },
        },
      )
      expect(issuedResponse.status(), await issuedResponse.text()).toBe(201)
      const issued = await issuedResponse.json() as { id: string; expiresAt: string }
      issuedId = issued.id
      expect(Date.parse(issued.expiresAt)).toBeGreaterThan(Date.now())

      const metadata = await ctx["hod-a"].request.get("/api/research/metadata")
      expect(metadata.ok(), await metadata.text()).toBeTruthy()
      const query = await ctx["hod-a"].request.post("/api/research/query", {
        headers: JSON_HEADERS,
        data: EMPTY_COHORT,
      })
      expect(query.ok(), await query.text()).toBeTruthy()
      const result = await query.json()
      expect(result.cases).toEqual([])
      expect(result.pagination).toBeNull()

      const inspect = await ctx["hod-a"].request.post("/api/research/cases/query", {
        headers: JSON_HEADERS,
        data: EMPTY_COHORT,
      })
      expect(inspect.status()).toBe(403)

      const revokedResponse = await request.post(
        `/api/internal/hospital/control-plane/research/grants/${encodeURIComponent(issued.id)}/revoke`,
        {
          headers: STATUS_HEADERS,
          data: { reason: "Disposable E2E grant completed" },
        },
      )
      revoked = revokedResponse.ok()
      expect(revoked, await revokedResponse.text()).toBeTruthy()

      const after = await ctx["hod-a"].request.get("/api/research/metadata")
      expect(after.status()).toBe(403)
      expect((await after.json()).code).toBe("RESEARCH_ACCESS_REQUIRED")
    } finally {
      if (issuedId && !revoked) {
        const cleanupResponse = await request.post(
          `/api/internal/hospital/control-plane/research/grants/${encodeURIComponent(issuedId)}/revoke`,
          {
            headers: STATUS_HEADERS,
            data: { reason: "Disposable E2E grant cleanup" },
          },
        )
        expect.soft(cleanupResponse.ok(), await cleanupResponse.text()).toBeTruthy()
      }
    }
  })
})
