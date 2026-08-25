import { describe, expect, it, vi } from "vitest"
import {
  claimHospitalUsername,
  UsernameReservationError,
} from "./username-reservation"

describe("Hospital username reservation", () => {
  it("refuses an active historical claim before writing", async () => {
    const tx = {
      hospitalUsernameReservation: {
        findFirst: vi.fn(async () => ({ id: "reservation-1" })),
        create: vi.fn(),
      },
    }
    await expect(claimHospitalUsername(tx, "user-2", "clinician.one"))
      .rejects.toBeInstanceOf(UsernameReservationError)
    expect(tx.hospitalUsernameReservation.create).not.toHaveBeenCalled()
  })

  it("maps a concurrent partial-unique-index loss to the same stable conflict", async () => {
    const tx = {
      hospitalUsernameReservation: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw Object.assign(new Error("unique"), { code: "P2002" })
        }),
      },
    }
    await expect(claimHospitalUsername(tx, "user-2", "clinician.one"))
      .rejects.toMatchObject({ code: "USERNAME_ALREADY_REGISTERED" })
  })

  it("creates a new history row without rewriting a released predecessor", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z")
    const tx = {
      hospitalUsernameReservation: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "reservation-2" })),
      },
    }
    await claimHospitalUsername(tx, "user-2", "clinician.one", now)
    expect(tx.hospitalUsernameReservation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        usernameCanonical: "clinician.one",
        createdAt: now,
      },
    })
  })
})
