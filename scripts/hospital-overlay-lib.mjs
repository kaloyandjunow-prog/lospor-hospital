import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

const LOCAL_CORE = "file:../../vendor/lospor-core"
const APP_NAMES = ["api", "web", "pwa", "browser"]
const FORBIDDEN_PACKAGES = [
  "@sentry/nextjs",
  "@sentry/node",
  "@sentry/react",
  "@sentry/react-native",
  "@vercel/analytics",
  "@vercel/speed-insights",
  "@netlify/plugin-nextjs",
]
const FORBIDDEN_CONFIG_NAMES = new Set([
  ".sentryclirc",
  "vercel.json",
  "netlify.toml",
  "serverless.yml",
  "serverless.yaml",
  "wrangler.toml",
  "fly.toml",
  "render.yaml",
])
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".expo",
  "coverage",
  "dist",
  "node_modules",
  "test-results",
])

export const STRUCTURAL_CONTRACTS = Object.freeze([
  {
    id: "api.hospital-deployment-guard",
    source: "api",
    path: "apps/api/src/lib/hospital/deployment.ts",
    required: ["LOSPOR_DEPLOYMENT_MODE", '=== "hospital"'],
  },
  {
    // Clinical payloads must default to EU inference and must never move to the
    // global endpoint on a provider 403 unless that transfer was explicitly
    // approved. Both halves lived only in this vendored copy and were asserted
    // by nothing, so a re-vendor could have restored the upstream behaviour --
    // which failed open -- with no gate noticing.
    id: "api.mistral-regional-residency",
    source: "api",
    path: "apps/api/src/lib/mistral.ts",
    required: ["MISTRAL_ALLOW_GLOBAL_FALLBACK", "DEFAULT_MISTRAL_API_BASE", "api.eu.mistral.ai"],
  },
  {
    id: "api.operator-status-route",
    source: "api",
    path: "apps/api/src/app/internal/appliance-status/route.ts",
    required: ["isHospitalDeployment", "applianceStatusSnapshot", "status-snapshot-auth"],
  },
  {
    id: "api.clinical-status-route",
    source: "api",
    path: "apps/api/src/app/v1/hospital/status/route.ts",
    required: ["isHospitalDeployment", "central-status", "hospitalInstallation"],
  },
  {
    id: "api.hospital-data-models",
    source: "api",
    path: "apps/api/prisma/schema.prisma",
    required: [
      "model PatientLink {",
      "model HospitalInstallation {",
      "applianceOperatorUserId",
      "model HospitalAccountAccessToken {",
      "enum HospitalAccountTokenPurpose {",
      "accountKind",
    ],
  },
  {
    id: "api.hospital-account-control-route",
    source: "api",
    path: "apps/api/src/app/v1/internal/hospital/accounts/route.ts",
    required: [
      "authorizeAccountControl",
      "createHospitalAccount",
      "listHospitalAccounts",
      "ACCOUNT_CONTROL_HEADERS",
    ],
  },
  {
    id: "api.local-status-events",
    source: "api",
    path: "apps/api/src/lib/audit.ts",
    required: ["hospital/status-events", "emitStatusEvent"],
  },
  {
    id: "api.generated-public-contract",
    source: "api",
    path: "apps/api/src/generated/openapi.json",
    required: ['"/v1/hospital/status"', '"x-lospor-stability": "hospital"'],
  },
  {
    id: "api.generated-internal-contract",
    source: "api",
    path: "apps/api/src/generated/openapi-internal.json",
    required: ['"/v1/internal/hospital-delivery/process"'],
  },
  {
    id: "web.local-api-routing",
    source: "web",
    path: "apps/web/next.config.ts",
    required: [
      "LOSPOR_API_INTERNAL_URL",
      "http://127.0.0.1:3002",
      'source: "/api/:path*"',
      "`${apiInternalUrl}/v1/:path*`",
      'transpilePackages: ["@lospor/core"]',
    ],
    forbidden: ["https://api.lospor.org"],
  },
  {
    id: "web.hospital-account-link-fragment",
    source: "web",
    path: "apps/web/src/lib/hospital-account-link.ts",
    required: ["hospitalToken", "URLSearchParams", "fragment"],
    forbidden: ["localStorage", "sessionStorage"],
  },
  {
    id: "web.e2e-local-api-command",
    source: "web",
    path: "apps/web/playwright.config.ts",
    required: [
      'const e2eApiPort = e2ePort("E2E_API_PORT", 3302)',
      'command: `npm exec -- next dev --port ${e2eApiPort}`',
      'cwd: "../api"',
      "reuseExistingServer: false",
    ],
    forbidden: ["../lospor-api", "https://api.lospor.org"],
  },
  {
    id: "web.e2e-local-api-database",
    source: "web",
    path: "apps/web/scripts/e2e-db.mjs",
    required: ['join(root, "..", "api")'],
    forbidden: ['join(root, "..", "lospor-api")'],
  },
  {
    id: "web.smoke-local-api-command",
    source: "web",
    path: "apps/web/playwright.smoke.config.ts",
    required: ['command: "npm --prefix ../api run dev"'],
    forbidden: ["../lospor-api", "https://api.lospor.org"],
  },
  {
    id: "pwa.appliance-api-default",
    source: "pwa",
    path: "apps/pwa/src/lib/api.ts",
    required: ["EXPO_PUBLIC_API_BASE", "https://hospital.lospor.invalid"],
    forbidden: ["https://api.lospor.org"],
  },
  {
    id: "pwa.appliance-web-links",
    source: "pwa",
    path: "apps/pwa/src/lib/hospital-links.ts",
    required: ["EXPO_PUBLIC_HOSPITAL_WEB_URL", "window.location.origin", "hospital.lospor.invalid"],
    forbidden: ["https://lospor.org"],
  },
  {
    id: "pwa.e2e-hospital-api",
    source: "pwa",
    path: "apps/pwa/playwright.pwa.config.ts",
    required: [
      'command: "npm --prefix ../api run dev"',
      'HOSPITAL_REQUIRE_PATIENT_NUMBER: "true"',
      'globalSetup: "../web/e2e/global-setup.ts"',
    ],
    forbidden: ["../lospor-api", "https://api.lospor.org"],
  },
  // Settings must open this hospital's own legal pages, never lospor.org.
  //
  // This asserted `hospitalWebUrl(...)` inside settings.tsx, which upstream has
  // since split into components/settings/. The guarantee did not move, only the
  // code: legalDocumentUrl resolves against the running origin, which on an
  // appliance is the clinical host serving the Web app at `/`, and it is the
  // only right answer there because the hospital's hostname is not knowable
  // from inside the export.
  //
  // Both halves are checked, since either alone can be satisfied while the
  // guarantee is broken: the call site must go through the deployment-aware
  // helper, and the helper must still prefer the running origin over the
  // public base it falls back to off the web.
  {
    id: "pwa.settings-use-appliance-links",
    source: "pwa",
    path: "apps/pwa/src/components/settings/SettingsPreferencesView.tsx",
    required: ['legalDocumentUrl("privacy"', 'legalDocumentUrl("terms"'],
    forbidden: ["lospor.org"],
  },
  {
    id: "pwa.legal-links-prefer-running-origin",
    source: "pwa",
    path: "apps/pwa/src/lib/legal-links.ts",
    required: ['platform === "web" && runtimeOrigin ? runtimeOrigin'],
  },
  {
    id: "browser.local-api-rewrite",
    source: "browser",
    path: "apps/browser/next.config.ts",
    required: [
      "LOSPOR_API_INTERNAL_URL",
      "http://127.0.0.1:3002",
      'source: "/api/:path*"',
      "`${apiInternalUrl}/v1/:path*`",
      'transpilePackages: ["@lospor/core"]',
    ],
    forbidden: ["https://api.lospor.org"],
  },
  {
    id: "browser.server-api-origin",
    source: "browser",
    path: "apps/browser/src/lib/api.ts",
    required: ["LOSPOR_API_INTERNAL_URL", "http://127.0.0.1:3002", "`${API_INTERNAL_URL}${path}`"],
    forbidden: ["https://api.lospor.org"],
  },
  {
    id: "browser.e2e-hospital-api",
    source: "browser",
    path: "apps/browser/playwright.config.ts",
    required: [
      'command: "npm --prefix ../api run dev"',
      'HOSPITAL_REQUIRE_PATIENT_NUMBER: "true"',
      'globalSetup: "../web/e2e/global-setup.ts"',
    ],
    forbidden: ["../lospor-api", "https://api.lospor.org"],
  },
  {
    id: "core.boundary-check",
    source: "core",
    path: "vendor/lospor-core/scripts/check-boundaries.mjs",
    required: ["process.exit"],
  },
  /**
   * The closure sweep is scheduled HERE AND NOWHERE ELSE.
   *
   * Upstream's vercel.json deliberately does not schedule it: Vercel charges
   * for sub-daily cron schedules and rejects the whole deployment without
   * them, which froze the published API at 9.8.0 for four releases. So reading
   * lospor-api gives the impression that automatic case closure is not
   * scheduled at all. It is -- by the appliance, every five minutes, which is
   * the only deployment where the feature actually works.
   *
   * This rule exists so that impression cannot quietly become true here. A
   * vendor pass that drops the call, or a tidy-up that removes it as dead
   * because upstream has no equivalent, fails the gate instead of shipping an
   * appliance where finished cases never close.
   */
  /**
   * Documentation is vendored too, and nothing else here looks at it.
   *
   * Upstream's ROLLBACK.md is written for the hosted deployment: promote a
   * previous Vercel build, take a Supabase point-in-time restore, reason about
   * a vercel.json build command. It was vendored verbatim for months. An
   * appliance has none of those things -- the overlay gate forbids vercel.json
   * outright -- so an operator who found this file mid-incident would have been
   * following instructions for somebody else's infrastructure.
   *
   * The gates are thorough about code and read no prose, which is how a
   * document can be false in its vendored context and still pass everything.
   * This rule is the narrow fix: the appliance's copy must point at the
   * appliance's own procedure, and must not carry the cloud one back.
   */
  {
    id: "api.rollback-is-the-appliance-procedure",
    source: "api",
    path: "apps/api/ROLLBACK.md",
    required: [
      "docs/updates-compatibility.md",
      "docs/backup-restore.md",
      "release-compatibility.tsv",
    ],
    forbidden: ["Supabase", "vercel.json", "VERCEL_ENV"],
  },
  /**
   * The privacy page is a complete appliance rewrite, not a translated
   * upstream one, and nothing else here notices if that stops being true.
   *
   * Upstream's version reads `messages/*.json`'s `legal.privacy` section,
   * which lists Supabase and Vercel as sub-processors under "Sub-processors
   * for the cloud demo" -- correct there, since that is what the hosted demo
   * uses. The appliance's own page is hand-authored instead: institution as
   * controller, data retained on the local server, no cloud sub-processor
   * list, because there is no cloud sub-processor.
   *
   * A vendor pass that took upstream's one-line component wholesale --
   * plausible, since it looks like a trivial file with nothing appliance-
   * specific in it -- would start telling a hospital's patients that their
   * perioperative record passes through Supabase and Vercel. That is the same
   * failure shape ROLLBACK.md and serve-pwa.mjs already turned out to have:
   * a vendored file assuming the cloud deployment, silently wrong once it
   * reaches a deployment that has none, caught by nothing because the gates
   * read code and structure, not the prose a clinician or patient reads.
   */
  {
    id: "web.privacy-page-is-appliance-authored",
    source: "web",
    path: "apps/web/src/app/(auth)/privacy/page.tsx",
    required: ["institution", "local server"],
    forbidden: ["Supabase", "Vercel", "LegalDocument", "getTranslations"],
  },
  {
    id: "delivery.case-close-sweep-scheduled",
    source: "hospital",
    path: "infra/delivery/worker-loop.sh",
    required: [
      "/v1/internal/close-expired-cases",
      "HOSPITAL_CASE_CLOSE_INTERVAL_SECONDS",
      "case_close_due",
      "case-close-status.v1.json",
    ],
  },
])

