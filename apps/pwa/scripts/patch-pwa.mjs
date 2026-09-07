// Injects PWA manifest link, Apple meta tags, and SW registration into dist/index.html,
// and stamps the build id into dist/sw.js.
// Run after `expo export --platform web`.
import { readFileSync, readdirSync, writeFileSync } from "fs"
import { resolve, dirname, join } from "path"
import { fileURLToPath } from "url"

import { pwaBuildId } from "./pwa-build-id.mjs"

const __dir = dirname(fileURLToPath(import.meta.url))
const distPath = resolve(__dir, "../dist")
const htmlPath = join(distPath, "index.html")

let html = readFileSync(htmlPath, "utf8")

// The appliance serves this app under /app on the clinical host, so every URL
// injected here is prefixed. It must match experiments.baseUrl in app.json, the
// scope in manifest.webmanifest and BASE in public/sw.js — the service worker's
// scope is taken from the URL it is served under, so registering it anywhere
// above /app/ would fail.
const BASE = "/app"

const additions = [
  [html.includes('rel="manifest"'), '<link rel="manifest" href="/manifest.webmanifest">'],
  [html.includes('name="apple-mobile-web-app-capable"'), '<meta name="apple-mobile-web-app-capable" content="yes">'],
  [html.includes('name="apple-mobile-web-app-status-bar-style"'), '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'],
  [html.includes('name="apple-mobile-web-app-title"'), '<meta name="apple-mobile-web-app-title" content="LOSPOR">'],
  [html.includes('rel="apple-touch-icon"'), '<link rel="apple-touch-icon" href="/icon-192.png">'],
  [html.includes('src="/register-sw.js"'), '<script src="/register-sw.js" defer></script>'],
  // Loaded from the page rather than bundled: it has to run when the bundle is
  // the thing that failed.
  [html.includes('src="/boot-watchdog.js"'), '<script src="/boot-watchdog.js" defer></script>'],
]
  .filter(([present]) => !present)
  .map(([, markup]) => markup)

if (additions.length > 0) html = html.replace("</head>", `${additions.join("\n")}\n</head>`)
writeFileSync(htmlPath, html, "utf8")

// Give the service worker's caches a name that changes when the build does, so
// activate retires the previous ones.
//
// Derived from the emitted bundle names, which are themselves content hashes,
// AND from the worker's own source. Both halves are load-bearing. Without the
// bundles a new app would go on being served the old files; without the worker
// a change to the caching rules would leave every entry written under the old
// rules in place, which is precisely the entries a rule change exists to
// distrust. That second half was missing once: a release that fixed how entries
// are written could not retire the bad ones it was written to replace, because
// no app source had changed and the name came out identical.
const swPath = join(distPath, "sw.js")
const sw = readFileSync(swPath, "utf8")
const buildId = pwaBuildId(readdirSync(join(distPath, "_expo", "static", "js", "web")), sw)
if (!sw.includes("__BUILD_ID__")) {
  // Unstamped caches never expire, and a bad entry in one is unreachable to
  // every later release. Refuse to ship rather than leave that in place.
  console.error("patch-pwa: dist/sw.js has no __BUILD_ID__ placeholder to stamp")
  process.exit(1)
}
writeFileSync(swPath, sw.replaceAll("__BUILD_ID__", buildId), "utf8")

console.log(`patch-pwa: hardened reset persisted; ${additions.length} PWA element(s) added; sw build ${buildId}`)
