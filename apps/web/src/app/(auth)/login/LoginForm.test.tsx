// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  completeLoginLocale: vi.fn(),
  loadAccountLocale: vi.fn(),
  persistAccountLocale: vi.fn(),
  authenticationState: {
    capability: {
      loginIdentifier: "EMAIL" as "EMAIL" | "USERNAME",
      selfRegistration: true,
      passwordRecovery: "EMAIL" as "EMAIL" | "ADMINISTRATOR",
    } as {
      loginIdentifier: "EMAIL" | "USERNAME"
      selfRegistration: boolean
      passwordRecovery: "EMAIL" | "ADMINISTRATOR"
    } | null,
    loading: false,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, warning: mocks.toastWarning },
}))
vi.mock("@/components/auth/AuthFrame", () => ({
  AuthFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/app/actions/locale", () => ({ completeLoginLocale: mocks.completeLoginLocale }))
vi.mock("@/lib/account-locale", () => ({
  loadAccountLocale: mocks.loadAccountLocale,
  persistAccountLocale: mocks.persistAccountLocale,
}))
vi.mock("@/lib/authentication-capability", () => ({
  useAuthenticationCapability: () => mocks.authenticationState,
}))

import { LoginForm } from "./LoginForm"

function completeForm() {
  fireEvent.change(screen.getByLabelText("auth.email"), { target: { value: "member@example.test" } })
  fireEvent.change(screen.getByLabelText("auth.password"), { target: { value: "Password!1" } })
  fireEvent.click(screen.getByRole("button", { name: "auth.signIn" }))
}

function completeUsernameForm(username = "Ivan.Petrov_2") {
  fireEvent.change(screen.getByLabelText("auth.username"), { target: { value: username } })
  fireEvent.change(screen.getByLabelText("auth.password"), { target: { value: "Password!1" } })
  fireEvent.click(screen.getByRole("button", { name: "auth.signIn" }))
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mocks.loadAccountLocale.mockResolvedValue("en")
    mocks.completeLoginLocale.mockResolvedValue({ locale: "en", persistExplicitChoice: false })
    mocks.persistAccountLocale.mockResolvedValue(true)
    mocks.authenticationState.loading = false
    mocks.authenticationState.capability = {
      loginIdentifier: "EMAIL",
      selfRegistration: true,
      passwordRecovery: "EMAIL",
    }
  })

  it("keeps public login, registration, recovery, and the email session payload unchanged", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: "INVALID_CREDENTIALS",
    }), { status: 401 }))
    render(<LoginForm callbackUrl="/dashboard" />)

    expect(screen.getByLabelText("auth.email").getAttribute("type")).toBe("email")
    expect(screen.getByRole("link", { name: "auth.forgotPassword" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "auth.register" })).toBeTruthy()
    completeForm()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        body: JSON.stringify({ email: "member@example.test", password: "Password!1" }),
      }),
    ))
  })

  it("waits for the deployment authentication capability before mounting a form", () => {
    mocks.authenticationState.loading = true
    render(<LoginForm callbackUrl="/dashboard" />)
    expect(screen.queryByLabelText("auth.email")).toBeNull()
    expect(screen.queryByLabelText("auth.username")).toBeNull()
    expect(screen.getByText("auth.authenticationSettingsLoading")).toBeTruthy()
  })

  it("does not accept an email fallback when authentication policy is unavailable", () => {
    mocks.authenticationState.capability = null
    render(<LoginForm callbackUrl="/dashboard" />)
    expect(screen.queryByLabelText("auth.email")).toBeNull()
    expect(screen.queryByLabelText("auth.username")).toBeNull()
    expect(screen.getByRole("alert").textContent)
      .toContain("auth.authenticationSettingsUnavailable")
  })

  it("renders the complete Hospital username policy and no public self-service links", () => {
    mocks.authenticationState.capability = {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    render(<LoginForm callbackUrl="/dashboard" registrationNotice="check-email" />)

    expect(screen.getByLabelText("auth.username").getAttribute("type")).toBe("text")
    expect(screen.queryByLabelText("auth.email")).toBeNull()
    expect(screen.getByText("auth.usernameRequirements")).toBeTruthy()
    expect(screen.getByText("auth.usernameCasePolicy")).toBeTruthy()
    expect(screen.getByText("auth.usernameDisplayNamePolicy")).toBeTruthy()
    expect(screen.getByText("auth.passwordRecoveryAdministratorOnly")).toBeTruthy()
    expect(screen.getByText("auth.registrationAdministratorOnly")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "auth.forgotPassword" })).toBeNull()
    expect(screen.queryByRole("link", { name: "auth.register" })).toBeNull()
    expect(screen.queryByText("auth.registrationVerifyEmail")).toBeNull()
  })

  it("preserves username case and sends no email fallback in Hospital mode", async () => {
    mocks.authenticationState.capability = {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: "INVALID_CREDENTIALS",
    }), { status: 401 }))
    render(<LoginForm callbackUrl="/dashboard" />)
    completeUsernameForm("Ivan.Petrov_2")

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        body: JSON.stringify({ username: "Ivan.Petrov_2", password: "Password!1" }),
      }),
    ))
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).not.toHaveProperty("email")
    expect(mocks.toastError).toHaveBeenCalledWith("auth.invalidUsernameCredentials")
  })

  it.each([
    "Ab",
    "1ivan",
    "Иван",
    "ivan petrov",
    "ivan@hospital.bg",
    "ivan/petrov",
    "ivan\\petrov",
  ])("rejects a forbidden Hospital username before any request: %j", async username => {
    mocks.authenticationState.capability = {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    const fetchMock = vi.spyOn(globalThis, "fetch")
    render(<LoginForm callbackUrl="/dashboard" />)
    completeUsernameForm(username)

    expect(await screen.findByText("auth.usernameInvalid")).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("renders the clinical-app boundary as localized copy", () => {
    render(<LoginForm callbackUrl="/dashboard" initialErrorCode="CLINICAL_APP_FORBIDDEN" />)
    expect(screen.getByRole("alert").textContent).toContain("auth.clinicalAppForbidden")
  })

  it("confirms a completed self-service password change", () => {
    render(<LoginForm callbackUrl="/dashboard" passwordChanged />)
    expect(screen.getByRole("status").textContent).toContain("auth.passwordChangedSignInAgain")
  })

  it("maps a research-only login rejection without exposing API prose", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: "CLINICAL_APP_FORBIDDEN",
      error: "raw server prose",
    }), { status: 403 }))
    render(<LoginForm callbackUrl="/dashboard" />)
    completeForm()
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("auth.clinicalAppForbidden"))
    expect(screen.queryByText("raw server prose")).toBeNull()
  })

  it("syncs locale and navigates only to the pre-sanitized callback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: { preferences: { ui: { locale: "en" } } },
    }), { status: 200 }))
    mocks.completeLoginLocale.mockResolvedValue({ locale: "bg", persistExplicitChoice: true })
    render(<LoginForm callbackUrl="/cases/new?step=2" />)
    completeForm()
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/cases/new?step=2"))
    expect(mocks.loadAccountLocale).toHaveBeenCalled()
    expect(mocks.persistAccountLocale).toHaveBeenCalledWith("bg")
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it("continues a 202 administrator challenge before syncing locale or navigating", async () => {
    const token = "a".repeat(43)
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "MFA_REQUIRED",
        mfa: {
          challengeToken: token,
          expiresIn: 300,
          enrollmentRequired: false,
        },
      }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: "admin", preferences: { ui: { locale: "bg" } } },
      }), { status: 200 }))

    render(<LoginForm callbackUrl="/admin" />)
    completeForm()
    await waitFor(() => expect(screen.getByLabelText("mfa.authenticatorCode")).toBeTruthy())
    expect(mocks.loadAccountLocale).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("auth.password")).toBeNull()

    fireEvent.change(screen.getByLabelText("mfa.authenticatorCode"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "mfa.verify" }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"))
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/mfa/login", expect.objectContaining({
      body: JSON.stringify({ challengeToken: token, code: "123456" }),
    }))
    expect(mocks.loadAccountLocale).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ id: "admin" }),
    }))
  })

  it("fails closed when a 202 response does not match the MFA contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: "MFA_REQUIRED",
      mfa: { challengeToken: "short", expiresIn: 300, enrollmentRequired: false },
      error: "raw server prose",
    }), { status: 202 }))
    render(<LoginForm callbackUrl="/dashboard" />)
    completeForm()
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("mfa.unavailable"))
    expect(screen.queryByText("raw server prose")).toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
