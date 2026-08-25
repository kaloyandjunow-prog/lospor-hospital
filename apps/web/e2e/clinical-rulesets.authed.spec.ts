import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS } from "./roles"

// Who may change a dose, and how far.
//
// A department can tune the drug list it works from — narrow a slider to the
// concentrations it stocks, drop the pills it never uses, reorder them. What it
// cannot do is widen anything. The platform ruleset is the reviewed envelope;
// an institution or personal layer may sit inside it, never outside. Otherwise
// one hospital quietly raising a ceiling would make every dose recorded in the
// register mean something different from every other.
//
// The guard itself is measured field by field in the API's unit tests. What
// this covers is the path a head of department actually takes to reach it:
// which scopes they are allowed to manage, creating a departmental copy, and
// the refusal arriving with the offending field named.

type Rule = { ruleKey: string; payload: Record<string, unknown> }
type Preset = {
  id: string
  scope: string
  status: string
  clinicalMode: string
  rules: Rule[]
}

/** A drug profile with a numeric ceiling on at least one route, whatever it is
 *  called in today's ruleset — the spec must not depend on Propofol existing. */
function findWidenableRule(rules: Rule[]): { rule: Rule; route: string; max: number } | null {
  for (const rule of rules) {
    const profile = rule.payload?.profile as { routeModes?: Record<string, { max?: unknown }> } | undefined
    const routeModes = profile?.routeModes
    if (!routeModes) continue
    for (const [route, mode] of Object.entries(routeModes)) {
      if (typeof mode?.max === "number" && Number.isFinite(mode.max)) {
        return { rule, route, max: mode.max }
      }
    }
  }
  return null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

test("a member may not manage a department's rulesets", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const api = ctx["member-a"].request

    const institution = await api.get("/api/clinical/rules/workbench?scope=INSTITUTION&mode=ADULT")
    expect(institution.status()).toBe(403)

    // Their own personal layer is theirs to manage, and is what they are given
    // by default.
    const personal = await api.get("/api/clinical/rules/workbench?mode=ADULT")
    expect(personal.ok(), await personal.text()).toBeTruthy()
    const body = await personal.json()
    expect(body.management.allowedScopes).toEqual(["USER"])
  })
})

test("a head of department may manage their institution but not the platform", async ({ browser }) => {
  await withRoles(browser, ["hod-a"], async ctx => {
    const api = ctx["hod-a"].request

    const workbench = await api.get("/api/clinical/rules/workbench?scope=INSTITUTION&mode=ADULT")
    expect(workbench.ok(), await workbench.text()).toBeTruthy()
    const body = await workbench.json()
    expect(body.management.allowedScopes).toContain("INSTITUTION")
    expect(body.management.allowedScopes).not.toContain("PLATFORM")

    expect((await api.get("/api/clinical/rules/workbench?scope=PLATFORM&mode=ADULT")).status()).toBe(403)
  })
})

// Where the narrow-only ceiling still bites, since 1.2.0 moved the line.
//
// It used to sit at the institution layer: a department could tighten a slider
// and nothing else. HCLN-02 moved the institution layer's control from a
// structural refusal to a governed act — publishing an institution ruleset now
// requires the head of department to re-enter their password, give a reason, and
// have the exact before/after diff written to the audit trail — so a department
// may move a numeric bound in either direction and answer for it. The personal
// layer has no such ceremony behind it, so it stays narrow-only: one clinician
// must not be able to quietly raise a reviewed maximum for themselves.
//
// This is deliberately asserted at USER scope for that reason. The companion
// test below pins what the institution layer still may not do.
test("a personal ruleset may narrow a dose but not widen it", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const api = ctx["member-a"].request

    const workbench = await api
      .get("/api/clinical/rules/workbench?mode=ADULT")
      .then(r => r.json())

    const platform = (workbench.presets as Preset[])
      .find(preset => preset.scope === "PLATFORM" && preset.status === "PUBLISHED")
    expect(platform, "no published platform adult ruleset to copy from").toBeTruthy()

    // The baseline the guard measures against, read from the platform ruleset
    // itself. The copy carries the identical payload under the identical rule
    // key, so editing this one edits the departmental copy of it.
    const target = findWidenableRule(platform!.rules)
    expect(target, "the platform ruleset has no drug profile with a numeric ceiling").toBeTruthy()
    const { rule, route, max } = target!

    // A fresh key per run: there is no delete-ruleset action, and reusing a key
    // would collide. `npm run e2e:seed` clears anything starting with "e2e_".
    const created = await api.post("/api/clinical/rules/workbench", {
      headers: JSON_HEADERS,
      data: {
        action: "create-ruleset",
        scope: "USER",
        clinicalMode: "ADULT",
        key: `e2e_scope_guard_${Date.now().toString(36)}`,
        name: "E2E personal copy",
        copyFromPresetId: platform!.id,
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const draft = await created.json() as Preset
    expect(draft.scope).toBe("USER")
    expect(draft.status).toBe("DRAFT")

    // ── widening the ceiling is refused, and the field is named ───────────
    const widened = clone(rule.payload)
    const widenedModes = (widened.profile as { routeModes: Record<string, { max: number }> }).routeModes
    widenedModes[route]!.max = max * 2 + 100

    const refused = await api.post("/api/clinical/rules/workbench", {
      headers: JSON_HEADERS,
      data: { action: "upsert-rule", presetId: draft.id, payload: widened },
    })
    expect(refused.status(), await refused.text()).toBe(403)
    const refusal = await refused.json()
    expect(refusal.error).toContain("scope")
    // Not just "no": which field, so the department can see what it did.
    expect(JSON.stringify(refusal.issues)).toContain(`routeModes.${route}.max`)

    // ── narrowing the same ceiling is allowed ─────────────────────────────
    const narrowed = clone(rule.payload)
    const narrowedModes = (narrowed.profile as {
      routeModes: Record<string, { min?: number; max: number; quickValues?: number[] }>
    }).routeModes
    const mode = narrowedModes[route]!
    const tighter = Math.max((mode.min ?? 0) + 1, Math.floor(max / 2))
    mode.max = tighter
    // Pills above the new ceiling would contradict it.
    if (Array.isArray(mode.quickValues)) {
      mode.quickValues = mode.quickValues.filter(value => value <= tighter)
    }

    const accepted = await api.post("/api/clinical/rules/workbench", {
      headers: JSON_HEADERS,
      data: { action: "upsert-rule", presetId: draft.id, payload: narrowed },
    })
    expect(accepted.ok(), await accepted.text()).toBeTruthy()
    expect((await accepted.json()).ruleKey).toBe(rule.ruleKey)
  })
})