function result(id, source, path, ok, message, evidence = undefined) {
  return {
    id,
    source,
    path,
    ok,
    message,
    ...(evidence === undefined ? {} : { evidence }),
  }
}

function readJson(root, path, checks, id, source) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"))
  } catch (error) {
    checks.push(result(id, source, path, false, `Cannot parse JSON: ${error.message}`))
    return null
  }
}

function packageChecks(root, app, checks) {
  const packagePath = `apps/${app}/package.json`
  const lockPath = `apps/${app}/package-lock.json`
  const packageJson = readJson(root, packagePath, checks, `${app}.package-json`, app)
  if (packageJson) {
    const declared = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.optionalDependencies,
    }
    checks.push(result(
      `${app}.local-core-package`,
      app,
      packagePath,
      packageJson.dependencies?.["@lospor/core"] === LOCAL_CORE,
      packageJson.dependencies?.["@lospor/core"] === LOCAL_CORE
        ? "package.json uses the vendored Core tree"
        : `@lospor/core must be '${LOCAL_CORE}'`,
      { actual: packageJson.dependencies?.["@lospor/core"] ?? null },
    ))
    const forbidden = FORBIDDEN_PACKAGES.filter(name => Object.hasOwn(declared, name))
    checks.push(result(
      `${app}.no-external-telemetry-package`,
      app,
      packagePath,
      forbidden.length === 0,
      forbidden.length
        ? `Forbidden external telemetry package(s): ${forbidden.join(", ")}`
        : "No known external telemetry SDK is declared",
      { forbidden },
    ))
  }

  const lock = readJson(root, lockPath, checks, `${app}.package-lock`, app)
  if (lock) {
    const rootDependency = lock.packages?.[""]?.dependencies?.["@lospor/core"]
    const link = lock.packages?.["node_modules/@lospor/core"]
    const ok = rootDependency === LOCAL_CORE
      && link?.resolved === "../../vendor/lospor-core"
      && link?.link === true
    checks.push(result(
      `${app}.local-core-lock`,
      app,
      lockPath,
      ok,
      ok
        ? "package-lock.json resolves Core through the local vendored link"
        : "package-lock.json does not preserve the local Core link",
      { rootDependency: rootDependency ?? null, link: link ?? null },
    ))
    const lockText = readFileSync(join(root, lockPath), "utf8").toLowerCase()
    const forbidden = FORBIDDEN_PACKAGES.filter(name => lockText.includes(name.toLowerCase()))
    checks.push(result(
      `${app}.no-external-telemetry-lock`,
      app,
      lockPath,
      forbidden.length === 0,
      forbidden.length
        ? `Lockfile contains forbidden telemetry package(s): ${forbidden.join(", ")}`
        : "Lockfile has no known external telemetry SDK",
      { forbidden },
    ))
  }
}

