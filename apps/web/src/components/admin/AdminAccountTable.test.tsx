// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const capability = vi.hoisted(() => ({ enabled: true, reason: "ENABLED" }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (
    values ? `${key}:${JSON.stringify(values)}` : key
  ),
}))
vi.mock("@/lib/account-administration-capability", () => ({
  useAccountAdministrationCapability: () => capability,
}))

import { AdminAccountTable, type AdminAccount } from "./AdminAccountTable"

const active: AdminAccount = {
  id: "member/1",
  email: "member@example.test",
  name: "Dr Member One",
  firstName: "Member",
  lastName: "One",
  title: "Dr",
  role: "MEMBER",
  accountKind: "CLINICAL",
  status: "ACTIVE",
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  legalCurrent: true,
  lastLoginAt: "2026-08-21T09:00:00.000Z",
  createdAt: "2026-08-01T09:00:00.000Z",
  institution: { id: "institution-1", name: "Hospital", city: "Sofia" },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("AdminAccountTable", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capability.enabled = true
    capability.reason = "ENABLED"
  })

  it("fails closed to the pre-existing Member/HOD table when Hospital controls are disabled", () => {
    capability.enabled = false
    capability.reason = "DISABLED_BY_DEPLOYMENT"
    render(<AdminAccountTable accounts={[active]} loading={false} currentUserId="admin-1" onRefresh={vi.fn()} />)
    expect(screen.queryByText("admin.hospitalAccountControls")).toBeNull()
    expect(screen.queryByText("admin.status.ACTIVE")).toBeNull()
    expect(screen.queryByRole("button", { name: /admin.suspend/ })).toBeNull()
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual([
      "admin.roleMember",
      "admin.roleHOD",
    ])
  })

  it("shows lifecycle status and submits a reasoned suspension", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true }))
    render(<AdminAccountTable accounts={[active]} loading={false} currentUserId="admin-1" onRefresh={refresh} />)
    expect(screen.getByText("admin.status.ACTIVE")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /admin.suspend/ }))
    const dialog = screen.getByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "admin.confirmAccountAction" })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText("admin.reason"), { target: { value: "Leave of absence" } })
    fireEvent.click(confirm)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/member%2F1/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Leave of absence" }),
    }))
    expect(refresh).toHaveBeenCalled()
  })

  it("requires password re-entry and a reason for administrator promotion", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true }))
    render(<AdminAccountTable accounts={[active]} loading={false} currentUserId="admin-1" onRefresh={refresh} />)
    fireEvent.change(screen.getByRole("combobox", { name: /admin.changeRoleFor/ }), { target: { value: "ADMIN" } })
    const dialog = screen.getByRole("alertdialog")
    fireEvent.change(within(dialog).getByLabelText("admin.reason"), { target: { value: "On-call administrator" } })
    fireEvent.change(within(dialog).getByLabelText("admin.yourCurrentPassword"), { target: { value: "CurrentPassword!1" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "admin.confirmAccountAction" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/member%2F1/authority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "ADMIN",
        currentPassword: "CurrentPassword!1",
        reason: "On-call administrator",
      }),
    }))
  })

  it("states explicitly that HOD demotion retains the clinician's own cases", () => {
    render(<AdminAccountTable
      accounts={[{ ...active, role: "HEAD_OF_DEPT" }]}
      loading={false}
      currentUserId="admin-1"
      onRefresh={vi.fn()}
    />)
    fireEvent.change(screen.getByRole("combobox", { name: /admin.changeRoleFor/ }), { target: { value: "MEMBER" } })
    expect(screen.getByText(/admin.hodDemotionKeepsCases/)).toBeTruthy()
  })

  it("requires the exact email before deletion and never shows server prose", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "LAST_ADMIN raw detail" }, 409))
    render(<AdminAccountTable accounts={[active]} loading={false} currentUserId="admin-1" onRefresh={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /admin.delete/ }))
    const dialog = screen.getByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "admin.confirmAccountAction" })
    fireEvent.change(within(dialog).getByLabelText("admin.typeEmailToConfirm"), { target: { value: "wrong@example.test" } })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText("admin.typeEmailToConfirm"), { target: { value: active.email } })
    fireEvent.click(confirm)
    expect((await within(dialog).findByRole("alert")).textContent).toContain("admin.accountConflict")
    expect(screen.queryByText("LAST_ADMIN raw detail")).toBeNull()
  })
})
