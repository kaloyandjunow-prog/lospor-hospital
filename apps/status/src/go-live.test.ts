import { describe, expect, it } from "vitest"
import { evaluateGoLive, GO_LIVE_SIGNOFF_ITEMS, type GoLiveSignoff } from "./go-live.js"
import type { TerminologyAgentSignal } from "./signals.js"
import type { ComponentView } from "./types.js"

const NOW = Date.parse("2026-09-13T09:00:00Z")
const DAY = 24 * 60 * 60_000

const component = (name: string, status: ComponentView["status"], code: string): ComponentView => ({
  component: name,
  label: name,
  group: "safety",
  status,
  observedStatus: status,
  code,
  checkedAt: NOW,
  changedAt: NOW,
})

const healthy = (): ComponentView[] => [
  component("host-certificate", "operational", "HOST_CERTIFICATE_VALID"),
  component("host-services", "operational", "HOST_SERVICES_HEALTHY"),
  component("host-clock", "operational", "HOST_CLOCK_SYNCHRONIZED"),
  component("host-backup", "operational", "HOST_BACKUP_FRESH"),
  component("offhost-backup", "operational", "OFFHOST_BACKUP_ACKNOWLEDGED"),
  component("key-escrow", "operational", "KEY_ESCROW_ACKNOWLEDGED"),
  component("update-supply", "operational", "UPDATE_SUPPLY_CONNECTED"),
  component("host-update-agent", "operational", "HOST_UPDATE_AGENT_HEALTHY"),
  component("host-os", "operational", "HOST_OS_CURRENT"),
  component("host-activation-lock", "operational", "HOST_ACTIVATION_LOCK_CLEAR"),
  component("host-restore-lock", "operational", "HOST_RESTORE_LOCK_CLEAR"),
]

const terminology: TerminologyAgentSignal = {
  observedAt: new Date(NOW).toISOString(),
  phase: "idle",
  resultCode: "TERMINOLOGY_AGENT_READY",
  rollbackAvailable: false,
  packageId: "hospital-omop",
  packageVersion: "2026.08",
  activatedAt: "2026-09-01T10:00:00Z",
  manifestSha256: "a".repeat(64),
}

const set = { statusOpenToAllPrivate: false, researchClosed: false }

const allSigned = (signedAt = NOW - DAY): GoLiveSignoff[] =>
  GO_LIVE_SIGNOFF_ITEMS.map(item => ({ item: item.id, signedAt, operatorRef: "status-operator-1", note: "done" }))

describe("go-live evaluation", () => {
  it("is ready only when every observed check passes and every sign-off is current", () => {
    expect(evaluateGoLive({ components: healthy(), terminology, networkLists: set, signoffs: allSigned(), now: NOW }).state)
      .toBe("GO_LIVE_READY")
  })

  it("a fresh installation is blocked, with every unmet item named", () => {
    const view = evaluateGoLive({
      components: [
        component("host-certificate", "degraded", "HOST_CERTIFICATE_EXPIRING"),
        component("offhost-backup", "degraded", "OFFHOST_BACKUP_NOT_CONFIGURED"),
        component("key-escrow", "degraded", "KEY_ESCROW_MISSING"),
      ],
      terminology: { ...terminology, packageId: undefined, activatedAt: undefined },
      networkLists: { statusOpenToAllPrivate: true, researchClosed: true },
      signoffs: [],
      now: NOW,
    })
    expect(view.state).toBe("GO_LIVE_BLOCKED")
    expect(view.checks.filter(check => !check.satisfied).map(check => check.id)).toEqual([
      "certificate", "services", "clock", "backup", "offhost-backup", "key-escrow", "update-route", "host-os", "network-lists", "terminology",
    ])
    expect(view.signoffs.every(signoff => !signoff.satisfied)).toBe(true)
  })

  it("a missing observation never counts as passing", () => {
    const view = evaluateGoLive({ components: [], terminology: null, networkLists: null, signoffs: allSigned(), now: NOW })
    expect(view.state).toBe("GO_LIVE_BLOCKED")
    expect(view.checks.some(check => check.satisfied)).toBe(false)
  })

  it("the network lists left as installed block go-live until both are set", () => {
    for (const networkLists of [{ statusOpenToAllPrivate: true, researchClosed: false }, { statusOpenToAllPrivate: false, researchClosed: true }]) {
      const view = evaluateGoLive({ components: healthy(), terminology, networkLists, signoffs: allSigned(), now: NOW })
      expect(view.state).toBe("GO_LIVE_BLOCKED")
      expect(view.checks.filter(check => !check.satisfied).map(check => check.id)).toEqual(["network-lists"])
    }
  })

  it("a restore drill older than a quarter no longer counts", () => {
    const stale = allSigned().map(signoff =>
      signoff.item === "restore-drill" ? { ...signoff, signedAt: NOW - 93 * DAY } : signoff)
    const view = evaluateGoLive({ components: healthy(), terminology, networkLists: set, signoffs: stale, now: NOW })
    expect(view.state).toBe("GO_LIVE_BLOCKED")
    const drill = view.signoffs.find(signoff => signoff.id === "restore-drill")!
    expect(drill.expired).toBe(true)
    expect(drill.satisfied).toBe(false)
    expect(view.signoffs.find(signoff => signoff.id === "clinical-acceptance")!.satisfied).toBe(true)
  })

  it("an interrupted release activation requires recovery, whatever else is true", () => {
    const components = healthy().map(entry => entry.component === "host-activation-lock"
      ? component("host-activation-lock", "outage", "HOST_ACTIVATION_LOCK_PRESENT") : entry)
    expect(evaluateGoLive({ components, terminology, networkLists: set, signoffs: allSigned(), now: NOW }).state).toBe("RECOVERY_REQUIRED")
  })

  it("a running restore or terminology operation is maintenance, not ready", () => {
    const restoring = healthy().map(entry => entry.component === "host-restore-lock"
      ? component("host-restore-lock", "degraded", "HOST_RESTORE_LOCK_PRESENT") : entry)
    expect(evaluateGoLive({ components: restoring, terminology, networkLists: set, signoffs: allSigned(), now: NOW }).state).toBe("MAINTENANCE")
    expect(evaluateGoLive({ components: healthy(), terminology: { ...terminology, phase: "working" }, networkLists: set, signoffs: allSigned(), now: NOW }).state)
      .toBe("MAINTENANCE")
  })
})
