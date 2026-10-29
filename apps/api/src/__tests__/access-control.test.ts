import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  canReadCase,
  canAccessCaseWithOwnerFallback,
  canWriteCase,
  caseCapabilitiesForUser,
  caseReadWhereForUser,
  caseWriteWhereForUser,
  colleagueWhereForUser,
} from "@/lib/access-control"

describe("access control helpers", () => {
  beforeEach(() => vi.stubEnv("LOSPOR_DEPLOYMENT_MODE", ""))
  afterEach(() => vi.unstubAllEnvs())

  it("widens only hospital clinical reads when the persisted overlay is enabled", async () => {
    vi.stubEnv("LOSPOR_DEPLOYMENT_MODE", "hospital")
    const member = { id: "member-1", role: "MEMBER", accountKind: "CLINICAL", institutionId: "inst-1" }
    const colleague = { userId: "colleague", createdById: "colleague", institutionId: "inst-1" }
    const otherHospital = { userId: "other", createdById: "other", institutionId: "inst-2" }

    await expect(canReadCase(member, colleague, true)).resolves.toBe(true)
    await expect(canReadCase(member, otherHospital, true)).resolves.toBe(false)
    await expect(canReadCase({ ...member, accountKind: "RESEARCH_ONLY" }, colleague, true)).resolves.toBe(false)
    await expect(caseReadWhereForUser(member, undefined, true)).resolves.toEqual({
      OR: [{ userId: "member-1" }, { createdById: "member-1" }, { institutionId: "inst-1" }],
    })
    expect(canWriteCase(member, colleague)).toBe(false)
  })

  it("keeps the member read scope narrow when the hospital overlay is off", async () => {
    vi.stubEnv("LOSPOR_DEPLOYMENT_MODE", "hospital")
    const member = { id: "member-1", role: "MEMBER", accountKind: "CLINICAL", institutionId: "inst-1" }
    const colleague = { userId: "colleague", createdById: "colleague", institutionId: "inst-1" }

    await expect(canReadCase(member, colleague, false)).resolves.toBe(false)
    await expect(caseReadWhereForUser(member, undefined, false)).resolves.toEqual({
      OR: [{ userId: "member-1" }, { createdById: "member-1", institutionId: "inst-1" }],
    })
  })

  it("falls back to own cases for a head of department without an institution", async () => {
    const user = { id: "hod-1", role: "HEAD_OF_DEPT", institutionId: null }

    await expect(caseReadWhereForUser(user)).resolves.toEqual({ userId: "hod-1" })
    await expect(canReadCase(user, { userId: "other", user: { institutionId: null } })).resolves.toBe(false)
    await expect(canReadCase(user, { userId: "hod-1", user: { institutionId: null } })).resolves.toBe(true)
  })

  it("scopes head of department access to their institution, plus their own cases anywhere", async () => {
    const user = { id: "hod-1", role: "HEAD_OF_DEPT", institutionId: "inst-1" }

    // Scopes by the case's own institution snapshot, or by being the
    // assignee. It once scoped by the owner's current institution, which let
    // a case follow its author to another hospital; the fallback for
    // unstamped cases did the same thing more quietly, so both are gone.
    //
    // The assignee branch is not optional: canReadCase permits the assignee
    // unconditionally, before it ever looks at institution, so promoting a
    // clinician to HOD must not silently drop the cases assigned to them at
    // a different institution — that was the bug this OR fixes.
    await expect(caseReadWhereForUser(user)).resolves.toEqual({
      OR: [{ userId: "hod-1" }, { institutionId: "inst-1" }],
    })
    expect(caseWriteWhereForUser(user)).toEqual({
      OR: [{ userId: "hod-1" }, { institutionId: "inst-1" }],
    })
    await expect(canReadCase(user, { userId: "other", institutionId: "inst-1" })).resolves.toBe(true)
    await expect(canReadCase(user, { userId: "other", institutionId: "inst-2" })).resolves.toBe(false)
    // The owner's institution is not consulted, whichever it is.
    await expect(canReadCase(user, { userId: "other", user: { institutionId: "inst-1" } })).resolves.toBe(false)
    await expect(canReadCase(user, { userId: "other", user: { institutionId: "inst-2" } })).resolves.toBe(false)
    // canReadCase already said yes to this — the case reserving this
    // regression was that the list/detail scope disagreed with it.
    await expect(canReadCase(user, { userId: "hod-1", institutionId: "inst-2" })).resolves.toBe(true)
    expect(canWriteCase(user, { userId: "hod-1", institutionId: "inst-2" })).toBe(true)
  })

  it("no longer looks the owner up for an unstamped case", async () => {
    // The lookup answered "does this case belong to my department?" with
    // "where does its author work today?", so the same case changed hands
    // whenever its author moved.
    const findUnique = vi.fn().mockResolvedValue({ institutionId: "inst-1" })
    const db = { user: { findUnique } } as never
    const user = { id: "hod-1", role: "HEAD_OF_DEPT", institutionId: "inst-1" }

    await expect(canAccessCaseWithOwnerFallback(
      db,
      user,
      { userId: "other", institutionId: null },
    )).resolves.toBe(false)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("does not return colleagues for a head of department without an institution", () => {
    expect(colleagueWhereForUser({ id: "hod-1", role: "HEAD_OF_DEPT", institutionId: null })).toBeNull()
  })

  it("gives a same-institution creator read-only access after handover", async () => {
    const creator = { id: "creator", role: "MEMBER", institutionId: "inst-1" }
    const handedOver = {
      userId: "assignee",
      createdById: "creator",
      institutionId: "inst-1",
    }
    await expect(canReadCase(creator, handedOver)).resolves.toBe(true)
    expect(canWriteCase(creator, handedOver)).toBe(false)
    await expect(caseCapabilitiesForUser(creator, handedOver)).resolves.toEqual({
      canRead: true,
      canWrite: false,
      isCreator: true,
      isAssignee: false,
    })
    await expect(caseReadWhereForUser(creator)).resolves.toEqual({
      OR: [
        { userId: "creator" },
        { createdById: "creator", institutionId: "inst-1" },
      ],
    })
    expect(caseWriteWhereForUser(creator)).toEqual({ userId: "creator" })
  })

  it("drops creator visibility after the creator leaves the case institution", async () => {
    await expect(canReadCase(
      { id: "creator", role: "MEMBER", institutionId: "inst-2" },
      { userId: "assignee", createdById: "creator", institutionId: "inst-1" },
    )).resolves.toBe(false)
  })
})
