// __BASE__ is stamped by patch-pwa.mjs from app.json's experiments.baseUrl:
// "" at a site root, "/app" on the Hospital appliance, where this app is served
// under a path prefix that the reverse proxy strips again on the way in.
//
// Both halves matter. Registering "/sw.js" from a page at /app/ asks for a file
// at the site root -- which on the appliance is a different application
// entirely -- so the worker never installs and the app has no offline
// capability at all. And a worker's scope cannot rise above the path it was
// served from, so the scope has to be stated too.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("__BASE__/sw.js", { scope: "__BASE__/" }).catch(() => {})
  })
}
