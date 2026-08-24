import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS } from "./roles"

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

// Running a department is not the same as being allowed to study its patients.
//
// Until 1.2.0 a head of department held research access over their own
// department by virtue of the role: it arrived with the job, applied to every
// request they made from then on, and there was nothing to withdraw. The
// entitlement is now the act, not the rank — either a ResearchAccessGrant
// somebody issued, or an eight-hour aggregate self-authorization the clinician
// takes deliberately and which is written to the audit trail. Seniority inside
// a hospital says who may run the list, not who may query the register.
//
// The assertion is inverted from what it used to say, which is the point: this
// is the behaviour 1.2.0 set out to change, and it is pinned here so it cannot
// drift back without somebody noticing.
test("a head of department needs a grant, not a rank", async ({ browser }) => {
  await withRoles(browser, ["hod-a"], async ctx => {
    const refused = await ctx["hod-a"].request.get("/api/research/metadata")
    expect(refused.status()).toBe(403)
    expect((await refused.json()).code).toBe("RESEARCH_ACCESS_REQUIRED")

    // The door is not bolted, it is a door: aggregate self-authorization is
    // offered to them, aggregate-only and time-limited. Read rather than taken
    // — issuing one costs a 24-hour cooldown that the e2e seeder does not
    // clear, so a spec that spent it would fail on the next run of the day.
    const offer = await ctx["hod-a"].request.get("/api/research/self-authorization")
    expect(offer.ok(), await offer.text()).toBeTruthy()
    const terms = await offer.json()
    expect(terms.permissions.query).toBe(true)
    expect(terms.permissions.inspectCases).toBe(false)
    expect(terms.permissions.export).toBe(false)
    expect(typeof terms.nextEligibleAt).toBe("string")
  })
})
