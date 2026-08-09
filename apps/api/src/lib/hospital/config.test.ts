import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  centralDeliveryConfig,
  hospitalConfig,
  isCentralDeliveryConfigured,
  resetHospitalConfigForTests,
} from "./config"

/**
 * A Hospital installation must run before Central exists.
 *
 * The client certificate that authenticates a site to Central is issued by
 * Central during enrollment, so treating it as required configuration made the
 * first installation impossible in principle. These tests pin the standalone
 * state as supported and, just as importantly, pin that a configured-but-absent
 * certificate is recognised as absent — the appliance mounts its whole secrets
 * directory, so the path is always set even when nothing is there.
 */

const BASE_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  LOSPOR_DEPLOYMENT_MODE: "hospital",
  HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE: "/run/secrets/site-signing-private.pem",
  HOSPITAL_SITE_SIGNING_PUBLIC_KEY_FILE: "/run/secrets/site-signing-public.pem",
  HOSPITAL_WORKER_TOKEN: "x".repeat(32),
}

let previous: NodeJS.ProcessEnv
let secrets: string

beforeEach(() => {
  previous = process.env
  secrets = mkdtempSync(join(tmpdir(), "lospor-config-"))
  process.env = { ...BASE_ENV }
  resetHospitalConfigForTests()
})

afterEach(() => {
  process.env = previous
  rmSync(secrets, { recursive: true, force: true })
  resetHospitalConfigForTests()
})

describe("hospital configuration without Central", () => {
  it("parses with no mTLS material at all", () => {
    const config = hospitalConfig()
    expect(config.LOSPOR_DEPLOYMENT_MODE).toBe("hospital")
    expect(config.HOSPITAL_MTLS_CERT_FILE).toBeUndefined()
    expect(isCentralDeliveryConfigured()).toBe(false)
  })

  it("still requires the locally generated signing identity", () => {
    delete process.env.HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE
    resetHospitalConfigForTests()
    expect(() => hospitalConfig()).toThrow()
  })

  it("treats a configured but missing certificate as not configured", () => {
    process.env.HOSPITAL_MTLS_CERT_FILE = join(secrets, "site-client-cert.pem")
    process.env.HOSPITAL_MTLS_KEY_FILE = join(secrets, "site-client-key.pem")
    resetHospitalConfigForTests()
    expect(isCentralDeliveryConfigured()).toBe(false)
  })

  it("refuses to hand out a delivery config, rather than connecting unauthenticated", () => {
    expect(() => centralDeliveryConfig()).toThrow(/not configured/i)
  })
})

describe("hospital configuration after enrollment", () => {
  beforeEach(() => {
    const cert = join(secrets, "site-client-cert.pem")
    const key = join(secrets, "site-client-key.pem")
    writeFileSync(cert, "certificate")
    writeFileSync(key, "private key")
    process.env.HOSPITAL_MTLS_CERT_FILE = cert
    process.env.HOSPITAL_MTLS_KEY_FILE = key
    resetHospitalConfigForTests()
  })

  it("recognises the credentials once both files are present", () => {
    expect(isCentralDeliveryConfigured()).toBe(true)
  })

  it("hands out a delivery config with both paths proven present", () => {
    const config = centralDeliveryConfig()
    expect(config.HOSPITAL_MTLS_CERT_FILE).toContain("site-client-cert.pem")
    expect(config.HOSPITAL_MTLS_KEY_FILE).toContain("site-client-key.pem")
  })

  it("is not configured if only one half of the pair survives", () => {
    rmSync(join(secrets, "site-client-key.pem"))
    expect(isCentralDeliveryConfigured()).toBe(false)
    expect(() => centralDeliveryConfig()).toThrow(/not configured/i)
  })
})
