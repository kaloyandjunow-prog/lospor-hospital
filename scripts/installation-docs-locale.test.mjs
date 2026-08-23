import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const docs = new URL("../docs/", import.meta.url)
const [english, bulgarian] = await Promise.all([
  readFile(new URL("installation.md", docs), "utf8"),
  readFile(new URL("installation.bg.md", docs), "utf8"),
])

const codeBlocks = source => [...source.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
  .map(match => match[1].replaceAll("\r\n", "\n"))
const inlineCode = source => new Set([...source.matchAll(/`([^`\n]+)`/g)].map(match => match[1]))
const headings = source => [...source.matchAll(/^##+ /gm)]

test("the installation guides link to each other", () => {
  assert.match(english, /\[Български\]\(installation\.bg\.md\)/)
  assert.match(bulgarian, /\[English\]\(installation\.md\)/)
})

test("the Bulgarian guide preserves every executable code block exactly", () => {
  assert.deepEqual(codeBlocks(bulgarian), codeBlocks(english))
})

test("the Bulgarian guide preserves every inline technical token", () => {
  const translatedTokens = inlineCode(bulgarian)
  for (const token of inlineCode(english)) {
    assert.ok(translatedTokens.has(token), `missing technical token: ${token}`)
  }
})

test("the Bulgarian guide covers the complete English section structure", () => {
  assert.equal(headings(bulgarian).length, headings(english).length)
  assert.ok((bulgarian.match(/[А-Яа-я]/g) ?? []).length > 1_000)
  assert.doesNotMatch(bulgarian, /Hospital 1\.0\.0/)
})
