import { formatMessage } from "@/i18n/locale"
import type { TranslationKey } from "./preferences-context"

export type PrivacySafeDiagnosticFacts = {
  generatedAt: string
  appVersion: string
  clientVersion: string
  platform: string
  language: "bg" | "en"
  apiMode: "same-origin" | "configured-native-origin"
  lastSuccessfulRequest: string | null
  lastRequestError: string | null
  queuedSaves: number
  droppedEvents: number
  timingSamples: number
}

type Translate = (key: TranslationKey) => string

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function safeTimestamp(value: string | null, none: string): string {
  if (!value) return none
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? none : parsed.toISOString()
}

function safeRequestError(value: string | null, t: Translate): string {
  if (!value) return t("diagnosticNone")
  const status = /^(\d{3})\b/.exec(value)?.[1]
  if (status) return formatMessage(t("diagnosticHttpError"), { status })
  return t("diagnosticNetworkError")
}

export function buildPrivacySafeDiagnosticReport(
  facts: PrivacySafeDiagnosticFacts,
  t: Translate,
): string {
  const none = t("diagnosticNone")
  return [
    t("diagnosticReportHeading"),
    `${t("diagnosticSchemaLabel")}: 1`,
    `${t("diagnosticGeneratedLabel")}: ${safeTimestamp(facts.generatedAt, none)}`,
    `${t("diagnosticAppVersionLabel")}: ${facts.appVersion || "?"}`,
    `${t("diagnosticClientVersionLabel")}: ${facts.clientVersion || "?"}`,
    `${t("diagnosticPlatformLabel")}: ${facts.platform || "?"}`,
    `${t("diagnosticLanguageLabel")}: ${facts.language}`,
    `${t("diagnosticApiModeLabel")}: ${facts.apiMode === "same-origin" ? t("diagnosticSameOrigin") : t("diagnosticConfiguredOrigin")}`,
    `${t("diagnosticLastSuccessLabel")}: ${safeTimestamp(facts.lastSuccessfulRequest, none)}`,
    `${t("diagnosticLastErrorLabel")}: ${safeRequestError(facts.lastRequestError, t)}`,
    `${t("diagnosticQueuedSavesLabel")}: ${safeCount(facts.queuedSaves)}`,
    `${t("diagnosticDroppedEventsLabel")}: ${safeCount(facts.droppedEvents)}`,
    `${t("diagnosticTimingSamplesLabel")}: ${safeCount(facts.timingSamples)}`,
    "",
    t("diagnosticPrivacyFooter"),
  ].join("\n")
}
