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

export async function getItemAsync(key: string): Promise<string | null> {
  try { return localStorage.getItem(PREFIX + key) } catch { return null }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  try { localStorage.setItem(PREFIX + key, value) } catch {}
}

export async function deleteItemAsync(key: string): Promise<void> {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}
