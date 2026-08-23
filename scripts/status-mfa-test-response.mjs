#!/usr/bin/env node
// Test-harness helper only: consume a Status enrollment page and emit the
// URL-encoded second-step body. It never prints the TOTP seed.
import { createHmac } from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function decodeBase32(value) {
  let bits = 0
  let accumulator = 0
  const output = []
  for (const character of value) {
    const index = ALPHABET.indexOf(character)
    if (index < 0) throw new Error("STATUS_MFA_TEST_PAGE_INVALID")
    accumulator = (accumulator << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      output.push((accumulator >>> bits) & 255)
    }
  }
  return Buffer.from(output)
}

function codeAt(secret, timeMs) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 30_000)))
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000).padStart(6, "0")
}

export function responseBodyFromEnrollmentPage(html, timeMs = Date.now()) {
  const challengeToken = html.match(/name="challengeToken" value="([^"]+)"/)?.[1]
  const secret = html.match(/<div class="secret">([A-Z2-7]+)<\/div>/)?.[1]
  if (!challengeToken || !secret) throw new Error("STATUS_MFA_TEST_PAGE_INVALID")
  return new URLSearchParams({ challengeToken, code: codeAt(secret, timeMs) }).toString()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const chunks = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    bytes += chunk.length
    if (bytes > 1_048_576) throw new Error("STATUS_MFA_TEST_PAGE_TOO_LARGE")
    chunks.push(chunk)
  }
  process.stdout.write(responseBodyFromEnrollmentPage(Buffer.concat(chunks).toString("utf8")))
}
