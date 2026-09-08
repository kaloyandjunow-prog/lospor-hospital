/**
 * Repairs the app when it fails to start, so that nobody has to know how.
 *
 * A cached bundle that cannot be parsed produces nothing to act on: no splash,
 * no error, a black screen, on a build that works everywhere else. Recovery
 * meant clearing storage a person cannot reach from the app, on a device with
 * no console — which in practice means a clinician at 2am gives up and
 * documents on paper.
 *
 * So the app watches itself. If the bundle has finished arriving and React has
 * still not mounted anything, the cached copy is the suspect: it is deleted, and
 * the page is reloaded to fetch a fresh one. One attempt per tab, then it stops
 * and says where to look, because a repair that loops is worse than the fault.
 *
 * It deliberately touches only Cache Storage. Queued clinical patches live in
 * localStorage and the local case store in IndexedDB, and neither is ever
 * cleared here — losing a case to fix a rendering fault would be a far worse
 * trade than the one it exists to make.
 *
 * A separate file rather than an inline script because the deployment's policy
 * allows only same-origin script elements, which is the rule that blanked this
 * app once already.
 */
;(function () {
  var GRACE_MS = 4000
  var LIMIT_MS = 25000
  var ATTEMPTED = "lospor-boot-repair-attempted"

  function mounted() {
    var root = document.getElementById("root")
    return !!root && root.childElementCount > 0
  }

  /**
   * Has the bundle actually arrived? A slow phone still downloading has nothing
   * wrong with it, and clearing its cache mid-flight would throw away a good
   * copy and start the download again.
   */
  function bundleSettled() {
    try {
      return performance.getEntriesByType("resource").some(function (entry) {
        return entry.name.indexOf("/_expo/static/js/") !== -1 && entry.responseEnd > 0
      })
    } catch (error) {
      return true
    }
  }

  function tell(message) {
    var root = document.getElementById("root")
    if (!root) return
    // Inline style attributes, which the policy does allow. The stylesheet this
    // would otherwise use is one of the things that may have failed to load.
    root.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'padding:24px;background:#090b0c;color:#e7edf2;font:15px/1.6 system-ui,sans-serif;' +
      'text-align:center">' + message + "</div>"
  }

  function repair() {
    tell("Repairing the app on this device…")
    caches.keys()
      .then(function (names) { return Promise.all(names.map(function (n) { return caches.delete(n) })) })
      .then(function () {
        return navigator.serviceWorker && navigator.serviceWorker.getRegistrations
          ? navigator.serviceWorker.getRegistrations()
          : []
      })
      .then(function (registrations) {
        return Promise.all(registrations.map(function (r) { return r.unregister() }))
      })
      .then(function () { location.reload() })
      .catch(function () {
        tell("This device could not start the app. Open /diagnostics.html for details.")
      })
  }

  function check(waited) {
    if (mounted()) return
    if (!bundleSettled() && waited < LIMIT_MS) {
      setTimeout(function () { check(waited + 2000) }, 2000)
      return
    }
    // Offline, the cached copy may be the only copy there is. A broken one is
    // worth nothing, but an app that failed for some other reason still has its
    // offline capability, and deleting it here would take that away too.
    if (!navigator.onLine) {
      tell("The app could not start, and this device is offline. Reconnect and reopen it.")
      return
    }
    var attempted
    try {
      attempted = sessionStorage.getItem(ATTEMPTED)
      sessionStorage.setItem(ATTEMPTED, "1")
    } catch (error) {
      // Private mode can refuse this. One attempt is still better than none;
      // the reload will simply not be remembered.
      attempted = null
    }
    if (attempted) {
      tell("This device could not start the app, and a repair has already been tried. " +
        "Open /diagnostics.html to see why.")
      return
    }
    repair()
  }

  addEventListener("load", function () { setTimeout(function () { check(0) }, GRACE_MS) })
})()