// The institution layer's remaining hard boundary.
//
// A department may retune the numbers it works from — that is the point of
// having a departmental layer, and publication is where it is re-authenticated,
// reasoned and audited. What no amount of ceremony makes acceptable is one
// hospital changing what a drug *is*: its display name, its catalog identity,
// its canonical unit, or the routes it exists on. Recorded observations have to
// keep meaning the same thing in every hospital in the register, and a
// departmental relabelling of Bupivacaine would silently break that.
test("a department may retune the platform numbers but not redefine the drug", async ({ browser }) => {
  await withRoles(browser, ["hod-a"], async ctx => {
    const api = ctx["hod-a"].request

    const workbench = await api
      .get("/api/clinical/rules/workbench?scope=INSTITUTION&mode=ADULT")
      .then(r => r.json())
    const platform = (workbench.presets as Preset[])
      .find(preset => preset.scope === "PLATFORM" && preset.status === "PUBLISHED")
    expect(platform, "no published platform adult ruleset to copy from").toBeTruthy()

    const target = findWidenableRule(platform!.rules)
    expect(target, "the platform ruleset has no drug profile with a numeric ceiling").toBeTruthy()
    const { rule, route, max } = target!

    const created = await api.post("/api/clinical/rules/workbench", {
      headers: JSON_HEADERS,
      data: {
        action: "create-ruleset",
        scope: "INSTITUTION",
        clinicalMode: "ADULT",
        key: `e2e_institution_scope_${Date.now().toString(36)}`,
        name: "E2E departmental copy",
        copyFromPresetId: platform!.id,
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const draft = await created.json() as Preset
    expect(draft.scope).toBe("INSTITUTION")

    // ── moving the ceiling is the department's call to make ───────────────
    const retuned = clone(rule.payload)
    const retunedModes = (retuned.profile as { routeModes: Record<string, { max: number }> }).routeModes
    retunedModes[route]!.max = max * 2 + 100

    const allowed = await api.post("/api/clinical/rules/workbench", {
      headers: JSON_HEADERS,
      data: { action: "upsert-rule", presetId: draft.id, payload: retuned },
    })
    expect(allowed.ok(), await allowed.text()).toBeTruthy()

    // ── renaming the drug is not ──────────────────────────────────────────
    const relabelled = clone(rule.payload)
    relabelled.labelEn = "E2E Renamed Agent"

    const refused = await api.post("/api/clinical/rules/workbench", {
      headers: JSON_HEADERS,
      data: { action: "upsert-rule", presetId: draft.id, payload: relabelled },
    })
    expect(refused.status(), await refused.text()).toBe(403)
    const refusal = await refused.json()
    expect(refusal.error).toContain("scope")
    expect(JSON.stringify(refusal.issues)).toContain("labelEn")
  })
})

test("a head of one department cannot author for another", async ({ browser }) => {
  await withRoles(browser, ["hod-b"], async ctx => {
    const refused = await ctx["hod-b"].request.post("/api/clinical/rules/workbench", {
      headers: JSON_HEADERS,
      data: {
        action: "create-ruleset",
        scope: "INSTITUTION",
        clinicalMode: "ADULT",
        key: `e2e_wrong_owner_${Date.now().toString(36)}`,
        name: "E2E cross-institution attempt",
        institutionId: "e2e-institution",
      },
    })
    expect(refused.status()).toBe(403)
  })
})
