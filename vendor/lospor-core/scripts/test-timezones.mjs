// The whole suite under several machine time zones (9.13.0).
//
// Times on the record must come from the case's own zone, never the machine's:
// a hand-picked 15:22 came back as 14:22 or 13:22 when a conversion used the
// host's zone, and the hosted servers run at GMT+1. A test that only ever runs
// on one machine cannot see that, so this runs everything under each zone.
//
// TZ is set here rather than in a shell because Git Bash rewrites a value with
// a slash in it ("Europe/Sofia") into a path, and the run then silently uses
// the machine's zone and passes for the wrong reason.
import { spawnSync } from "node:child_process"

const zones = ["UTC", "Etc/GMT-1", "Europe/Sofia", "America/New_York"]
let failed = false
for (const zone of zones) {
  const check = spawnSync(process.execPath, ["-e", "process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)"], {
    env: { ...process.env, TZ: zone },
    encoding: "utf8",
  })
  if (check.stdout !== zone) {
    console.error(`TZ=${zone} did not take effect (got ${check.stdout}); refusing to report a pass`)
    process.exit(1)
  }
  console.log(`\n== TZ=${zone}`)
  const run = spawnSync("npx", ["vitest", "run"], { env: { ...process.env, TZ: zone }, stdio: "inherit", shell: true })
  if (run.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
