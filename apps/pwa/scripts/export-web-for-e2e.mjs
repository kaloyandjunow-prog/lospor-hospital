#!/usr/bin/env node
// Build the PWA for an end-to-end run, pointed at the local API.
//
// EXPO_PUBLIC_* values are inlined at build time, so the API address is baked
// into the bundle rather than read when it runs. The dist left behind by an
// ordinary `npm run export:web` carries whatever was in .env.local — a LAN
// address like 192.168.0.105:3002 — and a suite run against it does not fail
// loudly: the app loads, every request goes to a host that is not there, and
// the tests look like the app is broken.
//
// So this is a script and not a note in a README. It also refuses to leave a
// dist that points anywhere other than where the tests will be listening.
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:3002"

execFileSync("npx", ["expo", "export", "--platform", "web", "--clear"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, EXPO_PUBLIC_API_BASE: apiBase },
})
execFileSync("node", ["scripts/patch-pwa.mjs"], {
  stdio: "inherit",
  shell: process.platform === "win32",
})

// Prove it, rather than trust it.
const bundleDir = join("dist", "_expo", "static", "js", "web")
const bundles = readdirSync(bundleDir).filter(name => name.endsWith(".js"))
const source = bundles.map(name => readFileSync(join(bundleDir, name), "utf8")).join("")

const found = [...new Set(source.match(/https?:\/\/[0-9a-zA-Z.\-]+:\d+/g) ?? [])]
  .filter(url => url.endsWith(":3002"))
if (!found.includes(apiBase)) {
  console.error(`\nThe exported bundle does not point at ${apiBase}.`)
  console.error(`API addresses found: ${found.join(", ") || "(none)"}`)
  process.exit(1)
}
const strays = found.filter(url => url !== apiBase)
if (strays.length) {
  console.error(`\nThe exported bundle also points at: ${strays.join(", ")}`)
  process.exit(1)
}
console.log(`\nPWA bundle built against ${apiBase}`)
