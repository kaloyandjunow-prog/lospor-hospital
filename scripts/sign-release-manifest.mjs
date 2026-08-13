import { readFile, writeFile } from "node:fs/promises"
import { publicKeyFingerprint, signManifest } from "./release-artifacts-lib.mjs"

const [manifestPath, privateKeyPath, signaturePath, publicKeyPath] = process.argv.slice(2)
if (!manifestPath || !privateKeyPath || !signaturePath) {
  throw new Error("Usage: node scripts/sign-release-manifest.mjs <release.lock> <private-key.pem> <signature> [public-key.pem]")
}
const [manifest, privateKey] = await Promise.all([readFile(manifestPath), readFile(privateKeyPath, "utf8")])
await writeFile(signaturePath, `${signManifest(manifest, privateKey)}\n`, { encoding: "utf8", flag: "wx", mode: 0o644 })
if (publicKeyPath) console.log(`Release public-key fingerprint: sha256:${publicKeyFingerprint(await readFile(publicKeyPath, "utf8"))}`)
console.log(`Release-lock signature written: ${signaturePath}`)
