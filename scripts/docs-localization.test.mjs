import assert from "node:assert/strict"
import { access, readdir, readFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "..")
const docsDirectory = join(root, "docs")

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function bulgarianCounterpart(path) {
  return path.endsWith("README.md")
    ? path.slice(0, -"README.md".length) + "README.bg.md"
    : path.slice(0, -".md".length) + ".bg.md"
}

async function documentationPairs() {
  const docNames = (await readdir(docsDirectory))
    .filter((name) => name.endsWith(".md") && !name.endsWith(".bg.md"))
    .sort()
  const pairs = docNames.map((name) => {
    const english = join(docsDirectory, name)
    return { english, bulgarian: bulgarianCounterpart(english) }
  })

  const appNames = (await readdir(join(root, "apps"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  for (const appName of appNames) {
    const english = join(root, "apps", appName, "README.md")
    if (await exists(english)) {
      pairs.push({ english, bulgarian: bulgarianCounterpart(english) })
    }
  }

  return pairs
}

function proseOnly(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\r\n]+`/g, "")
}

test("every operator-facing English guide has a Bulgarian counterpart and reciprocal language links", async () => {
  const pairs = await documentationPairs()
  assert.ok(pairs.length > 0)

  for (const { english, bulgarian } of pairs) {
    assert.equal(await exists(bulgarian), true, `missing ${relative(root, bulgarian)}`)
    const [englishText, bulgarianText] = await Promise.all([
      readFile(english, "utf8"),
      readFile(bulgarian, "utf8"),
    ])
    assert.match(bulgarianText, /[А-Яа-я]/, `${relative(root, bulgarian)} has no Bulgarian text`)
    assert.ok(
      bulgarianText.length >= englishText.length * 0.35,
      `${relative(root, bulgarian)} is unexpectedly shorter than its English source`,
    )
    const bulgarianName = relative(dirname(english), bulgarian).replaceAll("\\", "/")
    const englishName = relative(dirname(bulgarian), english).replaceAll("\\", "/")
    assert.match(englishText, new RegExp(`\\[Български\\]\\(${bulgarianName.replaceAll(".", "\\.")}\\)`))
    assert.match(bulgarianText, new RegExp(`\\[English\\]\\(${englishName.replaceAll(".", "\\.")}\\)`))
  }
})

test("translated guides have balanced fenced code blocks", async () => {
  const pairs = await documentationPairs()
  for (const { bulgarian } of pairs) {
    const text = await readFile(bulgarian, "utf8")
    const fences = text.match(/^```/gm) ?? []
    assert.equal(
      fences.length % 2,
      0,
      `${relative(root, bulgarian)} has an unclosed fenced code block`,
    )
  }
})

test("new terminology and host-observability guides keep ordinary English out of Bulgarian prose", async () => {
  const forbiddenEnglish = /\b(?:manifest|private|destructive|readiness|public|fallback|fingerprint|health|migration|initializer|exit|hostname|units|timers|appliance|operator|self-signed|browser|environment|variable|shell|manager|worker|backup)\b/i
  for (const name of ["terminology-import.bg.md", "host-observability.bg.md"]) {
    const text = proseOnly(await readFile(join(docsDirectory, name), "utf8"))
    assert.doesNotMatch(text, forbiddenEnglish, `${name} contains ordinary untranslated English prose`)
  }
})

test("local Markdown links resolve and Bulgarian guides prefer available Bulgarian targets", async () => {
  const pairs = await documentationPairs()
  const files = pairs.flatMap(({ english, bulgarian }) => [english, bulgarian])
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g

  for (const file of files) {
    const text = await readFile(file, "utf8")
    for (const match of text.matchAll(linkPattern)) {
      const [, label, rawTarget] = match
      if (/^(?:https?:|mailto:|#)/.test(rawTarget)) continue
      const targetWithoutAnchor = rawTarget.split("#", 1)[0]
      if (!targetWithoutAnchor) continue
      const target = resolve(dirname(file), decodeURIComponent(targetWithoutAnchor))
      assert.equal(
        await exists(target),
        true,
        `${relative(root, file)} links to missing ${rawTarget}`,
      )

      if (!file.endsWith(".bg.md") || target.endsWith(".bg.md") || label === "English") continue
      const counterpart = bulgarianCounterpart(target)
      assert.equal(
        await exists(counterpart),
        false,
        `${relative(root, file)} should link to ${relative(root, counterpart)} instead of ${rawTarget}`,
      )
    }
  }
})
