// Web shim for expo-secure-store: uses localStorage because browsers do not
// expose native Keychain/Keystore storage. This is weaker than native secure
// storage; logout clears the token plus offline clinical drafts and queues.
const PREFIX = "lospor_ss_"

export const AFTER_FIRST_UNLOCK             = 0
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 0
export const ALWAYS                         = 0
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY  = 0
export const ALWAYS_THIS_DEVICE_ONLY        = 0
export const WHEN_UNLOCKED                  = 0
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 0

export function isAvailableAsync(): Promise<boolean> {
  return Promise.resolve(typeof localStorage !== "undefined")
}

/**
 * A failed read is safe to treat as "no value": the caller sees a signed-out
 * state, which is the conservative outcome.
 */
export async function getItemAsync(key: string): Promise<string | null> {
  try { return localStorage.getItem(PREFIX + key) } catch { return null }
}

/**
 * Write failures propagate. Swallowing them let a login appear to succeed while
 * the token was never stored, so the next API call came back unauthorised and
 * the app looked broken for no visible reason. Storage can genuinely fail —
 * quota exhausted, or private browsing — and the caller needs to know.
 */
export async function setItemAsync(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch (error) {
    throw new Error(
      `Secure storage write failed for "${key}". The browser may be in private mode or out of storage.`,
      { cause: error },
    )
  }
}

/**
 * Delete failures propagate too. A silently failed delete on sign-out leaves a
 * bearer token in browser storage on what may be a shared ward device.
 */
export async function deleteItemAsync(key: string): Promise<void> {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch (error) {
    throw new Error(`Secure storage delete failed for "${key}".`, { cause: error })
  }
}
