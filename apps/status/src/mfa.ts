import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import { normalizeEmail, sha256 } from "./util.js"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const TOTP_PERIOD_SECONDS = 30
const TOTP_DIGITS = 6
const MFA_CIPHER_VERSION = "v1"

function base32Encode(value: Buffer): string {
  let bits = 0
  let accumulator = 0
  let output = ""
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += BASE32_ALPHABET[(accumulator >>> bits) & 31]
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31]
  return output
}

function base32Decode(value: string): Buffer {
  const normalized = value.replaceAll(" ", "").replaceAll("-", "").toUpperCase()
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error("Invalid base32 value")
  let bits = 0
  let accumulator = 0
  const bytes: number[] = []
  for (const character of normalized) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((accumulator >>> bits) & 255)
    }
  }
  return Buffer.from(bytes)
}

function mfaAad(generation: number): Buffer {
  return Buffer.from(`lospor-status-mfa\u0000${generation}`, "utf8")
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function encryptTotpSecret(secret: string, key: Buffer, generation: number): string {
  if (key.length !== 32) throw new Error("Status MFA encryption key must contain exactly 32 bytes")
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  cipher.setAAD(mfaAad(generation))
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [MFA_CIPHER_VERSION, nonce.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".")
}

export function decryptTotpSecret(ciphertext: string, key: Buffer, generation: number): string {
  if (key.length !== 32) throw new Error("Status MFA encryption key must contain exactly 32 bytes")
  const [version, nonceValue, tagValue, encryptedValue, ...extra] = ciphertext.split(".")
  if (version !== MFA_CIPHER_VERSION || !nonceValue || !tagValue || !encryptedValue || extra.length) {
    throw new Error("Invalid Status MFA ciphertext")
  }
  const nonce = Buffer.from(nonceValue, "base64url")
  const tag = Buffer.from(tagValue, "base64url")
  const encrypted = Buffer.from(encryptedValue, "base64url")
  if (nonce.length !== 12 || tag.length !== 16 || encrypted.length < 1 || encrypted.length > 256) {
    throw new Error("Invalid Status MFA ciphertext")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce)
  decipher.setAAD(mfaAad(generation))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

export function totpCode(secret: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS)
  const counterBytes = Buffer.alloc(8)
  counterBytes.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBytes).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const number = (digest.readUInt32BE(offset) & 0x7fff_ffff) % (10 ** TOTP_DIGITS)
  return number.toString().padStart(TOTP_DIGITS, "0")
}

export function matchingTotpStep(secret: string, code: string, timeMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const currentStep = Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS)
  for (const offset of [0, -1, 1]) {
    const step = currentStep + offset
    if (step < 0) continue
    const expected = Buffer.from(totpCode(secret, step * TOTP_PERIOD_SECONDS * 1000), "utf8")
    const supplied = Buffer.from(code, "utf8")
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return step
  }
  return null
}

export function totpUri(email: string, secret: string): string {
  const issuer = "LOSPOR Hospital"
  const label = `${issuer}:${email}`
  const parameters = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`
}

export function generateRecoveryCodes(count = 10): string[] {
  if (count !== 10) throw new Error("Status MFA requires exactly ten recovery codes")
  return Array.from({ length: count }, () => {
    const compact = base32Encode(randomBytes(10))
    return compact.match(/.{1,4}/g)!.join("-")
  })
}

export function normalizeRecoveryCode(value: string): string | null {
  const normalized = value.trim().replace(/[\s-]+/g, "").toUpperCase()
  return /^[A-Z2-7]{16}$/.test(normalized) ? normalized : null
}

export function recoveryCodeHash(generation: number, email: string, code: string): string | null {
  const normalized = normalizeRecoveryCode(code)
  return normalized ? sha256(`${generation}\u0000${normalizeEmail(email)}\u0000${normalized}`) : null
}
