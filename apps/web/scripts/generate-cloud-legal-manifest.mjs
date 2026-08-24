#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const DEPLOYMENT = "CLOUD_DEMO"
const VERSION = "4.0"
const EFFECTIVE_DATE = "2026-07-03"

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

const documents = []
for (const locale of ["bg", "en"]) {
  const messages = JSON.parse(await readFile(
    resolve(process.cwd(), `messages/${locale}.json`),
    "utf8",
  ))
  for (const kind of ["TERMS", "PRIVACY"]) {
    const content = JSON.stringify(messages.legal[kind.toLowerCase()])
    documents.push({
      deployment: DEPLOYMENT,
      kind,
      version: VERSION,
      effectiveDate: EFFECTIVE_DATE,
      locale,
      content,
      contentSha256: sha256(content),
    })
  }
}

process.stdout.write(`${JSON.stringify({ deployment: DEPLOYMENT, documents })}\n`)