function findForbiddenConfigs(root, start, found = []) {
  if (!existsSync(start)) return found
  for (const name of readdirSync(start)) {
    const absolute = join(start, name)
    const stat = lstatSync(absolute)
    const relativePath = relative(root, absolute).split(sep).join("/")
    if (stat.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(name)) continue
      if (name === ".vercel" || name === ".netlify") {
        found.push(relativePath)
      } else {
        findForbiddenConfigs(root, absolute, found)
      }
    } else if (
      FORBIDDEN_CONFIG_NAMES.has(name.toLowerCase())
      || /^sentry\..*\.config\.[cm]?[jt]sx?$/i.test(name)
    ) {
      found.push(relativePath)
    }
  }
  return found
}

function structuralCheck(root, contract) {
  const absolute = join(root, contract.path)
  if (!existsSync(absolute)) {
    return result(contract.id, contract.source, contract.path, false, "Required Hospital overlay file is missing")
  }
  let content
  try {
    content = readFileSync(absolute, "utf8")
  } catch (error) {
    return result(contract.id, contract.source, contract.path, false, `Cannot read file: ${error.message}`)
  }
  const missing = contract.required.filter(fragment => !content.includes(fragment))
  const forbidden = (contract.forbidden ?? []).filter(fragment => content.includes(fragment))
  const ok = missing.length === 0 && forbidden.length === 0
  return result(
    contract.id,
    contract.source,
    contract.path,
    ok,
    ok
      ? "Required structural markers are present"
      : [
          missing.length ? `missing ${missing.map(value => JSON.stringify(value)).join(", ")}` : "",
          forbidden.length ? `forbidden ${forbidden.map(value => JSON.stringify(value)).join(", ")}` : "",
        ].filter(Boolean).join("; "),
    { missing, forbidden },
  )
}

