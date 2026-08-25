"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import {
  BarChart3,
  Database,
  FileDown,
  Files,
  GitCompareArrows,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
} from "lucide-react"
import { clinicalDisplayLabel } from "@lospor/core/display"
import type { ResearchMetadata } from "@lospor/core/research"
import type { SessionUser } from "@/lib/api"
import { LanguageButton, useLocale } from "./locale-provider"
import { formatResearchScope } from "@/lib/research-scope"
import { canViewResearchNavigation } from "@/lib/research-ui-policy"

const items = [
  { href: "/overview", key: "overview", icon: LayoutDashboard, permission: null },
  { href: "/cohorts", key: "cohorts", icon: SlidersHorizontal, permission: null },
  { href: "/compare", key: "compare", icon: GitCompareArrows, permission: null },
  { href: "/cases", key: "cases", icon: Files, permission: "inspectCases" },
  { href: "/quality", key: "quality", icon: ShieldCheck, permission: null },
  { href: "/benchmarks", key: "benchmarks", icon: BarChart3, permission: null },
  { href: "/exports", key: "exports", icon: FileDown, permission: "export" },
] as const

export function WorkspaceShell({
  user,
  metadata,
  children,
}: {
  user: SessionUser
  metadata: ResearchMetadata
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { locale, message } = useLocale()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState("")
  const visibleItems = items.filter(item => canViewResearchNavigation(metadata.permissions, item.permission))
  const active = [...visibleItems, { href: "/governance", key: "governance" as const, icon: Database }]
    .find(item => pathname.startsWith(item.href))
  const actionScope = pathname.startsWith("/cases")
    ? metadata.scopes.inspectCases
    : pathname.startsWith("/exports")
      ? metadata.scopes.export
      : metadata.scopes.query
  const scopeLabel = formatResearchScope(actionScope, message("allInstitutions"))
  const scopeTitle = actionScope.institutionLabels.join(", ")

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/overview" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" />
          <span>
            <strong>{message("brand")}</strong>
            <small>{message("researchWorkspace")}</small>
          </span>
        </Link>
        <nav className="side-nav" aria-label={message("researchNavigation")}>
          {visibleItems.map(item => {
            const Icon = item.icon
            const selected = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${selected ? " active" : ""}`}
              >
                <Icon aria-hidden="true" />
                <span>{message(item.key)}</span>
              </Link>
            )
          })}
          <Link
            href="/governance"
            className={`nav-link${pathname.startsWith("/governance") ? " active" : ""}`}
          >
            <Stethoscope aria-hidden="true" />
            <span>{message("governance")}</span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="account-name">{user.name}</div>
          <div className="account-meta">
            {user.institutionName ?? clinicalDisplayLabel("userRole", user.role, locale)}
          </div>
          <div className="side-actions">
            <LanguageButton />
            <button
              type="button"
              className="icon-button"
              title={message("signOut")}
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true)
                setLogoutError("")
                const response = await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null)
                if (!response?.ok) {
                  setLogoutError(message("signOutFailed"))
                  setLoggingOut(false)
                  return
                }
                router.replace("/login")
                router.refresh()
              }}
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
          {logoutError ? <div className="sidebar-error" role="alert">{logoutError}</div> : null}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{active ? message(active.key) : message("brand")}</h1>
          <div className="topbar-actions">
            <div className="scope-label topbar-scope" title={scopeTitle}>
              {message("scope")}: {scopeLabel}
            </div>
            <div className="topbar-language"><LanguageButton /></div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
