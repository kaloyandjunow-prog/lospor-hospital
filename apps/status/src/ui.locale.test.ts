import { describe, expect, it } from "vitest"
import type { DashboardData } from "./types.js"
import {
  CODE_MESSAGE,
  CODE_MESSAGE_BG,
  EVENT_MESSAGE_BG,
  renderDashboard,
  renderLogin,
  renderMfaLogin,
  renderMfaRecoveryCodes,
  renderRelease,
} from "./ui.js"
import { BACKUP_FAILURE_CODES } from "./signals.js"
import { STATUS_SECURITY_EVENT_CODES } from "./auth.js"

const EMPTY_DASHBOARD: DashboardData = {
  components: [],
  incidents: [],
  events: [],
  histories: {},
  lastCheckedAt: null,
  snapshot: null,
  snapshotReceivedAt: null,
}

describe("Status screen localization", () => {
  it("ships Bulgarian for every coded operational explanation", () => {
    expect(Object.keys(CODE_MESSAGE_BG).sort()).toEqual(Object.keys(CODE_MESSAGE).sort())
    for (const value of Object.values(CODE_MESSAGE_BG)) expect(value.trim().length).toBeGreaterThan(10)
  })

  it("ships Bulgarian for every Status authentication and MFA security event", () => {
    for (const code of STATUS_SECURITY_EVENT_CODES) {
      expect(EVENT_MESSAGE_BG[code], code).toBeTruthy()
      expect(EVENT_MESSAGE_BG[code], code).not.toMatch(/^A |^An |^Status administrator/)
    }
  })

  it("localizes every accepted backup result in Bulgarian and English", () => {
    for (const code of ["BACKUP_VERIFIED", ...BACKUP_FAILURE_CODES]) {
      expect(CODE_MESSAGE[code], `${code} English`).toBeTruthy()
      expect(CODE_MESSAGE_BG[code], `${code} Bulgarian`).toBeTruthy()
    }
    expect(CODE_MESSAGE.BACKUP_BUSY).toBeUndefined()
    expect(CODE_MESSAGE_BG.BACKUP_BUSY).toBeUndefined()
  })

  it("renders the complete login and dashboard shells in either language", () => {
    const bulgarianLogin = renderLogin(null, true, "bg")
    expect(bulgarianLogin).toContain('<html lang="bg">')
    expect(bulgarianLogin).toContain("Имейл на системния администратор")
    expect(bulgarianLogin).toContain('name="locale" value="en"')

    const englishLogin = renderLogin(null, true, "en")
    expect(englishLogin).toContain('<html lang="en">')
    expect(englishLogin).toContain("Appliance administrator email")

    expect(renderDashboard(EMPTY_DASHBOARD, "bg")).toContain("Безопасност и поддръжка")
    expect(renderDashboard(EMPTY_DASHBOARD, "en")).toContain("Safety and maintenance")
  })

  it("localizes the case-closure and key-escrow component names", () => {
    const dashboard: DashboardData = {
      ...EMPTY_DASHBOARD,
      components: [
        { component: "case-close", label: "Automatic case closure", group: "safety", status: "operational", observedStatus: "operational", code: "CASE_CLOSE_COMPLETED", checkedAt: 1, changedAt: 1 },
        { component: "key-escrow", label: "Installation secrets escrow", group: "safety", status: "operational", observedStatus: "operational", code: "KEY_ESCROW_ACKNOWLEDGED", checkedAt: 1, changedAt: 1 },
      ],
    }
    const body = renderDashboard(dashboard, "bg")
    expect(body).toContain("Автоматично приключване на случаи")
    expect(body).toContain("Съхранение на инсталационните тайни")
    expect(body).not.toContain("Automatic case closure")
    expect(body).not.toContain("Installation secrets escrow")
  })

  it("localizes enrollment, verification, and the one-time recovery-code warning", () => {
    const challenge = {
      challengeToken: "c".repeat(43),
      expiresAt: "2026-08-22T12:05:00.000Z",
      enrollmentRequired: true,
      manualKey: "GEZDGNBVGY3TQOJQ",
      otpauthUri: "otpauth://totp/LOSPOR",
    }
    const bulgarian = renderMfaLogin(null, challenge, "<svg></svg>", "bg")
    expect(bulgarian).toContain("Настройване на потвърждение в две стъпки")
    expect(bulgarian).toContain("QR кодът се създава в самата система")
    expect(bulgarian).not.toContain("Set up two-step verification")
    expect(renderMfaLogin(null, { ...challenge, enrollmentRequired: false }, null, "en"))
      .toContain("Verification or recovery code")
    const codes = Array.from({ length: 10 }, (_, index) => `AAAA-AAAA-AAAA-${String(index).padStart(4, "A")}`)
    expect(renderMfaRecoveryCodes(codes, "bg")).toContain("Тези десет кода се показват само веднъж")
    expect(renderMfaRecoveryCodes(codes, "en")).toContain("These ten codes are shown only once")
  })

  it("localizes release actions while retaining the exact version", () => {
    const view = {
      installedVersion: "1.2.0",
      latestVersion: "1.3.0",
      fetchedVersion: "1.3.0",
      fetchedLockSha256: "b".repeat(64),
      agentMode: "healthy" as const,
      mayPrepare: true,
      windowDescription: "Прозорец за поддръжка.",
      mayApply: true,
    }
    expect(renderRelease(view, "bg")).toContain("Прилагане на 1.3.0")
    expect(renderRelease({ ...view, windowDescription: "Maintenance window." }, "en"))
      .toContain("Apply 1.3.0")
  })

  it("does not describe a missing installation choice as intentional console-only mode", () => {
    const base = {
      installedVersion: "1.2.0",
      agentMode: "unconfigured" as const,
      mayPrepare: false,
      windowDescription: "Maintenance window.",
      mayApply: false,
    }
    expect(renderRelease(base, "en")).toContain("Update mode has not been selected")
    expect(renderRelease(base, "bg")).toContain("Не е избран режим за обновяване")
    expect(renderRelease({ ...base, agentMode: "console-only" }, "en"))
      .toContain("intentionally console-only")
  })
})
