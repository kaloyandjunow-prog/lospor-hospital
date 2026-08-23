import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AUDIT_ACTION_REGISTRY } from "@/lib/audit-actions"
import {
  HOSPITAL_AUDIT_GOVERNANCE_INVENTORY,
  type HospitalAuditRequirement,
} from "@/lib/hospital/audit-governance-inventory"

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

const REQUIRED = [
  "ACCOUNT_PROVISION",
  "TOKEN_REISSUE",
  "ACTIVATION",
  "APPROVAL_REJECTION",
  "ROLE_CHANGE",
  "ADMIN_AUTHORITY",
  "INSTITUTION_CHANGE",
  "PASSWORD_CHANGE_RECOVERY",
  "SESSION_REVOCATION",
  "SUSPEND_REACTIVATE",
  "DELETE_RESTORE_ANONYMISE",
  "LEGAL_ACCEPTANCE",
  "RESEARCH_CHANGE",
  "CLINICAL_RULE_GOVERNANCE",
  "CENTRAL_CONTROL",
] as const satisfies readonly HospitalAuditRequirement[]

describe("Hospital HAUD-01 governance inventory", () => {
  it("gives every HAUD requirement an exact disposition", () => {
    const requirements = new Set(HOSPITAL_AUDIT_GOVERNANCE_INVENTORY.map(item => item.requirement))
    expect([...requirements].sort()).toEqual([...REQUIRED].sort())
    expect(new Set(HOSPITAL_AUDIT_GOVERNANCE_INVENTORY.map(item => item.id)).size)
      .toBe(HOSPITAL_AUDIT_GOVERNANCE_INVENTORY.length)
  })

  it("binds each implemented transition to a typed action inside its transaction owner", () => {
    const registered = new Set(AUDIT_ACTION_REGISTRY.map(action => action.code))
    for (const item of HOSPITAL_AUDIT_GOVERNANCE_INVENTORY) {
      if (item.disposition !== "HOSPITAL_TRANSACTIONAL") continue
      for (const source of item.sources) {
        expect(existsSync(join(ROOT, source.path)), source.path).toBe(true)
        const code = read(source.path)
        expect(code, `${item.id} lacks its transaction owner`).toContain(source.transactionMarker)
        expect(code, `${item.id} bypasses the durable writer`).toContain("logAuditInTransaction")
        expect(code, `${item.id} defers evidence after commit`).not.toMatch(
          /after\s*\([\s\S]{0,160}\blogAudit(?:InTransaction)?\s*\(/,
        )
        for (const action of source.actionCodes) {
          expect(registered.has(action), `${item.id}: ${action}`).toBe(true)
          expect(code, `${item.id} does not persist ${action}`).toContain(action)
        }
      }
      expect(existsSync(join(ROOT, item.rollback.evidencePath)), item.rollback.evidencePath).toBe(true)
      expect(read(item.rollback.evidencePath), `${item.id} lacks rollback evidence`)
        .toContain(item.rollback.marker)
    }
  })

  it("keeps Hospital self-registration as a no-mutation deployment branch", () => {
    const item = HOSPITAL_AUDIT_GOVERNANCE_INVENTORY.find(
      entry => entry.disposition === "HOSPITAL_NO_MUTATION",
    )
    expect(item?.disposition).toBe("HOSPITAL_NO_MUTATION")
    if (!item || item.disposition !== "HOSPITAL_NO_MUTATION") return
    expect(read(item.evidencePath)).toContain(item.marker)
    expect(item.limit.trim()).not.toBe("")
  })

  it("pins the six actor-principal decisions and every provenance blocker", () => {
    const decisionBlocked = HOSPITAL_AUDIT_GOVERNANCE_INVENTORY.flatMap(item => (
      item.disposition === "DECISION_BLOCKED" ? [...item.blockedSources] : []
    )).sort()
    expect(decisionBlocked).toEqual([
      "scripts/append-pediatric-fluid-profiles-to-draft.ts",
      "scripts/append-pediatric-infusion-profiles-to-draft.ts",
      "scripts/create-pediatric-v2-platform-draft.ts",
      "scripts/create-platform-clinical-drafts.ts",
      "scripts/prune-clinical-rulesets.ts",
      "scripts/seed-play-reviewer.ts",
    ])
    for (const path of decisionBlocked) expect(existsSync(join(ROOT, path)), path).toBe(true)
    for (const item of HOSPITAL_AUDIT_GOVERNANCE_INVENTORY) {
      if (item.disposition === "PROVENANCE_BLOCKED" || item.disposition === "DECISION_BLOCKED") {
        expect(item.limit.trim(), item.id).not.toBe("")
      }
    }
  })
})
