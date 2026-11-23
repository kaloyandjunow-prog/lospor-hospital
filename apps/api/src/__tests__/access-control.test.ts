import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  canReadCase,
  canAccessCaseWithOwnerFallback,
  canWriteCase,
  caseCapabilitiesForUser,
  caseExportWhereForUser,
  caseOwnWhereForUser,
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
    await expect(canReadCase(user, { userId: "other", institutionId: null, user: { institutionId: null } })).resolves.toBe(false)
    await expect(canReadCase(user, { userId: "hod-1", institutionId: null, user: { institutionId: null } })).resolves.toBe(true)
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
    await expect(canReadCase(user, { userId: "other", institutionId: null, user: { institutionId: "inst-1" } })).resolves.toBe(false)
    await expect(canReadCase(user, { userId: "other", institutionId: null, user: { institutionId: "inst-2" } })).resolves.toBe(false)
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
      isNurse: false,
      isSeniorNurse: false,
      canAssignNurses: false,
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

describe("anaesthesia nurses and the senior nurse (2026-11-23)", () => {
  const record = { id: "c1", userId: "doctor", institutionId: "inst-1", operatingTheatreId: null, finalizedAt: null, plannedSurgeryDate: null }
  const nurse = { id: "n1", role: "ANAESTHESIA_NURSE", institutionId: "inst-1", nurseScope: { caseIds: [] as string[], theatreIds: [] as string[], shiftDate: "2026-11-23" } }
  const senior = { id: "s1", role: "ANAESTHESIA_SENIOR_NURSE", institutionId: "inst-1" }

  it("lets a nurse see every case of her hospital and change only the ones she is on", async () => {
    await expect(canReadCase(nurse, record, true)).resolves.toBe(true)
    await expect(canReadCase(nurse, { ...record, institutionId: "inst-2" }, true)).resolves.toBe(false)
    expect(canWriteCase(nurse, record)).toBe(false)
    expect(canWriteCase({ ...nurse, nurseScope: { ...nurse.nurseScope, caseIds: ["c1"] } }, record)).toBe(true)
  })
  it("lets a senior nurse change every case of her hospital and no other", () => {
    expect(canWriteCase(senior, record)).toBe(true)
    expect(canWriteCase(senior, { ...record, institutionId: "inst-2" })).toBe(false)
    expect(caseWriteWhereForUser(senior)).toEqual({ institutionId: "inst-1" })
    expect(caseWriteWhereForUser({ ...senior, institutionId: null })).toEqual({ id: { in: [] } })
  })
  it("reads the hospital's cases and the ones she is on from a nurse's query", async () => {
    expect(await caseReadWhereForUser(nurse, undefined, true)).toEqual({ OR: [{ institutionId: "inst-1" }, { id: { in: [] } }] })
  })
  it("says who may put nurses on a case", async () => {
    expect((await caseCapabilitiesForUser(senior, record, true)).canAssignNurses).toBe(true)
    expect((await caseCapabilitiesForUser(nurse, record, true)).canAssignNurses).toBe(false)
    expect((await caseCapabilitiesForUser({ id: "doctor", role: "MEMBER", institutionId: "inst-1" }, record, true)).canAssignNurses).toBe(true)
    expect((await caseCapabilitiesForUser({ id: "other", role: "MEMBER", institutionId: "inst-1" }, record, true)).canAssignNurses).toBe(false)
    expect((await caseCapabilitiesForUser({ id: "head", role: "HEAD_OF_DEPT", institutionId: "inst-1" }, record, true)).canAssignNurses).toBe(true)
  })
  it("offers a nurse only nurses as colleagues, and a doctor no nurses", () => {
    expect(colleagueWhereForUser(nurse)).toMatchObject({ role: { in: ["ANAESTHESIA_NURSE", "ANAESTHESIA_SENIOR_NURSE"] } })
    expect(colleagueWhereForUser({ id: "doctor", role: "MEMBER", institutionId: "inst-1" })).toMatchObject({ role: { notIn: ["ANAESTHESIA_NURSE", "ANAESTHESIA_SENIOR_NURSE"] } })
  })

  it("exports a nurse nothing on the appliance", () => {
    expect(caseExportWhereForUser(nurse)).toEqual({ id: { in: [] } })
    expect(caseExportWhereForUser({ id: "doctor", role: "MEMBER", institutionId: "inst-1" })).toEqual(caseOwnWhereForUser({ id: "doctor", role: "MEMBER", institutionId: "inst-1" }))
  })
})
