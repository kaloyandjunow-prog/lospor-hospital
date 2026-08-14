import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const DEFAULT_CONTRACT_RELEASE = "1.0.0-compose-contract"
const DEFAULT_PUBLICATION_TAG = `candidate-${"a".repeat(40)}-12345-${"c".repeat(16)}`
const IMAGE_PREFIX = "ghcr.io/kaloyandjunow-prog/lospor-hospital-"

export const RELEASE_IMAGE_BUILD_SERVICES = Object.freeze({
  api: "api",
  browser: "browser",
  caddy: "caddy",
  "curl-worker": "delivery-worker",
  migrate: "migrate",
  postgres: "postgres",
  pwa: "pwa",
  status: "status",
  tools: "tools",
  web: "web",
})

const EXPECTED_BUILDS = Object.freeze({
  api: { dockerfile: "infra/docker/api.Dockerfile", target: "runner" },
  web: { dockerfile: "infra/docker/web.Dockerfile" },
  pwa: { dockerfile: "infra/docker/pwa.Dockerfile" },
  browser: { dockerfile: "infra/docker/browser.Dockerfile" },
  status: { dockerfile: "infra/docker/status.Dockerfile" },
  migrate: { dockerfile: "infra/docker/api.Dockerfile", target: "migrator" },
  tools: { dockerfile: "infra/docker/api.Dockerfile", target: "tools" },
  postgres: { dockerfile: "infra/docker/postgres.Dockerfile" },
  "delivery-worker": { dockerfile: "infra/docker/curl-worker.Dockerfile" },
  caddy: { dockerfile: "infra/docker/caddy.Dockerfile" },
})

const EXPECTED_RELEASE_BUILD_ARGS = Object.freeze({
  api: { NODE_API_BASE_IMAGE: "NODE_API_BASE_IMAGE" },
  browser: { NODE_BROWSER_BASE_IMAGE: "NODE_BROWSER_BASE_IMAGE" },
  migrate: { NODE_API_BASE_IMAGE: "NODE_API_BASE_IMAGE" },
  pwa: {
    NODE_PWA_BUILD_BASE_IMAGE: "NODE_PWA_BUILD_BASE_IMAGE",
    NGINX_PWA_BASE_IMAGE: "NGINX_PWA_BASE_IMAGE",
  },
  status: { NODE_STATUS_BASE_IMAGE: "NODE_STATUS_BASE_IMAGE" },
  tools: { NODE_API_BASE_IMAGE: "NODE_API_BASE_IMAGE" },
  web: { NODE_WEB_BASE_IMAGE: "NODE_WEB_BASE_IMAGE" },
  postgres: { POSTGRES_BASE_IMAGE: "POSTGRES_BASE_IMAGE" },
  "delivery-worker": { CURL_BASE_IMAGE: "CURL_BASE_IMAGE" },
  caddy: {
    CADDY_BUILD_BASE_IMAGE: "CADDY_BUILD_BASE_IMAGE",
    CADDY_RUNTIME_BASE_IMAGE: "CADDY_RUNTIME_BASE_IMAGE",
  },
})

const MODEL_FILES = Object.freeze({
  source: ["compose.yaml"],
  publication: ["compose.yaml", "compose.publish.yaml"],
  runtime: ["compose.yaml", "compose.release.yaml"],
})

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function normalizedPath(value) {
  return String(value ?? "").replaceAll("\\", "/")
}

function expectedImage(service, tag) {
  return `${IMAGE_PREFIX}${service}:${tag}`
}

function hasExplicitTagOrDigest(image) {
  if (image.includes("@sha256:")) return true
  const withoutDigest = image.split("@", 1)[0]
  return withoutDigest.lastIndexOf(":") > withoutDigest.lastIndexOf("/")
}

