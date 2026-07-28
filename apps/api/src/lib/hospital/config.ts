import { z } from "zod"

const schema = z.object({
  LOSPOR_DEPLOYMENT_MODE: z.literal("hospital"),
  HOSPITAL_EXPORT_DIR: z.string().min(1).default("/var/lib/lospor/central-exports"),
  HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE: z.string().min(1),
  HOSPITAL_SITE_SIGNING_PUBLIC_KEY_FILE: z.string().min(1),
  HOSPITAL_SITE_SIGNING_KEY_ID: z.string().min(1).default("hospital-ed25519-1"),
  HOSPITAL_MTLS_CERT_FILE: z.string().min(1),
  HOSPITAL_MTLS_KEY_FILE: z.string().min(1),
  HOSPITAL_MTLS_CA_FILE: z.string().min(1).optional(),
  HOSPITAL_CENTRAL_INSECURE_TEST: z.enum(["true", "false"]).default("false"),
  HOSPITAL_EXPORT_BATCH_CASE_LIMIT: z.coerce.number().int().min(1).max(5000).default(500),
  HOSPITAL_EXPORT_RETAIN_ACCEPTED_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  HOSPITAL_WORKER_TOKEN: z.string().min(24),
})

export type HospitalConfig = z.infer<typeof schema>

let cached: HospitalConfig | null = null

export function hospitalConfig(): HospitalConfig {
  cached ??= schema.parse(process.env)
  return cached
}

export function resetHospitalConfigForTests(): void {
  cached = null
}

