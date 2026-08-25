import React, { createContext, useContext, useEffect, useState } from "react"
import type { AppLanguage } from "@/i18n/locale"
import {
  clearToken,
  getAuthenticatedIdentity,
  getToken,
  login as apiLogin,
  completeAdministratorMfa as apiCompleteAdministratorMfa,
  logout as apiLogout,
  onAuthExpired,
  type AuthenticatedIdentity,
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
  identity: AuthenticatedIdentity | null
  login: (
    credential: LoginCredential,
    password: string,
    locale: AppLanguage,
  ) => Promise<LoginResult>
  completeAdministratorMfa: (
    challenge: AdministratorMfaChallenge,
    code: string,
  ) => Promise<AdministratorMfaCompletion>
  finishAdministratorMfaLogin: (completion: AdministratorMfaCompletion) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("loading")
  const [identity, setIdentity] = useState<AuthenticatedIdentity | null>(null)

  useEffect(() => {
    // An expired session never reaches logout(), so the device would otherwise
    // keep this account's preferences for whoever signs in next. Only the
    // preferences are dropped here, deliberately: drafts and queued patches may
    // be unsynced clinical work, and a session timing out is not a reason to
    // destroy them the way an explicit sign-out is.
    const unsubscribe = onAuthExpired(() => {
      setIdentity(null)
      setState("unauthenticated")
      void import("./clinical-preferences-mobile")
        .then(({ clearMobileClinicalPreferences }) => clearMobileClinicalPreferences())
        .catch(() => {})
    })
    getToken().then(async token => {
      // getAuthenticatedIdentity() does a real server round-trip for a web
      // session (its only source of identity -- the HttpOnly cookie can't be
      // decoded client-side) and fails closed to null on both a rejected
      // session and a network error, so there is nothing further to fall
      // back to here for web. For native it reads the locally stored,
      // unexpired token with no network round-trip at all.
      const identity = await getAuthenticatedIdentity().catch(() => null)
      if (!identity) {
        // Expiry is not explicit sign-out: remove only the session and
        // per-account preferences. Drafts and queued clinical writes may be
        // unsynced and must survive until that clinician authenticates again.
        if (token) await clearToken()
        await import("./clinical-preferences-mobile")
          .then(({ clearMobileClinicalPreferences }) => clearMobileClinicalPreferences())
          .catch(() => {})
        setIdentity(null)
        setState("unauthenticated")
        return
      }
      setIdentity(identity)
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
      if (result.kind === "authenticated") {
        // result.identity is carried directly from the already-successful
        // login response, not re-fetched: a second round-trip here could
        // itself fail or race, and LoginResult's type already guarantees a
        // real identity accompanies "authenticated".
        setIdentity(result.identity)
        setState("authenticated")
      }
      return result
    } catch (error) {
      // Includes the stable CLINICAL_APP_FORBIDDEN response used by
      // RESEARCH_ONLY deployments. A rejected clinical-app login must never
      // leave a usable bearer token behind.
      await clearToken().catch(() => {})
      setIdentity(null)
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

  async function finishAdministratorMfaLogin(completion: AdministratorMfaCompletion) {
    // completion.identity is carried from the MFA response the caller already
    // has (see completeAdministratorMfa() in api.ts), the same reasoning as
    // login() above. The state must never read "authenticated" without a real
    // identity behind it -- every offline affordance downstream keys off
    // draftOwner, which is derived from this.
    if (!completion.identity) {
      throw new Error("MFA completed but the server did not return a usable identity.")
    }
    setIdentity(completion.identity)
    setState("authenticated")
  }

  async function logout() {
    await apiLogout()
    // Native apiLogout clears the token even when its best-effort revocation is
    // offline. PWA apiLogout throws unless the server confirms cookie expiry;
    // in that case this line is intentionally not reached and the UI must not
    // pretend that the HttpOnly session disappeared.
    setIdentity(null)
    setState("unauthenticated")
  }

  return (
    <AuthContext.Provider value={{
      state,
      identity,
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
