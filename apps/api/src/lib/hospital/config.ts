import { existsSync } from "node:fs"
import { z } from "zod"

/**
 * Configuration for a Hospital installation.
 *
 * The mTLS fields are deliberately optional. A hospital's client certificate is
 * issued by Central when the site enrols, so requiring it here would mean no
 * installation could start before a Central existed to enrol with — which is
 * precisely backwards for a product whose first deployments run standalone and
 * gain a research link later.
 *
 * Everything else stays required. The Ed25519 signing keypair is generated
 * locally by `scripts/generate-hospital-identity.mjs` and never depends on
 * Central, and the worker token comes from `scripts/generate-secrets.sh`.
 */
const schema = z.object({
  LOSPOR_DEPLOYMENT_MODE: z.literal("hospital"),
  HOSPITAL_EXPORT_DIR: z.string().min(1).default("/var/lib/lospor/central-exports"),
  /// Where the folder-drop transport writes outbound messages and reads what
  /// the hospital system leaves for it. Two directories under one mount so a
  /// hospital watcher and this appliance never write to the same place.
  HOSPITAL_EHR_DIR: z.string().min(1).default("/var/lib/lospor/ehr-exchange"),
  HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE: z.string().min(1),
  HOSPITAL_SITE_SIGNING_PUBLIC_KEY_FILE: z.string().min(1),
  HOSPITAL_SITE_SIGNING_KEY_ID: z.string().min(1).default("hospital-ed25519-1"),
  HOSPITAL_MTLS_CERT_FILE: z.string().min(1).optional(),
  HOSPITAL_MTLS_KEY_FILE: z.string().min(1).optional(),
  HOSPITAL_MTLS_CA_FILE: z.string().min(1).optional(),
  HOSPITAL_CENTRAL_INSECURE_TEST: z.enum(["true", "false"]).default("false"),
  HOSPITAL_EXPORT_BATCH_CASE_LIMIT: z.coerce.number().int().min(1).max(5000).default(500),
  HOSPITAL_EXPORT_RETAIN_ACCEPTED_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  HOSPITAL_WORKER_TOKEN: z.string().min(24),
})

export type HospitalConfig = z.infer<typeof schema>

/** Config with the Central client credentials proven present. */
export type CentralDeliveryConfig = HospitalConfig & {
  HOSPITAL_MTLS_CERT_FILE: string
  HOSPITAL_MTLS_KEY_FILE: string
}

let cached: HospitalConfig | null = null

export function hospitalConfig(): HospitalConfig {
  cached ??= schema.parse(process.env)
  return cached
}

/**
 * Whether this installation holds the client credentials needed to talk to
 * Central. False on a standalone installation, which is a supported state and
 * not an error: cases are collected locally and exported once the site enrols.
 *
 * The files are checked, not just the variables. The appliance mounts its whole
 * secrets directory into the container, so a configured path whose file is
 * absent is the normal shape of "not enrolled yet" rather than a misconfigured
 * deployment.
 *
 * This answers "can this installation talk to Central", not "is it enrolled".
 * Enrollment is recorded in HospitalInstallation.centralEnabled and is the only
 * thing that authorises an export.
 */
export function isCentralDeliveryConfigured(): boolean {
  const config = hospitalConfig()
  return Boolean(
    config.HOSPITAL_MTLS_CERT_FILE && existsSync(config.HOSPITAL_MTLS_CERT_FILE)
    && config.HOSPITAL_MTLS_KEY_FILE && existsSync(config.HOSPITAL_MTLS_KEY_FILE),
  )
}

/**
 * Config for the transmission path. Throws rather than returning a partial
 * config, so a caller cannot accidentally attempt an unauthenticated connection
 * to Central.
 */
export function centralDeliveryConfig(): CentralDeliveryConfig {
  const config = hospitalConfig()
  if (!isCentralDeliveryConfigured()) {
    throw new Error(
      "Central delivery is not configured: this installation has no usable client "
      + "certificate. Have Central sign secrets/site-client.csr, place the "
      + "certificate and CA in secrets/, then enrol.",
    )
  }
  return config as CentralDeliveryConfig
}

export function resetHospitalConfigForTests(): void {
  cached = null
}

