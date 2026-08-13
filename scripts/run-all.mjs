import { spawnSync } from "node:child_process"

const action = process.argv[2]
if (!action) throw new Error("Usage: node scripts/run-all.mjs ACTION")

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
      })
    : spawnSync("npm", ["run", projectAction], {
        cwd: new URL(`../${directory}/`, import.meta.url),
        stdio: "inherit",
      })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
