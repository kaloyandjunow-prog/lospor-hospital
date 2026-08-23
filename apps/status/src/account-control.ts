import { isRecord, safeJsonParse } from "./util.js"

export type AccountAccessProfile =
  | "CLINICAL_MEMBER"
  | "CLINICAL_HOD"
  | "RESEARCH_ONLY"

export type ClinicalAccountRole = "MEMBER" | "HEAD_OF_DEPT" | "ADMIN"

export type AccountCreateRequest = {
  username: string
  email: string | null
  firstName: string
  lastName: string
  title: string
  institutionId: string
  accessProfile: AccountAccessProfile
  locale: "bg" | "en"
}

export type ManagedAccount = {
  id: string
  username: string
  email: string | null
  name: string
  role: ClinicalAccountRole | "RESEARCHER"
  accountKind: "CLINICAL" | "RESEARCH_ONLY"
  locale: "bg" | "en"
  institutionId: string | null
  institutionName: string | null
  state: "PENDING_ACTIVATION" | "ACTIVE" | "DELETED"
  designatedApplianceOperator: boolean
  activeActivationExpiresAt: string | null
  activeRecoveryExpiresAt: string | null
  createdAt: string
}

export type ManagedInstitution = {
  id: string
  name: string
  city: string
  canHaveHeadOfDepartment: boolean
}

export type AccountDirectory = {
  accounts: ManagedAccount[]
  institutions: ManagedInstitution[]
}

export type OneTimeAccountLink = {
  purpose: "ACTIVATION" | "RECOVERY"
  url: string
  expiresAt: string
}

export type CreatedAccount = {
  account: {
    id: string
    username: string
    email: string | null
    name: string
    role: string
    accountKind: "CLINICAL" | "RESEARCH_ONLY"
    institutionId: string | null
    institutionName: string
  }
  oneTimeLink: OneTimeAccountLink
}

export type AccountRoleChange = {
  account: { id: string; role: ClinicalAccountRole }
  previousRole: ClinicalAccountRole
  changed: boolean
  invalidatedLinks: number
}

export type AccountUsernameChange = {
  account: { id: string; username: string }
  oneTimeLink: OneTimeAccountLink
}

export interface AccountControlPort {
  list(): Promise<AccountDirectory>
  create(input: AccountCreateRequest): Promise<CreatedAccount>
  reissueActivation(userId: string): Promise<OneTimeAccountLink>
  issueRecovery(userId: string): Promise<OneTimeAccountLink>
  changeRole(userId: string, role: ClinicalAccountRole, reason: string): Promise<AccountRoleChange>
  changeUsername(userId: string, username: string, reason: string): Promise<AccountUsernameChange>
}

export class AccountControlError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = "AccountControlError"
  }
}

type Fetch = typeof globalThis.fetch

const string = (value: unknown, maximum = 512): value is string =>
  typeof value === "string" && value.length <= maximum

function iso(value: unknown): value is string {
  return string(value, 64) && Number.isFinite(Date.parse(value))
}

function nullableIso(value: unknown): value is string | null {
  return value === null || iso(value)
}

function parseLink(value: unknown): OneTimeAccountLink | null {
  if (!isRecord(value)
    || (value.purpose !== "ACTIVATION" && value.purpose !== "RECOVERY")
    || !string(value.url, 4096)
    || !iso(value.expiresAt)) return null
  try {
    const url = new URL(value.url)
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""))
    const token = fragment.get("hospitalToken")
    // The secret must be in the fragment, never the query string.
    if (!token || token.length < 32 || url.search) return null
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
  } catch {
    return null
  }
  return { purpose: value.purpose, url: value.url, expiresAt: value.expiresAt }
}

function parseDirectory(value: unknown): AccountDirectory | null {
  if (!isRecord(value) || !Array.isArray(value.accounts) || !Array.isArray(value.institutions)) {
    return null
  }
  const accounts: ManagedAccount[] = []
  for (const item of value.accounts) {
    if (!isRecord(item)
      || !string(item.id)
      || !string(item.username, 64)
      || !/^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(item.username)
      || (item.email !== null && !string(item.email, 254))
      || !string(item.name)
      || !["MEMBER", "HEAD_OF_DEPT", "ADMIN", "RESEARCHER"].includes(String(item.role))
      || (item.accountKind !== "CLINICAL" && item.accountKind !== "RESEARCH_ONLY")
      || (item.locale !== "bg" && item.locale !== "en")
      || (item.institutionId !== null && !string(item.institutionId))
      || (item.institutionName !== null && !string(item.institutionName))
      || !["PENDING_ACTIVATION", "ACTIVE", "DELETED"].includes(String(item.state))
      || typeof item.designatedApplianceOperator !== "boolean"
      || !nullableIso(item.activeActivationExpiresAt)
      || !nullableIso(item.activeRecoveryExpiresAt)
      || !iso(item.createdAt)) return null
    accounts.push(item as ManagedAccount)
  }
  const institutions: ManagedInstitution[] = []
  for (const item of value.institutions) {
    if (!isRecord(item)
      || !string(item.id)
      || !string(item.name)
      || !string(item.city)
      || typeof item.canHaveHeadOfDepartment !== "boolean") return null
    institutions.push(item as ManagedInstitution)
  }
  return { accounts, institutions }
}

