import "dotenv/config"
import bcrypt from "bcryptjs"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  Prisma,
  PrismaClient,
} from "../src/generated/prisma/client"
// Straight from core, not via src/lib/auth-email-tokens.
//
// That module only re-exports this function, but it also imports "server-only",
// which throws the moment it is loaded outside Next — and this script runs under
// tsx. Reaching normalizeEmail through it made the first administrator
// impossible to create:
//
//   Error: This module cannot be imported from a Client Component module.
//
// Nothing here needs a server context: normalizeEmail is a pure string
// function that core owns.
import { normalizeEmail } from "@lospor/core/account"
import { passwordSchema } from "../src/lib/password-policy"
import {
  applianceOperatorInputSchema,
  applyApplianceOperatorCredential,
} from "./lib/appliance-operator-db"
import { readJsonStdin } from "./lib/stdin-json"
import { emitStatusEvent } from "../src/lib/hospital/status-events"
import { logAuditInTransaction } from "../src/lib/audit-evidence"
import { HOSPITAL_STATUS_OPERATOR_AUDIT_ID } from "../src/lib/hospital/audit-principals"
import {
  setExternalAiPolicy,
  setGuidancePolicy,
} from "../src/lib/hospital/control-plane"
import { validateAndNormalizeUsername } from "../src/lib/username-identity"
import { claimHospitalUsername } from "../src/lib/hospital/username-reservation"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function guidanceDefault(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value !== "false" && value !== "no" && value !== "0"
}

async function main() {
  if (process.env.LOSPOR_DEPLOYMENT_MODE !== "hospital") {
    throw new Error("Bootstrap is available only in hospital deployment mode")
  }

  const databaseUrl = required("DATABASE_URL")
  // The credential arrives only through stdin. Environment variables and argv
  // are visible through container/process inspection and must never carry it.
  const credential = applianceOperatorInputSchema
    .omit({ operation: true })
    .strict()
    .parse(await readJsonStdin())
  const email = normalizeEmail(credential.email)
  const contactEmailRaw = process.env.HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL
  const contactEmail = contactEmailRaw?.trim()
    ? normalizeEmail(contactEmailRaw)
    : null
  const password = passwordSchema.parse(credential.password)
  const usernameInput = required("HOSPITAL_BOOTSTRAP_ADMIN_USERNAME")
  const usernameResult = validateAndNormalizeUsername(usernameInput)
  if (!usernameResult.success) throw new Error(usernameResult.code)
  const { username, usernameCanonical } = usernameResult.value
  const firstName = required("HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME")
  const lastName = required("HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME")
  const institutionName = required("HOSPITAL_INSTITUTION_NAME")
  const institutionCity = required("HOSPITAL_INSTITUTION_CITY")
  const institutionCountry =
    process.env.HOSPITAL_INSTITUTION_COUNTRY?.trim() || "Bulgaria"

  const adapter = new PrismaPg({ connectionString: databaseUrl })
  const prisma = new PrismaClient({
    adapter,
  } satisfies Prisma.PrismaClientOptions)

  try {
    const now = new Date()
    const institution = await prisma.$transaction(async tx => {
      const existing = await tx.institution.findFirst({
        where: {
          name: institutionName,
          city: institutionCity,
          country: institutionCountry,
        },
      })
      if (existing) return existing
      const created = await tx.institution.create({
        data: {
          name: institutionName,
          city: institutionCity,
          country: institutionCountry,
        },
      })
      await logAuditInTransaction(
        tx,
        HOSPITAL_STATUS_OPERATOR_AUDIT_ID,
        "HOSPITAL_INSTALLATION_INSTITUTION_CREATE",
        created.id,
      )
      return created
    })

    const existingAdmin = await prisma.user.findUnique({
      where: { usernameCanonical },
      select: { id: true, usernameCanonical: true },
    })
    if (existingAdmin && existingAdmin.usernameCanonical !== usernameCanonical) {
      throw new Error("HOSPITAL_BOOTSTRAP_ADMIN_USERNAME does not match the existing administrator")
    }
    let administratorCreated = false
    let administratorId = existingAdmin?.id ?? null
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(password, 12)
      administratorId = await prisma.$transaction(async tx => {
        const created = await tx.user.create({
          data: {
            email: contactEmail,
            username,
            usernameCanonical,
            passwordHash,
            firstName,
            lastName,
            name: `${firstName} ${lastName}`,
            role: "ADMIN",
            institutionId: institution.id,
            approvedAt: now,
            activatedAt: now,
            emailVerifiedAt: null,
            passwordChangedAt: now,
          },
        })
        await claimHospitalUsername(tx, created.id, usernameCanonical, now)
        await logAuditInTransaction(
          tx,
          HOSPITAL_STATUS_OPERATOR_AUDIT_ID,
          "HOSPITAL_APPLIANCE_ADMIN_CREATED",
          created.id,
          { role: created.role, institutionId: created.institutionId },
        )
        return created.id
      })
      administratorCreated = true
    }
    if (!administratorId) throw new Error("HOSPITAL_BOOTSTRAP_ADMIN_NOT_CREATED")

    const operator = await applyApplianceOperatorCredential(prisma, {
      operation: "initialize",
      email,
      password,
      credentialGeneration: credential.credentialGeneration,
    }, { institutionId: institution.id, targetUserId: administratorId })
    // Create once from the guided-install choices. Repeated bootstrap runs
    // deliberately leave the stored runtime policies untouched.
    if (!await prisma.clinicalGuidancePolicy.findUnique({ where: { id: "local" } })) {
      await setGuidancePolicy({
        adultEnabled: guidanceDefault("HOSPITAL_ADULT_GUIDANCE_DEFAULT"),
        pediatricEnabled: guidanceDefault("HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT"),
        reason: "Guided installation",
      })
    }
    if (!await prisma.hospitalExternalAiPolicy.findUnique({ where: { id: "local" } })) {
      await setExternalAiPolicy({
        externalAiEnabled: guidanceDefault("HOSPITAL_EXTERNAL_AI_DEFAULT"),
        reason: "Guided installation",
      })
    }
    if (!operator.alreadyApplied) {
      await emitStatusEvent("APPLIANCE_OPERATOR_CHANGED", {
        operation: "initialize",
        credentialGeneration: operator.credentialGeneration,
      })
    }
    // Deliberately omit email, name and database identifiers from install logs.
    console.log(JSON.stringify({
      ok: true,
      administratorCreated,
      operatorCredentialGeneration: operator.credentialGeneration,
      alreadyApplied: operator.alreadyApplied,
    }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(() => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: "HOSPITAL_BOOTSTRAP_FAILED" })}\n`)
  process.exitCode = 1
})
