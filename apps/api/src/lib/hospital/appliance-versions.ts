/**
 * What this appliance declares about itself on every exported batch.
 *
 * These end up in `manifest.versions`, which is the only provenance a batch
 * carries once it reaches Central. Central does not validate them — it requires
 * the fields and checks the contract version, nothing more — so nothing fails
 * if they are wrong. They are simply believed.
 *
 * They were wrong: the manifest declared api "7.3.2-hospital.1" and core
 * "7.3.0" while the appliance shipped 9.0.0 of both, because they were written
 * by hand and the vendored code moved underneath them. A researcher asking
 * which software produced a row would have been told something untrue, with no
 * way to notice.
 *
 * They are still literals rather than a runtime read of UPSTREAM_VERSIONS.json:
 * that file sits outside this workspace, and a manifest built for a hospital
 * should not depend on resolving a path outside the app at runtime.
 * `appliance-versions.test.ts` asserts these match the vendored versions
 * recorded there, so drift fails the suite instead of shipping.
 *
 * When re-vendoring, update these alongside UPSTREAM_VERSIONS.json — the test
 * will tell you if you forget.
 */
export const APPLIANCE_MANIFEST_VERSIONS = {
  /** This appliance's own release, independent of the upstream it vendors. */
  hospital: "1.4.3",
  /** The vendored lospor-api. Must equal UPSTREAM_VERSIONS.sources.api.version. */
  api: "9.10.4",
  /** The vendored lospor-core. Must equal UPSTREAM_VERSIONS.sources.core.version. */
  core: "9.10.1",
  /** The appliance's own database shape, not an upstream version. */
  databaseSchema: "hospital-2",
} as const
