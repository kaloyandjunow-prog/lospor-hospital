import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8")
const [compose, caddy, generated, guided, readiness, validator, doctor, importer, terminologyStatus, terminologyDb, referenceReadme] = await Promise.all([
  read("compose.yaml"),
  read("infra/caddy/Caddyfile"),
  read("scripts/generate-secrets.sh"),
  read("scripts/install-guided.sh"),
  read("scripts/readiness-check.sh"),
  read("scripts/validate-caddy-config.sh"),
  read("scripts/doctor.sh"),
  read("scripts/import-terminology.sh"),
  read("scripts/terminology-status.sh"),
  read("scripts/terminology-db-lib.sh"),
  read("reference-data/README.md"),
])

function serviceBlock(name) {
  const match = compose.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9-]*:\\n|\\nvolumes:)`))
  assert.ok(match, `missing ${name} service`)
  return match[1]
}

test("TLS mode, not raw Caddy text, selects one exact certificate mode", () => {
  assert.match(caddy, /import tls_site_\{\$HOSPITAL_TLS_MODE\}/g)
  assert.match(caddy, /\(tls_site_operator\)[\s\S]*tls \/run\/tls\/fullchain\.pem \/run\/tls\/private\.key/)
  assert.match(caddy, /\(tls_site_local\)[\s\S]*tls internal/)
  assert.match(caddy, /\(tls_site_acme\)[\s\S]*tls \{\$ACME_EMAIL\}/)
  assert.doesNotMatch(caddy, /HOSPITAL_CADDY_(?:GLOBAL|SITE)_EXTRA/)
  assert.doesNotMatch(compose, /HOSPITAL_CADDY_(?:GLOBAL|SITE)_EXTRA/)
})

test("host port 80 exists only on the ACME profile", () => {
  assert.doesNotMatch(serviceBlock("caddy"), /- "80:80"/)
  const acme = serviceBlock("acme-http")
  assert.match(acme, /profiles: \[tls-acme\]/)
  assert.match(acme, /- "80:80"/)
  assert.match(acme, /command: \["run", "--config", "\/etc\/caddy\/AcmeProxyCaddyfile"/)
  assert.doesNotMatch(acme, /command: \["caddy"/)
})

test("Research and Status boundaries are required without RFC1918 defaults", () => {
  const caddyService = serviceBlock("caddy")
  assert.match(caddyService, /HOSPITAL_RESEARCH_ALLOWED_CIDRS: \$\{HOSPITAL_RESEARCH_ALLOWED_CIDRS:\?/) 
  assert.match(caddyService, /HOSPITAL_STATUS_ALLOWED_CIDRS: \$\{HOSPITAL_STATUS_ALLOWED_CIDRS:\?/) 
  assert.doesNotMatch(caddyService, /10\.0\.0\.0\/8 172\.16\.0\.0\/12 192\.168\.0\.0\/16/)
  for (const source of [generated, guided, readiness]) {
    assert.match(source, /HOSPITAL_RESEARCH_ALLOWED_CIDRS/)
    assert.match(source, /HOSPITAL_STATUS_ALLOWED_CIDRS/)
  }
  assert.match(validator, /network-boundaries\.py/)
  assert.match(validator, /boundary_value.*boundary_canonical/s)
  assert.match(validator, /HOSPITAL_CADDY_GLOBAL_EXTRA/)
})

test("doctor probes both names on the configured ports and has a go-live gate", () => {
  assert.match(doctor, /HOSPITAL_RESEARCH_DOMAIN/)
  assert.match(doctor, /--resolve "\$host:\$HOSPITAL_HTTPS_PORT:127\.0\.0\.1"/)
  assert.match(doctor, /localhost:\$HOSPITAL_STATUS_PORT/)
  assert.match(doctor, /terminology-status\.sh --go-live/)
  // The package is optional: go-live checks one only where one was imported.
  assert.match(doctor, /"\$doctor_mode" = go-live \] && \[ -s "\$appliance_home\/\.data\/terminology\/active\.tsv" \]/)
})

test("restore pre-open doctor proves internal services and schema before touching Caddy", () => {
  assert.match(doctor, /--restore-preopen/)
  assert.match(doctor, /prisma\/build\/index\.js migrate status --schema prisma\/schema\.prisma/)
  for (const endpoint of [
    "http://api:3002/health/live",
    "http://api:3002/health/ready",
    "http://web:3000/login",
    "http://pwa:8080/health",
    "http://browser:3003/login",
    "http://127.0.0.1:3004/internal/health/live",
  ]) assert.match(doctor, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.ok(doctor.indexOf("RESTORE_PREOPEN_OK") < doctor.indexOf("HOSPITAL_CLINICAL_DOMAIN=\"$(env_value"))
})

test("terminology import is staged, resumable, validated, and atomically named", () => {
  assert.match(importer, /CREATE DATABASE \\"\$stage_database\\" WITH TEMPLATE \\"lospor\\"/)
  assert.match(importer, /--resume/)
  assert.match(importer, /seed-vocabularies\.ts/)
  assert.match(importer, /seed-lab-loinc\.ts/)
  assert.match(importer, /seed-athena-vocabularies\.ts/)
  assert.match(importer, /seed-concept-maps\.ts/)
  assert.match(importer, /ALTER DATABASE \\"lospor\\" RENAME TO \\"\$previous_database\\"/)
  assert.match(importer, /ALTER DATABASE \\"\$stage_database\\" RENAME TO \\"lospor\\"/)
  assert.match(importer, /terminology_record_approved_manifest/)
  assert.match(importer, /rollback-terminology\.sh --confirm/)
  assert.doesNotMatch(importer, /\bnpx\b/)
  assert.match(terminologyDb, /hospitalManifestEvidence/)
  assert.match(terminologyDb, /hospital-approved/)
  assert.match(terminologyStatus, /terminology_query_approved_manifest lospor/)
  assert.match(terminologyStatus, /database_evidence_sha/)
  assert.match(referenceReadme, /import-terminology\.sh/)
})
