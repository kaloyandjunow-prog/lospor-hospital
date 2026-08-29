import { spawnSync } from "node:child_process"

const action = process.argv[2]
if (!action) throw new Error("Usage: node scripts/run-all.mjs ACTION")

// This repository IS the Hospital deployment, so its suites must run in Hospital
// mode. CI supplies LOSPOR_DEPLOYMENT_MODE=hospital in the job environment, but
// nothing here did, so a clean local checkout silently tested the generic
// deployment instead and reported failures CI never sees. Default it, without
// overriding a value someone set deliberately (some suites force the generic
// deployment to test exactly that).
const childEnv = {
  ...process.env,
  LOSPOR_DEPLOYMENT_MODE: process.env.LOSPOR_DEPLOYMENT_MODE ?? "hospital",
}

const projects = [
  ["Core", "vendor/lospor-core"],
  ["Exchange", "vendor/exchange-contract"],
  ["API", "apps/api"],
  ["Web", "apps/web"],
  ["PWA", "apps/pwa"],
  ["Browser", "apps/browser"],
  ["Status", "apps/status"],
]

for (const [name, directory] of projects) {
  const packageJson = await import(
    new URL(`../${directory}/package.json`, import.meta.url),
    { with: { type: "json" } },
  ).then(module => module.default)
  const projectAction = packageJson.scripts?.[action]
    ? action
    : name === "PWA" && action === "build"
      ? "export:web"
      : null
  if (!projectAction) continue
  process.stdout.write(`\n== ${name}: ${projectAction} ==\n`)
  const npmExecPath = process.env.npm_execpath
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, "run", projectAction], {
        cwd: new URL(`../${directory}/`, import.meta.url),
        stdio: "inherit",
        env: childEnv,
      })
    : spawnSync("npm", ["run", projectAction], {
        cwd: new URL(`../${directory}/`, import.meta.url),
        stdio: "inherit",
        env: childEnv,
      })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
