import React from "react"
import { describe, expect, it, vi } from "vitest"
import { act, type ReactTestInstance } from "react-test-renderer"
import { getByText, queryByText, render } from "@/test/render"
import { AdministratorMfaStep } from "./AdministratorMfaStep"

const copy: Record<string, string> = {
  mfaSetupTitle: "Set up administrator verification",
  mfaSetupDescription: "Setup description",
  mfaTitle: "Administrator verification",
  mfaDescription: "Verification description",
  mfaManualKey: "Manual setup key",
  mfaOpenAuthenticator: "Open authenticator app",
  mfaAuthenticatorCode: "Authenticator code",
  mfaRecoveryCode: "Recovery code",
  mfaExpiresIn: "Challenge expires in",
  mfaChallengeExpired: "Challenge expired",
  mfaVerify: "Verify",
  mfaStartOver: "Start sign-in again",
  mfaCodeInvalid: "Invalid code",
  mfaInvalidOrExpired: "Invalid or expired",
  mfaChallengeEnded: "Challenge ended",
  mfaRateLimited: "Rate limited",
  mfaUnavailable: "Unavailable",
  mfaRecoveryCodesTitle: "Administrator recovery codes",
  mfaRecoveryCodesWarning: "Save all ten codes now",
  mfaCopyRecoveryCodes: "Copy recovery codes",
  mfaShareRecoveryCodes: "Share recovery codes",
  mfaRecoveryCodesSaved: "Codes saved",
  mfaRecoveryCodesAcknowledge: "I saved all ten codes",
  mfaSaveFailed: "Save failed",
  mfaContinue: "Continue to LOSPOR",
}

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ t: (key: string) => copy[key] ?? key }),
}))

const recoveryCodes = Array.from(
  { length: 10 },
  (_, index) => `${String.fromCharCode(65 + index)}A23-4567-A234-567A`,
)

function pressableFor(node: ReactTestInstance): ReactTestInstance {
  let current: ReactTestInstance | null = node
  while (current && typeof current.props.onPress !== "function") current = current.parent
  if (!current) throw new Error("No pressable ancestor")
  return current
}

describe("administrator MFA login step", () => {
  it("shows setup material without offering a recovery code before enrollment", () => {
    const tree = render(
      <AdministratorMfaStep
        challenge={{
          code: "MFA_ENROLLMENT_REQUIRED",
          challengeToken: "a".repeat(43),
          expiresIn: 300,
          expiresAt: Date.now() + 300_000,
          enrollmentRequired: true,
          manualKey: "A234567A234567A234567A234567A234",
        }}
        onComplete={vi.fn()}
        onAuthenticated={vi.fn()}
        onStartOver={vi.fn()}
      />,
    )

    expect(getByText(tree, "Set up administrator verification")).toBeTruthy()
    expect(getByText(tree, "A234567A234567A234567A234567A234").props.selectable).toBe(true)
    expect(queryByText(tree, "Recovery code")).toBeNull()
    tree.unmount()
  })

  it("requires explicit acknowledgement after showing all ten recovery codes", async () => {
    const complete = vi.fn(async () => ({ recoveryCodes }))
    const authenticated = vi.fn(async () => {})
    const tree = render(
      <AdministratorMfaStep
        challenge={{
          code: "MFA_ENROLLMENT_REQUIRED",
          challengeToken: "a".repeat(43),
          expiresIn: 300,
          expiresAt: Date.now() + 300_000,
          enrollmentRequired: true,
          manualKey: "A234567A234567A234567A234567A234",
        }}
        onComplete={complete}
        onAuthenticated={authenticated}
        onStartOver={vi.fn()}
      />,
    )

    const input = tree.root.find(node => typeof node.props.onChangeText === "function")
    await act(async () => input.props.onChangeText("123456"))
    const verifyText = getByText(tree, "Verify")
    const verifyButton = pressableFor(verifyText)
    await act(async () => {
      verifyButton.props.onPress()
      await Promise.resolve()
    })

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ enrollmentRequired: true }), "123456")
    expect(getByText(tree, "Administrator recovery codes")).toBeTruthy()
    expect(getByText(tree, recoveryCodes[0]).props.selectable).toBe(true)
    const continueButton = pressableFor(getByText(tree, "Continue to LOSPOR"))
    expect(continueButton.props.disabled).toBe(true)

    const acknowledgement = tree.root.find(node => node.props.accessibilityRole === "checkbox")
    await act(async () => acknowledgement.props.onPress())
    expect(pressableFor(getByText(tree, "Continue to LOSPOR")).props.disabled).toBe(false)
    expect(authenticated).not.toHaveBeenCalled()
    tree.unmount()
  })
})
