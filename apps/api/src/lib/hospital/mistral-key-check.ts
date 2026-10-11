import "server-only"

import { createHash } from "node:crypto"
import { externalAiProviderAccess } from "@/lib/hospital/external-ai-policy"

/**
 * Whether Mistral still accepts the stored key (1.5.6).
 *
 * The overview map showed Mistral green for being switched on, so a revoked or
 * expired key went unnoticed until a clinician's lab scan failed. Once an hour
 * this asks Mistral for its model list: no clinical data, nothing billed, and
 * the EU endpoint unless the site configured another. The answer is kept per
 * key, so replacing the key is checked at once rather than an hour later.
 *
 * The status snapshot never waits for Mistral: it reports the last answer and
 * starts a new check in the background when that answer is old.
 */

export type MistralKeyCheck = { state: "ok" | "key-refused" | "unreachable"; checkedAt: string }

export const MISTRAL_KEY_CHECK_INTERVAL_MS = 60 * 60_000
const TIMEOUT_MS = 10_000
const DEFAULT_MISTRAL_API_BASE = "https://api.eu.mistral.ai/v1"

let last: { keyHash: string; check: MistralKeyCheck } | null = null
let running: Promise<void> | null = null

const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex")

/** What a response from GET /models says about the key. */
export function keyCheckState(status: number | null): MistralKeyCheck["state"] {
  if (status === null) return "unreachable"
  if (status === 401 || status === 403) return "key-refused"
  return status >= 200 && status < 300 ? "ok" : "unreachable"
}

export async function checkMistralKey(apiKey: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<MistralKeyCheck> {
  const base = (process.env.MISTRAL_API_BASE ?? DEFAULT_MISTRAL_API_BASE).replace(/\/$/, "")
  let status: number | null = null
  try {
    const response = await fetcher(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = response.status
    await response.body?.cancel().catch(() => {})
  } catch {
    status = null
  }
  return { state: keyCheckState(status), checkedAt: new Date(now).toISOString() }
}

/** The last answer for the key in use, if any; refreshes in the background when it is old. */
export async function mistralKeyCheck(now = Date.now()): Promise<MistralKeyCheck | undefined> {
  const access = await externalAiProviderAccess()
  if (!access.enabled) return undefined
  const keyHash = hashKey(access.apiKey)
  const current = last?.keyHash === keyHash ? last.check : undefined
  if (!running && (!current || now - Date.parse(current.checkedAt) >= MISTRAL_KEY_CHECK_INTERVAL_MS)) {
    running = checkMistralKey(access.apiKey)
      .then(check => { last = { keyHash, check } })
      .catch(() => {})
      .finally(() => { running = null })
  }
  return current
}

/** For tests. */
export function resetMistralKeyCheck() {
  last = null
  running = null
}
