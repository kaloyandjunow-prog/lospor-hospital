import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const sourceRoots = ["src/app", "src/components"]
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"])
const allowedTechnicalText = new Set([
  "ASA",
  "LOINC",
  "SHA-256",
  "II, III",
  "I10",
  "LOSPOR",
  // Brand names, like LOSPOR above: the same in both locales, so translating
  // them is wrong rather than merely unnecessary. The sentence beside this
  // one on the legal pages ("A PeriOp Laboratories product") is translated.
  "PeriOp Laboratories",
])
const findings = []

function sourceFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(absolute)
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) return []
    return [absolute]
  })
}

function recordIfUntranslated(file, sourceFile, node, raw) {
  const text = raw.replace(/\s+/g, " ").trim()
  if (!/[A-Za-zА-Яа-я]{3}/.test(text) || allowedTechnicalText.has(text)) return
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  findings.push(`${file}:${position.line + 1}:${position.character + 1} ${JSON.stringify(text)}`)
}

for (const file of sourceRoots.flatMap(sourceFiles)) {
  const source = fs.readFileSync(file, "utf8")
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node) {
    if (ts.isJsxText(node)) {
      recordIfUntranslated(file, sourceFile, node, node.getText(sourceFile))
    } else if (
      ts.isJsxAttribute(node) &&
      visibleAttributes.has(node.name.getText(sourceFile)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      recordIfUntranslated(file, sourceFile, node, node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

if (findings.length) {
  console.error("Untranslated user-facing JSX text found:\n" + findings.join("\n"))
  process.exitCode = 1
} else {
  console.log("Browser i18n check passed: no raw user-facing JSX text was found.")
}

