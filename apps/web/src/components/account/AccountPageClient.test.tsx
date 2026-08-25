// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (
    values ? `${key}:${JSON.stringify(values)}` : key
  ),
}))

import { AccountPageClient } from "./AccountPageClient"

const profile = {
  id: "user-1",
  email: "clinician@example.test",
  name: "Dr Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  title: "Dr",
  role: "MEMBER",
  institution: { id: "hospital-1", name: "University Hospital", city: "Sofia" },
}

const sessions = {
  sessions: [
    {
      id: "current-session",
      clientType: "WEB",
      deviceLabel: "Chrome on Windows",
      issuedAt: "2026-08-20T08:00:00.000Z",
      lastSeenAt: "2026-08-22T08:00:00.000Z",
      expiresAt: "2026-08-23T08:00:00.000Z",
      current: true,
    },
    {
      id: "phone/session",
      clientType: "NATIVE",
      deviceLabel: "Clinician phone",
      issuedAt: "2026-08-20T08:00:00.000Z",
      lastSeenAt: "2026-08-21T08:00:00.000Z",
      expiresAt: "2026-08-23T08:00:00.000Z",
      current: false,
    },
  ],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("AccountPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input)
      if (url === "/api/user") return json(profile)
      if (url === "/api/user/sessions") return json(sessions)
      throw new Error(`unexpected request ${url}`)
    })
  })

  it("loads the governed profile and marks the current session", async () => {
    render(<AccountPageClient />)
    expect(await screen.findByDisplayValue("clinician@example.test")).toHaveProperty("readOnly", true)
    expect(screen.getByText("University Hospital — Sofia")).toBeTruthy()
    expect(screen.getByText("account.currentSession")).toBeTruthy()
    expect(screen.getByRole("button", { name: "account.revokeSession" })).toBeTruthy()
  })

  it("saves only the self-correctable identity fields", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/user" && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual({
          firstName: "Grace",
          lastName: "Hopper",
          title: "Prof",
        })
        return json({ firstName: "Grace", lastName: "Hopper", title: "Prof", name: "Prof Grace Hopper" })
      }
      if (url === "/api/user") return json(profile)
      if (url === "/api/user/sessions") return json(sessions)
      throw new Error(`unexpected request ${url}`)
    })

    render(<AccountPageClient />)
    fireEvent.change(await screen.findByLabelText("account.professionalTitle"), { target: { value: "Prof" } })
    fireEvent.change(screen.getByLabelText("account.firstName"), { target: { value: "Grace" } })
    fireEvent.change(screen.getByLabelText("account.lastName"), { target: { value: "Hopper" } })
    fireEvent.click(screen.getByRole("button", { name: /account.saveProfile/ }))

    expect(await screen.findByText("account.profileSaved")).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it("requires confirmation and URL-encodes a selectively revoked session", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/user/sessions/phone%2Fsession" && init?.method === "DELETE") return json({ ok: true })
      if (url === "/api/user") return json(profile)
      if (url === "/api/user/sessions") return json(sessions)
      throw new Error(`unexpected request ${url}`)
    })

    render(<AccountPageClient />)
    fireEvent.click(await screen.findByRole("button", { name: "account.revokeSession" }))
    const confirmation = screen.getByRole("alertdialog")
    expect(within(confirmation).getByText(/Clinician phone/)).toBeTruthy()
    fireEvent.click(within(confirmation).getByRole("button", { name: "account.confirmRevoke" }))

    await waitFor(() => expect(screen.queryByText("Clinician phone")).toBeNull())
  })

  it("rejects mismatched passwords locally and reauthenticates after a successful change", async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/user/change-password" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          currentPassword: "OldPassword!1",
          newPassword: "NewPassword!2",
        })
        return json({ ok: true, reauthenticationRequired: true })
      }
      if (url === "/api/user") return json(profile)
      if (url === "/api/user/sessions") return json(sessions)
      throw new Error(`unexpected request ${url}`)
    })

    render(<AccountPageClient />)
    await screen.findByDisplayValue("clinician@example.test")
    fireEvent.change(screen.getByLabelText("account.currentPassword"), { target: { value: "OldPassword!1" } })
    fireEvent.change(screen.getByLabelText("account.newPassword"), { target: { value: "NewPassword!2" } })
    fireEvent.change(screen.getByLabelText("account.confirmPassword"), { target: { value: "DifferentPassword!3" } })
    fireEvent.click(screen.getByRole("button", { name: /account.changePassword/ }))
    expect(await screen.findByText("account.passwordMismatch")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("account.confirmPassword"), { target: { value: "NewPassword!2" } })
    fireEvent.click(screen.getByRole("button", { name: /account.changePassword/ }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?passwordChanged=1"))
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it("does not expose server prose when loading fails", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(json({ error: "database detail" }, 500))
    render(<AccountPageClient />)
    expect((await screen.findByRole("alert")).textContent).toContain("account.loadFailed")
    expect(screen.queryByText("database detail")).toBeNull()
  })
})
