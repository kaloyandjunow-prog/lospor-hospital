export type HospitalSupportConfiguration = {
  configured: boolean
  contactUrl: string | null
}

const UNCONFIGURED: HospitalSupportConfiguration = {
  configured: false,
  contactUrl: null,
}

const SUPPORT_MAILBOX = /^[A-Za-z0-9.!#%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

function safeSupportMailbox(address: string): boolean {
  const local = address.slice(0, address.lastIndexOf("@"))
  return address.length <= 320
    && SUPPORT_MAILBOX.test(address)
    && !local.startsWith(".")
    && !local.endsWith(".")
    && !local.includes("..")
}

export function hospitalSupportConfiguration(): HospitalSupportConfiguration {
  const configured = process.env.LOSPOR_SUPPORT_URL?.trim()
  if (!configured || configured.length > 2_048 || /[\s\\$]/.test(configured)) return UNCONFIGURED
  try {
    const parsed = new URL(configured)
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash) {
      return { configured: true, contactUrl: parsed.toString() }
    }
    if (parsed.protocol === "mailto:" && !parsed.hash) {
      const address = decodeURIComponent(parsed.pathname).trim()
      if (safeSupportMailbox(address)) {
        return { configured: true, contactUrl: `mailto:${address}` }
      }
    }
  } catch {
    return UNCONFIGURED
  }
  return UNCONFIGURED
}
