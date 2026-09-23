// Seeds a single approved test user for Playwright E2E into whatever DATABASE_URL
// points at. GUARD: refuses to run against the production Supabase project so an
// E2E account can never be created in prod. Idempotent (upsert by email).
//
// Usage: npx tsx scripts/seed-e2e-user.ts   (uses .env DATABASE_URL = dev DB)
import "dotenv/config"
import bcrypt from "bcryptjs"
import {
  E2E_EMAIL, E2E_USERNAME, E2E_PASSWORD, E2E_RESEARCH_EMAIL, E2E_RESEARCH_USERNAME,
  E2E_HOD_A_EMAIL, E2E_HOD_A_USERNAME,
  E2E_MEMBER_A_EMAIL, E2E_MEMBER_A_USERNAME,
  E2E_HOD_B_EMAIL, E2E_HOD_B_USERNAME,
  E2E_MEMBER_B_EMAIL, E2E_MEMBER_B_USERNAME,
  E2E_MEMBER_A2_EMAIL, E2E_MEMBER_A2_USERNAME,
  E2E_INSTITUTION_B,
} from "../e2e/credentials"
// Every account belongs to an institution; a researcher with no department
// belongs to "Без институция" rather than to NULL.
import { NO_INSTITUTION_ID } from "../src/lib/institutions"
import { canonicalizeUsername } from "../src/lib/username-identity"
import { ensureInitialPreopProfile } from "../src/lib/preop/service"

const PROD_PROJECT_REF = "yzqszvlvccyufrkbuhtv" // never seed E2E data here

// The client is created inside main() so the production guard runs before any
// database connection is opened.
async function openPrisma(connectionString: string) {
  const { PrismaClient } = await import("../src/generated/prisma/client")
  const { PrismaPg } = await import("@prisma/adapter-pg")
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  } as ConstructorParameters<typeof PrismaClient>[0])
}

async function reserveE2eUsername(
  prisma: Awaited<ReturnType<typeof openPrisma>>,
  userId: string,
  username: string,
): Promise<void> {
  const usernameCanonical = canonicalizeUsername(username)
  await prisma.hospitalUsernameReservation.upsert({
    where: { id: `e2e-${usernameCanonical}` },
    update: { userId, usernameCanonical, releasedAt: null },
    create: { id: `e2e-${usernameCanonical}`, userId, usernameCanonical },
  })
}

