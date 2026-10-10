import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStatusApp } from "./app.js"
import { AuthService } from "./auth.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"
import { renderTerminology, type TerminologyView } from "./ui.js"
import { NAV_GROUPS, NAV_PATHS, STATUS_SKINS, attentionHref, withUi, type StatusSkin } from "./ui-shell.js"

// Hospital 1.5.4: Status gets five skins with the map hub as default, a
// legacy skin that keeps the old look, light and dark, and Display settings.
// A skin is only a frame; these tests hold it to that.

const NOW = Date.parse("2026-10-10T12:00:00Z")
const PASSWORD = "Initial password phrase1!"
const databases: StatusDatabase[] = []
const directories: string[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})

function setup() {
  const workspace = mkdtempSync(join(tmpdir(), "lospor-status-skins-"))
  directories.push(workspace)
  const dirs = ["state", "signals", "requests"].map(name => join(workspace, name))
  for (const directory of dirs) mkdirSync(directory, { recursive: true })
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  const auth = new AuthService(db, Buffer.alloc(32, 7), 4, () => NOW)
  const config = {
    defaultLocale: "en", basePath: "/status", eventTokens: new Map(),
    updateStateDir: dirs[0], signalsDir: dirs[1], updateRequestsDir: dirs[2], rateLimitKey: Buffer.alloc(32, 7),
  } as unknown as StatusConfig
  return { app: createStatusApp({ db, auth, config, now: () => NOW }), auth, db }
}

const headers = (extra: Record<string, string> = {}) => ({ origin: "https://hospital.test", host: "hospital.test", "x-forwarded-proto": "https", ...extra })

async function signIn(auth: AuthService, recovery = false) {
  await auth.initialize("admin+status@hospital.test", PASSWORD)
  if (recovery) {
    const result = await auth.loginWithRecoveryToken({ recoveryToken: auth.createRecoveryToken().token, clientAddress: "127.0.0.1" })
    return `lospor_status_session=${result.sessionToken}`
  }
  const challenge = await auth.beginPasswordLogin({ email: "admin+status@hospital.test", password: PASSWORD, clientAddress: "127.0.0.1" })
  const result = auth.completeMfaLogin({ challengeToken: challenge.challengeToken, code: totpCode(challenge.manualKey!, NOW), clientAddress: "127.0.0.1" })
  return `lospor_status_session=${result.sessionToken}`
}

const terminology: TerminologyView = { state: null, agentMode: "unconfigured", mayManage: false, recoverySession: false }
const render = (skin: StatusSkin, audience: "password" | "recovery" = "password", locale: "en" | "bg" = "en") =>
  withUi({ skin, theme: "system", path: "/status/terminology" }, () => renderTerminology(terminology, locale, audience))
