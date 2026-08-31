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

// External AI is an explicit hospital policy in 1.2. Deployment files may pass
// only the non-secret default, the API-only seal-file path, and the non-secret
// restore fingerprint. A plaintext provider credential must never enter
// Compose, .env, argv, image metadata, or a browser-visible capability reply.
const allowedExternalAiSettings = new Set([
  "HOSPITAL_EXTERNAL_AI_DEFAULT",
  "HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE",
  "HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT",
])
for (const relative of [
  "compose.yaml",
  "compose.release.yaml",
  "compose.publish.yaml",
  ".env.example",
]) {
  const content = await readFile(new URL(`../${relative}`, import.meta.url), "utf8")
  if (/\bMISTRAL_[A-Z_]+\b/.test(content)) {
    problems.push(`${relative} wires a plaintext AI provider setting into the appliance`)
  }
  for (const [setting] of content.matchAll(/\b(HOSPITAL_EXTERNAL_AI_[A-Z_]+)\b/g)) {
    if (!allowedExternalAiSettings.has(setting)) {
      problems.push(`${relative} wires unapproved external-AI setting ${setting}`)
    }
  }
}

const aiRoutes = [
  "apps/api/src/app/v1/ai/advise/route.ts",
  "apps/api/src/app/v1/cases/[id]/ai/advise/route.ts",
  "apps/api/src/app/v1/cases/[id]/ai/read-labs/route.ts",
  "apps/api/src/app/v1/cases/[id]/vitals-scan/route.ts",
]
for (const relative of aiRoutes) {
  const content = await readFile(new URL(`../${relative}`, import.meta.url), "utf8")
  const preflightAt = content.indexOf("await externalAiCapabilityState()")
  const credentialAt = content.indexOf("await externalAiProviderAccess()")
  if (preflightAt === -1) {
    problems.push(`${relative} does not resolve persisted external-AI policy before clinical work`)
    continue
  }
  const handlerAt = content.search(/export async function POST\(/)
  if (handlerAt === -1 || preflightAt < handlerAt) {
    problems.push(`${relative} resolves external-AI policy outside its request handler`)
  } else if (content.slice(handlerAt, preflightAt).split("\n").length > 5) {
    problems.push(`${relative} does not resolve external-AI policy before doing clinical work`)
  }
  if (credentialAt === -1 || credentialAt <= preflightAt) {
    problems.push(`${relative} does not reopen the sealed credential immediately before egress`)
  }
  if (!/const (\w+) = await externalAiCapabilityState\(\)\s*\r?\n\s*if \(!\1\.enabled\)/.test(content)) {
    problems.push(`${relative} checks policy without returning its disabled state`)
  }
  if (!/const (\w+) = await externalAiProviderAccess\(\)\s*\r?\n\s*if \(!\1\.enabled\)/.test(content)) {
    problems.push(`${relative} opens a credential without returning a concurrent refusal`)
  }
  const providerAt = content.indexOf("fetchMistralChatCompletions(")
  if (providerAt === -1 || credentialAt > providerAt) {
    problems.push(`${relative} does not open the sealed credential before its provider call`)
  }
  for (const clinicalRead of ["await req.text()", "await req.json()", "prisma.case.findUnique"] ) {
    const clinicalReadAt = content.indexOf(clinicalRead)
    if (clinicalReadAt !== -1 && preflightAt > clinicalReadAt) {
      problems.push(`${relative} reads clinical data before the external-AI policy preflight`)
    }
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
