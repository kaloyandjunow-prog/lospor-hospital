/**
 * What this app tells the server it is.
 *
 * Not decoration. It is sent as `x-lospor-client-version` on proxied requests
 * and on the live session, and the server refuses paediatric case writes with
 * 426 `PEDIATRIC_CLIENT_UPDATE_REQUIRED` when it is below
 * `PEDIATRIC_MIN_CLIENT_VERSION`. Left behind the real version, it eventually
 * disables paediatric dosing on an app that supports it perfectly well — and
 * tells the clinician to update something that is already up to date.
 *
 * It had been frozen at 8.0.0 through nine releases, saved from doing harm only
 * because the minimum happened to still be 8.0.0 as well.
 *
 * Kept in step with package.json by client-version.test.ts, which is the only
 * thing that will notice: a stale version string breaks nothing on the day it
 * goes stale.
 */
export const LOSPOR_WEB_CLIENT_VERSION = "9.9.3"
