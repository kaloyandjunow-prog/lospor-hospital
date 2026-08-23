#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The clinical clients below are still the deliberately pinned pre-localization
 * imports.  They are allowed to remain so while 1.2.0 work is in progress, but
 * advancing any one of them is a claim that a new owner release is being
 * imported.  At that point the API and all three clients must advance together
 * and carry the complete locale contract and its release E2E evidence.
 */
export const PRE_LOCALIZATION_PINS = Object.freeze({
  api: "a1e866f56c3040bc9332cc03d33a37108eff3d5f",
  web: "8eebcd2a659e167de92b8ed50f03c459657f628c",
  pwa: "c9ddfb7a58508fc69792b70d81492e0c0713d0bb",
  browser: "6bec8500ae6b09c46877d59695f1f5438de0cc33",
})

const marker = Object.freeze({
  defaultBg: "HOSPITAL_LOCALE_E2E_DEFAULT_BG",
  visibleChoices: "HOSPITAL_LOCALE_E2E_VISIBLE_CHOICES",
  accountTakeover: "HOSPITAL_LOCALE_E2E_ACCOUNT_TAKEOVER",
})

export const LOCALIZATION_IMPORT_REQUIREMENTS = Object.freeze([
  {
    id: "api.appliance-default",
    path: "apps/api/src/app/v1/locale/route.ts",
    required: ["LOSPOR_DEFAULT_LOCALE", '"bg"'],
  },
  {
    id: "api.account-locale-profile",
    path: "apps/api/src/app/v1/user/route.ts",
    required: ["preferredLocaleFromPreferences", "preferencesWithPreferredLocale", "ui:", "locale"],
  },
  {
    id: "api.web-session-locale",
    path: "apps/api/src/app/v1/auth/session/route.ts",
    required: ["preferredLocaleFromPreferences", "preferencesWithPreferredLocale", "locale:"],
  },
  {
    id: "api.pwa-token-locale",
    path: "apps/api/src/app/v1/auth/token/route.ts",
    required: ["preferredLocaleFromPreferences", "preferencesWithPreferredLocale", "locale:"],
  },
  {
    id: "web.bulgarian-default",
    path: "apps/web/src/i18n/locales.ts",
    required: ["DEFAULT_LOCALE", '"bg"', "configuredDefaultLocale"],
  },
  {
    id: "web.visible-selector",
    path: "apps/web/src/components/LanguageSwitcher.tsx",
    required: ["Български", "English", '"bg"', '"en"'],
  },
  {
    id: "web.account-locale-reader",
    path: "apps/web/src/lib/account-locale.ts",
    required: ["preferences", "ui", "locale", "loadAccountLocale", "persistAccountLocale"],
  },
  {
    id: "web.account-locale-takeover",
    path: "apps/web/src/components/AccountLocaleSync.tsx",
    required: ["accountLocale", "setAccountLocale", "router.refresh"],
  },
  {
    id: "pwa.appliance-default",
    path: "apps/pwa/src/lib/appliance-locale.ts",
    required: ["DEFAULT_APP_LANGUAGE", "/api/locale", "loadApplianceDefaultLocale"],
  },
  {
    id: "pwa.account-locale",
    path: "apps/pwa/src/lib/account-locale.ts",
    required: ["preferences", "ui", "locale", "loadAuthenticatedLocale", "saveAuthenticatedLocale"],
  },
  {
    id: "pwa.localized-login",
    path: "apps/pwa/app/(auth)/login.tsx",
    required: ["usePreferences", "selectLoginLanguage", "completeLoginLocaleSync", "Български", "English"],
  },
  {
    id: "browser.bulgarian-default",
    path: "apps/browser/src/lib/locale.ts",
    required: ["DEFAULT_LOCALE", '"bg"', "localeFromSessionUser"],
  },
  {
    id: "browser.account-locale-reader",
    path: "apps/browser/src/lib/server-locale.ts",
    required: ["currentSession", "localeFromSessionUser", "LOSPOR_DEFAULT_LOCALE"],
  },
  {
    id: "browser.visible-selector",
    path: "apps/browser/src/components/locale-provider.tsx",
    required: ["Български", "English", "preferences", "locale"],
  },
  {
    id: "browser.login-takeover",
    path: "apps/browser/src/components/login-form.tsx",
    required: ["localeFromSessionUser", "EXPLICIT_LOGIN_LOCALE_KEY", "body.user"],
  },
  {
    id: "web.public-locale-e2e",
    path: "apps/web/e2e/smoke.spec.ts",
    required: [marker.defaultBg, marker.visibleChoices, "Вход", "Български", "English", "expect("],
  },
  {
    id: "web.account-locale-e2e",
    path: "apps/web/e2e/smoke-authed.spec.ts",
    required: [marker.accountTakeover, "expect("],
  },
  {
    id: "pwa.locale-e2e",
    path: "apps/pwa/e2e/sign-in.pwa.spec.ts",
    required: [marker.defaultBg, marker.visibleChoices, marker.accountTakeover, "Вход", "Български", "English", "expect("],
  },
  {
    id: "browser.public-locale-e2e",
    path: "apps/browser/e2e/login.spec.ts",
    required: [marker.defaultBg, marker.visibleChoices, "Вход", "Български", "English", "expect("],
  },
  {
    id: "browser.account-locale-e2e",
    path: "apps/browser/e2e/authenticated.spec.ts",
    required: [marker.accountTakeover, "expect("],
  },
])

