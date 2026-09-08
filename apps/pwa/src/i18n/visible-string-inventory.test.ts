import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"
import { PEDIATRIC_PREOP_LABELS } from "@/components/preop/PediatricPreopSections"
import { CLINICAL_STRINGS } from "./clinical-strings"
import { EQUIPMENT_LABELS_BG, EQUIPMENT_NOTES_BG, EQUIPMENT_VALUES_BG } from "./equipment-strings"
import { STRINGS } from "./strings"

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }))
vi.mock("expo-haptics", () => ({}))

type Finding = { file: string; line: number; text: string }

const VISIBLE_STRING_ATTRIBUTES = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "headerTitle",
  "label",
  "placeholder",
  "prompt",
  "title",
])

// These are intentionally language-invariant: product/locale names, named
// scores and calculations, standard clinical abbreviations, routes, units and
// canonical display codes. Surrounding explanatory UI must still be localized.
const INTENTIONAL_LATIN_TOKENS = new Set([
  "ABW", "APAGBI", "ASA", "Apfel", "BIS", "BMI", "BG", "BP", "BSA",
  "C", "CO₂", "COLDS", "CVP", "DBP", "E", "ECG", "EEG", "EMG", "EN", "EtCO₂",
  "FGF", "Fi", "FiO2", "FiO₂", "Fr", "G", "HH", "HR", "IBW", "IM",
  "IV", "J", "L", "LOSPOR", "MAC", "MM", "McLaren", "NIRS", "NRS", "P10",
  "P5", "P50", "PO", "POVOC", "RCRI", "RR", "SBP", "SC", "SpO₂",
  "STOP-BANG", "TCI", "TIVA", "TOF", "Temp", "ULBT", "adrenaline", "bpm",
  "cm", "cmH₂O", "d", "g", "h", "hospital", "kg", "kPa", "lb", "m2", "mcg",
  "mg", "min", "mL", "ml", "mmHg", "mo", "org", "q", "you", "y",
])

const EXACT_INTENTIONAL_LITERALS = new Set([
  "BG · Български",
  "EN · English",
  "Mistral AI",
  "you@hospital.org",
])

function productionTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return productionTsxFiles(path)
    if (!entry.name.endsWith(".tsx") || /\.(?:test|spec)\.tsx$/.test(entry.name)) return []
    return [path]
  })
}

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function pushLiteral(findings: Finding[], source: ts.SourceFile, node: ts.Node, value: string) {
  const text = normalized(value)
  if (!/[A-Za-z]/.test(text)) return
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
  findings.push({
    file: relative(process.cwd(), source.fileName).replaceAll("\\", "/"),
    line: line + 1,
    text,
  })
}

function renderedExpressionLiterals(
  findings: Finding[],
  source: ts.SourceFile,
  expression: ts.Expression,
) {
  if (ts.isStringLiteralLike(expression)) {
    pushLiteral(findings, source, expression, expression.text)
    return
  }
  if (ts.isTemplateExpression(expression)) {
    pushLiteral(findings, source, expression.head, expression.head.text)
    for (const span of expression.templateSpans) {
      pushLiteral(findings, source, span.literal, span.literal.text)
    }
    return
  }
  if (ts.isConditionalExpression(expression)) {
    renderedExpressionLiterals(findings, source, expression.whenTrue)
    renderedExpressionLiterals(findings, source, expression.whenFalse)
    return
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    renderedExpressionLiterals(findings, source, expression.left)
    renderedExpressionLiterals(findings, source, expression.right)
    return
  }
  if (ts.isParenthesizedExpression(expression)) {
    renderedExpressionLiterals(findings, source, expression.expression)
  }
}

