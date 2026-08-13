import "dotenv/config"
import { createHash } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { Prisma, PrismaClient } from "../src/generated/prisma/client"
import { normalizeEmail } from "@lospor/core/account"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name}_REQUIRED`)
  return value
}

async function main() {
  if (process.env.LOSPOR_DEPLOYMENT_MODE !== "hospital") {
    throw new Error("HOSPITAL_DEPLOYMENT_REQUIRED")
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required("DATABASE_URL") }),
  } satisfies Prisma.PrismaClientOptions)
  try {
    const installation = await prisma.hospitalInstallation.findUnique({
      where: { id: "local" },
      select: {
        applianceOperatorUserId: true,
        operatorCredentialGeneration: true,
        applianceOperator: { select: { email: true } },
      },
    })
    const operatorEmailHash = installation?.applianceOperator?.email
      ? createHash("sha256")
          .update(normalizeEmail(installation.applianceOperator.email), "utf8")
          .digest("hex")
      : null
    process.stdout.write(`${JSON.stringify({
      initialized: Boolean(installation?.applianceOperatorUserId),
      credentialGeneration: installation?.operatorCredentialGeneration ?? 0,
      operatorEmailHash,
    })}\n`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(() => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: "APPLIANCE_OPERATOR_STATE_FAILED" })}\n`)
  process.exitCode = 1
})