const links = (html: string) => new Set([...html.matchAll(/href="(\/status\/[^"#?]*)"/g)].map(match => match[1]))

describe("every skin reaches every page", () => {
  const passwordPaths = NAV_GROUPS.flatMap(group => group.items.filter(item => item.audiences.includes("password")).map(item => item.path))

  it.each(["maphub", "sidebar", "index", "console"] as const)("%s lists every page a password session may open", skin => {
    // The map hub shows one group's pages at a time, so it is checked group by group below.
    if (skin === "maphub") return
    const found = links(render(skin))
    for (const path of passwordPaths) expect(found, `${skin}: ${path}`).toContain(path)
  })

  it("map hub: every group is a tab, and the open group's pages are chips", () => {
    const html = render("maphub")
    for (const group of NAV_GROUPS) expect(links(html)).toContain(group.items[0]!.path)
    // On the terminology page the Connections group is open.
    const connections = NAV_GROUPS.find(group => group.id === "connections")!
    for (const item of connections.items) expect(links(html)).toContain(item.path)
  })

  it("inbox: needs you, watch, configure and people, and Configure lists every setting", async () => {
    const html = render("inbox")
    for (const path of ["/status/", "/status/services", "/status/configure", "/status/accounts"]) expect(links(html)).toContain(path)
    const { app, auth } = setup()
    const cookie = `${await signIn(auth)}; lospor_status_skin=inbox`
    const configure = await (await app.request("/status/configure", { headers: headers({ cookie }) })).text()
    for (const path of passwordPaths.filter(path => !["/status/", "/status/services"].includes(path))) expect(links(configure)).toContain(path)
  })

  it("marks the current page for assistive technology in every skin", () => {
    for (const skin of ["maphub", "sidebar", "index", "console"] as const) {
      expect(render(skin), skin).toMatch(/href="\/status\/terminology" aria-current="page"/)
    }
  })

  it("never offers a recovery session the accounts or hospital-control pages", () => {
    for (const skin of STATUS_SKINS) {
      const found = links(render(skin, "recovery"))
      expect(found, skin).not.toContain("/status/accounts")
      for (const path of found) expect(path.startsWith("/status/control"), `${skin}: ${path}`).toBe(false)
    }
  })

  it("has a route for every page in the navigation", () => {
    const source = readFileSync(new URL("./app.ts", import.meta.url), "utf8")
    const routes = new Set([...source.matchAll(/app\.get\("(\/status\/[^"]*)"/g)].map(match => match[1]))
    for (const path of NAV_PATHS) expect(routes.has(path), path).toBe(true)
  })
})

describe("the legacy skin", () => {
  it("keeps the old header and adds a way back to Display settings", () => {
    const html = render("legacy")
    expect(html).toContain('<nav class="statusnav"')
    expect(html).toContain('href="/status/preferences"')
    expect(html).not.toContain("skin-head")
  })
})

describe("language and theme", () => {
  it("names the navigation in Bulgarian", () => {
    const html = render("maphub", "password", "bg")
    for (const name of ["Преглед", "Връзки", "Клинични настройки", "Хора", "Актуализации и резервни копия", "Терминологичен пакет"]) expect(html).toContain(name)
  })

  it("follows the computer by default and marks an explicit choice on <html>", () => {
    expect(render("maphub")).toMatch(/<html lang="en" data-skin="maphub">/)
    const dark = withUi({ skin: "sidebar", theme: "dark", path: "/status/" }, () => renderTerminology(terminology, "en", "password"))
    expect(dark).toMatch(/<html lang="en" data-skin="sidebar" data-theme="dark">/)
    expect(dark).toContain("prefers-color-scheme:dark")
  })
})

describe("Display settings", () => {
  it("requires a signed-in session", async () => {
    const { app } = setup()
    expect(await (await app.request("/status/preferences")).text()).toContain("Sign in")
    const refused = await app.request("/status/preferences", { method: "POST", headers: headers({ "content-type": "application/x-www-form-urlencoded" }), body: "skin=legacy&theme=dark&locale=bg" })
    expect(await refused.text()).toContain("Sign in")
    expect(refused.headers.get("set-cookie")).toBeNull()
  })

  it("saves skin, theme and language in this browser, from this site only", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(auth)
    const foreign = await app.request("/status/preferences", { method: "POST", headers: { ...headers({ cookie, "content-type": "application/x-www-form-urlencoded" }), origin: "https://elsewhere.test" }, body: "skin=legacy&theme=dark&locale=bg" })
    expect(foreign.status).toBe(403)
    const saved = await app.request("/status/preferences", { method: "POST", headers: headers({ cookie, "content-type": "application/x-www-form-urlencoded" }), body: "skin=legacy&theme=dark&locale=bg" })
    expect(saved.status).toBe(303)
    const set = saved.headers.get("set-cookie") ?? ""
    expect(set).toContain("lospor_status_skin=legacy")
    expect(set).toContain("lospor_status_theme=dark")
    expect(set).toContain("lospor_status_locale=bg")
    expect(set).toContain("HttpOnly")
    const invalid = await app.request("/status/preferences", { method: "POST", headers: headers({ cookie, "content-type": "application/x-www-form-urlencoded" }), body: "skin=neon&theme=dark&locale=bg" })
    expect(invalid.status).toBe(400)
  })

  it("offers all six skins, legacy set apart, in both languages", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(auth)
    const english = await (await app.request("/status/preferences", { headers: headers({ cookie }) })).text()
    for (const skin of STATUS_SKINS) expect(english).toContain(`value="${skin}"`)
    expect(english).toContain("Legacy skin")
    expect(english).toMatch(/value="maphub" checked/)
    const bulgarian = await (await app.request("/status/preferences", { headers: headers({ cookie: `${cookie}; lospor_status_locale=bg; lospor_status_skin=legacy` }) })).text()
    expect(bulgarian).toContain("Класически облик")
    expect(bulgarian).toMatch(/value="legacy" checked/)
    expect(bulgarian).toContain(".choices{")
  })
})

describe("the overview and services pages", () => {
  it("shows the map overview by default and the old status page under legacy", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(auth)
    const overview = await (await app.request("/status/", { headers: headers({ cookie }) })).text()
    expect(overview).toContain('class="map"')
    expect(overview).toContain("To do")
    expect(overview).toContain('href="/status/control/ehr"')
    const legacy = await (await app.request("/status/", { headers: headers({ cookie: `${cookie}; lospor_status_skin=legacy` }) })).text()
    expect(legacy).not.toContain('class="map"')
    expect(legacy).toContain("Needs attention today")
  })

  it("does not repeat a page's heading in a line under it, but still describes pages in lists", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(auth)
    const page = async (path: string, extra = "") => (await app.request(path, { headers: headers({ cookie: `${cookie}${extra}` }) })).text()
    const subtitle = (html: string) => /<div class="skin-title">.*?<\/h1>(<p>.*?<\/p>)?<\/div>/s.exec(html)?.[1]
    expect(subtitle(await page("/status/"))).toBeUndefined()
    expect(subtitle(await page("/status/", "; lospor_status_locale=bg"))).toBeUndefined()
    expect(subtitle(await page("/status/accounts"))).toBeUndefined()
    expect(subtitle(await page("/status/preferences"))).toContain("Kept in this browser only.")
    expect(await page("/status/configure")).toContain("Everyone who signs in to LOSPOR, and the Status administrators.")
  })

  it("keeps the profile button on the brand's row: tabs and menus never wrap beside it", () => {
    const html = render("maphub")
    expect(html).toContain(".skin-head .tabs{flex-wrap:nowrap;")
    expect(html).toContain("@media (max-width:1100px){.skin-head .tabs,.skin-head .menus{order:3;width:100%}.skin-head .profile{order:2}}")
    expect(html).toContain(".skin-head .brand{white-space:nowrap}")
  })

  it("shows availability over 24 hours, 7 days or 90 days", async () => {
    const { app, auth, db } = setup()
    db.recordObservation({ component: "web", label: "Clinical web", group: "clinical", status: "outage", code: "WEB_DOWN", checkedAt: NOW - 30 * 60_000 })
    const cookie = await signIn(auth)
    const day = await (await app.request("/status/services", { headers: headers({ cookie }) })).text()
    expect(day).toContain('style="--n:96"')
    expect(day).toMatch(/<i class="bad"><\/i>/)
    const week = await (await app.request("/status/services?range=7d", { headers: headers({ cookie }) })).text()
    expect(week).toContain('style="--n:168"')
    const quarter = await (await app.request("/status/services?range=90d", { headers: headers({ cookie }) })).text()
    expect(quarter).toContain('style="--n:90"')
  })

  it("sends a legacy session from the new pages to the pages it knows", async () => {
    const { app, auth } = setup()
    const cookie = `${await signIn(auth)}; lospor_status_skin=legacy`
    expect((await app.request("/status/services", { headers: headers({ cookie }) })).headers.get("location")).toBe("/status/")
    expect((await app.request("/status/configure", { headers: headers({ cookie }) })).headers.get("location")).toBe("/status/control")
  })

  it("links each to-do item to its own maintenance page", () => {
    expect(attentionHref("/status/maintenance#maintenance-offhost")).toBe("/status/maintenance/offhost")
    expect(attentionHref("/status/release")).toBe("/status/release")
  })
})

describe("pages the skins regroup", () => {
  it("puts related maintenance sections on one page, and the agent where it matters", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(auth)
    const backups = await (await app.request("/status/maintenance/backups", { headers: headers({ cookie }) })).text()
    expect(backups).toContain('id="maintenance-backups"')
    expect(backups).toContain("Copies kept elsewhere")
    const security = await (await app.request("/status/maintenance/rotation", { headers: headers({ cookie }) })).text()
    expect(security).toContain("Secrets escrow")
    expect(security).toContain("Credential rotation")
    const legacy = await (await app.request("/status/maintenance/backups", { headers: headers({ cookie: `${cookie}; lospor_status_skin=legacy` }) })).text()
    expect(legacy).not.toContain('<h2 id="maintenance-offhost"')
  })
})

