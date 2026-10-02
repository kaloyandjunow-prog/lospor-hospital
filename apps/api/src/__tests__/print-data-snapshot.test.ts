import { beforeEach, describe, expect, it, vi } from "vitest"
import { SignJWT } from "jose"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const {
  deliveryFindFirstMock,
  finalizationFindUniqueMock,
  institutionFindUniqueMock,
  liveCaseFindFirstMock,
} = vi.hoisted(() => ({
  deliveryFindFirstMock: vi.fn(),
  finalizationFindUniqueMock: vi.fn(),
  institutionFindUniqueMock: vi.fn(),
  liveCaseFindFirstMock: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ehrDelivery: { findFirst: deliveryFindFirstMock },
    caseFinalization: { findUnique: finalizationFindUniqueMock },
    institution: { findUnique: institutionFindUniqueMock },
    case: { findFirst: liveCaseFindFirstMock },
  },
}))
vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: vi.fn() }))
vi.mock("@/lib/token-blocklist", () => ({ isRevokedAsync: vi.fn().mockResolvedValue(false) }))

process.env.LOSPOR_AUTH_SECRET = "snapshot-route-test-secret"

import { GET } from "@/app/v1/cases/[id]/print-data/route"

async function adapterToken() {
  return new SignJWT({
    caseId: "case-1",
    userId: "ehr-adapter:d-1",
    deliveryId: "d-1",
    finalizationId: "fin-1",
    type: "print",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(process.env.LOSPOR_AUTH_SECRET))
}

describe("adapter print-data is bound to the finalized snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deliveryFindFirstMock.mockResolvedValue({ finalizationId: "fin-1" })
    finalizationFindUniqueMock.mockResolvedValue({
      snapshotDocument: JSON.stringify({
        id: "case-1",
        caseCode: "2026-0027",
        institutionId: "inst-1",
        preop: { diagnosis: "frozen diagnosis" },
        intraop: { bloodLossMl: 250 },
      }),
    })
    institutionFindUniqueMock.mockResolvedValue({ name: "Demo Hospital", city: "Sofia" })
    // If the route ever falls back to the live Case query, the test returns a
    // deliberately different record so that the regression cannot pass by
    // merely proving the endpoint is reachable.
    liveCaseFindFirstMock.mockResolvedValue({
      id: "case-1",
      preop: { diagnosis: "live diagnosis" },
      intraop: { bloodLossMl: 999 },
    })
  })

  it("returns the frozen clinical values and never reads the live case", async () => {
    const token = await adapterToken()
    const request = new NextRequest(
      `http://localhost/api/cases/case-1/print-data?print_token=${encodeURIComponent(token)}`,
    )
    const response = await GET(request as never, { params: Promise.resolve({ id: "case-1" }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      caseCode: "2026-0027",
      preop: { diagnosis: "frozen diagnosis" },
      intraop: { bloodLossMl: 250 },
      institution: { name: "Demo Hospital" },
      capabilities: { canWrite: false },
    })
    expect(liveCaseFindFirstMock).not.toHaveBeenCalled()
  })
})