function visibleLiteralFindings(): Finding[] {
  const roots = [join(process.cwd(), "app"), join(process.cwd(), "src", "components")]
  const findings: Finding[] = []

  for (const file of roots.flatMap(productionTsxFiles)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        pushLiteral(findings, source, node, node.text)
      } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
        renderedExpressionLiterals(findings, source, node.expression)
      } else if (ts.isJsxAttribute(node) && VISIBLE_STRING_ATTRIBUTES.has(node.name.getText(source))) {
        if (node.initializer && ts.isStringLiteral(node.initializer)) {
          pushLiteral(findings, source, node.initializer, node.initializer.text)
        } else if (node.initializer && ts.isJsxExpression(node.initializer)
          && node.initializer.expression && ts.isStringLiteralLike(node.initializer.expression)) {
          pushLiteral(findings, source, node.initializer.expression, node.initializer.expression.text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  return findings
}

function isIntentionalLiteral(value: string): boolean {
  if (EXACT_INTENTIONAL_LITERALS.has(value)) return true
  const tokens = value.match(/[A-Za-z][A-Za-z0-9₂₃₄₅₆₇₈₉]*(?:[-–][A-Za-z0-9₂₃₄₅₆₇₈₉]+)*/g) ?? []
  return tokens.length > 0 && tokens.every(token => INTENTIONAL_LATIN_TOKENS.has(token))
}

describe("user-visible localization inventory", () => {
  it("contains no unclassified literal English UI in production JSX", () => {
    const unclassified = visibleLiteralFindings().filter(item => !isIntentionalLiteral(item.text))
    expect(unclassified, "Move these literals into EN/BG catalogs or classify a protected term explicitly").toEqual([])
  })

  it("keeps the pediatric screen's local EN/BG catalog structurally complete", () => {
    expect(Object.keys(PEDIATRIC_PREOP_LABELS.bg).sort()).toEqual(
      Object.keys(PEDIATRIC_PREOP_LABELS.en).sort(),
    )
    expect(Object.values(PEDIATRIC_PREOP_LABELS.bg).every(Boolean)).toBe(true)
  })

  it("preserves named pediatric scores while translating their surrounding copy", () => {
    expect(PEDIATRIC_PREOP_LABELS.bg.povoc).toBe("POVOC")
    expect(PEDIATRIC_PREOP_LABELS.bg.coldsScore).toContain("COLDS")
    expect(PEDIATRIC_PREOP_LABELS.bg.coldsScore).not.toBe(PEDIATRIC_PREOP_LABELS.en.coldsScore)
    expect(PEDIATRIC_PREOP_LABELS.bg.bsa).toBe("BSA (Mosteller)")
  })

  it("uses the clinician-approved Bulgarian surrounding copy without retired synonyms", () => {
    expect(CLINICAL_STRINGS.bg.difficultAirwayHx)
      .toBe("Анамнеза за труден дихателен път")
    expect(EQUIPMENT_LABELS_BG["ETT depth (lip)"])
      .toBe("Дълбочина на ЕТТ при устната комисура")
    expect(EQUIPMENT_NOTES_BG.cuffed).toBe("с маншет")
    expect(EQUIPMENT_LABELS_BG.Maintenance)
      .toBe("Поддържаща скорост на инфузия на течности")
    expect(PEDIATRIC_PREOP_LABELS.bg.maintenanceFluid)
      .toBe("Поддържаща скорост на инфузия на течности")

    const renderedCopy = JSON.stringify({
      base: STRINGS.bg,
      clinical: CLINICAL_STRINGS.bg,
      equipmentLabels: EQUIPMENT_LABELS_BG,
      equipmentNotes: EQUIPMENT_NOTES_BG,
      equipmentValues: EQUIPMENT_VALUES_BG,
      pediatric: PEDIATRIC_PREOP_LABELS.bg,
    })
    expect(renderedCopy).not.toMatch(/лекарств(?:о|а|ото|ата)/iu)
    expect(renderedCopy).not.toContain("История на труден дихателен път")
    expect(renderedCopy).not.toContain("с маншон")
    expect(renderedCopy).not.toContain("Поддържащи течности")
    expect(renderedCopy).not.toContain("Поддържаща инфузия")
  })

  it("keeps named scores, standard abbreviations, drugs, units, and codes unchanged", () => {
    for (const key of [
      "abwLabel",
      "aldreteScore",
      "asaPhysicalStatus",
      "bmiLabel",
      "ibwLabel",
      "ponvLabel",
      "spO2Label",
      "summaryASA",
      "summaryBMI",
      "summaryCL",
      "summaryIBW",
      "summaryMallampati",
      "summaryPONV",
      "summaryULBT",
    ] as const) {
      expect(CLINICAL_STRINGS.bg[key], key).toBe(CLINICAL_STRINGS.en[key])
    }
    expect(STRINGS.bg.aldreteLabel).toBe("Aldrete")

    const lockedTokensByKey = {
      apfelSection: ["Apfel"],
      apfelPONV: ["PONV"],
      emergencySuffix: ["ASA", "E"],
      eventToHDU: ["HDU"],
      eventToICU: ["ICU"],
      eventToPACU: ["PACU"],
      familyAnesthesiaHint: ["MH", "suxamethonium"],
      heightCm: ["cm"],
      hviAlertHR: ["HR", "bpm"],
      hviAlertResp: ["SpO₂", "RR", "/min"],
      hviDVT_LMWH: ["DVT", "LMWH"],
      hviECG: ["ECG"],
      hviFluidPlan: ["IV"],
      hviNPO: ["NPO"],
      hviPIV: ["IV"],
      hviPONVProtocol: ["PONV"],
      n2oFlow: ["N₂O", "L/min"],
      o2Flow: ["O₂", "L/min"],
      rcriCreatinine: ["µmol/L", "mg/dL"],
      stopbangBMI: ["BMI"],
      stopbangNeck: ["cm"],
      techniqueExample: ["ketamine"],
      weightKg: ["kg"],
    } as const
    for (const [key, tokens] of Object.entries(lockedTokensByKey)) {
      for (const token of tokens) {
        expect(CLINICAL_STRINGS.bg[key as keyof typeof CLINICAL_STRINGS.bg], `${key}: ${token}`)
          .toContain(token)
      }
    }

    const bulgarian = JSON.stringify({ STRINGS: STRINGS.bg, CLINICAL_STRINGS: CLINICAL_STRINGS.bg })
    expect(bulgarian).not.toMatch(/ПОПМ|\bАСА\b|\bТМИ\b|\bИТТ\b|\bКТТ\b|Малампати|Кормак-Лехан|Алдрете|Апфел/)
  })

  it("uses ИИ for Bulgarian generic AI copy and preserves the Mistral AI provider brand", () => {
    const bulgarian = JSON.stringify({
      base: STRINGS.bg,
      clinical: CLINICAL_STRINGS.bg,
      pediatric: PEDIATRIC_PREOP_LABELS.bg,
    })
    expect(bulgarian).toContain("Mistral AI")
    expect(bulgarian.replaceAll("Mistral AI", "")).not.toMatch(/\bAI\b/)
  })

  it("does not describe required institution selection as optional", () => {
    const localized = JSON.stringify({ STRINGS, CLINICAL_STRINGS }).toLocaleLowerCase("bg")
    for (const falseClaim of [
      "institution selection is optional",
      "institution is optional",
      "optional institution",
      "изборът на институция е незадължителен",
      "институцията не е задължителна",
      "институция по желание",
    ]) {
      expect(localized).not.toContain(falseClaim)
    }
  })
})
