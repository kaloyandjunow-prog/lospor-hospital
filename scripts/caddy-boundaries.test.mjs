import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

const caddyfile = readFileSync(
  fileURLToPath(new URL("../infra/caddy/Caddyfile", import.meta.url)),
  "utf8",
)

test("internal API routes are refused at ingress", () => {
  assert.match(caddyfile, /@internal path \/v1\/internal\/\*/)
})

test("they are refused with 404, not 403", () => {
  // A 403 confirms the route exists to anyone who asks.
  const block = caddyfile.match(/handle @internal \{[^}]*\}/)
  assert.ok(block, "no handle block for @internal")
  assert.match(block[0], /respond 404/)
  assert.doesNotMatch(block[0], /reverse_proxy/)
})

test("the internal refusal is matched before the catch-all /v1 proxy", () => {
  // Caddy evaluates handlers in file order, so an @internal block placed after
  // @api would never be reached and the routes would stay published.
  const internal = caddyfile.indexOf("@internal path /v1/internal/*")
  const api = caddyfile.indexOf("@api path /v1/*")
  assert.ok(internal !== -1 && api !== -1)
  assert.ok(internal < api, "@internal must be declared before @api")
})

test("framing is refused for every route from one place", () => {
  const snippet = caddyfile.match(/\(security_headers\) \{[\s\S]*?\n\}/)
  assert.ok(snippet, "no security_headers snippet")
  assert.match(snippet[0], /frame-ancestors 'none'/)
  assert.match(snippet[0], /X-Frame-Options "DENY"/)
})

test("the shared CSP is appended so it cannot clobber an upstream policy", () => {
  // Caddy's `header Name value` replaces. The web app sets a far richer CSP in
  // next.config.ts; setting rather than appending here would delete it and
  // weaken the app while looking like a hardening change.
  assert.match(caddyfile, /\+Content-Security-Policy "frame-ancestors 'none'"/)
})

test("both published sites import the shared headers", () => {
  const imports = caddyfile.match(/import security_headers/g) ?? []
  assert.equal(imports.length, 2, "clinical and research sites must both import")
})

test("status stays behind its network allowlist ahead of any clinical route", () => {
  const allowed = caddyfile.indexOf("@status_allowed")
  const api = caddyfile.indexOf("@api path /v1/*")
  assert.ok(allowed !== -1 && allowed < api)
})

test("an operator's own directives cannot precede the status allowlist", () => {
  // HOSPITAL_CADDY_SITE_EXTRA exists so a hospital can serve a certificate from
  // its own authority, which is the only way an internal-only site gets one
  // that devices already trust. It is a raw Caddyfile substitution, so whatever
  // it contains becomes real configuration.
  //
  // `tls` is a site directive and applies wherever it sits. A `handle` is not:
  // handlers are ordered against each other by position, so one written above
  // the status matchers would answer /status/* before the network allowlist
  // did. Keeping the placeholder last means a misunderstanding of that variable
  // cannot quietly widen who can reach the appliance's own controls.
  const placeholders = [...caddyfile.matchAll(/\{\$HOSPITAL_CADDY_SITE_EXTRA\}/g)].map(m => m.index)
  assert.equal(placeholders.length, 2, "both sites take operator directives")

  const statusAllowlist = caddyfile.indexOf("@status_allowed")
  const researchAllowlist = caddyfile.indexOf("@allowed remote_ip")
  assert.ok(statusAllowlist !== -1 && researchAllowlist !== -1)

  for (const at of placeholders) {
    assert.ok(
      at > statusAllowlist,
      "a site-extra placeholder precedes the status allowlist, so an operator " +
      "directive could answer /status/* before the network check",
    )
  }
  assert.ok(
    placeholders[1] > researchAllowlist,
    "the research site-extra placeholder precedes its allowlist",
  )
})
