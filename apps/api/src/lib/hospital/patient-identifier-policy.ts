import "server-only"

import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

type Database = PrismaClient | Prisma.TransactionClient
/**
 * Just the one table. `resolvePatientLink` runs inside a `Prisma.TransactionClient`
 * that is typed down to `patientLink` alone (see `patient-link.ts`); this lets the
 * enforcement check accept that same narrowed client instead of forcing every
 * caller to widen its type.
 */
type PolicyDatabase = Pick<PrismaClient | Prisma.TransactionClient, "hospitalPatientIdentifierPolicy">

export class PatientIdentifierPolicyError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "PatientIdentifierPolicyError"
  }
}

/**
 * ЕГН is enabled unless a deployment operator deliberately configured it off
 * before the first policy row ever existed. This mirrors
 * `configuredExternalAiDefault`, but the polarity of the fallback is opposite:
 * external AI defaults off absent explicit configuration, ЕГН defaults on,
 * because a hospital that does nothing should get the behavior that already
 * lets ИЗ № numbers rejoin across years, not a silently narrower one.
 */
export function configuredEgnPolicyDefault(): boolean {
  const value = process.env.HOSPITAL_EGN_POLICY_DEFAULT?.trim().toLowerCase()
  return value !== "false" && value !== "no" && value !== "0"
}

export function storedPatientIdentifierPolicy(db: Database = prisma) {
  return db.hospitalPatientIdentifierPolicy.findUnique({ where: { id: "local" } })
}

/** Whether creating an EGN link is currently permitted at this site. */
export async function patientIdentifierCapabilityState(
  db: PolicyDatabase = prisma,
): Promise<{ egnPermitted: boolean }> {
  const policy = await db.hospitalPatientIdentifierPolicy.findUnique({
    where: { id: "local" },
    select: { egnPermitted: true },
  })
  return { egnPermitted: policy?.egnPermitted ?? configuredEgnPolicyDefault() }
}

/**
 * Refuse loudly rather than let an EGN link quietly not happen.
 *
 * `resolvePatientLink` would otherwise proceed to create the link as if the
 * policy were on, which is indistinguishable from success to the caller --
 * exactly the silent-drop failure mode this policy exists to avoid.
 */
export async function assertEgnLinkingPermitted(db: PolicyDatabase): Promise<void> {
  const { egnPermitted } = await patientIdentifierCapabilityState(db)
  if (!egnPermitted) throw new PatientIdentifierPolicyError("EGN_DISABLED_BY_POLICY")
}

export async function patientIdentifierControlView(db: Database = prisma) {
  const policy = await storedPatientIdentifierPolicy(db)
  return {
    egnPermitted: policy?.egnPermitted ?? configuredEgnPolicyDefault(),
    // The actor identifier itself is deliberately not returned to Status,
    // matching how the transport lock and the external-AI credential owner
    // are withheld: the fact that a change happened, and why, is a safe fact;
    // who at the hospital made it is not this surface's business to publish.
    changeReasonRecorded: Boolean(policy?.changeReason),
    changedAt: policy?.changedAt?.toISOString() ?? null,
    updatedAt: policy?.updatedAt?.toISOString() ?? null,
  }
}
