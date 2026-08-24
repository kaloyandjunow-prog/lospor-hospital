import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import {
  ACCOUNT_LOCALE_COOKIE,
  DEVICE_LOCALE_COOKIE,
  LEGACY_LOCALE_COOKIE,
  LOGIN_LOCALE_CHOICE_COOKIE,
  SESSION_COOKIE,
  messagesForLocale,
  resolveRequestLocale,
} from "@/i18n/locales"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = resolveRequestLocale({
    account: cookieStore.has(SESSION_COOKIE)
      ? cookieStore.get(ACCOUNT_LOCALE_COOKIE)?.value
      : undefined,
    device: cookieStore.get(DEVICE_LOCALE_COOKIE)?.value,
    loginChoice: cookieStore.get(LOGIN_LOCALE_CHOICE_COOKIE)?.value,
    legacy: cookieStore.get(LEGACY_LOCALE_COOKIE)?.value,
  })
  return {
    locale,
    messages: messagesForLocale(locale),
  }
})
