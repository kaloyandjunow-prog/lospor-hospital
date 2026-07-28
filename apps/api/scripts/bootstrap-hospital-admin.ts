import "dotenv/config"
import bcrypt from "bcryptjs"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  Prisma,
  PrismaClient,
} from "../src/generated/prisma/client"
import { normalizeEmail } from "../src/lib/auth-email-tokens"
import { passwordSchema } from "../src/lib/password-policy"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function main() {
  if (process.env.LOSPOR_DEPLOYMENT_MODE !== "hospital") {
    throw new Error("Bootstrap is available only in hospital deployment mode")
  }

  const databaseUrl = required("DATABASE_URL")
  const email = normalizeEmail(required("HOSPITAL_BOOTSTRAP_ADMIN_EMAIL"))
  const password = passwordSchema.parse(
    required("HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD"),
  )
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
      return existing ?? tx.institution.create({
        data: {
          name: institutionName,
          city: institutionCity,
          country: institutionCountry,
        },
      })
    })

    const existingAdmin = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existingAdmin) {
      console.log(`Hospital administrator already exists: ${email}`)
      return
    }

    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        role: "ADMIN",
        institutionId: institution.id,
        approvedAt: now,
        emailVerifiedAt: now,
      },
    })
    console.log(`Created Hospital administrator: ${email}`)
    console.log(`Institution ID: ${institution.id}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
