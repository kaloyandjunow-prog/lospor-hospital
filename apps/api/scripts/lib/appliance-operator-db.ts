import bcrypt from "bcryptjs"
import { z } from "zod"
import { normalizeEmail } from "@lospor/core/account"
import type { PrismaClient } from "../../src/generated/prisma/client"
import type { AuditActionCode } from "../../src/lib/audit-actions"
import { logAuditInTransaction } from "../../src/lib/audit-evidence"
import { HOSPITAL_STATUS_OPERATOR_AUDIT_ID } from "../../src/lib/hospital/audit-principals"
import { passwordSchema } from "../../src/lib/password-policy"

export const applianceOperatorInputSchema = z.object({
  operation: z.enum(["initialize", "rotate", "transfer", "reconcile"]),
  email: z.string().email(),
  password: passwordSchema,
  credentialGeneration: z.number().int().min(1),
}).strict()

export type ApplianceOperatorInput = z.infer<typeof applianceOperatorInputSchema>

export type ApplianceOperatorResult = {
  operation: ApplianceOperatorInput["operation"]
  credentialGeneration: number
  alreadyApplied: boolean
}

const OPERATOR_AUDIT_ACTION = {
  initialize: "HOSPITAL_APPLIANCE_OPERATOR_INITIALIZE",
  rotate: "HOSPITAL_APPLIANCE_OPERATOR_ROTATE",
  transfer: "HOSPITAL_APPLIANCE_OPERATOR_TRANSFER",
  reconcile: "HOSPITAL_APPLIANCE_OPERATOR_RECONCILE",
} as const satisfies Record<ApplianceOperatorInput["operation"], AuditActionCode>

/**
 * Apply the clinical half of a host-coordinated credential change.
 *
 * The monotonic generation is the commit marker shared with Status. Replaying
 * exactly the same generation/password is a safe no-op, which lets the host
 * finish an interrupted two-service rotation without guessing which side won.
 */
export async function applyApplianceOperatorCredential(
  prisma: PrismaClient,
  rawInput: ApplianceOperatorInput,
  setup: { institutionId?: string; targetUserId?: string } = {},
): Promise<ApplianceOperatorResult> {
  const input = { ...rawInput, email: normalizeEmail(rawInput.email) }
  const passwordHash = await bcrypt.hash(input.password, 12)

  return prisma.$transaction(async tx => {
    const target = await tx.user.findUnique({
      where: setup.targetUserId
        ? { id: setup.targetUserId }
        : { email: input.email },
      select: {
        id: true,
        role: true,
        deletedAt: true,
        passwordHash: true,
      },
    })
    if (!target || target.deletedAt || target.role !== "ADMIN") {
      throw new Error("APPLIANCE_OPERATOR_MUST_BE_ACTIVE_ADMIN")
    }

    const installation = await tx.hospitalInstallation.findUnique({
      where: { id: "local" },
      select: {
        institutionId: true,
        applianceOperatorUserId: true,
        operatorCredentialGeneration: true,
      },
    })
    const currentOperator = installation?.applianceOperatorUserId ?? null
    const currentGeneration = installation?.operatorCredentialGeneration ?? 0

    if (input.credentialGeneration === currentGeneration) {
      const isExactReplay = currentOperator === target.id
        && await bcrypt.compare(input.password, target.passwordHash)
      if (!isExactReplay) throw new Error("CREDENTIAL_GENERATION_ALREADY_USED")
      if (setup.institutionId && installation?.institutionId !== setup.institutionId) {
        await tx.hospitalInstallation.update({
          where: { id: "local" },
          data: { institutionId: setup.institutionId },
        })
        await logAuditInTransaction(
          tx,
          HOSPITAL_STATUS_OPERATOR_AUDIT_ID,
          "HOSPITAL_INSTALLATION_INSTITUTION_UPDATE",
          "local",
          { institutionId: setup.institutionId },
        )
      }
      return {
        operation: input.operation,
        credentialGeneration: currentGeneration,
        alreadyApplied: true,
      }
    }
    if (input.credentialGeneration < currentGeneration) {
      throw new Error("CREDENTIAL_GENERATION_CANNOT_GO_BACKWARDS")
    }
    if (
      input.operation !== "reconcile"
      && input.credentialGeneration !== currentGeneration + 1
    ) {
      throw new Error("CREDENTIAL_GENERATION_MUST_INCREMENT_BY_ONE")
    }
    if (
      input.operation === "reconcile"
      && input.credentialGeneration <= currentGeneration
    ) {
      throw new Error("RECONCILE_REQUIRES_NEWER_CREDENTIAL_GENERATION")
    }

    if (input.operation === "initialize" && currentOperator !== null) {
      throw new Error("APPLIANCE_OPERATOR_ALREADY_INITIALIZED")
    }
    if (input.operation === "rotate" && currentOperator !== target.id) {
      throw new Error("ROTATE_REQUIRES_CURRENT_APPLIANCE_OPERATOR")
    }
    if (input.operation === "transfer" && (!currentOperator || currentOperator === target.id)) {
      throw new Error("TRANSFER_REQUIRES_DIFFERENT_ACTIVE_ADMIN")
    }
    if (input.operation === "reconcile" && !currentOperator) {
      throw new Error("RECONCILE_REQUIRES_EXISTING_APPLIANCE_OPERATOR")
    }

    const changedAt = new Date()
    await tx.user.update({
      where: { id: target.id },
      data: { passwordHash, passwordChangedAt: changedAt },
    })
    await tx.passwordResetToken.updateMany({
      where: { userId: target.id, usedAt: null },
      data: { usedAt: changedAt },
    })
    await tx.hospitalInstallation.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        ...(setup.institutionId ? { institutionId: setup.institutionId } : {}),
        applianceOperatorUserId: target.id,
        operatorCredentialGeneration: input.credentialGeneration,
      },
      update: {
        ...(setup.institutionId ? { institutionId: setup.institutionId } : {}),
        applianceOperatorUserId: target.id,
        operatorCredentialGeneration: input.credentialGeneration,
      },
    })
    await logAuditInTransaction(
      tx,
      HOSPITAL_STATUS_OPERATOR_AUDIT_ID,
      OPERATOR_AUDIT_ACTION[input.operation],
      target.id,
      { credentialGeneration: input.credentialGeneration },
    )

    return {
      operation: input.operation,
      credentialGeneration: input.credentialGeneration,
      alreadyApplied: false,
    }
  })
}
