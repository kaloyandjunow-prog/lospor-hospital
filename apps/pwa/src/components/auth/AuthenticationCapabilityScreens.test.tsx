import React from "react"
import { Platform } from "react-native"
import { act, type ReactTestInstance } from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getByText, queryByText, render } from "@/test/render"
import { STRINGS } from "@/i18n/strings"
import LoginScreen from "../../../app/(auth)/login"
import ForgotPasswordScreen from "../../../app/(auth)/forgot-password"
import RegisterScreen from "../../../app/(auth)/register"

const state = vi.hoisted(() => ({
  language: "en" as "bg" | "en",
  authentication: {
    status: "EXPLICIT",
    loginIdentifier: "EMAIL",
    selfRegistration: true,
    passwordRecovery: "EMAIL",
  } as {
    status: "EXPLICIT" | "LEGACY_PUBLIC" | "INVALID_CONTRACT"
    loginIdentifier: "EMAIL" | "USERNAME" | null
    selfRegistration: boolean
    passwordRecovery: "EMAIL" | "ADMINISTRATOR" | "UNAVAILABLE"
  },
  login: vi.fn(async (..._args: unknown[]) => ({ kind: "authenticated" as const })),
  completeLocaleSync: vi.fn(async () => {}),
  requestPasswordReset: vi.fn(async () => ({ ok: true })),
  notify: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: state.push, replace: state.replace }),
}))

vi.mock("@/components/AuthBrand", () => ({
  AuthBackdrop: () => null,
  AuthBrand: () => null,
}))

vi.mock("@/components/auth/AdministratorMfaStep", () => ({
  AdministratorMfaStep: () => null,
}))

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    login: state.login,
    completeAdministratorMfa: vi.fn(),
    finishAdministratorMfaLogin: vi.fn(),
  }),
}))

vi.mock("@/lib/deployment-capabilities", () => ({
  useAuthenticationCapabilities: () => state.authentication,
}))

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    completeLoginLocaleSync: state.completeLocaleSync,
    language: state.language,
    selectLoginLanguage: vi.fn(async (language: "bg" | "en") => {
      state.language = language
    }),
    t: (key: keyof typeof STRINGS.en) => STRINGS[state.language][key],
  }),
}))

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    code?: string
  },
  registerAccount: vi.fn(),
  requestPasswordReset: state.requestPasswordReset,
}))

vi.mock("@/lib/notify", () => ({ notify: state.notify }))

vi.mock("@/lib/legal-documents", () => ({
  useRegistrationLegalDocuments: () => ({
    acceptances: null,
    failed: false,
    loading: true,
  }),
}))

function inputByLabel(tree: ReturnType<typeof render>, label: string): ReactTestInstance {
  return tree.root.find(node => (node.type as unknown) === "TextInput"
    && node.props.accessibilityLabel === label)
}

function pressableByText(tree: ReturnType<typeof render>, text: string): ReactTestInstance {
  let node: ReactTestInstance | null = getByText(tree, text)
  while (node && typeof node.props.onPress !== "function") node = node.parent
  if (!node) throw new Error(`No pressable found for ${text}`)
  return node
}

async function enterCredentials(
  tree: ReturnType<typeof render>,
  identifierLabel: string,
  identifier: string,
) {
  await act(async () => {
    inputByLabel(tree, identifierLabel).props.onChangeText(identifier)
    inputByLabel(tree, STRINGS[state.language].password).props.onChangeText("Strong1!")
  })
}

