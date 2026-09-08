import { describe, expect, it } from "vitest"

import appJson from "../../app.json"
import packageJson from "../../package.json"
import upstream from "../../../../UPSTREAM_VERSIONS.json"
import { LOSPOR_MOBILE_CLIENT_VERSION } from "./client-version"

/**
 * Three places state this app's version, and nothing kept them together.
 *
 * They had drifted three ways at once — package.json at 9.7.5, app.json at
 * 9.3.1, and the client constant at 8.0.0 — so the About screen named a version
 * four releases old, and a support report, the one artifact whose entire job is
 * to say what was running, named two different wrong ones.
 *
 * A release bumps package.json. Nothing made the others follow, and nothing
 * complained, because a stale version string breaks nothing on the day it goes
 * stale. This is what complains.
 */
describe("the app's stated version", () => {
  it("is the same in package.json and app.json", () => {
    // app.json is what Constants.expoConfig reports, so it is the number a
    // clinician reads under About and the one a support report carries.
    expect(appJson.expo.version).toBe(packageJson.version)
  })

  it("is the same in the version sent to the server", () => {
    // Sent as X-LOSPOR-Client-Version, and compared against
    // PEDIATRIC_MIN_CLIENT_VERSION before a paediatric write is allowed. Understating
    // it here refuses clinical work the app can do.
    // Checked against the vendored upstream client, not this package's own
    // version: the appliance versions its apps 1.0.0 independently of the
    // client they are built from, and it is the client capability the server
    // gates paediatric writes on.
    expect(LOSPOR_MOBILE_CLIENT_VERSION).toBe(upstream.sources.pwa.version)
  })

  it("is a plain three-part version, which is what the server compares", () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