function failure(id, path, message) {
  return { id, path, message }
}

function readManifest(root) {
  const path = resolve(root, "UPSTREAM_VERSIONS.json")
  try {
    return { path, value: JSON.parse(readFileSync(path, "utf8")) }
  } catch (error) {
    return {
      path,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function verifyClientLocalizationImport(root, { requireReady = false } = {}) {
  const manifest = readManifest(root)
  if (manifest.error) {
    return {
      ok: false,
      status: "blocked",
      advanced: [],
      failures: [failure("manifest.read", "UPSTREAM_VERSIONS.json", manifest.error)],
    }
  }

  const advanced = []
  const unchanged = []
  const malformed = []
  for (const [name, baseline] of Object.entries(PRE_LOCALIZATION_PINS)) {
    const commit = manifest.value?.sources?.[name]?.commit
    if (typeof commit !== "string" || !commit) malformed.push(name)
    else if (commit === baseline) unchanged.push(name)
    else advanced.push(name)
  }

  if (malformed.length) {
    return {
      ok: false,
      status: "blocked",
      advanced,
      failures: [failure(
        "manifest.client-pins",
        "UPSTREAM_VERSIONS.json",
        `Missing valid owner commit pins for: ${malformed.join(", ")}.`,
      )],
    }
  }

  // The current, knowingly pre-localization import is not represented as a
  // failed dirty-tree quality run. A tagged candidate calls the same gate with
  // requireReady and may never publish this pending state.
  if (advanced.length === 0) {
    if (requireReady) {
      return {
        ok: false,
        status: "blocked",
        advanced,
        failures: [failure(
          "localization.release-ready",
          "UPSTREAM_VERSIONS.json",
          "Release candidates require coordinated API, Web, PWA, and Browser localization owner imports plus Hospital E2E evidence; all four pins are still pre-localization.",
        )],
      }
    }
    return {
      ok: true,
      status: "pending",
      advanced,
      failures: [],
    }
  }

  const failures = []
  if (unchanged.length) {
    failures.push(failure(
      "localization.atomic-owner-import",
      "UPSTREAM_VERSIONS.json",
      `Locale import is partial. Advance API, Web, PWA, and Browser together; still pinned: ${unchanged.join(", ")}.`,
    ))
  }

  for (const requirement of LOCALIZATION_IMPORT_REQUIREMENTS) {
    const absolute = resolve(root, requirement.path)
    if (!existsSync(absolute)) {
      failures.push(failure(requirement.id, requirement.path, "Required imported source or E2E evidence is missing."))
      continue
    }
    const source = readFileSync(absolute, "utf8")
    const missing = requirement.required.filter(value => !source.includes(value))
    if (missing.length) {
      failures.push(failure(
        requirement.id,
        requirement.path,
        `Missing required locale contract evidence: ${missing.join(", ")}.`,
      ))
    }
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "ready" : "blocked",
    advanced,
    failures,
  }
}

function parseArgs(args) {
  let root = fileURLToPath(new URL("..", import.meta.url))
  let json = false
  let requireReady = false
  while (args.length) {
    const value = args.shift()
    if (value === "--json") json = true
    else if (value === "--require-ready") requireReady = true
    else if (value === "--root") {
      const candidate = args.shift()
      if (!candidate) throw new Error("--root requires a path")
      root = resolve(candidate)
    } else throw new Error(`Unknown option '${value}'`)
  }
  return { root, json, requireReady }
}

function main() {
  const { root, json, requireReady } = parseArgs(process.argv.slice(2))
  const report = verifyClientLocalizationImport(root, { requireReady })
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else if (report.status === "pending") {
    process.stdout.write(
      "Client localization import remains pending at the documented owner pins; no release claim was made.\n",
    )
  } else if (report.ok) {
    process.stdout.write("Client localization owner import and Hospital E2E evidence are complete.\n")
  } else {
    process.stderr.write("Client localization import is incomplete:\n")
    for (const item of report.failures) {
      process.stderr.write(`  - ${item.id} [${item.path}]: ${item.message}\n`)
    }
  }
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
