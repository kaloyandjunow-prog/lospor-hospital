// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AdministratorMfaChallenge } from "@/lib/administrator-mfa-client"
import { MfaLoginStep } from "./MfaLoginStep"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

const token = "a".repeat(43)
const manualKey = "A234567A234567A234567A234567A234"
const recoveryCodes = Array.from(
  { length: 10 },
  (_, index) => `${String.fromCharCode(65 + index)}A23-4567-A234-567A`,
)

function challenge(overrides: Partial<AdministratorMfaChallenge> = {}): AdministratorMfaChallenge {
  return {
    code: "MFA_REQUIRED",
    challengeToken: token,
    expiresIn: 300,
    expiresAt: Date.now() + 300_000,
    enrollmentRequired: false,
    ...overrides,
  }
}

describe("MfaLoginStep", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("guides first enrollment and withholds navigation until all recovery codes are acknowledged", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: { id: "admin" },
      recoveryCodes,
    }), { status: 200 }))
    const onAuthenticated = vi.fn().mockResolvedValue(undefined)
    const otpUri = `otpauth://totp/LOSPOR%3Aadmin%40example.test?secret=${manualKey}&issuer=LOSPOR`

    render(<MfaLoginStep
      challenge={challenge({
        code: "MFA_ENROLLMENT_REQUIRED",
        enrollmentRequired: true,
        manualKey,
        otpauthUri: otpUri,
      })}
      onAuthenticated={onAuthenticated}
      onStartOver={vi.fn()}
    />)

    expect(screen.getByRole("link", { name: "mfa.openAuthenticator" }).getAttribute("href")).toBe(otpUri)
    expect(screen.getByText(manualKey)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("mfa.authenticatorCode"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "mfa.verify" }))

    await waitFor(() => expect(screen.getByRole("heading", { name: "mfa.recoveryTitle" })).toBeTruthy())
    expect(screen.getAllByRole("listitem")).toHaveLength(10)
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/mfa/login", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ challengeToken: token, code: "123456" }),
    }))

    const createObjectUrl = vi.fn(() => "blob:recovery-codes")
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole("button", { name: "mfa.saveCodes" }))
    fireEvent.click(screen.getByRole("button", { name: "mfa.printCodes" }))
    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(anchorClick).toHaveBeenCalledOnce()
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:recovery-codes")
    expect(print).toHaveBeenCalledOnce()

    const continueButton = screen.getByRole("button", { name: "mfa.continue" })
    expect((continueButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText("mfa.recoveryAcknowledgement"))
    expect((continueButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(continueButton)
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({
      user: { id: "admin" },
      recoveryCodes,
    }))
  })

  it("accepts a recovery code for an already-enrolled administrator", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: { id: "admin" },
    }), { status: 200 }))
    const onAuthenticated = vi.fn().mockResolvedValue(undefined)

    render(<MfaLoginStep
      challenge={challenge()}
      onAuthenticated={onAuthenticated}
      onStartOver={vi.fn()}
    />)
    fireEvent.click(screen.getByRole("button", { name: "mfa.useRecoveryCode" }))
    fireEvent.change(screen.getByLabelText("mfa.recoveryCode"), {
      target: { value: "  ba23-4567-a234-567a  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "mfa.verify" }))

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith({ user: { id: "admin" } }))
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/mfa/login", expect.objectContaining({
      body: JSON.stringify({ challengeToken: token, code: "ba23-4567-a234-567a" }),
    }))
  })

  it("never exposes raw API errors and lets a mistyped code be retried", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "sensitive server detail",
    }), { status: 401 }))
    render(<MfaLoginStep
      challenge={challenge()}
      onAuthenticated={vi.fn()}
      onStartOver={vi.fn()}
    />)
    fireEvent.change(screen.getByLabelText("mfa.authenticatorCode"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "mfa.verify" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("mfa.invalidOrExpired"))
    expect(screen.queryByText("sensitive server detail")).toBeNull()
    expect((screen.getByRole("button", { name: "mfa.verify" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("retries post-verification navigation without replaying the consumed challenge", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: { id: "admin" },
    }), { status: 200 }))
    const onAuthenticated = vi.fn()
      .mockRejectedValueOnce(new Error("navigation unavailable"))
      .mockResolvedValueOnce(undefined)
    render(<MfaLoginStep
      challenge={challenge()}
      onAuthenticated={onAuthenticated}
      onStartOver={vi.fn()}
    />)
    fireEvent.change(screen.getByLabelText("mfa.authenticatorCode"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "mfa.verify" }))

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("mfa.continueFailed"))
    fireEvent.click(screen.getByRole("button", { name: "mfa.continue" }))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("expires locally and requires a new credentials request", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-22T12:00:00Z"))
    const onStartOver = vi.fn()
    render(<MfaLoginStep
      challenge={challenge({ expiresIn: 1, expiresAt: Date.now() + 1_000 })}
      onAuthenticated={vi.fn()}
      onStartOver={onStartOver}
    />)
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole("alert").textContent).toContain("mfa.expired")
    fireEvent.click(screen.getByRole("button", { name: "mfa.startOver" }))
    expect(onStartOver).toHaveBeenCalledOnce()
  })

  it("fails closed when first enrollment omits any of the ten one-time codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      user: { id: "admin" },
      recoveryCodes: recoveryCodes.slice(1),
    }), { status: 200 }))
    const onAuthenticated = vi.fn()
    render(<MfaLoginStep
      challenge={challenge({
        code: "MFA_ENROLLMENT_REQUIRED",
        enrollmentRequired: true,
        manualKey,
      })}
      onAuthenticated={onAuthenticated}
      onStartOver={vi.fn()}
    />)
    fireEvent.change(screen.getByLabelText("mfa.authenticatorCode"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "mfa.verify" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("mfa.recoveryCodesUnavailable"))
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "mfa.startOver" })).toBeTruthy()
  })
})