function parseCreated(value: unknown): CreatedAccount | null {
  if (!isRecord(value) || !isRecord(value.account)) return null
  const account = value.account
  const oneTimeLink = parseLink(value.oneTimeLink)
  if (!oneTimeLink
    || !string(account.id)
    || !string(account.username, 64)
    || !/^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(account.username)
    || (account.email !== null && !string(account.email, 254))
    || !string(account.name)
    || !string(account.role, 64)
    || (account.accountKind !== "CLINICAL" && account.accountKind !== "RESEARCH_ONLY")
    || (account.institutionId !== null && !string(account.institutionId))
    || !string(account.institutionName)) return null
  return { account: account as CreatedAccount["account"], oneTimeLink }
}

function parseRoleChange(value: unknown): AccountRoleChange | null {
  if (!isRecord(value) || !isRecord(value.account)
    || !string(value.account.id)
    || !["MEMBER", "HEAD_OF_DEPT", "ADMIN"].includes(String(value.account.role))
    || !["MEMBER", "HEAD_OF_DEPT", "ADMIN"].includes(String(value.previousRole))
    || typeof value.changed !== "boolean"
    || !Number.isInteger(value.invalidatedLinks)
    || Number(value.invalidatedLinks) < 0) return null
  return value as unknown as AccountRoleChange
}

function parseUsernameChange(value: unknown): AccountUsernameChange | null {
  if (!isRecord(value) || !isRecord(value.account)
    || !string(value.account.id)
    || !string(value.account.username, 64)
    || !/^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(value.account.username)) return null
  const oneTimeLink = parseLink(value.oneTimeLink)
  return oneTimeLink
    ? { account: value.account as AccountUsernameChange["account"], oneTimeLink }
    : null
}

export class AccountControlClient implements AccountControlPort {
  private readonly baseUrl: string | null

  constructor(
    url: string | null,
    private readonly bearer: string | null,
    private readonly timeoutMs: number,
    private readonly fetchImpl: Fetch = globalThis.fetch,
  ) {
    this.baseUrl = url?.replace(/\/$/, "") ?? null
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.baseUrl || !this.bearer) throw new AccountControlError("ACCOUNT_CONTROL_NOT_CONFIGURED")
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.bearer}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new AccountControlError("ACCOUNT_CONTROL_UNAVAILABLE")
    }
    const text = await response.text()
    if (Buffer.byteLength(text, "utf8") > 1_048_576) {
      throw new AccountControlError("ACCOUNT_CONTROL_INVALID_RESPONSE")
    }
    const value = safeJsonParse(text)
    if (!response.ok) {
      const code = isRecord(value) && string(value.code, 96) && /^[A-Z0-9_]+$/.test(value.code)
        ? value.code
        : "ACCOUNT_CONTROL_FAILED"
      throw new AccountControlError(code)
    }
    return value
  }

  async list(): Promise<AccountDirectory> {
    const value = await this.request("")
    const parsed = parseDirectory(value)
    if (!parsed) throw new AccountControlError("ACCOUNT_CONTROL_INVALID_RESPONSE")
    return parsed
  }

  async create(input: AccountCreateRequest): Promise<CreatedAccount> {
    const value = await this.request("", { method: "POST", body: JSON.stringify(input) })
    const parsed = parseCreated(value)
    if (!parsed) throw new AccountControlError("ACCOUNT_CONTROL_INVALID_RESPONSE")
    return parsed
  }

  private async link(path: string): Promise<OneTimeAccountLink> {
    const value = await this.request(path, { method: "POST", body: "{}" })
    const parsed = isRecord(value) ? parseLink(value.oneTimeLink) : null
    if (!parsed) throw new AccountControlError("ACCOUNT_CONTROL_INVALID_RESPONSE")
    return parsed
  }

  reissueActivation(userId: string): Promise<OneTimeAccountLink> {
    return this.link(`/${encodeURIComponent(userId)}/activation`)
  }

  issueRecovery(userId: string): Promise<OneTimeAccountLink> {
    return this.link(`/${encodeURIComponent(userId)}/recovery`)
  }

  async changeRole(
    userId: string,
    role: ClinicalAccountRole,
    reason: string,
  ): Promise<AccountRoleChange> {
    const value = await this.request(`/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role, reason }),
    })
    const parsed = parseRoleChange(value)
    if (!parsed) throw new AccountControlError("ACCOUNT_CONTROL_INVALID_RESPONSE")
    return parsed
  }

  async changeUsername(
    userId: string,
    username: string,
    reason: string,
  ): Promise<AccountUsernameChange> {
    const value = await this.request(`/${encodeURIComponent(userId)}/username`, {
      method: "PATCH",
      body: JSON.stringify({ username, reason }),
    })
    const parsed = parseUsernameChange(value)
    if (!parsed) throw new AccountControlError("ACCOUNT_CONTROL_INVALID_RESPONSE")
    return parsed
  }
}
