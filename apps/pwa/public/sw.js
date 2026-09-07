// LOSPOR clinical PWA service worker
//
// The appliance serves this app under /app on the clinical host, alongside the
// web app at / and the API at /v1, so every path below carries that prefix. It
// must stay in step with experiments.baseUrl in app.json and with the scope in
// manifest.webmanifest: a mismatch does not fail loudly, it just silently stops
// the app working offline.
//
// Strategy:
//   - App shell (index.html): cache on install, serve from cache as offline fallback
//   - Static JS/CSS/fonts (/_expo/static/*, /assets/*): cache-first after first fetch
//   - API calls (/api/*): always network-only — clinical data must be live
//
// The cache names carry the build id, stamped in by scripts/patch-pwa.mjs, so a
// deploy retires the previous caches through the activate handler below.
//
// They used to be a hand-written "v4" that no release had ever changed, and the
// combination was a trap with no way out: a bundle is served cache-first and
// never revalidated, anything with an ok status is stored, and nothing ever
// retires an entry. One interrupted download — a phone leaving a lift, a hotspot
// dropping mid-fetch — puts a truncated bundle in the cache under the filename
// the app asks for, and the device then fails to parse it on every visit
// afterwards. That failure shows nothing: no splash, no error, a black screen,
// and it survives clearing cookies because Cache Storage is not cookies.
const BUILD_ID = "__BUILD_ID__"
const CACHE = `lospor-shell-${BUILD_ID}`
const STATIC_CACHE = `lospor-static-${BUILD_ID}`

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([`${BASE}/`, `${BASE}/index.html`]))
  )
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

/**
 * Serve a hashed asset from the cache, and store it only once it has arrived
 * whole.
 *
 * The entry written here is the one every later visit is served without asking
 * the network again, so writing a partial one is not a slow load, it is a
 * device that never works again. Two things make that easy to do by accident:
 *
 * respondWith keeps this worker alive only until the response is *returned*,
 * which happens when the headers arrive and not when the body finishes. A
 * cache write started after that point is unprotected, and closing the tab
 * while a bundle is still downloading kills the worker in the middle of it.
 * That is a real report, not a theory: leave during the splash and the app is
 * broken on every visit afterwards. So the write is held open with waitUntil.
 *
 * And a truncated body is still a 200 with an ordinary type, so nothing about
 * the response says it is short. The only honest check is to read it to the end
 * and weigh it against the length the server declared.
 */
async function serveStatic(event) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(event.request)
  if (cached) return cached

  const response = await fetch(event.request)
  // A 206 is a fragment and an opaque cross-origin response has a status of 0.
  // Either one stored under the name of a script is a file the app can never
  // parse and, being cache-first, will never fetch again.
  if (response.status === 200 && response.type === "basic") {
    event.waitUntil(storeWhenComplete(cache, event.request, response.clone()))
  }
  // Returned before the copy above has been read, so the page still streams.
  return response
}

async function storeWhenComplete(cache, request, response) {
  try {
    const body = await response.arrayBuffer()
    const declared = Number(response.headers.get("Content-Length"))
    if (Number.isFinite(declared) && declared > 0 && declared !== body.byteLength) return
    await cache.put(request, new Response(body, {
      status: 200,
      statusText: response.statusText,
      headers: response.headers,
    }))
  } catch {
    // The transfer broke. Storing nothing is the right outcome: the next visit
    // asks the network again, which is the recovery the old code denied.
  }
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url)

  // Never intercept API calls — clinical data must always come from the server.
  // The appliance serves the API at /v1; the old /api/ prefix never matched a
  // real request, so this guard was decorative.
  if (url.pathname.startsWith("/v1/")) return

  // Nor a request the diagnostics page marks, which needs to weigh what this
  // device holds against what the server sends. A controlled page cannot reach
  // past its worker on its own, so answering that request from the cache would
  // have the instrument compare the cache with itself — and report a corrupt
  // bundle as healthy, which is exactly what it did before this line existed.
  if (url.searchParams.has("diagnostics")) return

  // Cache-first for hashed static bundles (JS, CSS, fonts, images)
  // These filenames change on every build so stale entries are never served
  if (
    url.pathname.startsWith(`${BASE}/_expo/static/`) ||
    url.pathname.startsWith(`${BASE}/assets/`)
  ) {
    e.respondWith(serveStatic(e))
    return
  }

  // Navigation requests (HTML): network-first, cached shell as offline fallback
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(`${BASE}/index.html`))
    )
  }
})

// Focus (or open) the app when a reminder notification is tapped.
self.addEventListener("notificationclick", e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(`${BASE}/`)
    })
  )
})
