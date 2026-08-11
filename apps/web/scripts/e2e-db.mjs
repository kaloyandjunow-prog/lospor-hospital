import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

/**
 * Brings up the disposable end-to-end database.
 *
 * The point is that nothing here needs to be careful. The seeder is not
 * transactional and has a path that cannot repair itself on a rerun, which
 * against the shared dev project meant a half-seeded database somebody had to
 * diagnose. Here the recovery for anything at all is `reset`.
 *
 *   node scripts/e2e-db.mjs up      start, wait, migrate
 *   node scripts/e2e-db.mjs reset   destroy and rebuild, then migrate
 *   node scripts/e2e-db.mjs down    stop
 */

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const composeFile = join(root, "e2e", "docker-compose.e2e.yaml")

/**
 * Where the end-to-end database lives.
 *
 * This used to be a hard-coded constant while playwright.config.ts read
 * E2E_DATABASE_URL from the environment. The two therefore disagreed the moment
 * anyone set it: this script created, migrated and seeded a container on 55433
 * while Playwright ran against whatever the variable named. CI is exactly that
 * case — it provisions PostgreSQL on 5432 — so the suite tested an empty
 * database, or a database nobody had migrated.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL
  ?? "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e"

/**
 * An externally supplied URL means "use this database", not "start a container
 * on this port". Whoever set the variable owns the server's lifecycle, so we
 * bring the schema and data up to date and never start or destroy it.
 */
const externalDatabase = Boolean(process.env.E2E_DATABASE_URL)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result
}

function compose(...args) {
  run("docker", ["compose", "-f", composeFile, ...args], { cwd: root })
}

function waitForHealthy() {
  process.stdout.write("waiting for postgres")
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync("docker", [
      "compose", "-f", composeFile, "exec", "-T", "postgres",
      "pg_isready", "-U", "lospor", "-d", "lospor_e2e",
    ], { cwd: root, encoding: "utf8" })
    if (probe.status === 0) {
      process.stdout.write(" ready\n")
      return
    }
    process.stdout.write(".")
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{}, 1000)"])
  }
  console.error("\nPostgreSQL did not become ready.")
  process.exit(1)
}

function migrate() {
  // The API owns the schema, so its migrations are the only definition of it.
  // Run from the API directory: npm --prefix resolves the package but leaves the
  // working directory alone, and Prisma looks for its schema relative to cwd.
  const apiRoot = join(root, "..", "lospor-api")
  run("npx", ["prisma", "migrate", "deploy"], {
    cwd: apiRoot,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
    },
  })
}

function seed() {
  const apiRoot = join(root, "..", "lospor-api")
  run("npm", ["run", "e2e:seed"], {
    cwd: apiRoot,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
    },
  })
}

const command = process.argv[2] ?? "up"

if (command === "down") {
  if (externalDatabase) {
    console.log("E2E_DATABASE_URL is set; leaving that database running.")
  } else {
    compose("down", "--volumes")
  }
} else if (command === "seed") {
  seed()
} else if (command === "reset" || command === "up") {
  if (externalDatabase) {
    // Not ours to create or throw away — only to bring up to date.
    migrate()
    seed()
  } else {
    // reset throws the data away first; up is idempotent on an existing one.
    if (command === "reset") compose("down", "--volumes")
    compose("up", "-d")
    waitForHealthy()
    migrate()
    seed()
  }
  console.log(`\nDatabase ready and seeded at ${E2E_DATABASE_URL}`)
} else {
  console.error(`Unknown command: ${command}. Use up, reset, seed or down.`)
  process.exit(1)
}
