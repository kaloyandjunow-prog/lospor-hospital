import React, { createContext, useContext, useEffect, useState } from "react"
import {
  authenticatedIdentityFromToken,
  clearToken,
  getAuthenticatedIdentity,
  getToken,
  isTokenExpired,
  login as apiLogin,
  logout as apiLogout,
  onAuthExpired,
  type AuthenticatedIdentity,
} from "./api"

type AuthState = "loading" | "unauthenticated" | "authenticated"

type AuthContextValue = {
  state: AuthState
  identity: AuthenticatedIdentity | null
  login: (email: string, password: string) => Promise<void>
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
      if (!token || isTokenExpired(token)) {
        // Expiry is not an explicit sign-out. Keep account-bound unsynced
        // clinical work quarantined until the same account authenticates again.
        if (token) await clearToken()
        setIdentity(null)
        setState("unauthenticated")
        return
      }
      const currentIdentity = authenticatedIdentityFromToken(token)
      if (!currentIdentity) {
        await clearToken()
        setIdentity(null)
        setState("unauthenticated")
        return
      }
      setIdentity(currentIdentity)
      setState("authenticated")
    })
    return unsubscribe
  }, [])

  async function login(email: string, password: string) {
    await apiLogin(email, password)
    const currentIdentity = await getAuthenticatedIdentity()
    if (!currentIdentity) {
      await clearToken()
      throw new Error("The signed-in account identity could not be verified.")
    }
    setIdentity(currentIdentity)
    setState("authenticated")
  }

  async function logout() {
    await apiLogout()
    setIdentity(null)
    setState("unauthenticated")
  }

  return (
    <AuthContext.Provider value={{ state, identity, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
