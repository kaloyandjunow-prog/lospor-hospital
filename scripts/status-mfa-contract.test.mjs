import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("production and development Status receive a dedicated MFA encryption key", () => {
  for (const compose of [read("compose.yaml"), read("compose.status-dev.yaml")]) {
    assert.match(
      compose,
      /STATUS_MFA_ENCRYPTION_KEY_FILE:\s*\/run\/status-secrets\/mfa-encryption-key/,
    )
  }
  assert.match(read("scripts/ensure-status-secrets.sh"), /ensure_hex secrets\/status\/mfa-encryption-key/)
  assert.match(read("scripts/ensure-status-dev-secrets.sh"), /ensure_hex "\$directory\/mfa-encryption-key"/)
  assert.match(read("infra/secrets/install-runtime-secrets.sh"), /rate-limit-key \\\n+\s*mfa-encryption-key \\/)
  assert.match(
    read("infra/status-fixture/install-dev-secrets.sh"),
    /source_dir\/mfa-encryption-key.*status_target\/mfa-encryption-key/,
  )
})

test("Status fails closed on key format and wires that key into authentication", () => {
  const config = read("apps/status/src/config.ts")
  assert.match(config, /readEncryptionKey\(env, "STATUS_MFA_ENCRYPTION_KEY_FILE"\)/)
  assert.match(config, /\^\[0-9a-f\]\{64\}\$/i)
  assert.doesNotMatch(config, /STATUS_MFA_(?:DISABLED|OPTIONAL|REQUIRED)/)

  const index = read("apps/status/src/index.ts")
  assert.match(index, /config\.mfaEncryptionKey/)
  const app = read("apps/status/src/app.ts")
  assert.match(app, /auth\.beginPasswordLogin\(/)
  assert.match(app, /auth\.completeMfaLogin\(/)
  assert.doesNotMatch(app, /auth\.login\(/)
})

test("Status and the clinical API keep separate source allowlists", () => {
  const installer = read("infra/secrets/install-runtime-secrets.sh")
  assert.match(installer, /"\$status_source\/\$name" "\$status_target\/\$name"/)
  assert.match(installer, /"\$api_source\/\$name" "\$api_target\/\$name"/)
  // ehr-transport-seal-key joined this list when the EHR transport credential
  // gained a seal; the assertion pinned the previous list verbatim and so went
  // red on a deliberate addition rather than on a regression.
  assert.match(installer, /site-signing-private\.pem site-signing-public\.pem external-ai-seal-key ehr-transport-seal-key mfa-encryption-key/)
})
