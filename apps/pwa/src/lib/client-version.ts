/**
 * What this app tells the server it is.
 *
 * Not decoration. It is sent as `X-LOSPOR-Client-Version` on every request, and
 * the server refuses paediatric case writes with 426
 * `PEDIATRIC_CLIENT_UPDATE_REQUIRED` when it is below
 * `PEDIATRIC_MIN_CLIENT_VERSION`. Left behind the real version, it eventually
 * disables paediatric dosing on an app that supports it perfectly well — and the
 * clinician is told to update an app that is already up to date.
 *
 * It had been frozen at 8.0.0 through nine releases, saved from doing harm only
 * because the minimum happened to still be 8.0.0 as well.
 *
 * Kept in step with package.json and app.json by client-version.test.ts, which
 * is the only thing that will notice.
 */
export const LOSPOR_MOBILE_CLIENT_VERSION = "9.9.1"
