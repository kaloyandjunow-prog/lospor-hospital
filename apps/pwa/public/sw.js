// LOSPOR clinical PWA service worker
//
// The appliance serves this app under /app on the clinical host, alongside the
// web app at / and the API at /v1, so every path below carries that prefix. It
// must stay in step with experiments.baseUrl in app.json and with the scope in
// manifest.webmanifest: a mismatch does not fail loudly, it just silently stops
// the app working offline.
//
// Strategy:
//   - App shell (/app/): cache on install, serve from cache as offline fallback
//   - Static JS/CSS/fonts (/app/_expo/static/*, /app/assets/*): cache-first after first fetch
//   - API calls (/v1/*): always network-only — clinical data must be live
const BASE = "/app"
const CACHE = "lospor-shell-v5"
const STATIC_CACHE = "lospor-static-v5"

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

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url)

  // Never intercept API calls — clinical data must always come from the server.
  // The appliance serves the API at /v1; the old /api/ prefix never matched a
  // real request, so this guard was decorative.
  if (url.pathname.startsWith("/v1/")) return

  // Cache-first for hashed static bundles (JS, CSS, fonts, images)
  // These filenames change on every build so stale entries are never served
  if (
    url.pathname.startsWith(`${BASE}/_expo/static/`) ||
    url.pathname.startsWith(`${BASE}/assets/`)
  ) {
    e.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(e.request)
        if (cached) return cached
        const response = await fetch(e.request)
        if (response.ok) cache.put(e.request, response.clone())
        return response
      })
    )
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
