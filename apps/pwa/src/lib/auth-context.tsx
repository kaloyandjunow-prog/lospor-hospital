import React, { createContext, useContext, useEffect, useState } from "react"
import { getToken, isTokenExpired, login as apiLogin, logout as apiLogout, onAuthExpired } from "./api"

type AuthState = "loading" | "unauthenticated" | "authenticated"

type AuthContextValue = {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
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
    getToken().then(async token => {
      if (!token || isTokenExpired(token)) {
        if (token) await apiLogout()
        setState("unauthenticated")
        return
      }
      setState("authenticated")
    })
    return unsubscribe
  }, [])

  async function login(email: string, password: string) {
    await apiLogin(email, password)
    setState("authenticated")
  }

  async function logout() {
    await apiLogout()
    setState("unauthenticated")
  }

  return (
    <AuthContext.Provider value={{ state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
