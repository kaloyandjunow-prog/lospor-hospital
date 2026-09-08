import { describe, expect, it } from "vitest"

import upstream from "../../../../UPSTREAM_VERSIONS.json"
import { LOSPOR_WEB_CLIENT_VERSION } from "./client-version"

/**
 * The version this app claims must be the version it is.
 *
 * It is sent as `x-lospor-client-version` and compared against
 * `PEDIATRIC_MIN_CLIENT_VERSION` before the server permits a paediatric write.
 * Understating it refuses clinical work the app can do, and tells the clinician
 * to update an app that is already current.
 *
 * A release bumps the vendored version. Nothing made this follow, and nothing
 * complained, because a stale version string breaks nothing on the day it goes
 * stale — it waits until the minimum moves. It had sat at 8.0.0 here.
 *
 * Checked against the vendored upstream version rather than this package's own,
 * which upstream compares: the appliance versions its apps 1.0.0 independently
 * of the client they are built from, and it is the client capability the server
 * gates paediatric writes on.
 */
describe("the version this client reports", () => {
  it("matches the upstream client this appliance vendors", () => {
    expect(LOSPOR_WEB_CLIENT_VERSION).toBe(upstream.sources.web.version)
  })

  it("is a plain three-part version, which is what the server compares", () => {
    expect(LOSPOR_WEB_CLIENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