async function main() {
  const url = process.env.DATABASE_URL ?? ""
  if (url.includes(PROD_PROJECT_REF)) {
    throw new Error("Refusing to seed E2E user: DATABASE_URL points at the production project.")
  }
  const prisma = await openPrisma(url)
  try {
    // E2E uses the exact release-owned adult-v2 and pediatric-v2 baselines.
    // This is intentionally separate from the test account and never attributes
    // release content to that login-capable administrator.
    const { provisionBundledClinicalBaselines } = await import(
      "../src/lib/clinical-rules/bundled-baseline-provisioner"
    )
    await provisionBundledClinicalBaselines(prisma)
    await ensureInitialPreopProfile(prisma, "e2e-seed")

    const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10)
    const now = new Date()
    const email = E2E_EMAIL.trim().toLowerCase()
    const usernameCanonical = canonicalizeUsername(E2E_USERNAME)
    // A real institution so created cases satisfy Case.institutionId's FK.
    const inst = await prisma.institution.upsert({
      where: { id: "e2e-institution" },
      update: {},
      create: { id: "e2e-institution", name: "E2E Test Hospital", city: "Sofia" },
    })
    // The production appliance receives its licensed ICD-10 vocabulary as a
    // separate institutional import. This disposable database deliberately
    // starts from migrations alone, so provide one synthetic search fixture to
    // let the golden journey use the real diagnosis picker rather than bypass
    // the UI or depend on a licensed data package.
    await prisma.icd10Code.upsert({
      where: { code: "K35" },
      update: { labelEn: "Acute appendicitis", labelBg: "Остър апендицит" },
      create: { code: "K35", labelEn: "Acute appendicitis", labelBg: "Остър апендицит" },
    })
    const user = await prisma.user.upsert({
      where: { email },
      update: { username: E2E_USERNAME, usernameCanonical, passwordHash, activatedAt: now, emailVerifiedAt: now, acceptedTermsAt: now, acceptedPrivacyAt: now, role: "ADMIN", accountKind: "CLINICAL", institutionId: inst.id, preferences: { ui: { locale: "en" } } },
      create: {
        email, username: E2E_USERNAME, usernameCanonical,
        name: "E2E Tester", firstName: "E2E", lastName: "Tester", title: "Dr",
        passwordHash, role: "ADMIN", accountKind: "CLINICAL", activatedAt: now, emailVerifiedAt: now, acceptedTermsAt: now, acceptedPrivacyAt: now, termsVersion: "e2e",
        institutionId: inst.id, preferences: { ui: { locale: "en" } },
      },
    })
    await reserveE2eUsername(prisma, user.id, E2E_USERNAME)
    console.log(`E2E user ready: ${user.email} (id ${user.id}, institution ${inst.id})`)

    // The administrator's clinical ADMIN role does not, by itself, carry
    // research data access -- Hospital mode requires a Status-issued grant
    // for inspectCases/export even for the appliance operator, the same
    // separation of clinical admin and research governance enforced
    // elsewhere. Specs that exercise the research browser as this account
    // need that grant to already exist.
    await prisma.researchAccessGrant.deleteMany({ where: { userId: user.id } })
    await prisma.researchAccessGrant.create({ data: {
      userId: user.id,
      grantedById: user.id,
      allInstitutions: true,
      canQuery: true,
      canInspectCases: true,
      // canExport is the legacy coarse bit; the DB requires it equal
      // (canExportCsv OR canExportJson) for Status-issued grants.
      canExport: true,
      canExportCsv: true,
      canExportJson: true,
      canExportOmop: true,
      canShare: true,
      expiresAt: new Date(now.getTime() + 90 * 86_400_000),
    } })

    // Status-owned research grants must be attributed to the designated
    // appliance operator. The disposable E2E installation therefore records
    // the seeded administrator as that operator; no production credential or
    // Status authentication state is created here.
    await prisma.hospitalInstallation.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        institutionId: inst.id,
        applianceOperatorUserId: user.id,
        operatorCredentialGeneration: 1,
      },
      update: {
        institutionId: inst.id,
        applianceOperatorUserId: user.id,
        operatorCredentialGeneration: 1,
      },
    })

    const researchEmail = E2E_RESEARCH_EMAIL.trim().toLowerCase()
    const researchUsernameCanonical = canonicalizeUsername(E2E_RESEARCH_USERNAME)
    const researcher = await prisma.user.upsert({
      where: { email: researchEmail },
      update: {
        username: E2E_RESEARCH_USERNAME, usernameCanonical: researchUsernameCanonical,
        passwordHash, activatedAt: now, emailVerifiedAt: now, acceptedTermsAt: now,
        acceptedPrivacyAt: now, role: "RESEARCHER", accountKind: "RESEARCH_ONLY", institutionId: NO_INSTITUTION_ID,
        preferences: { ui: { locale: "en" } },
      },
      create: {
        email: researchEmail, username: E2E_RESEARCH_USERNAME,
        usernameCanonical: researchUsernameCanonical,
        name: "E2E Aggregate Researcher", firstName: "Aggregate",
        lastName: "Researcher", title: "Dr", passwordHash, role: "RESEARCHER", accountKind: "RESEARCH_ONLY",
        activatedAt: now, emailVerifiedAt: now, acceptedTermsAt: now,
        acceptedPrivacyAt: now, termsVersion: "e2e",
        // Omitting this left the column NULL, which the invariant no longer
        // allows: every account belongs to an institution.
        institutionId: NO_INSTITUTION_ID, preferences: { ui: { locale: "en" } },
      },
    })
    await reserveE2eUsername(prisma, researcher.id, E2E_RESEARCH_USERNAME)
    await prisma.researchAccessGrant.deleteMany({ where: { userId: researcher.id } })
    await prisma.researchAccessGrant.create({ data: {
      userId: researcher.id,
      institutionId: inst.id,
      grantedById: user.id,
      canInspectCases: false,
      canExport: false,
      canExportOmop: false,
      expiresAt: new Date(now.getTime() + 90 * 86_400_000),
    } })
    console.log(`E2E aggregate researcher ready: ${researcher.email} (id ${researcher.id})`)

    // The cast. Institution, visibility and approval rules need more than one
    // person and more than one institution before they mean anything: a head of
    // department must have somebody to be head *of*, and "the other hospital's
    // head cannot see this" needs an other hospital.
    const instB = await prisma.institution.upsert({
      where: { id: E2E_INSTITUTION_B },
      update: {},
      create: { id: E2E_INSTITUTION_B, name: "E2E Second Hospital", city: "Plovdiv" },
    })

    const cast = [
      { email: E2E_HOD_A_EMAIL,    username: E2E_HOD_A_USERNAME,    role: "HEAD_OF_DEPT", institutionId: inst.id,  first: "Hod",    last: "Alpha" },
      { email: E2E_MEMBER_A_EMAIL, username: E2E_MEMBER_A_USERNAME, role: "MEMBER",       institutionId: inst.id,  first: "Member", last: "Alpha" },
      { email: E2E_MEMBER_A2_EMAIL, username: E2E_MEMBER_A2_USERNAME, role: "MEMBER",     institutionId: inst.id,  first: "Member", last: "Alpha Two" },
      { email: E2E_HOD_B_EMAIL,    username: E2E_HOD_B_USERNAME,    role: "HEAD_OF_DEPT", institutionId: instB.id, first: "Hod",    last: "Beta"  },
      { email: E2E_MEMBER_B_EMAIL, username: E2E_MEMBER_B_USERNAME, role: "MEMBER",       institutionId: instB.id, first: "Member", last: "Beta"  },
    ] as const

    const castIds: string[] = []
    for (const person of cast) {
      const email = person.email.trim().toLowerCase()
      const usernameCanonical = canonicalizeUsername(person.username)
      const seeded = await prisma.user.upsert({
        where: { email },
        // Reset role and institution on every run: a spec that moves somebody
        // between institutions must not leave the next run starting elsewhere.
        update: {
          username: person.username, usernameCanonical,
          passwordHash, role: person.role, accountKind: "CLINICAL", institutionId: person.institutionId,
          activatedAt: now, emailVerifiedAt: now, acceptedTermsAt: now, acceptedPrivacyAt: now,
          preferences: { ui: { locale: "en" } },
        },
        create: {
          email, username: person.username, usernameCanonical,
          name: `${person.first} ${person.last}`,
          firstName: person.first, lastName: person.last, title: "Dr",
          passwordHash, role: person.role, accountKind: "CLINICAL", institutionId: person.institutionId,
          activatedAt: now, emailVerifiedAt: now, acceptedTermsAt: now,
          acceptedPrivacyAt: now, termsVersion: "e2e",
          preferences: { ui: { locale: "en" } },
        },
      })
      await reserveE2eUsername(prisma, seeded.id, person.username)
      // Likewise for anything a previous run left half-decided.
      await prisma.institutionChangeRequest.deleteMany({ where: { userId: seeded.id } })
      castIds.push(seeded.id)
      console.log(`E2E ${person.role} ready: ${seeded.email} (${person.institutionId})`)
    }

    // Most specs delete what they create, but one cannot: a finalised case is
    // undeletable by design, which is the point of finalising. Clearing the
    // cast's cases here rather than leaving them to accumulate is safe because
    // these four accounts exist only for Playwright — nobody records real work
    // as hod-a-e2e. The administrator and researcher are deliberately left
    // alone; those are also used for hand smoke-testing.
    if (castIds.length) {
      const { count } = await prisma.case.deleteMany({ where: { userId: { in: castIds } } })
      if (count) console.log(`E2E cases cleared: ${count}`)
      await prisma.researchAccessGrant.deleteMany({ where: { userId: { in: castIds } } })
    }

    // Same reason, different table: there is no delete-ruleset action, so the
    // scope-guard spec creates a departmental copy per run under an "e2e_" key
    // and leaves it. Anything with that prefix is a test artefact. Scoped to
    // DRAFT status only, so a published e2e-prefixed platform ruleset (there is
    // none today, but nothing rules it out) is never swept up by accident.
    const rulesets = await prisma.clinicalPreset.deleteMany({
      where: { key: { startsWith: "e2e_" }, status: "DRAFT" },
    })
    if (rulesets.count) console.log(`E2E rulesets cleared: ${rulesets.count}`)

    // Sign-in is rate limited two ways — 10 attempts per email and 50 per
    // client address in 15 minutes — and every suite run signs each of these
    // accounts in. Iterating on a spec therefore used to end in a locked-out
    // login page that looked like a broken login rather than the limiter doing
    // its job. The per-address counter was the tighter one in practice, because
    // it is shared across every account and both suites.
    //
    // Clearing the per-email counters is safe: they are keyed by these
    // addresses, which belong to nobody. Clearing the per-address counters is
    // safe here and only here — this script refuses to run against production,
    // so the only traffic these buckets ever held is the suite's own.
    const limitKeys = [
      email, researchEmail,
      ...cast.map(person => person.email.trim().toLowerCase()),
    ].map(address => `login:${address}`)
    const limits = await prisma.rateLimit.deleteMany({
      where: {
        OR: [
          { key: { in: limitKeys } },
          { key: { startsWith: "login-ip:" } },
          // The spec that proves the limiter works deliberately exhausts a
          // throwaway address on every run. Those buckets are litter.
          { key: { startsWith: "login:rate-limit-" } },
        ],
      },
    })
    if (limits.count) console.log(`E2E login rate limits cleared: ${limits.count}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
