import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const unit = readFileSync(new URL("../infra/systemd/lospor-update-agent.service", import.meta.url), "utf8")
const installer = readFileSync(new URL("./install-update-agent.sh", import.meta.url), "utf8")
const envWriter = readFileSync(new URL("./write-update-agent-env.sh", import.meta.url), "utf8")
const doctor = readFileSync(new URL("./doctor.sh", import.meta.url), "utf8")

test("unit uses only the canonical appliance path and Unit-level crash limits", () => {
  assert.doesNotMatch(unit, /\/opt\/lospor\/current/)
  assert.match(unit, /ExecStart=\/bin\/sh \/opt\/lospor-hospital\/current\/scripts\/update-agent-loop\.sh/)
  const [unitSection, serviceSection] = unit.split("[Service]")
  assert.match(unitSection, /StartLimitIntervalSec=300/)
  assert.doesNotMatch(serviceSection, /StartLimitIntervalSec/)
  assert.match(serviceSection, /EnvironmentFile=-\/etc\/lospor-hospital\/update-agent\.env/)
  assert.match(serviceSection, /ProtectSystem=strict/)
})

test("installer verifies, enables, starts, and waits for a fresh heartbeat", () => {
  for (const pattern of [/systemd-analyze verify/, /systemctl enable --now/, /systemctl is-active --quiet/, /update-agent\.v2\.json/]) {
    assert.match(installer, pattern)
  }
  assert.match(installer, /update_durable_replace "\$marker_tmp" "\$marker"/)
})

test("environment writer allowlists update settings and never sources application env", () => {
  assert.doesNotMatch(envWriter, /\.\s+["']?\$source_env|source\s+/)
  assert.match(envWriter, /HOSPITAL_UPDATE_TIMEZONE/)
  assert.match(envWriter, /HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES/)
  assert.match(envWriter, /"\$poll" -le 3600/)
  assert.match(envWriter, /"\$interval" -ge 300/)
  assert.match(envWriter, /update_durable_replace "\$temporary" "\$destination"/)
  assert.doesNotMatch(envWriter, /POSTGRES_PASSWORD|STATUS_RATE_LIMIT_KEY|CENTRAL_CLIENT_KEY/)
})

test("doctor distinguishes an explicit console-only site from a broken installed agent", () => {
  assert.match(doctor, /update-agent-installation\.v1\.json/)
  assert.match(doctor, /failed strict validation/)
  assert.match(doctor, /systemctl is-enabled --quiet lospor-update-agent\.service/)
  assert.match(doctor, /systemctl is-active --quiet lospor-update-agent\.service/)
  assert.match(doctor, /update-agent\.v2\.json" -mmin -10/)
  assert.match(doctor, /Update mode is intentionally console-only/)
})
