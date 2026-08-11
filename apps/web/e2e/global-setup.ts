import { spawnSync } from "node:child_process"
import { join } from "node:path"

/**
 * Reseeds before every run.
 *
 * Sign-in is rate limited to ten attempts per address and per IP in fifteen
 * minutes. A full run authenticates six accounts in the setup project and signs
 * in again in several specs, all from one address — so a second run inside the
 * window, and occasionally a single long one, fails on a limit the suite
 * imposed on itself. It surfaces as a navigation timeout on the login page,
 * which reads like a broken application rather than an exhausted bucket.
 *
 * The seeder already clears the E2E rate-limit rows as its last step, so
 * running it here fixes the problem without relaxing a control that exists for
 * a reason. It also restores the fixture accounts if a spec has disturbed them.
 *
 * It does not recreate the database — `npm run e2e:db:reset` does that, and it
 * is the right answer when the schema changes or the data is genuinely wrong.
 */
export default function globalSetup() {
  // __dirname, not import.meta: Playwright loads this file as CommonJS, the
  // same way it loads playwright.config.ts.
  const root = join(__dirname, "..")
  const result = spawnSync("node", [join(root, "scripts", "e2e-db.mjs"), "seed"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  })
  if (result.status !== 0) {
    throw new Error(
      "e2e seed failed. If the database is not running: npm run e2e:db:up",
    )
  }
}
