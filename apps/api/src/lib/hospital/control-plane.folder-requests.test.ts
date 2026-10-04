import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  upsert: vi.fn(async (args: { update: Record<string, unknown> }) => ({ id: "local", ...args.update })),
  audit: vi.fn(),
}))
vi.mock("@/lib/prisma", () => {
  const tx = {
    hospitalInstallation: {
      findUnique: async () => ({ applianceOperator: { id: "op-1", role: "ADMIN", deletedAt: null, activatedAt: new Date() } }),
    },
    hospitalEhrTransportPolicy: { findUnique: mocks.policy, upsert: mocks.upsert },
  }
  return { prisma: { ...tx, $transaction: async (run: (db: typeof tx) => unknown) => run(tx) } }
})
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: mocks.audit }))

import { HospitalControlPlaneError, setEhrFolderRequests } from "./control-plane"

// Asking the hospital system over the watched folder (1.5.0): off by default,
// switched in Status, audited, and only where the transport is a folder.
describe("switching folder requests", () => {
  beforeEach(() => { mocks.policy.mockReset(); mocks.upsert.mockClear(); mocks.audit.mockClear() })

  it("switches them on for a folder site, and audits the change with its reason", async () => {
    mocks.policy.mockResolvedValue({ id: "local", transport: "FOLDER", folderRequestsEnabled: false })
    const policy = await setEhrFolderRequests({ enabled: true, reason: "Vendor answers request files" })
    expect(policy.folderRequestsEnabled).toBe(true)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ folderRequestsEnabled: true }) }))
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), "op-1", "HOSPITAL_EHR_TRANSPORT_POLICY_UPDATE", "local", {
      folderRequestsEnabled: true, previousFolderRequestsEnabled: false, reasonRecorded: true,
    })
  })

  it("refuses to switch them on anywhere but a watched folder", async () => {
    for (const transport of ["FHIR", null]) {
      mocks.policy.mockResolvedValue(transport ? { id: "local", transport } : null)
      await expect(setEhrFolderRequests({ enabled: true, reason: "Vendor answers request files" }))
        .rejects.toEqual(new HospitalControlPlaneError("EHR_FOLDER_REQUESTS_NOT_ACTIVE"))
    }
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("always lets them be switched off", async () => {
    mocks.policy.mockResolvedValue({ id: "local", transport: "FHIR", folderRequestsEnabled: true })
    expect((await setEhrFolderRequests({ enabled: false, reason: "Vendor stopped answering" })).folderRequestsEnabled).toBe(false)
  })

  it("needs a reason", async () => {
    await expect(setEhrFolderRequests({ enabled: true, reason: "short" })).rejects.toThrow()
  })
})
