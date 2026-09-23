import "dotenv/config"
import { PrismaClient, Prisma } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { ensureInitialPreopProfile } from "../src/lib/preop/service"

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL is required")

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter } satisfies Prisma.PrismaClientOptions)

try {
  await ensureInitialPreopProfile(prisma, "seed")
  console.log("Bundled preoperative catalog/profile: provisioned")
} finally {
  await prisma.$disconnect()
}
