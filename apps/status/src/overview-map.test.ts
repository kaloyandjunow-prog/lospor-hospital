import { describe, expect, it } from "vitest"
import { attentionItems } from "./attention.js"
import type { ApplianceSnapshot, ComponentView, DashboardData } from "./types.js"
import { mapNodes, overviewMap } from "./ui-shell.js"

// The overview map (1.5.6). Before it, four boxes were green for being switched
// on or set up: a hospital feed silent for days, a Mistral key that no longer
// works, an update route that cannot ask, and backups kept only on this server.
// A box is now green only when its thing is known to work, and every amber or
// red box has a to-do item at the same threshold.

const NOW = Date.parse("2026-10-11T09:40:00Z")
const H = 3_600_000
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const HEALTHY: Record<string, [ComponentView["status"], string, string]> = {
  web: ["operational", "HTTP_OK", "clinical"], pwa: ["operational", "HTTP_OK", "clinical"], api: ["operational", "API_READY", "clinical"],
  database: ["operational", "DATABASE_OK", "clinical"], proxy: ["operational", "HTTP_OK", "clinical"], browser: ["operational", "HTTP_OK", "research"],
  "host-storage": ["operational", "HOST_STORAGE_OK", "safety"], "host-certificate": ["operational", "HOST_CERTIFICATE_VALID", "safety"],
  "host-clock": ["operational", "HOST_CLOCK_SYNCHRONIZED", "safety"], "host-services": ["operational", "HOST_SERVICES_HEALTHY", "safety"],
  migrations: ["operational", "MIGRATIONS_CURRENT", "safety"], "offhost-backup": ["operational", "OFFHOST_BACKUP_ACKNOWLEDGED", "safety"],
  "update-supply": ["operational", "UPDATE_SUPPLY_CONNECTED", "safety"], "appliance-update": ["operational", "RELEASE_CURRENT", "safety"],
  central: ["operational", "CENTRAL_READY", "research"],
}

function components(changes: Record<string, [ComponentView["status"], string]> = {}): ComponentView[] {
  return Object.entries(HEALTHY).map(([component, [status, code, group]]) => {
    const [actual, actualCode] = changes[component] ?? [status, code]
    return { component, label: component, group, status: actual, code: actualCode, checkedAt: NOW, observedStatus: actual, changedAt: NOW } as ComponentView
  })
}

function snapshot(changes: Partial<ApplianceSnapshot> & {
  ehr?: Partial<NonNullable<ApplianceSnapshot["integrations"]>["ehr"]>
  ai?: Partial<NonNullable<ApplianceSnapshot["integrations"]>["ai"]>
  waiting?: number
} = {}): ApplianceSnapshot {
  const { ehr, ai, waiting, ...rest } = changes
  return {
    schemaVersion: 1, generatedAt: ago(0), versions: {}, operatorCredentialGeneration: 1, operatorCredentialIdentityProof: null,
    email: { configured: false }, database: { logicalSize: { state: "unknown" }, migrations: { state: "ok" } },
    research: { exportsByStatus: {}, storage: { driver: "filesystem", state: "unknown" } },
    central: { configured: true, enrolled: true, exportPolicyApproved: true, casesWithUnacceptedChanges: waiting ?? 2, deliveriesByStatus: {}, enrolledAt: null, lastCapabilitiesAt: null, lastDeliveryAt: null },
    activity: { activeUsers: 7, activeClinical: 6, activeResearch: 1, days: [] },
    integrations: {
      ehr: { configured: true, lastReceivedAt: ago(12 * 60_000), readFailures24h: 0, unmappedCodes: 0, ...ehr },
      ai: { enabled: true, check: { state: "ok", checkedAt: ago(10 * 60_000) }, ...ai },
    },
    centralOldestWaitingSince: ago(3 * H),
    researchExportsFailed7d: 0,
    lastAdministratorAddedAt: null,
    ...rest,
  }
}

const quiet = {
  maintenance: { observedAt: ago(60_000), phase: "idle" as const, resultCode: "MAINTENANCE_AGENT_READY", drills: [{ completedAt: ago(20 * 24 * H), result: "passed" as const, backup: "lospor.backup" }] },
  offhost: null, hostOs: null, siteConfig: null, goLive: null, now: NOW,
}

