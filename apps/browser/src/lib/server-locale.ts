import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"
import { currentSession } from "./api"
import {
  DEVICE_LOCALE_COOKIE,
  localeFromSessionUser,
  preAuthLocale,
} from "./locale"

export const currentLocale = cache(async () => {
  const [store, session] = await Promise.all([
    cookies(),
    currentSession(),
  ])
  const deviceLocale = preAuthLocale(
    store.get(DEVICE_LOCALE_COOKIE)?.value,
    process.env.LOSPOR_DEFAULT_LOCALE,
  )
  return session?.user
    ? localeFromSessionUser(session.user, deviceLocale)
    : deviceLocale
})
