import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { AUDIT_ACTION_REGISTRY } from "@/lib/audit-actions"

const API_ROOT = resolve(import.meta.dirname, "..")

/**
 * Routes the appliance has deliberately turned into no-mutation tombstones.
 *
 * They are asserted the other way round rather than simply dropped from the
 * durable list: a tombstone that quietly regained a write would otherwise be
 * covered by nothing at all, which is the weaker of the two failure modes.
 */
const TOMBSTONED_LIFECYCLE_ROUTES = [
  {
    path: "app/v1/admin/users/route.ts",
    marker: "STATUS_ACCOUNT_PROVISIONING_REQUIRED",
  },
] as const

const DURABLE_LIFECYCLE_ROUTES = [
  "app/v1/admin/users/[id]/route.ts",
  "app/v1/admin/users/[id]/approve/route.ts",
  "app/v1/admin/role-requests/[id]/route.ts",
  "app/v1/role-request/route.ts",
  "app/v1/user/institution-request/route.ts",
  "app/v1/admin/institution-requests/[id]/route.ts",
  "app/v1/user/delete/route.ts",
  "app/v1/user/accept-terms/route.ts",
  "app/v1/auth/password-reset/confirm/route.ts",
  "app/v1/auth/verify-email/route.ts",
  "app/v1/hospital/cases/[id]/export-control/route.ts",
  "app/v1/research/cohorts/route.ts",
  "app/v1/research/cohorts/[id]/route.ts",
  "app/v1/research/grants/route.ts",
  "app/v1/research/grants/[id]/route.ts",
] as const

const DURABLE_LIFECYCLE_SERVICES = [
  "lib/clinical-rules/service.ts",
  "lib/hospital/account-provisioning.ts",
  "lib/hospital/control-plane.ts",
  "lib/hospital/enrollment.ts",
  "lib/hospital/research-control.ts",
  "lib/purge-deleted.ts",
  "lib/research/exports.ts",
] as const

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : productionTypeScriptFiles(path)
    }
    return entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts")
      ? [path]
      : []
  })
}

function literalAuditActions(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const actions: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const actionIndex = node.expression.text === "logAuditInTransaction"
        ? 2
        : node.expression.text === "logAudit"
          ? 1
          : -1
      const action = actionIndex >= 0 ? node.arguments[actionIndex] : undefined
      if (action && ts.isStringLiteral(action)) actions.push(action.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return actions
}

describe("HAUD-01 lifecycle drift contracts", () => {
  it.each(DURABLE_LIFECYCLE_ROUTES)("keeps %s mutation and evidence transactional", relative => {
    const source = readFileSync(resolve(API_ROOT, relative), "utf8")
    expect(source).toMatch(/\$transaction|withDirectTransaction/)
    expect(source).toContain("logAuditInTransaction")
  })

  it.each(TOMBSTONED_LIFECYCLE_ROUTES)("keeps $path a no-mutation tombstone", ({ path, marker }) => {
    const source = readFileSync(resolve(API_ROOT, path), "utf8")
    expect(source).toContain(marker)
    expect(source).not.toMatch(/\$transaction|withDirectTransaction/)
    expect(source).not.toMatch(
      /\b(?:prisma|tx|transaction)\.\w+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    )
  })

  it.each(DURABLE_LIFECYCLE_SERVICES)("keeps %s lifecycle evidence in its transaction owner", relative => {
    const source = readFileSync(resolve(API_ROOT, relative), "utf8")
    expect(source).toMatch(/\$transaction|withDirectTransaction/)
    expect(source).toContain("logAuditInTransaction")
  })

  it("routes production audit writes through the privacy-enforcing helper", () => {
    const durableWriter = resolve(API_ROOT, "lib/audit-evidence.ts")
    const bestEffortWriter = resolve(API_ROOT, "lib/audit.ts")
    expect(readFileSync(durableWriter, "utf8")).toContain("auditLog.create")
    expect(readFileSync(bestEffortWriter, "utf8")).toContain("auditLog.create")

    for (const path of productionTypeScriptFiles(API_ROOT)) {
      if (path === durableWriter || path === bestEffortWriter) continue
      const source = readFileSync(path, "utf8")
      expect(source).not.toMatch(/\bauditLog\.create(?:Many)?\s*\(/)
    }
  })

  it("does not leave account/research mutations in post-commit route callbacks", () => {
    for (const relative of [
      "app/v1/internal/purge-deleted/route.ts",
      "app/v1/research/cohorts/route.ts",
      "app/v1/research/cohorts/[id]/route.ts",
      "app/v1/research/exports/route.ts",
    ]) {
      const source = readFileSync(resolve(API_ROOT, relative), "utf8")
      expect(source).not.toMatch(/after\(\(\) => logAudit/)
    }
  })

  it("keeps every clinical-rules transition and its audit in the service transaction", () => {
    const service = readFileSync(resolve(API_ROOT, "lib/clinical-rules/service.ts"), "utf8")
    const route = readFileSync(resolve(API_ROOT, "app/v1/clinical/rules/workbench/route.ts"), "utf8")
    for (const action of [
      "CLINICAL_RULESET_CREATE",
      "CLINICAL_RULESET_RULE_UPSERT",
      "CLINICAL_RULESET_PEDIATRIC_DRUG_REPLACE",
      "CLINICAL_RULESET_RULE_DELETE",
      "CLINICAL_RULESET_PUBLISH",
      "CLINICAL_RULESET_SELECT",
      "CLINICAL_RULESET_SELECTION_CLEAR",
    ]) {
      expect(service, action).toContain(action)
    }
    expect(service).toContain("logAuditInTransaction")
    expect(route).not.toContain("logAudit(")
    expect(route).not.toContain("logAuditInTransaction(")
  })

  it("keeps every persisted literal action in the public registry", () => {
    const registry: ReadonlySet<string> = new Set(AUDIT_ACTION_REGISTRY.map(action => action.code))
    for (const path of productionTypeScriptFiles(API_ROOT)) {
      const source = readFileSync(path, "utf8")
      for (const action of literalAuditActions(path, source)) {
        expect(registry.has(action), `${path}: ${action}`).toBe(true)
      }
    }
  })
})
