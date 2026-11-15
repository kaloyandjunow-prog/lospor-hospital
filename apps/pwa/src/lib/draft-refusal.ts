/**
 * Why the server refused to create a case from an offline draft (10.4.2).
 *
 * The replay used to treat every refusal as "still offline" and resend the
 * same payload on every cycle, forever, with nothing on screen. A refusal the
 * same request can never get past is now kept on the draft with its reason,
 * the replay stops, and the dashboard says what to fix. Saving the draft again
 * from the form clears it and the replay resumes.
 */
export type DraftRefusal = { status: number; code: string | null; at: string }

/** Answers the same request can get past: sign-in, timeout, app update, rate limit. */
const RETRYABLE = new Set([401, 408, 426, 429])

function codeOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  for (const key of ["code", "error"] as const) {
    const value = (body as Record<string, unknown>)[key]
    if (typeof value === "string" && /^[A-Z][A-Z0-9_]{2,63}$/.test(value)) return value
  }
  return null
}

/**
 * The refusal to keep, or null when the replay should simply try again.
 * Paediatric mode switched off is a 503 but no retry will change it.
 */
export function draftRefusalFrom(status: number | undefined, body: unknown, at: Date = new Date()): DraftRefusal | null {
  if (status === undefined) return null
  const code = codeOf(body)
  const permanent = (status >= 400 && status < 500 && !RETRYABLE.has(status)) || code === "PEDIATRIC_MODE_DISABLED"
  return permanent ? { status, code, at: at.toISOString() } : null
}

const TEXT: Record<"bg" | "en", Record<string, string>> = {
  bg: {
    PEDIATRIC_MODE_REQUIRED: "Възрастта е на дете, а случаят е в режим за възрастни. Отворете черновата и превключете на педиатричен режим.",
    ADULT_MODE_REQUIRED: "Възрастта е на възрастен, а случаят е в педиатричен режим. Отворете черновата и превключете на режим за възрастни.",
    PEDIATRIC_AGE_REQUIRED: "Педиатричният случай няма възраст. Отворете черновата и я въведете.",
    INVALID_PEDIATRIC_AGE: "Възрастта в педиатричния случай не е валидна. Отворете черновата и я поправете.",
    PEDIATRIC_MODE_DISABLED: "Педиатричният режим е изключен в Status. Свържете се с администратора.",
    PREOP_ANSWER_REFUSED: "Отговор от предоперативния профил вече не се приема: профилът е променен. Отворете черновата и проверете отговорите.",
    PII_BLOCKED: "Текстово поле прилича на лични данни (име, ЕГН, телефон). Отворете черновата и го поправете.",
    FORBIDDEN: "Профилът ви няма право да създава случаи тук. Свържете се с администратора.",
    DEFAULT: "Сървърът не прие черновата. Отворете я, за да я проверите.",
  },
  en: {
    PEDIATRIC_MODE_REQUIRED: "The age is a child's but the case is in adult mode. Open the draft and switch to paediatric mode.",
    ADULT_MODE_REQUIRED: "The age is an adult's but the case is in paediatric mode. Open the draft and switch to adult mode.",
    PEDIATRIC_AGE_REQUIRED: "The paediatric case has no age. Open the draft and enter it.",
    INVALID_PEDIATRIC_AGE: "The paediatric case's age is not valid. Open the draft and correct it.",
    PEDIATRIC_MODE_DISABLED: "Paediatric mode is switched off in Status. Contact the administrator.",
    PREOP_ANSWER_REFUSED: "A preoperative answer is no longer accepted: the profile has changed. Open the draft and check the answers.",
    PII_BLOCKED: "A text field looks like personal data (a name, ЕГН or phone number). Open the draft and correct it.",
    FORBIDDEN: "Your account may not create cases here. Contact the administrator.",
    DEFAULT: "The server did not accept this draft. Open it to check it.",
  },
}

/** What the dashboard says about a refused draft. */
export function draftRefusalText(refusal: Pick<DraftRefusal, "status" | "code">, language: string): string {
  const text = TEXT[language === "bg" ? "bg" : "en"]
  if (refusal.code && text[refusal.code]) return text[refusal.code]
  return refusal.status === 403 ? text.FORBIDDEN : text.DEFAULT
}
