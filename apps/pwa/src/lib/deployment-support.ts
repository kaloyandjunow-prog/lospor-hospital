import { apiFetch } from "./api"

export type DeploymentSupport = {
  configured: boolean
  contactUrl: string | null
}

export const NO_DEPLOYMENT_SUPPORT: DeploymentSupport = {
  configured: false,
  contactUrl: null,
}

const SUPPORT_MAILBOX = /^[A-Za-z0-9.!#%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

function safeMailbox(address: string): boolean {
  const local = address.slice(0, address.lastIndexOf("@"))
  return address.length <= 320
    && SUPPORT_MAILBOX.test(address)
    && !local.startsWith(".")
    && !local.endsWith(".")
    && !local.includes("..")
}

function safeSupportUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2_048 || /[\s\\$]/.test(value)) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash) {
      return parsed.toString()
    }
    if (parsed.protocol === "mailto:" && !parsed.hash) {
      const address = decodeURIComponent(parsed.pathname).trim()
      if (safeMailbox(address)) {
        return `mailto:${address}`
      }
    }
  } catch {
    return null
  }
  return null
}

export function parseDeploymentSupport(value: unknown): DeploymentSupport {
  if (!value || typeof value !== "object") return NO_DEPLOYMENT_SUPPORT
  const support = (value as { support?: unknown }).support
  if (!support || typeof support !== "object") return NO_DEPLOYMENT_SUPPORT
  const candidate = support as { configured?: unknown; contactUrl?: unknown }
  const contactUrl = safeSupportUrl(candidate.contactUrl)
  return candidate.configured === true && contactUrl
    ? { configured: true, contactUrl }
    : NO_DEPLOYMENT_SUPPORT
}

export async function loadDeploymentSupport(): Promise<DeploymentSupport> {
  try {
    const response = await apiFetch("/api/capabilities", { method: "GET" })
    if (!response.ok) return NO_DEPLOYMENT_SUPPORT
    return parseDeploymentSupport(await response.json().catch(() => null))
  } catch {
    return NO_DEPLOYMENT_SUPPORT
  }
}

export function supportContactUrlWithReport(
  contactUrl: string,
  report: string,
  subject: string,
): string {
  const safe = safeSupportUrl(contactUrl)
  if (!safe) throw new Error("UNSAFE_SUPPORT_URL")
  if (!safe.startsWith("mailto:")) return safe
  return `${safe}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(report)}`
}