function corePackageCheck(root, checks) {
  const path = "vendor/lospor-core/package.json"
  const packageJson = readJson(root, path, checks, "core.package-json", "core")
  if (!packageJson) return
  const ok = packageJson.name === "@lospor/core"
    && packageJson.private === true
    && packageJson.type === "module"
    && packageJson.main === "./src/index.ts"
    && packageJson.exports?.["."] === "./src/index.ts"
  checks.push(result(
    "core.package-boundary",
    "core",
    path,
    ok,
    ok
      ? "Vendored Core retains its private source-package boundary"
      : "Core package identity, privacy, module type, entry point, or root export changed",
  ))
}

export function verifyHospitalOverlays(root) {
  root = resolve(root)
  const checks = []
  for (const app of APP_NAMES) packageChecks(root, app, checks)
  corePackageCheck(root, checks)
  for (const contract of STRUCTURAL_CONTRACTS) checks.push(structuralCheck(root, contract))

  const scanRoots = [
    ...APP_NAMES.map(app => join(root, "apps", app)),
    join(root, "vendor", "lospor-core"),
  ]
  const forbiddenConfigs = scanRoots.flatMap(path => findForbiddenConfigs(root, path))
    .sort((a, b) => a.localeCompare(b, "en"))
  checks.push(result(
    "all.no-cloud-or-sentry-config",
    "all",
    ".",
    forbiddenConfigs.length === 0,
    forbiddenConfigs.length
      ? `Known cloud/Sentry deployment config(s) found: ${forbiddenConfigs.join(", ")}`
      : "No known cloud-hosting or Sentry configuration file is present",
    { forbiddenConfigs },
  ))

  const failures = checks.filter(check => !check.ok)
  return {
    schemaVersion: 1,
    kind: "lospor-hospital-overlay-verification",
    ok: failures.length === 0,
    root,
    summary: {
      total: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
    },
    checks,
    failures,
  }
}
