import "server-only"

import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export const APPLIANCE_OPERATOR_MANAGED_MESSAGE =
  "This appliance operator account is managed from the hospital server. Use the appliance-operator command to change or transfer it."

/**
 * True only for the administrator whose credential is also held by Status.
 *
 * Keep this check in one place: ordinary account routes must not change one
 * half of a synchronized credential, demote its owner, or remove the account.
 */
export async function isDesignatedApplianceOperator(userId: string): Promise<boolean> {
  if (!isHospitalDeployment()) return false
  const installation = await prisma.hospitalInstallation.findFirst({
    where: { applianceOperatorUserId: userId },
    select: { id: true },
  })
  return Boolean(installation)
}
