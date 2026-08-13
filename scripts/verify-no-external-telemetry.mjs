import { readFile, readdir } from "node:fs/promises"
const forbiddenPackages = [
  "@sentry/nextjs",
  "@sentry/node",
  "@vercel/analytics",
]
const packagePaths = [
  "apps/api/package.json",
  "apps/web/package.json",
  "apps/pwa/package.json",
  "apps/browser/package.json",
  "apps/status/package.json",
]

const problems = []
for (const relative of packagePaths) {
  try {
    const parsed = JSON.parse(await readFile(new URL(`../${relative}`, import.meta.url), "utf8"))
    const declared = { ...parsed.dependencies, ...parsed.devDependencies }
    for (const name of forbiddenPackages) {
      if (name in declared) problems.push(`${relative} declares ${name}`)
    }
  } catch (error) {
    if (relative !== "apps/status/package.json") throw error
    // Status is created in the same change as this gate. Let an early install
    // run the guard before that directory has been materialised.
  }
}

const webRoot = new URL("../apps/web/", import.meta.url)
for (const entry of await readdir(webRoot)) {
  if (/^sentry\..*\.config\.[cm]?[jt]s$/.test(entry)) {
    problems.push(`apps/web/${entry} initializes Sentry`)
  }
}

const deploymentFiles = ["compose.yaml", ".env.example", "apps/web/.env.example"]
for (const relative of deploymentFiles) {
  const content = await readFile(new URL(`../${relative}`, import.meta.url), "utf8")
  if (/\b(?:SENTRY_DSN|NEXT_PUBLIC_SENTRY_DSN)\b/.test(content)) {
    problems.push(`${relative} configures external Sentry ingestion`)
  }
}

const dockerIgnore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8")
for (const boundary of ["secrets/*", ".data/", ".npm-cache-status/"]) {
  if (!dockerIgnore.split(/\r?\n/).includes(boundary)) {
    problems.push(`.dockerignore does not exclude ${boundary}`)
  }
}

if (problems.length) {
  process.stderr.write(`External telemetry boundary failed:\n${problems.map(p => `  - ${p}`).join("\n")}\n`)
  process.exit(1)
}

process.stdout.write("External telemetry boundary OK: appliance operational data stays local.\n")
