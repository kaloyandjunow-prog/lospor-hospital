"use server"

import { cookies } from "next/headers"
import {
  ACCOUNT_LOCALE_COOKIE, DEVICE_LOCALE_COOKIE, LEGACY_LOCALE_COOKIE,
  LOGIN_LOCALE_CHOICE_COOKIE, SESSION_COOKIE, configuredDefaultLocale,
  parseLocale, type AppLocale,
} from "@/i18n/locales"

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60
const LOGIN_CHOICE_SECONDS = 15 * 60
function cookieOptions(maxAge?: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", ...(maxAge === undefined ? {} : { maxAge }) }
}
function requireLocale(value: unknown): AppLocale {
  const locale = parseLocale(value)
  if (!locale) throw new Error("Unsupported locale")
  return locale
}
export async function selectDeviceLocale(value: unknown, context: "public" | "login" = "public") {
  const locale = requireLocale(value)
  const jar = await cookies()
  jar.set(DEVICE_LOCALE_COOKIE, locale, cookieOptions(ONE_YEAR_SECONDS))
  if (context === "public" && jar.has(SESSION_COOKIE)) jar.set(ACCOUNT_LOCALE_COOKIE, locale, cookieOptions())
  jar.delete(LEGACY_LOCALE_COOKIE)
  if (context === "login") jar.set(LOGIN_LOCALE_CHOICE_COOKIE, locale, cookieOptions(LOGIN_CHOICE_SECONDS))
  return locale
}
export async function setAccountLocale(value: unknown) {
  const locale = requireLocale(value)
  const jar = await cookies()
  jar.set(ACCOUNT_LOCALE_COOKIE, locale, cookieOptions())
  jar.delete(LEGACY_LOCALE_COOKIE)
  return locale
}
export async function completeLoginLocale(accountPreference: unknown) {
  const jar = await cookies()
  const explicitChoice = parseLocale(jar.get(LOGIN_LOCALE_CHOICE_COOKIE)?.value)
  const locale = explicitChoice ?? parseLocale(accountPreference)
    ?? parseLocale(jar.get(DEVICE_LOCALE_COOKIE)?.value) ?? configuredDefaultLocale()
  jar.set(ACCOUNT_LOCALE_COOKIE, locale, cookieOptions())
  jar.delete(LOGIN_LOCALE_CHOICE_COOKIE)
  jar.delete(LEGACY_LOCALE_COOKIE)
  return { locale, persistExplicitChoice: explicitChoice !== undefined }
}
export async function finishLogoutLocale() {
  const jar = await cookies()
  jar.delete(ACCOUNT_LOCALE_COOKIE)
  jar.delete(LOGIN_LOCALE_CHOICE_COOKIE)
  jar.delete(LEGACY_LOCALE_COOKIE)
}