describe("the PeriOp Laboratories logo", () => {
  it("is served by Status itself and shown at the foot of every page and in About", async () => {
    const { app, auth } = setup()
    const logo = await app.request("/status/brand/periop-laboratories.png")
    expect(logo.headers.get("content-type")).toBe("image/png")
    expect(new Uint8Array(await logo.arrayBuffer()).slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]))
    expect(logo.headers.get("content-security-policy")).toContain("img-src 'self'")
    const login = await (await app.request("/status/")).text()
    expect(login).toContain('src="/status/brand/periop-laboratories.png"')
    const cookie = await signIn(auth)
    for (const skin of STATUS_SKINS) {
      const settings = await (await app.request("/status/preferences", { headers: headers({ cookie: `${cookie}; lospor_status_skin=${skin}` }) })).text()
      expect(settings, skin).toContain('class="maker"')
      expect(settings, skin).toContain('class="lospor-logo"')
    }
    const bulgarian = await (await app.request("/status/preferences", { headers: headers({ cookie: `${cookie}; lospor_status_locale=bg` }) })).text()
    expect(bulgarian).toContain("Разработено от")
    expect(bulgarian).toContain("За системата")
  })
})

describe("the settings-index search script", () => {
  it("is served from Status itself, as the content policy requires", async () => {
    const { app } = setup()
    const response = await app.request("/status/ui.js")
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toContain("status-index-search")
  })
})