function portNumber(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function buildErrors(modelName, serviceName, service) {
  const errors = []
  const expected = EXPECTED_BUILDS[serviceName]
  if (!record(service.build)) {
    errors.push(`${modelName} service "${serviceName}" must have a build definition`)
    return errors
  }

  const dockerfile = normalizedPath(service.build.dockerfile)
  if (!dockerfile.endsWith(expected.dockerfile)) {
    errors.push(
      `${modelName} service "${serviceName}" must build with ${expected.dockerfile}; got ${dockerfile || "none"}`,
    )
  }
  if (expected.target && service.build.target !== expected.target) {
    errors.push(
      `${modelName} service "${serviceName}" must use build target ${expected.target}; got ${service.build.target ?? "none"}`,
    )
  }
  return errors
}

function commonModelErrors(modelName, model) {
  const errors = []
  if (!record(model) || !record(model.services)) {
    return [`${modelName} did not resolve to a Compose model with services`]
  }

  for (const serviceName of Object.values(RELEASE_IMAGE_BUILD_SERVICES)) {
    if (!record(model.services[serviceName])) {
      errors.push(`${modelName} is missing required custom service "${serviceName}"`)
    }
  }

  for (const [serviceName, service] of Object.entries(model.services)) {
    const image = service.image
    if (typeof image === "string" && image.length > 0) {
      if (/(^|:)latest(?:@|$)/i.test(image)) {
        errors.push(`${modelName} service "${serviceName}" uses forbidden latest image ${image}`)
      } else if (!hasExplicitTagOrDigest(image)) {
        errors.push(`${modelName} service "${serviceName}" has an unpinned image ${image}`)
      }
    }

    for (const port of Array.isArray(service.ports) ? service.ports : []) {
      if (portNumber(port?.target) === 5432 || portNumber(port?.published) === 5432) {
        errors.push(`${modelName} service "${serviceName}" accidentally publishes PostgreSQL port 5432`)
      }
    }
  }

  const status = model.services.status
  if (record(status)) {
    const ports = Array.isArray(status.ports) ? status.ports : []
    const validFallback = ports.length === 1
      && portNumber(ports[0]?.target) === 3443
      && portNumber(ports[0]?.published) === 3443
      && ports[0]?.host_ip === "127.0.0.1"
      && (ports[0]?.protocol ?? "tcp") === "tcp"
    if (!validFallback) {
      errors.push(
        `${modelName} Status must publish only 127.0.0.1:3443 -> 3443/tcp as its HTTPS fallback`,
      )
    }
  }

  for (const serviceName of Object.values(RELEASE_IMAGE_BUILD_SERVICES).filter(name => !["status", "caddy"].includes(name))) {
    const service = model.services[serviceName]
    if (record(service) && Array.isArray(service.ports) && service.ports.length > 0) {
      errors.push(`${modelName} custom service "${serviceName}" must not publish a host port`)
    }
  }

  return errors
}

/**
 * Validate Docker Compose's fully resolved JSON models, not the source YAML.
 * This sees anchors, interpolation, profiles, merge resets and port expansion
 * exactly as Compose sees them.
 */
export function composeContractErrors(models, release) {
  const errors = []
  for (const modelName of Object.keys(MODEL_FILES)) {
    errors.push(...commonModelErrors(modelName, models?.[modelName]))
  }

  const source = models?.source?.services ?? {}
  const publication = models?.publication?.services ?? {}
  const runtime = models?.runtime?.services ?? {}
  const publicationTag = models?.publicationTag ?? DEFAULT_PUBLICATION_TAG

  for (const [imageName, serviceName] of Object.entries(RELEASE_IMAGE_BUILD_SERVICES)) {
    if (record(source[serviceName])) {
      errors.push(...buildErrors("source", serviceName, source[serviceName]))
    }

    if (record(publication[serviceName])) {
      errors.push(...buildErrors("publication", serviceName, publication[serviceName]))
      const wanted = expectedImage(imageName, publicationTag)
      if (publication[serviceName].image !== wanted) {
        errors.push(
          `publication service "${serviceName}" must use image ${wanted}; got ${publication[serviceName].image ?? "none"}`,
        )
      }
    }

    if (record(runtime[serviceName])) {
      const wanted = expectedImage(imageName, release)
      if (runtime[serviceName].image !== wanted) {
        errors.push(
          `runtime service "${serviceName}" must use image ${wanted}; got ${runtime[serviceName].image ?? "none"}`,
        )
      }
      if (runtime[serviceName].build !== undefined && runtime[serviceName].build !== null) {
        errors.push(`runtime service "${serviceName}" must not retain a build definition`)
      }
      if (runtime[serviceName].pull_policy !== "never") {
        errors.push(`runtime service "${serviceName}" must use pull_policy: never`)
      }
    }
  }

  const pinnedRuntimeImages = {
    "runtime-secrets-init": expectedImage("postgres", release),
    postgres: expectedImage("postgres", release),
    "status-db-init": expectedImage("postgres", release),
    backup: expectedImage("postgres", release),
    "delivery-worker": expectedImage("curl-worker", release),
    caddy: expectedImage("caddy", release),
  }
  for (const [serviceName, image] of Object.entries(pinnedRuntimeImages)) {
    const service = runtime[serviceName]
    if (!record(service)) {
      errors.push(`runtime is missing required service "${serviceName}"`)
      continue
    }
    if (service.image !== image) errors.push(`runtime service "${serviceName}" must use ${image}; got ${service.image ?? "none"}`)
    if (service.pull_policy !== "never") errors.push(`runtime service "${serviceName}" must use pull_policy: never`)
    if (service.build !== undefined && service.build !== null) {
      errors.push(`runtime service "${serviceName}" must not retain a build definition`)
    }
  }

  return errors
}

export function assertResolvedComposeContracts(models, release) {
  const errors = composeContractErrors(models, release)
  if (errors.length > 0) {
    throw new Error(`Resolved Compose release contract failed:\n- ${errors.join("\n- ")}`)
  }
}

export function digestPinnedBuildArgErrors(publicationModel, environment) {
  const errors = []
  for (const [serviceName, args] of Object.entries(EXPECTED_RELEASE_BUILD_ARGS)) {
    const actualArgs = publicationModel?.services?.[serviceName]?.build?.args ?? {}
    for (const [argName, environmentName] of Object.entries(args)) {
      const expected = environment?.[environmentName]
      if (typeof expected !== "string" || !/@sha256:[a-f0-9]{64}$/.test(expected)) {
        errors.push(`release environment ${environmentName} must be digest-pinned`)
      } else if (actualArgs[argName] !== expected) {
        errors.push(`publication service "${serviceName}" build arg ${argName} did not resolve to the approved digest`)
      }
    }
  }
  return [...new Set(errors)]
}

export function assertDigestPinnedBuildArgs(publicationModel, environment) {
  const errors = digestPinnedBuildArgErrors(publicationModel, environment)
  if (errors.length) throw new Error(`Release build arguments are not pinned:\n- ${errors.join("\n- ")}`)
}

function resolveOneModel(root, modelName, files, release, publicationTag) {
  const args = ["compose", "--env-file", ".env.example"]
  for (const file of files) args.push("-f", file)
  args.push("--profile", "tools", "config", "--format", "json")

  try {
    const output = execFileSync("docker", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        HOSPITAL_RELEASE: release,
        HOSPITAL_IMAGE_TAG: publicationTag,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    return JSON.parse(output)
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message || String(error)
    throw new Error(`Could not resolve ${modelName} Compose model: ${detail}`, { cause: error })
  }
}

export function resolveComposeModels({
  root = ROOT,
  release = DEFAULT_CONTRACT_RELEASE,
  publicationTag = DEFAULT_PUBLICATION_TAG,
} = {}) {
  return {
    publicationTag,
    ...Object.fromEntries(
    Object.entries(MODEL_FILES).map(([name, files]) => [
      name,
      resolveOneModel(root, name, files, release, publicationTag),
    ]),
    ),
  }
}

export function verifyReleaseCompose({
  root = ROOT,
  release = process.env.HOSPITAL_RELEASE || DEFAULT_CONTRACT_RELEASE,
  publicationTag = process.env.HOSPITAL_IMAGE_TAG || DEFAULT_PUBLICATION_TAG,
} = {}) {
  const models = resolveComposeModels({ root, release, publicationTag })
  assertResolvedComposeContracts(models, release)
  if (process.env.HOSPITAL_REQUIRE_DIGEST_BUILD_ARGS === "1") {
    assertDigestPinnedBuildArgs(models.publication, process.env)
  }
  return { models, release }
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedAsScript) {
  const { release } = verifyReleaseCompose()
  console.log(`Resolved Compose release contract OK (${release})`)
  console.log("- source: all ten release images retain controlled builds")
  console.log("- publication: all ten release images retain builds and gain candidate names")
  console.log("- runtime: all ten release images use versioned names without builds")
  console.log("- runtime: all ten verified release images use pull_policy never")
  console.log("- all models: no latest, no database port, loopback-only Status fallback")
}
