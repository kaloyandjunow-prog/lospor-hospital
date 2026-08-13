import { execFileSync } from "node:child_process"
import { generateKeyPairSync } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const output = resolve(process.argv[2] ?? "secrets/api")
const siteCode = process.argv[3] ?? "LOSPOR-HOSPITAL"
const selfSigned = process.argv.includes("--self-signed")
mkdirSync(output, { recursive: true, mode: 0o700 })

const signingPrivate = join(output, "site-signing-private.pem")
const signingPublic = join(output, "site-signing-public.pem")
if (!existsSync(signingPrivate) || !existsSync(signingPublic)) {
  const keys = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  })
  writeFileSync(signingPrivate, keys.privateKey, { mode: 0o600 })
  writeFileSync(signingPublic, keys.publicKey, { mode: 0o644 })
}

const tlsKey = join(output, "site-client-key.pem")
const tlsCsr = join(output, "site-client.csr")
if (!existsSync(tlsKey) || !existsSync(tlsCsr)) {
  execFileSync("openssl", [
    "req", "-new", "-newkey", "rsa:3072", "-nodes",
    "-keyout", tlsKey,
    "-out", tlsCsr,
    "-subj", `/CN=${siteCode}`,
  ], { stdio: "inherit" })
}

if (selfSigned) {
  const tlsCert = join(output, "site-client-cert.pem")
  execFileSync("openssl", [
    "x509", "-req", "-in", tlsCsr, "-signkey", tlsKey,
    "-out", tlsCert, "-days", "30", "-sha256",
  ], { stdio: "inherit" })
}

console.log(`Hospital signing identity and TLS CSR are in ${output}`)
console.log("Have the Central operator sign site-client.csr with the trusted client CA.")