describe("authentication capability screens", () => {
  beforeEach(() => {
    ;(Platform as { OS: string }).OS = "ios"
    state.language = "en"
    state.authentication = {
      status: "EXPLICIT",
      loginIdentifier: "EMAIL",
      selfRegistration: true,
      passwordRecovery: "EMAIL",
    }
    vi.clearAllMocks()
  })

  it("keeps public native login, registration, and email recovery isolated", async () => {
    const tree = render(<LoginScreen />)
    expect(inputByLabel(tree, STRINGS.en.email)).toBeTruthy()
    expect(queryByText(tree, STRINGS.en.usernameRules)).toBeNull()
    expect(getByText(tree, STRINGS.en.forgotPassword)).toBeTruthy()
    expect(getByText(tree, STRINGS.en.register)).toBeTruthy()

    await enterCredentials(tree, STRINGS.en.email, " Doctor@Example.COM ")
    await act(async () => {
      pressableByText(tree, STRINGS.en.signIn).props.onPress()
      await Promise.resolve()
    })
    expect(state.login).toHaveBeenCalledWith(
      { loginIdentifier: "EMAIL", value: " Doctor@Example.COM " },
      "Strong1!",
      "en",
    )

    act(() => pressableByText(tree, STRINGS.en.forgotPassword).props.onPress())
    act(() => pressableByText(tree, STRINGS.en.register).props.onPress())
    expect(state.push).toHaveBeenNthCalledWith(1, "/(auth)/forgot-password")
    expect(state.push).toHaveBeenNthCalledWith(2, "/(auth)/register")
    tree.unmount()
  })

  it.each(["ios", "web"])("uses username only on %s", async platform => {
    ;(Platform as { OS: string }).OS = platform
    state.authentication = {
      status: "EXPLICIT",
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    const tree = render(<LoginScreen />)

    expect(inputByLabel(tree, STRINGS.en.username).props.accessibilityHint)
      .toBe(STRINGS.en.usernameRules)
    expect(getByText(tree, STRINGS.en.usernameRules)).toBeTruthy()
    expect(queryByText(tree, STRINGS.en.register)).toBeNull()
    expect(queryByText(tree, STRINGS.en.forgotPassword)).toBeNull()
    expect(getByText(tree, STRINGS.en.accountAccessHelp)).toBeTruthy()

    await enterCredentials(tree, STRINGS.en.username, "Ivan.Petrov")
    await act(async () => {
      pressableByText(tree, STRINGS.en.signIn).props.onPress()
      await Promise.resolve()
    })
    expect(state.login).toHaveBeenCalledWith(
      { loginIdentifier: "USERNAME", value: "Ivan.Petrov" },
      "Strong1!",
      "en",
    )
    expect(state.login.mock.calls[0]?.[0]).not.toHaveProperty("email")

    act(() => pressableByText(tree, STRINGS.en.accountAccessHelp).props.onPress())
    expect(state.push).toHaveBeenCalledWith("/(auth)/forgot-password")
    tree.unmount()
  })

  it("refuses an invalid username before making a login request", async () => {
    state.authentication = {
      status: "EXPLICIT",
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    const tree = render(<LoginScreen />)
    await enterCredentials(tree, STRINGS.en.username, "doctor@example.com")
    await act(async () => pressableByText(tree, STRINGS.en.signIn).props.onPress())

    expect(state.login).not.toHaveBeenCalled()
    expect(state.notify).toHaveBeenCalledWith(STRINGS.en.loginFailed, STRINGS.en.invalidUsername)
    tree.unmount()
  })

  it("renders the complete Bulgarian username and administrator-recovery explanation", () => {
    state.language = "bg"
    state.authentication = {
      status: "EXPLICIT",
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }
    const login = render(<LoginScreen />)
    expect(getByText(login, STRINGS.bg.usernameRules)).toBeTruthy()
    expect(getByText(login, STRINGS.bg.accountAccessHelp)).toBeTruthy()
    login.unmount()

    const recovery = render(<ForgotPasswordScreen />)
    expect(getByText(recovery, STRINGS.bg.administratorRecovery)).toBeTruthy()
    expect(getByText(recovery, STRINGS.bg.administratorRecoveryInstructions)).toBeTruthy()
    expect(recovery.root.findAll(node => (node.type as unknown) === "TextInput")).toHaveLength(0)
    recovery.unmount()
  })

  it("fails closed on malformed authentication capability data", () => {
    state.authentication = {
      status: "INVALID_CONTRACT",
      loginIdentifier: null,
      selfRegistration: false,
      passwordRecovery: "UNAVAILABLE",
    }
    const login = render(<LoginScreen />)
    expect(getByText(login, STRINGS.en.authConfigurationUnavailable)).toBeTruthy()
    expect(login.root.findAll(node => (node.type as unknown) === "TextInput")).toHaveLength(0)
    expect(queryByText(login, STRINGS.en.register)).toBeNull()
    expect(queryByText(login, STRINGS.en.forgotPassword)).toBeNull()
    login.unmount()

    const recovery = render(<ForgotPasswordScreen />)
    expect(getByText(recovery, STRINGS.en.authConfigurationUnavailable)).toBeTruthy()
    expect(recovery.root.findAll(node => (node.type as unknown) === "TextInput")).toHaveLength(0)
    recovery.unmount()
  })

  it("never mounts public registration or email recovery for a Hospital contract", () => {
    state.authentication = {
      status: "EXPLICIT",
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    }

    const registration = render(<RegisterScreen />)
    expect(getByText(registration, STRINGS.en.registrationUnavailable)).toBeTruthy()
    expect(getByText(registration, STRINGS.en.registrationAdministratorOnly)).toBeTruthy()
    expect(queryByText(registration, STRINGS.en.createAccount)).toBeNull()
    registration.unmount()

    const recovery = render(<ForgotPasswordScreen />)
    expect(getByText(recovery, STRINGS.en.administratorRecoveryInstructions)).toBeTruthy()
    expect(queryByText(recovery, STRINGS.en.sendResetLink)).toBeNull()
    expect(state.requestPasswordReset).not.toHaveBeenCalled()
    recovery.unmount()
  })

  it("retains the public email reset form and registration form", () => {
    const recovery = render(<ForgotPasswordScreen />)
    expect(inputByLabel(recovery, STRINGS.en.email)).toBeTruthy()
    expect(getByText(recovery, STRINGS.en.sendResetLink)).toBeTruthy()
    recovery.unmount()

    const registration = render(<RegisterScreen />)
    expect(getByText(registration, STRINGS.en.createAccount)).toBeTruthy()
    expect(queryByText(registration, STRINGS.en.registrationUnavailable)).toBeNull()
    registration.unmount()
  })
})
