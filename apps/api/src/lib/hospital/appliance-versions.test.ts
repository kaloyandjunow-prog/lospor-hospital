import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { APPLIANCE_MANIFEST_VERSIONS } from "./appliance-versions"

/**
 * The manifest must state the versions this appliance actually runs.
 *
 * `manifest.versions` is the only provenance an exported batch carries once it
 * reaches Central, and Central does not validate it — it requires the fields and
 * checks the contract version, nothing more. A wrong value there is believed.
 *
 * It was wrong for two majors: the manifest declared api "7.3.2-hospital.1" and
 * core "7.3.0" while the appliance shipped 9.0.0 of both, because the numbers
 * were hand-written and the vendored code moved underneath them. Nothing failed.
 * That is the whole problem — a batch that misdeclares what produced it is
 * indistinguishable from one that does not, until someone tries to reproduce a
 * finding years later.
 *
 * This test is the thing that would have caught it. Re-vendoring without
 * updating appliance-versions.ts now fails here.
 */
const upstream = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "UPSTREAM_VERSIONS.json"), "utf8"),
) as { sources: Record<string, { version: string }> }

describe("the versions an exported batch declares", () => {
  it("names the lospor-api this appliance actually vendors", () => {
    expect(APPLIANCE_MANIFEST_VERSIONS.api).toBe(upstream.sources.api.version)
  })

  it("names the lospor-core this appliance actually vendors", () => {
    expect(APPLIANCE_MANIFEST_VERSIONS.core).toBe(upstream.sources.core.version)
  })

  it("keeps the appliance's own identifiers, which are not upstream versions", () => {
    // These two describe the box, not anything it vendors, so they are
    // deliberately not compared against UPSTREAM_VERSIONS.
    expect(APPLIANCE_MANIFEST_VERSIONS.hospital).toBe("1.0.0")
    expect(APPLIANCE_MANIFEST_VERSIONS.databaseSchema).toBe("hospital-1")
  })
})