function view(snap: ApplianceSnapshot, list = components()) {
  const attention = attentionItems({ ...quiet, components: list, snapshot: snap })
  const data: DashboardData = { components: list, incidents: [], events: [], histories: {}, lastCheckedAt: NOW, snapshot: snap, snapshotReceivedAt: NOW }
  const nodes = Object.fromEntries(mapNodes(data, attention, "en", NOW).map(node => [node.en, node]))
  return { attention, nodes, ids: attention.map(item => item.id), html: overviewMap(data, attention, "en", NOW) }
}

describe("the overview map", () => {
  it("is all green, with nothing to do, when everything works", () => {
    const { nodes, attention } = view(snapshot())
    expect(Object.values(nodes).map(node => [node.en, node.state])).toEqual([
      ["Phones and computers", "good"], ["Updates", "good"], ["Backups", "good"], ["Hospital system", "good"],
      ["LOSPOR Central", "good"], ["Mistral AI (EU)", "good"], ["Research", "good"],
    ])
    expect(nodes["LOSPOR Central"]!.sub).toBe("2 waiting, oldest 3 h")
    expect(attention).toEqual([])
  })

  it("turns the hospital system amber after a quiet day and red after three", () => {
    expect(view(snapshot({ ehr: { lastReceivedAt: ago(20 * H) } })).nodes["Hospital system"]!.state).toBe("good")
    const day = view(snapshot({ ehr: { lastReceivedAt: ago(30 * H) } }))
    expect(day.nodes["Hospital system"]).toMatchObject({ state: "warn", sub: "no data for 30 h" })
    expect(day.attention.find(item => item.id === "ehr-quiet")?.level).toBe("soon")
    const days = view(snapshot({ ehr: { lastReceivedAt: ago(76 * H) } }))
    expect(days.nodes["Hospital system"]).toMatchObject({ state: "bad", sub: "no data for 3 days" })
    expect(days.attention.find(item => item.id === "ehr-quiet")?.level).toBe("today")
  })

  it("shows failed reads and unmapped codes from the hospital system", () => {
    const reads = view(snapshot({ ehr: { readFailures24h: 4 } }))
    expect(reads.nodes["Hospital system"]).toMatchObject({ state: "warn", sub: "4 failed reads in 24 h" })
    expect(reads.ids).toContain("ehr-reads")
    const codes = view(snapshot({ ehr: { unmappedCodes: 7 } }))
    expect(codes.nodes["Hospital system"]).toMatchObject({ state: "warn", sub: "7 codes not mapped" })
    expect(codes.attention.find(item => item.id === "ehr-unmapped")?.href).toBe("/status/control/codes")
  })

  it("leaves a hospital system that is not set up grey, with nothing to do", () => {
    const { nodes, ids } = view(snapshot({ ehr: { configured: false, lastReceivedAt: null } }))
    expect(nodes["Hospital system"]!.state).toBe("off")
    expect(ids.filter(id => id.startsWith("ehr-"))).toEqual([])
  })

  it("turns Mistral red when it refuses the key and amber when it does not answer", () => {
    const refused = view(snapshot({ ai: { check: { state: "key-refused", checkedAt: ago(0) } } }))
    expect(refused.nodes["Mistral AI (EU)"]).toMatchObject({ state: "bad", sub: "Mistral refuses the key" })
    expect(refused.attention.find(item => item.id === "ai-check")?.level).toBe("today")
    const silent = view(snapshot({ ai: { check: { state: "unreachable", checkedAt: ago(0) } } }))
    expect(silent.nodes["Mistral AI (EU)"]!.state).toBe("warn")
    const off = view(snapshot({ ai: { enabled: false, check: { state: "key-refused", checkedAt: ago(0) } } }))
    expect(off.nodes["Mistral AI (EU)"]!.state).toBe("off")
    expect(off.ids).not.toContain("ai-check")
  })

  it("says when updates cannot be checked, except on a site that installs them by hand", () => {
    const failed = view(snapshot(), components({ "appliance-update": ["unknown", "UPDATE_CHECK_FAILED"] }))
    expect(failed.nodes.Updates).toMatchObject({ state: "warn", sub: "cannot check for updates" })
    expect(failed.ids).toContain("update-check")
    const offline = view(snapshot(), components({ "appliance-update": ["unknown", "UPDATE_CHECK_NEVER_RUN"], "update-supply": ["operational", "UPDATE_SUPPLY_OFFLINE"] }))
    expect(offline.nodes.Updates!.state).toBe("off")
    expect(offline.ids).not.toContain("update-check")
  })

  it("turns backups amber when copies exist only on this server", () => {
    const { nodes } = view(snapshot(), components({ "offhost-backup": ["not-configured", "OFFHOST_BACKUP_NOT_CONFIGURED"] }))
    expect(nodes.Backups).toMatchObject({ state: "warn", sub: "only on this server" })
  })

  it("draws Research: red when the website does not answer, amber after failed exports", () => {
    const down = view(snapshot(), components({ browser: ["outage", "HTTP_UNREACHABLE"] }))
    expect(down.nodes.Research!.state).toBe("bad")
    expect(down.ids).toContain("research-down")
    const failed = view(snapshot({ researchExportsFailed7d: 2 }))
    expect(failed.nodes.Research).toMatchObject({ state: "warn", sub: "2 exports failed" })
    expect(failed.ids).toContain("exports-failed")
  })

  it("counts failed exports over the last week, not forever", () => {
    const old = snapshot({ researchExportsFailed7d: 0 })
    old.research.exportsByStatus = { FAILED: 3 }
    expect(view(old).nodes.Research!.state).toBe("good")
  })

  it("says how long the oldest case has waited for Central, amber after two days", () => {
    const { nodes, attention } = view(snapshot({ waiting: 3, centralOldestWaitingSince: ago(9 * 24 * H) }))
    expect(nodes["LOSPOR Central"]).toMatchObject({ state: "warn", sub: "3 waiting, oldest 9 days" })
    expect(attention.find(item => item.id === "central-waiting")?.en).toContain("9 days")
    expect(view(snapshot({ waiting: 0, centralOldestWaitingSince: null })).nodes["LOSPOR Central"]!.sub).toBe("0 waiting")
  })

  it("notes a new administrator for a week", () => {
    expect(view(snapshot({ lastAdministratorAddedAt: ago(2 * 24 * H) })).attention.find(item => item.id === "new-admin")?.level).toBe("note")
    expect(view(snapshot({ lastAdministratorAddedAt: ago(8 * 24 * H) })).ids).not.toContain("new-admin")
  })

  it("gives the gateway and the server their own dots, each keeping its own colour", () => {
    const { html } = view(snapshot(), components({ "host-certificate": ["degraded", "HOST_CERTIFICATE_EXPIRING"] }))
    expect(html).toContain('class="node core warn"')
    const parts = html.match(/<g class="parts">(.*?)<\/g>/)![1]!
    expect(parts).toMatch(/<circle class="good"[^>]*\/><text[^>]*>Gateway</)
    expect(parts).toMatch(/<circle class="warn"[^>]*\/><text[^>]*>Server</)
    expect(parts.match(/class="warn"/g)).toHaveLength(1)
  })

  it("explains every amber or red box in the to-do list", () => {
    const { nodes, attention } = view(
      snapshot({ ehr: { lastReceivedAt: ago(80 * H) }, ai: { check: { state: "key-refused", checkedAt: ago(0) } }, waiting: 1, centralOldestWaitingSince: ago(5 * 24 * H), researchExportsFailed7d: 1 }),
      components({ "appliance-update": ["unknown", "UPDATE_CHECK_FAILED"], "offhost-backup": ["not-configured", "OFFHOST_BACKUP_NOT_CONFIGURED"] }),
    )
    const hrefs = new Set(attention.map(item => item.href.replace(/#.*$/, "")))
    for (const node of Object.values(nodes).filter(node => node.state === "warn" || node.state === "bad")) {
      const expected = node.href === "/status/maintenance/backups" ? "/status/maintenance" : node.href
      expect([...hrefs].some(href => href === expected || href.startsWith(expected)), node.en).toBe(true)
    }
  })
})
