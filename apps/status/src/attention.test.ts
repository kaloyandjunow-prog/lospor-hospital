import { describe, expect, it } from "vitest"
import { attentionItems } from "./attention.js"
import type { HostOsSignal } from "./host-os.js"
import type { ComponentView } from "./types.js"

const NOW = Date.parse("2026-09-13T09:00:00Z")
const component = (id: string, status: ComponentView["status"], code: string, group = "safety") =>
  ({ component: id, label: id, group, status, code, checkedAt: NOW }) as unknown as ComponentView
const recentDrill = { completedAt: "2026-09-01T08:00:00Z", result: "passed" as const, backup: "lospor-20260901T072635Z-W3UVqwGn.backup" }
const quiet = {
  maintenance: { observedAt: "2026-09-13T08:59:00Z", phase: "idle" as const, resultCode: "MAINTENANCE_AGENT_READY", drills: [recentDrill] },
  offhost: null,
  hostOs: null,
  siteConfig: null,
  goLive: null,
  now: NOW,
}

describe("needs attention today", () => {
  it("is empty when everything is in order", () => {
    expect(attentionItems({ ...quiet, components: [
      component("host-backup", "operational", "HOST_BACKUP_FRESH"),
      component("offhost-backup", "operational", "OFFHOST_BACKUP_ACKNOWLEDGED"),
      component("host-os", "operational", "HOST_OS_CURRENT"),
    ] })).toEqual([])
  })

  it("puts what matters now before what can wait, and says where to act", () => {
    const items = attentionItems({ ...quiet, components: [
      component("offhost-backup", "not-configured", "OFFHOST_BACKUP_NOT_CONFIGURED"),
      component("host-backup", "outage", "HOST_BACKUP_OVERDUE"),
      component("host-certificate", "outage", "HOST_CERTIFICATE_EXPIRED"),
      component("appliance-update", "operational", "UPDATE_AVAILABLE"),
    ] })
    expect(items.map(item => [item.id, item.level])).toEqual([
      ["certificate", "now"], ["backup", "today"], ["offhost", "soon"], ["release", "soon"],
    ])
    expect(items.find(item => item.id === "backup")?.href).toBe("/status/maintenance#maintenance-backups")
  })

  it("asks for a restore drill when none passed in three months, and sooner when the last one failed", () => {
    const old = attentionItems({ ...quiet, components: [], maintenance: { ...quiet.maintenance, drills: [{ ...recentDrill, completedAt: "2026-05-01T08:00:00Z" }] } })
    expect(old.find(item => item.id === "drill")).toMatchObject({ level: "soon" })
    const failed = attentionItems({ ...quiet, components: [], maintenance: { ...quiet.maintenance, drills: [{ ...recentDrill, result: "failed" as const }] } })
    expect(failed.find(item => item.id === "drill")).toMatchObject({ level: "today" })
  })

  it("turns Ubuntu's state into tasks, and a restart left a week into a task for today", () => {
    const hostOs: HostOsSignal = {
      observedAt: "2026-09-13T08:59:30Z", release: "24.04", standardSupportEnds: "2029-04-30", securityUpdates: 4, otherUpdates: 0,
      dockerUpdates: true, updatesCheckedAt: null, automaticUpdates: "enabled", lastAutomaticRunAt: null,
      lastAutomaticResult: "never", rebootRequired: true, rebootRequiredSince: "2026-09-02T00:00:00Z", bootedAt: null,
      rebootPolicy: "manual",
    }
    const items = attentionItems({ ...quiet, hostOs, components: [component("host-os", "degraded", "HOST_OS_SECURITY_UPDATES_PENDING")] })
    expect(items.find(item => item.id === "os-updates")).toMatchObject({ level: "today", en: "4 Ubuntu security updates are waiting." })
    expect(items.find(item => item.id === "os-reboot")).toMatchObject({ level: "today" })
    expect(items.find(item => item.id === "os-docker")).toMatchObject({ level: "note" })
  })
})
