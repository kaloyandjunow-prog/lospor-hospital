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

/**
 * Where this export is served from.
 *
 * Expo already prefixes the bundle assets it emits with `experiments.baseUrl`.
 * Everything hand-written beside them -- the manifest, the worker, its
 * registration and the tags injected below -- did not, so on the Hospital
 * appliance, which serves this app under /app, each of them asked for a file at
 * the site root. That is a different application there, so they 404: no service
 * worker, therefore no offline capability, no boot watchdog, and an install
 * whose start_url opened the wrong app. At a site root the base is "" and every
 * path below is byte-identical to what it has always been.
 */
const baseUrl = JSON.parse(readFileSync(resolve(__dir, "../app.json"), "utf8"))
  ?.expo?.experiments?.baseUrl ?? ""
const BASE = baseUrl.replace(/\/+$/, "")
if (BASE && !BASE.startsWith("/")) {
  console.error(`patch-pwa: experiments.baseUrl must start with "/" (got ${baseUrl})`)
  process.exit(1)
}

/** Stamps __BASE__ through a file emitted into dist, refusing if it has none. */
function stampBase(name) {
  const path = join(distPath, name)
  const source = readFileSync(path, "utf8")
  if (!source.includes("__BASE__")) {
    // These files are the whole reason the base exists. Shipping one unstamped
    // is the silent failure this stamping was added to end, so refuse instead.
    console.error(`patch-pwa: dist/${name} has no __BASE__ placeholder to stamp`)
    process.exit(1)
  }
  writeFileSync(path, source.replaceAll("__BASE__", BASE), "utf8")
}

let html = readFileSync(htmlPath, "utf8")

// Expo emits its reset as an inline style. Move it to a same-origin stylesheet
// so the deployment can keep script/style elements under a hash-free CSP.
html = html.replace(
  /<style id="expo-reset">[\s\S]*?<\/style>/,
  `<link rel="stylesheet" href="${BASE}/expo-reset.css">`,
)

const additions = [
  [html.includes('rel="manifest"'), `<link rel="manifest" href="${BASE}/manifest.webmanifest">`],
  [html.includes('name="apple-mobile-web-app-capable"'), '<meta name="apple-mobile-web-app-capable" content="yes">'],
  [html.includes('name="apple-mobile-web-app-status-bar-style"'), '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'],
  [html.includes('name="apple-mobile-web-app-title"'), '<meta name="apple-mobile-web-app-title" content="LOSPOR">'],
  [html.includes('rel="apple-touch-icon"'), `<link rel="apple-touch-icon" href="${BASE}/icon-192.png">`],
  [html.includes(`src="${BASE}/register-sw.js"`), `<script src="${BASE}/register-sw.js" defer></script>`],
  // Loaded from the page rather than bundled: it has to run when the bundle is
  // the thing that failed.
  [html.includes(`src="${BASE}/boot-watchdog.js"`), `<script src="${BASE}/boot-watchdog.js" defer></script>`],
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
if (!sw.includes("__BASE__")) {
  console.error("patch-pwa: dist/sw.js has no __BASE__ placeholder to stamp")
  process.exit(1)
}
// The build id is taken from the worker's source before either substitution, so
// it still changes when the caching rules change and does not merely track the
// path a deployment happens to serve from.
writeFileSync(swPath, sw.replaceAll("__BUILD_ID__", buildId).replaceAll("__BASE__", BASE), "utf8")

// The manifest names the installed app's identity (start_url and scope) and the
// registration names the worker's; both are meaningless at the wrong root.
stampBase("manifest.webmanifest")
stampBase("register-sw.js")

console.log(
  `patch-pwa: hardened reset persisted; ${additions.length} PWA element(s) added; `
  + `sw build ${buildId}; base ${BASE === "" ? "(site root)" : BASE}`,
)
