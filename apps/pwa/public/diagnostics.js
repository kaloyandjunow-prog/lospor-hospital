/**
 * What this device actually holds, reported without loading any app code.
 *
 * A phone that will not start the app cannot be asked what is wrong with it.
 * There is no console on Android Chrome, a static host has no request log, and
 * the failure this exists for shows nothing at all: no splash, no error, a
 * black screen, on a build that loads correctly everywhere else. Twice now a
 * plausible mechanism has been reasoned out, and once it has been wrong.
 *
 * So this measures rather than argues. The decisive line is CACHED BUNDLES: the
 * bytes held on the device against the bytes the server sends for the same URL
 * right now. A cached copy that is short is a file the app can never parse, and
 * because the bundle cache is read before the network, it is served on every
 * visit until something removes it.
 *
 * It carries no app code on purpose — an instrument that fails the way the
 * patient does measures nothing.
 */
const out = document.getElementById("report")
const lines = []
const say = (label, value) => lines.push(`${String(label).padEnd(22)}${value}`)
const heading = title => lines.push("", `--- ${title} ---`)

async function collect() {
  heading("PAGE")
  say("origin", location.origin)
  say("time", new Date().toISOString())
  say("user agent", navigator.userAgent)
  say("display mode", matchMedia("(display-mode: standalone)").matches ? "standalone (installed)" : "browser tab")
  say("online", String(navigator.onLine))
  say("storage", await describeQuota())

  heading("SERVICE WORKER")
  if (!("serviceWorker" in navigator)) {
    say("supported", "NO — the app cannot work offline here")
  } else {
    const registration = await navigator.serviceWorker.getRegistration()
    say("registered", registration ? "yes" : "no")
    say("controlling page", navigator.serviceWorker.controller ? "yes" : "no — a first load, or unregistered")
    if (registration) {
      say("script", registration.active?.scriptURL ?? "(none active)")
      say("state", registration.active?.state ?? "-")
      // A worker stuck in waiting is a released fix that never took effect.
      say("waiting", registration.waiting ? "YES — an update is installed but not active" : "no")
      say("installing", registration.installing ? "yes" : "no")
    }
    say("build id on device", await buildIdOf(registration?.active?.scriptURL))
    say("build id on server", await buildIdOf("/sw.js?diagnostics=" + Date.now()))
  }

  heading("CACHES")
  const names = await caches.keys()
  say("cache names", names.length ? names.join(", ") : "(none)")

  heading("CACHED BUNDLES")
  await reportBundles(names)

  out.textContent = lines.join("\n")
}

async function describeQuota() {
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return `${(usage / 1e6).toFixed(1)} MB used of ${(quota / 1e6).toFixed(0)} MB`
  } catch {
    return "unavailable"
  }
}

/** Read the stamped build id straight out of a worker script. */
async function buildIdOf(url) {
  if (!url) return "-"
  try {
    const source = await (await fetch(url, { cache: "no-store" })).text()
    return /const BUILD_ID = "([0-9a-f]+)"/.exec(source)?.[1] ?? "not stamped (a pre-9.7.2 worker)"
  } catch (error) {
    return `could not be read (${error})`
  }
}

/**
 * The measurement everything else is context for: cached bytes against served
 * bytes, for the same URL, right now.
 */
async function reportBundles(names) {
  let found = 0
  for (const name of names) {
    const cache = await caches.open(name)
    for (const request of await cache.keys()) {
      if (!/\/_expo\/static\/js\/.*\.js$/.test(request.url)) continue
      found++
      const file = request.url.split("/").pop()
      const held = (await (await cache.match(request)).arrayBuffer()).byteLength
      let verdict
      try {
        // The marker is what gets this past the worker. A controlled page has
        // no way to bypass it otherwise, and a comparison answered from the
        // cache would call a corrupt bundle healthy.
        const probe = request.url + (request.url.includes("?") ? "&" : "?") + "diagnostics=" + Date.now()
        const served = (await (await fetch(probe, { cache: "no-store" })).arrayBuffer()).byteLength
        verdict = held === served
          ? `OK          ${held} bytes`
          : `BAD  device has ${held} bytes, server sends ${served} — short by ${served - held}`
      } catch (error) {
        verdict = `unknown (offline?) device has ${held} bytes — ${error}`
      }
      say(file.slice(0, 20), verdict)
    }
  }
  if (found === 0) say("(none cached)", "nothing to compare — the next load fetches from the network")
}

document.getElementById("reset").addEventListener("click", async () => {
  out.textContent = "Resetting…"
  for (const name of await caches.keys()) await caches.delete(name)
  const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? []
  for (const registration of registrations) await registration.unregister()
  out.textContent = "Caches deleted and the worker unregistered. Opening the app…"
  setTimeout(() => location.replace("/"), 1200)
})

document.getElementById("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(out.textContent)
  } catch {
    // Clipboard access is refused in plenty of ordinary situations. Selecting
    // the text is the fallback, and it needs no permission.
    getSelection()?.selectAllChildren(out)
  }
})

collect().catch(error => {
  out.textContent = `The report itself failed: ${error?.stack ?? error}`
})
