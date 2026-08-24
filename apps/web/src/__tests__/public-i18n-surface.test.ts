import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const PUBLIC_SURFACES = [
  "src/app/(auth)",
  "src/app/offline",
  "src/app/not-found.tsx",
  "src/app/error.tsx",
  "src/components/auth",
  "src/components/legal",
  "src/components/LanguageSwitcher.tsx",
  "src/components/SignOutButton.tsx",
  "src/components/OnboardingModal.tsx",
]
const VISIBLE_ATTRIBUTES = new Set(["placeholder", "title", "aria-label"])

function filesAt(value: string): string[] {
  const full = path.resolve(value)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [full]
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(full, entry.name)
    if (entry.isDirectory()) return filesAt(child)
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [child] : []
  })
}

function humanText(value: string) {
  const text = value.replace(/\s+/g, " ").trim()
  return text.length > 1 && /[A-Za-z\u0400-\u04ff]/.test(text) ? text : undefined
}

function rawPublicCopy(file: string) {
  const source = fs.readFileSync(file, "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings: string[] = []

  function add(node: ts.Node, value: string) {
    const text = humanText(value)
    if (!text) return
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
    findings.push(`${path.relative(process.cwd(), file)}:${line} ${text}`)
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) add(node, node.text)
    if (
      ts.isJsxAttribute(node)
      && VISIBLE_ATTRIBUTES.has(node.name.getText(ast))
      && node.initializer
      && ts.isStringLiteral(node.initializer)
    ) add(node, node.initializer.text)
    if (
      ts.isJsxExpression(node)
      && node.expression
      && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) add(node, node.expression.text)
    ts.forEachChild(node, visit)
  }

  visit(ast)
  return findings
}

describe("public localization surface", () => {
  it("contains no unkeyed visible copy", () => {
    const findings = PUBLIC_SURFACES.flatMap(filesAt).flatMap(rawPublicCopy)
    expect(findings).toEqual([])
  })
})

