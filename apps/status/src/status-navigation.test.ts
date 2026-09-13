import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { STATUS_NAV, renderTerminology, type TerminologyView } from "./ui.js"

const view: TerminologyView = {
  state: null,
  agentMode: "unconfigured",
  mayManage: false,
  recoverySession: false,
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/<nav class="statusnav"[^>]*>(.*?)<\/nav>/gs)]
    .flatMap(match => [...match[1].matchAll(/href="([^"]+)"/g)].map(link => link[1]))
}

describe("the shared Status navigation", () => {
  it("offers a password session every destination, once", () => {
    const links = hrefs(renderTerminology(view, "en", "password"))
    expect(links).toEqual([
      "/status/",
      "/status/go-live",
      "/status/accounts",
      "/status/control",
      "/status/terminology",
      "/status/maintenance",
      "/status/release",
    ])
  })

  // Hiding a link is not authorization -- the routes refuse a recovery session
  // on their own -- but sending one to a page that will certainly 403 is a
  // dead end presented as a destination.
  it("offers a recovery session only what it can actually open", () => {
    const links = hrefs(renderTerminology(view, "en", "recovery"))
    expect(links).toEqual(["/status/", "/status/go-live", "/status/terminology", "/status/maintenance", "/status/release"])
    expect(links).not.toContain("/status/accounts")
    expect(links).not.toContain("/status/control")
  })

  it("marks the current destination for assistive technology, not only visually", () => {
    const html = renderTerminology(view, "en", "password")
    const current = [...html.matchAll(/<a href="([^"]+)" aria-current="page"/g)].map(m => m[1])
    expect(current).toEqual(["/status/terminology"])
  })

  it("renders the destination names in the reader's language", () => {
    expect(renderTerminology(view, "en", "password")).toContain(">Accounts<")
    expect(renderTerminology(view, "bg", "password")).toContain(">Профили<")
  })

  it("returns to the current page after switching language", () => {
    const html = renderTerminology(view, "en", "password")
    expect(html).toContain('name="returnTo" value="/status/terminology"')
  })

  it("keeps Sign out an explicit labelled POST", () => {
    const html = renderTerminology(view, "en", "password")
    expect(html).toMatch(/<form class="logout" method="post" action="\/status\/logout"><button type="submit">Sign out<\/button>/)
  })

  it("no longer leaves a stray Back to status link beside the header", () => {
    expect(renderTerminology(view, "en", "password")).not.toContain("Back to status")
  })
})

describe("the navigation registry", () => {
  it("names every destination exactly once", () => {
    const paths = STATUS_NAV.map(entry => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("gives every destination both languages", () => {
    for (const entry of STATUS_NAV) {
      expect(entry.en.trim()).not.toBe("")
      expect(entry.bg.trim()).not.toBe("")
      expect(entry.audiences.length).toBeGreaterThan(0)
    }
  })

  // A new authenticated top-level page must be an explicit decision: either it
  // appears in the header, or it is listed below as deliberately outside it.
  // Without this, the next page added is simply unreachable, which is the
  // defect this navigation was built to end.
  it("accounts for every authenticated top-level page", () => {
    const source = readFileSync(new URL("./app.ts", import.meta.url), "utf8")
    const routes = [...source.matchAll(/app\.get\("(\/status\/[^"]*)"/g)]
      .map(match => match[1])
      .filter(path => !path.includes("/api/"))

    // Deliberately outside the authenticated shell. The first three are
    // reached before a normal session exists and must not show navigation that
    // implies one; the last two are a script asset and a file download, not pages.
    const outsideTheShell = new Set([
      "/status/login",
      "/status/admin-activate",
      "/status/admin-recover",
      "/status/admin-link.js",
      "/status/maintenance/support-bundle",
    ])
    const navigational = new Set<string>(STATUS_NAV.map(entry => entry.path))

    const unaccounted = routes.filter(path => !navigational.has(path) && !outsideTheShell.has(path))
    expect(unaccounted).toEqual([])
  })
})
