// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  state: {
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

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/components/auth/AuthFrame", () => ({
  AuthFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/lib/authentication-capability", () => ({
  useAuthenticationCapability: () => mocks.state,
}))

import { AuthenticationSelfServiceBoundary } from "./AuthenticationSelfServiceBoundary"

describe("AuthenticationSelfServiceBoundary", () => {
  beforeEach(() => {
    mocks.state.loading = false
    mocks.state.capability = {
      loginIdentifier: "EMAIL",
      selfRegistration: true,
      passwordRecovery: "EMAIL",
    }
  })

  it.each(["registration", "passwordRecovery"] as const)(
    "renders the public %s page when enabled",
    service => {
      render(
        <AuthenticationSelfServiceBoundary service={service}>
          <input aria-label="public form" />
        </AuthenticationSelfServiceBoundary>,
      )
      expect(screen.getByLabelText("public form")).toBeTruthy()
    },
  )

  it("does not mount a public form before the capability is known", () => {
    mocks.state.loading = true
    render(
      <AuthenticationSelfServiceBoundary service="registration">
        <input aria-label="public form" />
      </AuthenticationSelfServiceBoundary>,
    )
    expect(screen.queryByLabelText("public form")).toBeNull()
    expect(screen.getByText("auth.authenticationSettingsLoading")).toBeTruthy()
  })

  it("does not mount a fallback form when the policy is unavailable", () => {
    mocks.state.capability = null
    render(
      <AuthenticationSelfServiceBoundary service="registration">
        <input aria-label="public form" />
      </AuthenticationSelfServiceBoundary>,
    )
    expect(screen.queryByLabelText("public form")).toBeNull()
    expect(screen.getByRole("heading", { name: "auth.authenticationSettingsUnavailableTitle" })).toBeTruthy()
    expect(screen.getByText("auth.authenticationSettingsUnavailable")).toBeTruthy()
  })

  it("blocks a direct Hospital registration route", () => {
    mocks.state.capability = {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    render(
      <AuthenticationSelfServiceBoundary service="registration">
        <input aria-label="public form" />
      </AuthenticationSelfServiceBoundary>,
    )
    expect(screen.queryByLabelText("public form")).toBeNull()
    expect(screen.getByText("auth.registrationAdministratorOnly")).toBeTruthy()
    expect(screen.getByRole("link", { name: "auth.backToSignIn" })).toBeTruthy()
  })

  it("blocks a direct Hospital email-recovery route", () => {
    mocks.state.capability = {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    render(
      <AuthenticationSelfServiceBoundary service="passwordRecovery">
        <input aria-label="public form" />
      </AuthenticationSelfServiceBoundary>,
    )
    expect(screen.queryByLabelText("public form")).toBeNull()
    expect(screen.getByText("auth.passwordRecoveryAdministratorOnly")).toBeTruthy()
  })
})
