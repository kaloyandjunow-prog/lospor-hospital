import { describe, expect, it, vi } from "vitest"
import { AUDIT_HISTORY_CATEGORIES, AUDIT_HISTORY_PAGE_SIZE, auditHistory } from "./audit-history"
import { AUDIT_ACTION_REGISTRY } from "@/lib/audit-actions"

function store(logs: unknown[], total = logs.length) {
  return {
    auditLog: { count: vi.fn().mockResolvedValue(total), findMany: vi.fn().mockResolvedValue(logs) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "u1", name: "Ivan Petrov", title: "Dr." }]) },
    technicalPrincipal: { findMany: vi.fn().mockResolvedValue([{ id: "t1", displayName: "Status" }]) },
  }
}

describe("the change history (10.3.0)", () => {
  const at = new Date("2026-11-09T08:00:00Z")

  it("lists who changed what and when, with both labels, and nothing from the row's detail", async () => {
    const db = store([
      { id: "a1", userId: "u1", action: "HOSPITAL_NAME_UPDATE", createdAt: at },
      { id: "a2", userId: "t1", action: "INTRAOP_AUTOMATION_UPDATE", createdAt: at },
      { id: "a3", userId: "gone", action: "HOSPITAL_LOGO_UPDATE", createdAt: at },
    ])
    const view = await auditHistory(db as never)
    expect(view.rows.map(row => row.who)).toEqual(["Dr. Ivan Petrov", "Status", null])
    expect(view.rows[0]).toMatchObject({ action: "HOSPITAL_NAME_UPDATE", category: "SECURITY", labelEn: "Hospital name on the record changed", at: at.toISOString() })
    expect(view.rows[0]!.labelBg).toContain("име")
    expect(Object.keys(view.rows[0]!).sort()).toEqual(["action", "at", "category", "id", "labelBg", "labelEn", "who"])
    // The query selects no detail and no target id at all.
    expect(db.auditLog.findMany.mock.calls[0]![0].select).toEqual({ id: true, userId: true, action: true, createdAt: true })
  })

  it("leaves out sign-ins and case work, and narrows by category or by one action", async () => {
    const db = store([])
    await auditHistory(db as never)
    const all = db.auditLog.findMany.mock.calls[0]![0].where.action.in as string[]
    const byCode = new Map(AUDIT_ACTION_REGISTRY.map(item => [item.code, item.category]))
    expect(all.every(code => (AUDIT_HISTORY_CATEGORIES as readonly string[]).includes(byCode.get(code) as string))).toBe(true)
    expect(all.some(code => byCode.get(code) === "AUTHENTICATION" || byCode.get(code) === "CASE")).toBe(false)

    await auditHistory(db as never, { category: "CENTRAL" })
    expect((db.auditLog.findMany.mock.calls[1]![0].where.action.in as string[]).every(code => byCode.get(code) === "CENTRAL")).toBe(true)

    await auditHistory(db as never, { action: "HOSPITAL_NAME_UPDATE", category: "CENTRAL" })
    expect(db.auditLog.findMany.mock.calls[2]![0].where.action.in).toEqual(["HOSPITAL_NAME_UPDATE"])
    // An action of a category that is not part of the history, or a made-up one, shows nothing.
    await auditHistory(db as never, { action: "CASE_CREATE" })
    expect(db.auditLog.findMany.mock.calls[3]![0].where.action.in).toEqual([])
  })

  it("pages by fifty, newest first, and treats a bad page as the first", async () => {
    const db = store([], 120)
    const view = await auditHistory(db as never, { page: 2 })
    expect(db.auditLog.findMany.mock.calls[0]![0]).toMatchObject({ orderBy: { createdAt: "desc" }, skip: 2 * AUDIT_HISTORY_PAGE_SIZE, take: AUDIT_HISTORY_PAGE_SIZE })
    expect(view).toMatchObject({ total: 120, page: 2, pageSize: 50 })
    await auditHistory(db as never, { page: -3 })
    expect(db.auditLog.findMany.mock.calls[1]![0].skip).toBe(0)
  })
})
