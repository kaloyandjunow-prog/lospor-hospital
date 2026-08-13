import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { Prisma, PrismaClient } from "../src/generated/prisma/client"
import {
  applianceOperatorInputSchema,
  applyApplianceOperatorCredential,
} from "./lib/appliance-operator-db"
import { readJsonStdin } from "./lib/stdin-json"
import { emitStatusEvent } from "../src/lib/hospital/status-events"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name}_REQUIRED`)
  return value
}

async function main() {
  if (process.env.LOSPOR_DEPLOYMENT_MODE !== "hospital") {
    throw new Error("HOSPITAL_DEPLOYMENT_REQUIRED")
  }
  const input = applianceOperatorInputSchema.parse(await readJsonStdin())
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required("DATABASE_URL") }),
  } satisfies Prisma.PrismaClientOptions)
  try {
    const result = await applyApplianceOperatorCredential(prisma, input)
    if (!result.alreadyApplied) {
      await emitStatusEvent("APPLIANCE_OPERATOR_CHANGED", {
        operation: result.operation,
        credentialGeneration: result.credentialGeneration,
      })
    }
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
  } finally {
    await prisma.$disconnect()
  }
}

const SAFE_ERROR_CODES = new Set([
  "JSON_STDIN_REQUIRED",
  "STDIN_TOO_LARGE",
  "INVALID_JSON_STDIN",
  "HOSPITAL_DEPLOYMENT_REQUIRED",
  "DATABASE_URL_REQUIRED",
  "APPLIANCE_OPERATOR_MUST_BE_ACTIVE_ADMIN",
  "CREDENTIAL_GENERATION_ALREADY_USED",
  "CREDENTIAL_GENERATION_CANNOT_GO_BACKWARDS",
  "CREDENTIAL_GENERATION_MUST_INCREMENT_BY_ONE",
  "APPLIANCE_OPERATOR_ALREADY_INITIALIZED",
  "ROTATE_REQUIRES_CURRENT_APPLIANCE_OPERATOR",
  "TRANSFER_REQUIRES_DIFFERENT_ACTIVE_ADMIN",
  "RECONCILE_REQUIRES_NEWER_CREDENTIAL_GENERATION",
  "RECONCILE_REQUIRES_EXISTING_APPLIANCE_OPERATOR",
])

main().catch(error => {
  const message = error instanceof Error ? error.message : ""
  const code = SAFE_ERROR_CODES.has(message)
    ? message
    : "APPLIANCE_OPERATOR_COMMAND_FAILED"
  process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`)
  process.exitCode = 1
})
