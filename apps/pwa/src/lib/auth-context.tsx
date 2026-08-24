import React, { createContext, useContext, useEffect, useState } from "react"
import type { AppLanguage } from "@/i18n/locale"
import {
  clearToken,
  getToken,
  hasAuthenticatedSession,
  login as apiLogin,
  completeAdministratorMfa as apiCompleteAdministratorMfa,
  logout as apiLogout,
  onAuthExpired,
} from "./api"
import type {
  AdministratorMfaChallenge,
  AdministratorMfaCompletion,
  LoginResult,
} from "./administrator-mfa"
import type { LoginCredential } from "./login-identifier"

type AuthState = "loading" | "unauthenticated" | "authenticated"

type AuthContextValue = {
  state: AuthState
  login: (
    credential: LoginCredential,
    password: string,
    locale: AppLanguage,
  ) => Promise<LoginResult>
  completeAdministratorMfa: (
    challenge: AdministratorMfaChallenge,
    code: string,
  ) => Promise<AdministratorMfaCompletion>
  finishAdministratorMfaLogin: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("loading")

  useEffect(() => {
    // An expired session never reaches logout(), so the device would otherwise
    // keep this account's preferences for whoever signs in next. Only the
    // preferences are dropped here, deliberately: drafts and queued patches may
    // be unsynced clinical work, and a session timing out is not a reason to
    // destroy them the way an explicit sign-out is.
    const unsubscribe = onAuthExpired(() => {
      setState("unauthenticated")
      void import("./clinical-preferences-mobile")
        .then(({ clearMobileClinicalPreferences }) => clearMobileClinicalPreferences())
        .catch(() => {})
    })
    Promise.all([getToken(), hasAuthenticatedSession()]).then(async ([token, authenticated]) => {
      if (!authenticated) {
        // Expiry is not explicit sign-out: remove only the session and
        // per-account preferences. Drafts and queued clinical writes may be
        // unsynced and must survive until that clinician authenticates again.
        if (token) await clearToken()
        await import("./clinical-preferences-mobile")
          .then(({ clearMobileClinicalPreferences }) => clearMobileClinicalPreferences())
          .catch(() => {})
        setState("unauthenticated")
        return
      }
      setState("authenticated")
    })
    return unsubscribe
  }, [])

  async function login(
    credential: LoginCredential,
    password: string,
    locale: AppLanguage,
  ) {
    try {
      const result = await apiLogin(credential, password, locale)
      if (result.kind === "authenticated") setState("authenticated")
      return result
    } catch (error) {
      // Includes the stable CLINICAL_APP_FORBIDDEN response used by
      // RESEARCH_ONLY deployments. A rejected clinical-app login must never
      // leave a usable bearer token behind.
      await clearToken().catch(() => {})
      setState("unauthenticated")
      throw error
    }
  }

  async function completeAdministratorMfa(
    challenge: AdministratorMfaChallenge,
    code: string,
  ) {
    return apiCompleteAdministratorMfa(challenge, code)
  }

  function finishAdministratorMfaLogin() {
    setState("authenticated")
  }

  async function logout() {
    await apiLogout()
    // Native apiLogout clears the token even when its best-effort revocation is
    // offline. PWA apiLogout throws unless the server confirms cookie expiry;
    // in that case this line is intentionally not reached and the UI must not
    // pretend that the HttpOnly session disappeared.
    setState("unauthenticated")
  }

  return (
    <AuthContext.Provider value={{
      state,
      login,
      completeAdministratorMfa,
      finishAdministratorMfaLogin,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
