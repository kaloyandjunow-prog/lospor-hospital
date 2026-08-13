/**
 * Shared preflight before either independent credential store is changed.
 * Uses the same pinned Core password policy as the clinical API.
 */
import { normalizeEmail, passwordMeetsPolicy } from "../vendor/lospor-core/src/account.ts"

process.stdin.setEncoding("utf8")
let input = ""
for await (const chunk of process.stdin) {
  input += chunk
  if (Buffer.byteLength(input) > 64 * 1024) throw new Error("CREDENTIAL_INPUT_TOO_LARGE")
}

let parsed
try {
  parsed = JSON.parse(input)
} catch {
  throw new Error("CREDENTIAL_INPUT_INVALID")
}

if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
  || typeof parsed.email !== "string" || typeof parsed.password !== "string") {
  throw new Error("CREDENTIAL_INPUT_INVALID")
}
const email = normalizeEmail(parsed.email)
if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("OPERATOR_EMAIL_INVALID")
}
if (parsed.password.length > 256 || !passwordMeetsPolicy(parsed.password)) {
  throw new Error("OPERATOR_PASSWORD_POLICY_FAILED")
}

process.stdout.write(`${JSON.stringify({ ...parsed, email })}\n`)
