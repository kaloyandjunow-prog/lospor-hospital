import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const ROOT = path.resolve("src")
const ATTRIBUTE_NAMES = new Set(["placeholder", "title", "aria-label"])
const CALL_NAMES = new Set(["alert", "confirm", "error", "info", "prompt", "success", "warning"])
const INTENTIONAL_CONTROLLED_TOKENS = new Set([
  "AGPL-3.0",
  "LOSPOR",
  "Rh",
  "cm /",
  "kg",
  "BMI",
  "IBW",
  "ASA",
  "(ML)",
  "min ·",
  "TBW / kg",
  "BSA / m2",
  "Pediatric 4/2/1",
  "TBW",
  "ABW",
  "Mallampati",
  "kg/m²",
  "mg)",
  "0 mL",
  "HH",
  "MM",
  "Fi",
  "+ N2O",
  "FiN2O",
  "inhalational",
  "mL/h",
  "mL",
  "FGF",
  "L/min · FiO2",
  "L/min",
  "FiO2",
  "/kg ×",
  "BP",
  "HR",
  "SpO2",
  "EtCO2",
])

function sourceFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "__tests__") sourceFiles(full, output)
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      output.push(full)
    }
  }
  return output
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim()
}

function looksUserFacing(value) {
  const text = normalize(value)
  return text.length > 1 && /[A-Za-z\u0400-\u04ff]/.test(text)
}

function callName(expression) {
  if (
    ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && (expression.expression.text === "toast" || expression.expression.text === "window")
  ) return expression.name.text
  return ""
}

function isStyleExpression(node) {
  const parent = node.parent
  if (!parent || !ts.isJsxElement(parent)) return false
  return parent.openingElement.tagName.getText() === "style"
}

function findingsFor(file) {
  const source = fs.readFileSync(file, "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings = []

  function add(node, kind, raw) {
    const text = normalize(raw)
    if (!looksUserFacing(text)) return
    const location = ast.getLineAndCharacterOfPosition(node.getStart(ast))
    findings.push({
      file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
      line: location.line + 1,
      kind,
      text,
    })
  }

  function visit(node) {
    if (ts.isJsxText(node)) add(node, "JSX text", node.text)

    if (
      ts.isJsxAttribute(node)
      && ATTRIBUTE_NAMES.has(node.name.getText(ast))
      && node.initializer
      && ts.isStringLiteral(node.initializer)
    ) {
      add(node, `${node.name.getText(ast)} attribute`, node.initializer.text)
    }

    if (
      ts.isJsxExpression(node)
      && node.expression
      && !isStyleExpression(node)
      && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) {
      add(node, "JSX expression", node.expression.text)
    }

    if (ts.isCallExpression(node) && CALL_NAMES.has(callName(node.expression))) {
      const first = node.arguments[0]
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        add(first, `${callName(node.expression)}() message`, first.text)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(ast)
  return findings
}

const findings = sourceFiles(ROOT).flatMap(findingsFor)
const unresolved = findings.filter(finding => !INTENTIONAL_CONTROLLED_TOKENS.has(finding.text))
const intentional = findings.filter(finding => INTENTIONAL_CONTROLLED_TOKENS.has(finding.text))
const byFile = new Map()
for (const finding of findings) {
  const current = byFile.get(finding.file) ?? []
  current.push(finding)
  byFile.set(finding.file, current)
}

console.log("# Untranslated Web UI candidate inventory")
console.log("")
console.log(`Unresolved interface strings: ${unresolved.length}. Intentional controlled tokens: ${intentional.length} across ${byFile.size} files.`)
console.log("")
console.log("The allowlist is intentionally narrow: product/license names, units, abbreviations, named scores, named clinical calculations and controlled clinical terms remain unchanged. Every other candidate must be localized.")
console.log("")
console.log("| Source | Kind | Candidate | Disposition |")
console.log("| --- | --- | --- | --- |")
for (const finding of findings) {
  const text = finding.text.replaceAll("|", "\\|").replaceAll("\n", " ")
  const disposition = INTENTIONAL_CONTROLLED_TOKENS.has(finding.text)
    ? "Intentional controlled token"
    : "LOCALIZE"
  console.log(`| \`${finding.file}:${finding.line}\` | ${finding.kind} | ${text} | ${disposition} |`)
}

if (unresolved.length > 0) process.exitCode = 1
