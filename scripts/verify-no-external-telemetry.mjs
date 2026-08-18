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

// Outbound AI was a boundary this gate did not cover at all: it blocked three
// Sentry and Vercel packages and nothing else, while the appliance carries four
// routes that would post clinical text to a provider the moment a key existed.
//
// Two halves. No deployment file may wire an AI key -- today the appliance is
// safe only because compose.yaml omits one, which is an absence rather than a
// decision and one line away from not being true. And every AI route must
// refuse on an appliance before it reads that key, so adding one cannot turn
// the feature on.
for (const relative of ["compose.yaml", ".env.example"]) {
  const content = await readFile(new URL(`../${relative}`, import.meta.url), "utf8")
  if (/\bMISTRAL_[A-Z_]*\b/.test(content)) {
    problems.push(`${relative} wires an AI provider key into the appliance`)
  }
}

const aiRoutes = [
  "apps/api/src/app/v1/ai/advise/route.ts",
  "apps/api/src/app/v1/ai/read-labs/route.ts",
  "apps/api/src/app/v1/cases/[id]/ai/advise/route.ts",
  "apps/api/src/app/v1/cases/[id]/vitals-scan/route.ts",
]
for (const relative of aiRoutes) {
  const content = await readFile(new URL(`../${relative}`, import.meta.url), "utf8")
  const refusalAt = content.indexOf("refuseAiOnAppliance()")
  if (refusalAt === -1) {
    problems.push(`${relative} does not refuse AI on an appliance`)
    continue
  }
  // It has to be the first thing the handler does. Checked by position rather
  // than by mere presence, because a refusal placed after the provider call
  // would satisfy a presence check while the data had already left.
  const handlerAt = content.search(/export async function POST\(/)
  if (handlerAt === -1 || refusalAt < handlerAt) {
    problems.push(`${relative} refuses outside its request handler`)
  } else if (content.slice(handlerAt, refusalAt).split("\n").length > 4) {
    // Being first is what makes the check meaningful: everything the handler
    // could otherwise do first -- reading a key, parsing a clinical body,
    // calling the provider -- happens after this line or not at all.
    problems.push(`${relative} does not refuse on an appliance before doing other work`)
  }
  // Calling it is not enough; the answer has to be returned. Dropping the
  // return leaves the call in place and would pass a presence check while the
  // request carried on into the provider.
  if (!/const (\w+) = refuseAiOnAppliance\(\)\s*\r?\n\s*if \(\1\) return \1/.test(content)) {
    problems.push(`${relative} calls the appliance refusal without returning it`)
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
