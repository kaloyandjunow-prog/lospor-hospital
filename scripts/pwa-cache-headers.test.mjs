import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

// A phone kept showing the previous release's settings screen because the PWA
// shell carried no Cache-Control and Chrome guessed its own lifetime (1.8.0).
const conf = readFileSync(new URL("../infra/nginx/pwa.conf", import.meta.url), "utf8")

function block(opening) {
  const start = conf.indexOf(opening)
  assert.notEqual(start, -1, `${opening} is missing from pwa.conf`)
  const end = conf.indexOf("\n  }\n", start)
  return conf.slice(start, end)
}

test("the app shell and the service worker are revalidated on every load", () => {
  assert.match(block("  location / {"), /add_header Cache-Control "no-cache" always;/)
  assert.match(block("  location = /sw.js {"), /add_header Cache-Control "no-cache" always;/)
})

test("the service worker keeps the security headers its own block would otherwise drop", () => {
  const worker = block("  location = /sw.js {")
  for (const header of ["Content-Security-Policy", "Cross-Origin-Opener-Policy", "Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options"]) {
    assert.ok(worker.includes(`add_header ${header} `), `${header} missing on /sw.js`)
  }
})

test("only hashed static files get the long cache", () => {
  const longCache = block("  location ~* ")
  assert.match(longCache, /expires 7d;/)
  assert.ok(conf.indexOf("location = /sw.js") !== -1, "an exact-match sw.js block is what keeps it out of the 7-day rule")
})
