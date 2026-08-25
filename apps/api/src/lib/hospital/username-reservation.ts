export class UsernameReservationError extends Error {
  readonly code = "USERNAME_ALREADY_REGISTERED"

  constructor() {
    super("USERNAME_ALREADY_REGISTERED")
    this.name = "UsernameReservationError"
  }
}

type UsernameReservationTransaction = {
  hospitalUsernameReservation: {
    findFirst(args: unknown): Promise<{ id: string; userId?: string } | null>
    create(args: unknown): Promise<unknown>
  }
}

/**
 * Claim a new spelling during administrator rename, or retain an earlier name
 * already reserved by this same account. Old names are deliberately not
 * released until final anonymization.
 */
export async function claimOrRetainHospitalUsername(
  tx: UsernameReservationTransaction,
  userId: string,
  usernameCanonical: string,
  now = new Date(),
): Promise<void> {
  const active = await tx.hospitalUsernameReservation.findFirst({
    where: { usernameCanonical, releasedAt: null },
    select: { id: true, userId: true },
  })
  if (active?.userId === userId) return
  if (active) throw new UsernameReservationError()
  try {
    await tx.hospitalUsernameReservation.create({
      data: { userId, usernameCanonical, createdAt: now },
    })
  } catch (error) {
    translateReservationError(error)
  }
}

function translateReservationError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    throw new UsernameReservationError()
  }
  throw error
}

/**
 * Atomically reserve one canonical username. The partial unique database index
 * resolves concurrent claims; released history rows are never overwritten.
 */
export async function claimHospitalUsername(
  tx: UsernameReservationTransaction,
  userId: string,
  usernameCanonical: string,
  now = new Date(),
): Promise<void> {
  const active = await tx.hospitalUsernameReservation.findFirst({
    where: { usernameCanonical, releasedAt: null },
    select: { id: true },
  })
  if (active) throw new UsernameReservationError()
  try {
    await tx.hospitalUsernameReservation.create({
      data: { userId, usernameCanonical, createdAt: now },
    })
  } catch (error) {
    translateReservationError(error)
  }
}
