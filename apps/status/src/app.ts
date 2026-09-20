import { randomBytes } from "node:crypto"
import { Hono, type Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { AuthService } from "./auth.js"
import { AuthError } from "./auth.js"
import type { StatusConfig } from "./config.js"
import type { StatusDatabase } from "./db.js"
import { parseSafeOperationalEvent } from "./event-contract.js"
import { localize, parseStatusLocale, statusLocale, type StatusLocale } from "./locale.js"
import {
  readAgentInstallationSignal,
  readAgentSignal,
  readTerminologyAgentSignal,
  readTerminologyPackagesSignal,
  readUpdateSignal,
} from "./signals.js"
import type { MaintenanceView, ReleaseView } from "./ui.js"
import {
  STATUS_NAV,
  renderAccounts,
  renderApplyConfirm,
  renderDashboard,
  renderLogin,
  renderMfaLogin,
  renderMfaRecoveryCodes,
  renderOneTimeAccountLink,
  renderStatusAdminCredentialSetup,
  renderStatusAdminCredentialSuccess,
  renderStatusAdminOneTimeLink,
  renderControlPlane,
  renderGoLive,
  renderEscrowPassphrase,
  renderMaintenance,
  renderSettingsConfirm,
  renderAdvancedConfirm,
  renderRelease,
  renderTerminology,
} from "./ui.js"
import { evaluateGoLive, isGoLiveSignoffItem } from "./go-live.js"
import { attentionItems } from "./attention.js"
import { readHostOsSignal } from "./host-os.js"
import { readReleaseDossier } from "./release-dossier.js"
import {
  ADVANCED_SETTINGS,
  EDITABLE_SETTINGS,
  advancedDisplayValue,
  buildAdvancedProposal,
  buildSettingsProposal,
  cidrListContains,
  networkListsState,
  buildOffhostProposal,
  offhostDestinationFromForm,
  readMaintenanceAgentSignal,
  readOffhostSignal,
  readSiteConfigSignal,
  readSupportBundle,
  generateEscrowPassphrase,
  readSecretsEscrowBundle,
  readSecretsEscrowOffer,
  validSettingValue,
} from "./maintenance.js"
import {
  mintConfirmation,
  newRequestId,
  requestFetch,
  submitRequest,
  submitTerminologyRequest,
  submitMaintenanceRequest,
  verifyConfirmation,
} from "./update-requests.js"
import { constantTimeEqual, isRecord, safeJsonParse, sha256 } from "./util.js"
import {
  AccountControlClient,
  AccountControlError,
  type AccountControlPort,
  type AccountCreateRequest,
  type AccountAccessProfile,
  type ClinicalAccountRole,
} from "./account-control.js"
import { accountLinkQrSvg } from "./account-qr.js"
import {
  ControlPlaneClient,
  ControlPlaneClientError,
  EHR_CODE_LIST_ANSWERS,
  type ControlPlanePort,
  type EhrCodeListAnswer,
  type ResearchGrantInput,
} from "./control-plane.js"

// Deliberately vague about the hours, and deliberately not read from
// configuration here. The maintenance window is the agent's to enforce; if
// Status held the values it could describe a window it does not control, and a
// page that names the wrong time is worse than one that names none. When a
// request is actually queued the agent reports the exact time, and that is what
// the page shows.
function windowDescription(locale: StatusLocale): string {
  return localize(
    locale,
    "Unless you choose to apply it immediately, this will be applied during the overnight maintenance window, when no list is running.",
    "Ако не изберете незабавно прилагане, обновяването ще бъде приложено през нощния прозорец за поддръжка, когато не се извършва оперативна дейност.",
  )
}

const COOKIE_NAME = "lospor_status_session"
const LOCALE_COOKIE_NAME = "lospor_status_locale"
const NO_STORE = "private, no-store, max-age=0"
const STATUS_ADMIN_FRAGMENT_SCRIPT = `(() => {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const token = new URLSearchParams(fragment).get("statusAdminToken");
  const input = document.querySelector('input[name="token"]');
  if (token && input instanceof HTMLInputElement) input.value = token;
  for (const link of document.querySelectorAll("a.fragment-language")) {
    if (link instanceof HTMLAnchorElement && location.hash) link.href += location.hash;
  }
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
})();`
// Derived from the navigation registry rather than maintained beside it: a
// sixth destination added there would otherwise silently lose its language
// switch. /status/login is not navigation, so it is listed on its own.
const LOCALE_RETURN_PATHS = new Set<string>([
  ...STATUS_NAV.map(entry => entry.path),
  "/status/login",
])

type AppDependencies = {
  db: StatusDatabase
  auth: AuthService
  config: StatusConfig
  accountControl?: AccountControlPort
  controlPlane?: ControlPlanePort
  now?: () => number
}

function accountControlMessage(code: string, locale: StatusLocale): string {
  const messages: Record<string, [string, string]> = {
    ACCOUNT_CONTROL_NOT_CONFIGURED: [
      "Account controls have not been configured on this appliance.",
      "Управлението на профили не е настроено в тази система.",
    ],
    ACCOUNT_CONTROL_UNAVAILABLE: [
      "The clinical API cannot currently perform account controls.",
      "Клиничният API в момента не може да управлява профили.",
    ],
    ACCOUNT_CONTROL_INVALID_RESPONSE: [
      "The account service returned an invalid response. Nothing was changed.",
      "Услугата за профили върна невалиден отговор. Нищо не е променено.",
    ],
    INVALID_REQUEST: ["Check the entered account details.", "Проверете въведените данни за профила."],
    USERNAME_ALREADY_REGISTERED: ["That username is already in use.", "Това потребителско име вече се използва."],
    EMAIL_ALREADY_REGISTERED: ["That email already has an account.", "За този имейл вече има профил."],
    INSTITUTION_NOT_FOUND: ["The selected institution no longer exists.", "Избраното лечебно заведение вече не съществува."],
    INSTITUTION_CANNOT_HAVE_HOD: [
      "The selected entry is not a department and cannot have a head of department.",
      "Избраният запис не е отделение и не може да има началник на отделение.",
    ],
    ACCOUNT_NOT_FOUND: ["The account no longer exists.", "Профилът вече не съществува."],
    ACCOUNT_ALREADY_ACTIVE: [
      "The account is already active. Issue a recovery link instead.",
      "Профилът вече е активен. Вместо това издайте връзка за възстановяване.",
    ],
    ACCOUNT_NOT_ACTIVE: [
      "The account is not active yet. Issue an activation link instead.",
      "Профилът още не е активен. Вместо това издайте връзка за активиране.",
    ],
    ACCOUNT_AUTHORITY_PROTECTED: [
      "This account's authority cannot be managed from Status.",
      "Правомощията на този профил не могат да се управляват от страницата за състояние.",
    ],
    APPLIANCE_OPERATOR_MANAGED: [
      "The appliance operator password must be changed through the server credential workflow.",
      "Паролата на системния администратор трябва да се промени чрез сървърния процес за данни за вход.",
    ],
    LAST_CLINICAL_ADMIN: [
      "The last active clinical administrator cannot be demoted.",
      "Последният активен клиничен администратор не може да бъде понижен.",
    ],
    UNAUTHORIZED: ["The private account service refused this request.", "Частната услуга за профили отхвърли заявката."],
    ACCOUNT_CONTROL_FAILED: ["The account operation failed. Nothing was changed.", "Операцията с профила беше неуспешна. Нищо не е променено."],
  }
  const message = messages[code] ?? messages.ACCOUNT_CONTROL_FAILED!
  return localize(locale, message[0], message[1])
}

function statusAdminMessage(code: string, locale: StatusLocale): string {
  const messages: Record<string, [string, string]> = {
    INVALID_INPUT: [
      "Check the administrator details, reason, and password.",
      "Проверете данните за администратора, причината и паролата.",
    ],
    INVALID_CREDENTIALS: [
      "Your current Status password was not accepted. Nothing was changed.",
      "Текущата ви парола за Status не беше приета. Нищо не е променено.",
    ],
    RATE_LIMITED: [
      "Too many confirmation attempts. Wait 15 minutes before trying again.",
      "Твърде много опити за потвърждение. Изчакайте 15 минути, преди да опитате отново.",
    ],
    ADMIN_ALREADY_EXISTS: [
      "That email already belongs to a Status administrator.",
      "Този имейл вече принадлежи на администратор на Status.",
    ],
    ADMIN_NOT_FOUND: [
      "That Status administrator no longer exists.",
      "Този администратор на Status вече не съществува.",
    ],
    ADMIN_STATE_INVALID: [
      "That action is not available for the administrator's current state.",
      "Това действие не е достъпно при текущото състояние на администратора.",
    ],
    PROTECTED_ADMIN: [
      "The protected initial chief IT administrator cannot be suspended or reactivated here.",
      "Защитеният първоначален главен ИТ администратор не може да бъде спрян или активиран повторно тук.",
    ],
    LAST_ADMIN: [
      "The last enabled Status administrator cannot be suspended.",
      "Последният активен администратор на Status не може да бъде спрян.",
    ],
    TOKEN_INVALID: [
      "This one-time link is invalid, expired, replaced, or already used.",
      "Тази еднократна връзка е невалидна, изтекла, заменена или вече използвана.",
    ],
  }
  const message = messages[code] ?? messages.ADMIN_STATE_INVALID!
  return localize(locale, message[0], message[1])
}

function controlPlaneMessage(code: string, locale: StatusLocale): string {
  const messages: Record<string, [string, string]> = {
    CONTROL_NOT_CONFIGURED: [
      "Hospital controls have not been configured on this appliance.",
      "Управлението на болничната система не е настроено.",
    ],
    CONTROL_UNAVAILABLE: [
      "The private hospital control service is currently unavailable.",
      "Частната услуга за управление на болничната система в момента не е достъпна.",
    ],
    CONTROL_INVALID_RESPONSE: [
      "The hospital control service returned an invalid response. Nothing was changed.",
      "Услугата за управление върна невалиден отговор. Нищо не е променено.",
    ],
    INVALID_CONTROL_REQUEST: [
      "Check the entered values. Nothing was changed.",
      "Проверете въведените стойности. Нищо не е променено.",
    ],
    RESEARCH_ACCOUNT_NOT_FOUND: ["The research account no longer exists.", "Изследователският профил вече не съществува."],
    RESEARCH_PRINCIPAL_NOT_ELIGIBLE: ["Select an active clinician, head of department, administrator, or research-only account.", "Изберете активен клиницист, началник на отделение, администратор или профил само за изследвания."],
    RESEARCH_ACCOUNT_NOT_ACTIVE: ["Activate the research account first.", "Първо активирайте изследователския профил."],
    RESEARCH_GRANT_NOT_FOUND: ["The research grant no longer exists.", "Разрешението за изследвания вече не съществува."],
    GRANT_TO_SUPERSEDE_NOT_FOUND: ["The grant selected for replacement is no longer active.", "Разрешението, избрано за замяна, вече не е действащо."],
    GRANT_ALREADY_TERMINAL: ["That grant is already revoked, replaced, or expired.", "Разрешението вече е отменено, заменено или изтекло."],
    OMOP_REQUEST_NOT_FOUND: ["The OMOP request no longer exists.", "Заявката за OMOP вече не съществува."],
    OMOP_REQUEST_ALREADY_APPROVED: ["That exact OMOP dataset is already approved.", "Точно този OMOP набор вече е одобрен."],
    OMOP_REQUEST_NOT_APPROVABLE: ["The OMOP request no longer matches a frozen pending dataset.", "Заявката за OMOP вече не съответства на замразен чакащ набор."],
    OMOP_GRANT_NOT_ACTIVE: ["The grant bound to this OMOP dataset is no longer active.", "Разрешението, свързано с този OMOP набор, вече не е действащо."],
    CENTRAL_ENDPOINT_INVALID: ["Use a valid HTTPS Central endpoint.", "Използвайте валиден HTTPS адрес на Central."],
    CENTRAL_CERTIFICATES_NOT_READY: ["Install the Central client and CA certificates first.", "Първо инсталирайте клиентския сертификат и CA сертификата за Central."],
    CENTRAL_TRANSPORT_NOT_LOCKED: ["Configure and lock Central transport before approving clinical export.", "Настройте и заключете преноса към Central, преди да одобрите клиничния износ."],
    CENTRAL_CLINICAL_EXPORT_NOT_ENABLED: ["Enable and approve Central clinical export before retrying a batch.", "Включете и одобрете клиничния износ към Central, преди да повторите изпращането на пакет."],
    CENTRAL_BATCH_NOT_FOUND: ["The Central batch no longer exists.", "Пакетът за Central вече не съществува."],
    CENTRAL_BATCH_NOT_RETRYABLE: ["Only a rejected or retryable Central batch can be queued again.", "Само отхвърлен пакет или пакет за нов опит може да бъде поставен отново в опашката."],
    EXTERNAL_AI_SEAL_KEY_UNAVAILABLE: ["The appliance key needed to protect the Mistral credential is unavailable. Nothing was changed.", "Ключът на системата, необходим за защита на данните за достъп до Mistral, не е достъпен. Нищо не е променено."],
    EXTERNAL_AI_PROVIDER_NOT_CONFIGURED: ["Store a valid Mistral credential before using external AI.", "Запазете валидни данни за достъп до Mistral, преди да използвате външен ИИ."],
    EXTERNAL_AI_SEAL_KEY_INVALID: ["The appliance key used to protect the Mistral credential is invalid. Nothing was changed.", "Ключът на системата за защита на данните за достъп до Mistral е невалиден. Нищо не е променено."],
    EXTERNAL_AI_CREDENTIAL_REQUIRED: ["Enter the new Mistral credential. Nothing was changed.", "Въведете новите данни за достъп до Mistral. Нищо не е променено."],
    EXTERNAL_AI_CREDENTIAL_UNREADABLE: ["The stored Mistral credential cannot be opened with this appliance key. Replace or remove it before enabling external AI.", "Запазените данни за достъп до Mistral не могат да бъдат отворени с ключа на тази система. Заменете ги или ги премахнете, преди да включите външен ИИ."],
    APPLIANCE_OPERATOR_UNAVAILABLE: ["The designated appliance administrator is unavailable.", "Определеният системен администратор не е достъпен."],
    EHR_TRANSPORT_SEAL_KEY_UNAVAILABLE: ["The appliance key needed to protect the EHR transport credential is unavailable. Nothing was changed.", "Ключът на системата, необходим за защита на данните за достъп за преноса на ЕЗД, не е достъпен. Нищо не е променено."],
    EHR_TRANSPORT_SEAL_KEY_INVALID: ["The appliance key used to protect the EHR transport credential is invalid. Nothing was changed.", "Ключът на системата за защита на данните за достъп за преноса на ЕЗД е невалиден. Нищо не е променено."],
    EHR_TRANSPORT_CREDENTIAL_REQUIRED: ["Enter the new EHR transport credential. Nothing was changed.", "Въведете новите данни за достъп за преноса на ЕЗД. Нищо не е променено."],
    EHR_TRANSPORT_CREDENTIAL_UNREADABLE: ["The stored EHR transport credential cannot be opened with this appliance key. Replace or remove it, or choose the transport again.", "Запазените данни за достъп за преноса на ЕЗД не могат да бъдат отворени с ключа на тази система. Заменете ги, премахнете ги или изберете отново транспорта."],
    EHR_TRANSPORT_NOT_CREDENTIALED: ["Choose FHIR or HL7v2 as the transport before setting a credential. A watched folder needs none.", "Изберете FHIR или HL7v2 като транспорт, преди да зададете данни за достъп. Наблюдавана папка не се нуждае от такива."],
    HOSPITAL_CONTROL_FAILED: ["The hospital control operation failed. Nothing was changed.", "Операцията за управление беше неуспешна. Нищо не е променено."],
    CONTROL_FAILED: ["The hospital control operation failed. Nothing was changed.", "Операцията за управление беше неуспешна. Нищо не е променено."],
  }
  const message = messages[code] ?? messages.HOSPITAL_CONTROL_FAILED!
  return localize(locale, message[0], message[1])
}

function securityHeaders(response: Response): void {
  response.headers.set("cache-control", NO_STORE)
  response.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
  response.headers.set("referrer-policy", "no-referrer")
  response.headers.set("x-content-type-options", "nosniff")
  response.headers.set("x-frame-options", "DENY")
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return false
  // Chromium deliberately serializes the origin as `null` after an operator
  // proceeds through the self-signed certificate on the loopback-only outage
  // listener. Keep that documented recovery route usable without weakening
  // the normal proxied origin check: this exception is HTTPS, direct (never
  // forwarded), browser-declared same-origin navigation, and loopback only.
  if (origin === "null") {
    if (request.headers.has("x-forwarded-host") || request.headers.has("x-forwarded-proto")) return false
    if (request.headers.get("sec-fetch-site") !== "same-origin") return false
    if (request.headers.get("sec-fetch-mode") !== "navigate") return false
    try {
      const requestUrl = new URL(request.url)
      const host = request.headers.get("host")
      if (requestUrl.protocol !== "https:" || !host) return false
      const hostUrl = new URL(`https://${host}/`)
      return ["localhost", "127.0.0.1", "[::1]"].includes(hostUrl.hostname)
        && ["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname)
    } catch {
      return false
    }
  }
  try {
    const originUrl = new URL(origin)
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    const host = forwardedHost || request.headers.get("host")
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    const protocol = forwardedProto || new URL(request.url).protocol.replace(":", "")
    return Boolean(host) && originUrl.host === host && originUrl.protocol === `${protocol}:`
  } catch {
    return false
  }
}

function secureRequest(context: Context): boolean {
  return new URL(context.req.url).protocol === "https:"
    || context.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
}

function clientAddress(request: Request): string {
  const candidate = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-lospor-status-peer")?.trim()
    || "local"
  return /^[0-9a-f:.]{2,64}$/i.test(candidate) ? candidate : "invalid"
}

function eventProducer(authorization: string | undefined, tokens: ReadonlyMap<string, string>): string | null {
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : ""
  let match: string | null = null
  for (const [producer, expected] of tokens) {
    if (constantTimeEqual(supplied, expected)) {
      match = producer.endsWith("-previous") ? producer.slice(0, -9) : producer
    }
  }
  return match
}

export function createStatusApp({
  db,
  auth,
  config,
  accountControl: providedAccountControl,
  controlPlane: providedControlPlane,
  now = Date.now,
}: AppDependencies): Hono {
  const app = new Hono()
  const accounts = new AccountControlClient(
    config.accountControlUrl ?? null,
    config.accountControlToken ?? null,
    config.probeTimeoutMs ?? 3_000,
  )
  const accountControl = providedAccountControl ?? accounts
  const derivedControlPlaneUrl = config.accountControlUrl?.replace(/\/accounts\/?$/, "/control-plane") ?? null
  const controls = new ControlPlaneClient(
    config.controlPlaneUrl ?? derivedControlPlaneUrl,
    config.accountControlToken ?? null,
    config.probeTimeoutMs ?? 3_000,
  )
  const controlPlane = providedControlPlane ?? controls
  const currentLocale = (context: Context): StatusLocale =>
    statusLocale(getCookie(context, LOCALE_COOKIE_NAME), statusLocale(config.defaultLocale))

  /**
   * Why a maintenance request could not be written, kept rather than discarded.
   *
   * These calls all ended `.catch(() => "failed")`, so an operational failure --
   * a directory the container cannot write, a read-only mount -- reached the
   * operator as an unexplained "could not be recorded" and reached nobody else
   * at all. Status writes no logs by design, so the reason goes where the rest
   * of its diagnostics go: the event list, and from there the support bundle.
   *
   * The operator still sees the same sentence. Only the diagnosis improves.
   */
  const maintenanceRequestFailed = (requestId: string, error: unknown): "failed" => {
    const errno = (error as { code?: unknown } | null)?.code
    const path = (error as { path?: unknown } | null)?.path
    const reason = error instanceof Error ? error.message : String(error)
    db.insertEvent({
      id: requestId,
      producer: "status-maintenance",
      occurredAt: now(),
      code: "STATUS_MAINTENANCE_REQUEST_WRITE_FAILED",
      severity: "warning",
      message: `A maintenance request could not be written: ${reason || "unknown error"}`,
      facts: {
        ...(errno === undefined ? {} : { errno: String(errno) }),
        ...(path === undefined ? {} : { path: String(path) }),
      },
    })
    return "failed"
  }

  app.use("*", async (context, next) => {
    await next()
    securityHeaders(context.res)
  })

  app.get("/internal/health/live", context => {
    try {
      db.sqlite.prepare("SELECT 1").get()
      return context.json({ schemaVersion: 1, status: "ok" })
    } catch {
      return context.json({ schemaVersion: 1, status: "unavailable" }, 503)
    }
  })

  app.post("/internal/events", async context => {
    const producer = eventProducer(context.req.header("authorization"), config.eventTokens)
    if (!producer) return context.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
    const length = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(length) || length > 4096) {
      return context.json({ error: "Invalid event", code: "INVALID_EVENT" }, 400)
    }
    let value: unknown
    try {
      const text = await context.req.text()
      if (Buffer.byteLength(text) > 4096) throw new Error("oversize")
      value = safeJsonParse(text)
    } catch {
      return context.json({ error: "Invalid event", code: "INVALID_EVENT" }, 400)
    }
    const event = parseSafeOperationalEvent(value, now())
    if (!event) return context.json({ error: "Invalid event", code: "INVALID_EVENT" }, 400)
    const inserted = db.insertEvent({ ...event, producer })
    if (inserted === null) {
      return context.json({ error: "Event storage unavailable", code: "EVENT_STORAGE_UNAVAILABLE" }, 503)
    }
    return context.json({ accepted: true, duplicate: !inserted }, 202)
  })

  app.get("/status", context => context.redirect("/status/", 308))
  app.post("/status/language", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) {
      return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    }
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 1024) {
      return context.text(localize(locale, "Invalid request", "Невалидна заявка"), 400)
    }
    const body = await context.req.parseBody().catch(() => ({}))
    const selected = isRecord(body) ? parseStatusLocale(body.locale) : null
    const returnTo = isRecord(body) && typeof body.returnTo === "string"
      && LOCALE_RETURN_PATHS.has(body.returnTo) ? body.returnTo : "/status/"
    if (!selected) {
      return context.text(localize(locale, "Invalid language", "Невалиден език"), 400)
    }
    setCookie(context, LOCALE_COOKIE_NAME, selected, {
      path: "/status",
      httpOnly: true,
      secure: secureRequest(context),
      sameSite: "Strict",
      maxAge: 365 * 24 * 60 * 60,
    })
    return context.redirect(returnTo, 303)
  })
  app.get("/status/admin-link.js", context => context.body(
    STATUS_ADMIN_FRAGMENT_SCRIPT,
    200,
    { "content-type": "text/javascript; charset=utf-8" },
  ))

  const statusAdminSetupLocale = (context: Context): StatusLocale => {
    const selected = parseStatusLocale(context.req.query("locale"))
    if (!selected) return currentLocale(context)
    setCookie(context, LOCALE_COOKIE_NAME, selected, {
      path: "/status",
      httpOnly: true,
      secure: secureRequest(context),
      sameSite: "Strict",
      maxAge: 365 * 24 * 60 * 60,
    })
    return selected
  }

  app.get("/status/admin-activate", context => context.html(
    renderStatusAdminCredentialSetup("ACTIVATION", null, statusAdminSetupLocale(context)),
  ))
  app.get("/status/admin-recover", context => context.html(
    renderStatusAdminCredentialSetup("RECOVERY", null, statusAdminSetupLocale(context)),
  ))

  const redeemStatusAdmin = async (
    context: Context,
    purpose: "ACTIVATION" | "RECOVERY",
  ) => {
    let locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 4096) {
      return context.html(renderStatusAdminCredentialSetup(
        purpose,
        statusAdminMessage("INVALID_INPUT", locale),
        locale,
      ), 400)
    }
    const parsed = await context.req.parseBody().catch(() => ({}))
    const body = isRecord(parsed) ? parsed : {}
    const selectedLocale = parseStatusLocale(body.locale)
    if (selectedLocale) locale = selectedLocale
    const token = typeof body.token === "string" ? body.token : ""
    const password = typeof body.password === "string" ? body.password : ""
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : ""
    if (password !== confirmPassword) {
      return context.html(renderStatusAdminCredentialSetup(
        purpose,
        localize(locale, "The two passwords do not match.", "Двете пароли не съвпадат."),
        locale,
      ), 400)
    }
    try {
      const result = await auth.redeemStatusAdminLink({ token, purpose, password })
      if (selectedLocale) {
        setCookie(context, LOCALE_COOKIE_NAME, selectedLocale, {
          path: "/status",
          httpOnly: true,
          secure: secureRequest(context),
          sameSite: "Strict",
          maxAge: 365 * 24 * 60 * 60,
        })
      }
      return context.html(renderStatusAdminCredentialSuccess(purpose, result.email, locale))
    } catch (error) {
      const code = error instanceof AuthError ? error.code : "ADMIN_STATE_INVALID"
      return context.html(renderStatusAdminCredentialSetup(
        purpose,
        statusAdminMessage(code, locale),
        locale,
      ), code === "TOKEN_INVALID" ? 410 : 400)
    }
  }

  app.post("/status/admin-activate", context => redeemStatusAdmin(context, "ACTIVATION"))
  app.post("/status/admin-recover", context => redeemStatusAdmin(context, "RECOVERY"))

  app.get("/status/login", context => {
    const locale = currentLocale(context)
    if (auth.validateSession(getCookie(context, COOKIE_NAME))) {
      return context.redirect("/status/", 303)
    }
    return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
  })
  app.get("/status/", async context => {
    const locale = currentLocale(context)
    const session = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(session)
    if (!kind) {
      return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    }
    const dashboard = db.getDashboard(now())
    const [maintenance, offhost, hostOs, siteConfig, terminology] = await Promise.all([
      readMaintenanceAgentSignal(config.updateStateDir, now()),
      readOffhostSignal(config.updateStateDir, now()),
      readHostOsSignal(config.updateStateDir, now()),
      readSiteConfigSignal(config.updateStateDir),
      readTerminologyAgentSignal(config.updateStateDir, now()),
    ])
    const goLive = evaluateGoLive({ components: dashboard.components, terminology, networkLists: networkListsState(siteConfig), signoffs: db.listGoLiveSignoffs(), now: now() })
    const attention = attentionItems({ components: dashboard.components, maintenance, offhost, hostOs, siteConfig, goLive, escrowDownloadedAt: db.latestOperationalEventAt("STATUS_SECRETS_ESCROW_DOWNLOADED"), now: now() })
    return context.html(renderDashboard(dashboard, locale, kind, attention))
  })

  app.post("/status/login", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 2048) {
      return context.text(localize(locale, "Invalid request", "Невалидна заявка"), 400)
    }
    let body: Record<string, unknown>
    try {
      const parsed = await context.req.parseBody()
      body = isRecord(parsed) ? parsed : {}
    } catch {
      return context.html(renderLogin(
        localize(locale, "The sign-in request was not accepted.", "Заявката за вход не беше приета."),
        Boolean(db.getAuth()), locale,
      ), 400)
    }
    try {
      if (typeof body.recoveryToken === "string" && body.recoveryToken.length > 0) {
        const result = await auth.loginWithRecoveryToken({
          recoveryToken: body.recoveryToken,
          clientAddress: clientAddress(context.req.raw),
        })
        setCookie(context, COOKIE_NAME, result.sessionToken, {
          path: "/status",
          httpOnly: true,
          secure: secureRequest(context),
          sameSite: "Strict",
          maxAge: 8 * 60 * 60,
        })
        return context.redirect("/status/", 303)
      }
      const challenge = await auth.beginPasswordLogin({
        email: typeof body.email === "string" ? body.email : "",
        password: typeof body.password === "string" ? body.password : "",
        clientAddress: clientAddress(context.req.raw),
      })
      const qrSvg = challenge.otpauthUri
        ? await accountLinkQrSvg(challenge.otpauthUri)
        : null
      return context.html(renderMfaLogin(null, challenge, qrSvg, locale))
    } catch (error) {
      const status = error instanceof AuthError && error.code === "RATE_LIMITED" ? 429 : 401
      const message = error instanceof AuthError && error.code === "RATE_LIMITED"
        ? localize(locale, "Too many attempts. Wait 15 minutes before trying again.", "Твърде много опити. Изчакайте 15 минути, преди да опитате отново.")
        : error instanceof AuthError && error.code === "NOT_INITIALIZED"
          ? localize(locale, "The appliance operator has not been initialized.", "Системният администратор още не е инициализиран.")
          : localize(locale, "The credentials were not accepted.", "Данните за вход не бяха приети.")
      return context.html(renderLogin(message, Boolean(db.getAuth()), locale), status)
    }
  })

  app.post("/status/login/mfa", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 4096) {
      return context.text(localize(locale, "Invalid request", "Невалидна заявка"), 400)
    }
    let body: Record<string, unknown>
    try {
      const parsed = await context.req.parseBody()
      body = isRecord(parsed) ? parsed : {}
    } catch {
      return context.html(renderLogin(
        localize(locale, "The verification request was not accepted. Start sign-in again.", "Заявката за потвърждение не беше приета. Започнете входа отначало."),
        Boolean(db.getAuth()),
        locale,
      ), 400)
    }
    const challengeToken = typeof body.challengeToken === "string" ? body.challengeToken : ""
    const selectedLocale = parseStatusLocale(body.locale)
    if (selectedLocale) {
      try {
        const challenge = auth.describeMfaChallenge(challengeToken)
        setCookie(context, LOCALE_COOKIE_NAME, selectedLocale, {
          path: "/status",
          httpOnly: true,
          secure: secureRequest(context),
          sameSite: "Strict",
          maxAge: 365 * 24 * 60 * 60,
        })
        const qrSvg = challenge.otpauthUri
          ? await accountLinkQrSvg(challenge.otpauthUri)
          : null
        return context.html(renderMfaLogin(null, challenge, qrSvg, selectedLocale))
      } catch {
        return context.html(renderLogin(
          localize(selectedLocale, "This sign-in request expired. Start again.", "Тази заявка за вход изтече. Започнете отново."),
          Boolean(db.getAuth()),
          selectedLocale,
        ), 401)
      }
    }
    try {
      const result = auth.completeMfaLogin({
        challengeToken,
        code: typeof body.code === "string" ? body.code : "",
        clientAddress: clientAddress(context.req.raw),
      })
      setCookie(context, COOKIE_NAME, result.sessionToken, {
        path: "/status",
        httpOnly: true,
        secure: secureRequest(context),
        sameSite: "Strict",
        maxAge: 8 * 60 * 60,
      })
      // Where to land is a convenience: it must never turn a good sign-in into a failed one.
      const landing = await signedInLanding().catch(() => "/status/")
      return result.recoveryCodes
        ? context.html(renderMfaRecoveryCodes(result.recoveryCodes, locale, landing))
        : context.redirect(landing, 303)
    } catch (error) {
      const rateLimited = error instanceof AuthError && error.code === "RATE_LIMITED"
      const invalidChallenge = error instanceof AuthError && error.code === "MFA_CHALLENGE_INVALID"
      if (invalidChallenge) {
        return context.html(renderLogin(
          localize(locale, "This sign-in request expired. Start again.", "Тази заявка за вход изтече. Започнете отново."),
          Boolean(db.getAuth()),
          locale,
        ), 401)
      }
      try {
        const challenge = auth.describeMfaChallenge(challengeToken)
        const qrSvg = challenge.otpauthUri
          ? await accountLinkQrSvg(challenge.otpauthUri)
          : null
        const message = rateLimited
          ? localize(locale, "Too many attempts. Wait 15 minutes before trying again.", "Твърде много опити. Изчакайте 15 минути, преди да опитате отново.")
          : localize(locale, "The verification code was not accepted.", "Кодът за потвърждение не беше приет.")
        return context.html(renderMfaLogin(message, challenge, qrSvg, locale), rateLimited ? 429 : 401)
      } catch {
        return context.html(renderLogin(
          localize(locale, "This sign-in request expired. Start again.", "Тази заявка за вход изтече. Започнете отново."),
          Boolean(db.getAuth()),
          locale,
        ), 401)
      }
    }
  })

  app.post("/status/logout", context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    auth.logout(getCookie(context, COOKIE_NAME))
    deleteCookie(context, COOKIE_NAME, {
      path: "/status",
      secure: secureRequest(context),
    })
    return context.redirect("/status/", 303)
  })

  // ── account provisioning and one-time links ───────────────────────────────
  //
  // Status owns only the operator session and calls one narrow API endpoint
  // with its service bearer. It never receives a clinical JWT and therefore
  // cannot use the clinical or research APIs as the operator.

  const passwordAccountSession = (context: Context): "ok" | "missing" | "recovery" => {
    const kind = auth.validateSessionKind(getCookie(context, COOKIE_NAME))
    return kind === "password" ? "ok" : kind === "recovery" ? "recovery" : "missing"
  }

  const accountDirectory = async () => {
    try {
      return { directory: await accountControl.list(), error: undefined }
    } catch (error) {
      const code = error instanceof AccountControlError ? error.code : "ACCOUNT_CONTROL_FAILED"
      return { directory: null, error: code }
    }
  }

  const unifiedAccountsPage = async (context: Context, error?: string) => {
    const locale = currentLocale(context)
    const result = await accountDirectory()
    const principal = auth.statusSessionPrincipal(getCookie(context, COOKIE_NAME))
    return renderAccounts(
      result.directory,
      locale,
      error ?? (result.error ? accountControlMessage(result.error, locale) : undefined),
      auth.listStatusAdmins(),
      principal?.adminId,
    )
  }

  app.get("/status/accounts", async context => {
    const locale = currentLocale(context)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") {
      return context.html(renderAccounts(
        null,
        locale,
        localize(
          locale,
          "Sign in with the administrator password to manage accounts. Console recovery sessions cannot create credentials or links.",
          "Влезте с администраторската парола, за да управлявате профили. Аварийните сесии от конзолата не могат да създават данни за вход или връзки.",
        ),
      ), 403)
    }
    return context.html(await unifiedAccountsPage(context))
  })

  app.post("/status/accounts", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 8192) {
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage("INVALID_REQUEST", locale),
      ), 400)
    }
    const body = await context.req.parseBody().catch(() => ({}))
    const value = isRecord(body) ? body : {}
    const profile = typeof value.accessProfile === "string"
      && ["CLINICAL_MEMBER", "CLINICAL_HOD", "RESEARCH_ONLY"].includes(value.accessProfile)
      ? value.accessProfile as AccountAccessProfile
      : null
    const selectedLocale = value.locale === "en" ? "en" : value.locale === "bg" ? "bg" : null
    const input: AccountCreateRequest | null = profile && selectedLocale
      && typeof value.username === "string"
      && /^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(value.username)
      && typeof value.email === "string"
      && typeof value.firstName === "string"
      && typeof value.lastName === "string"
      && typeof value.title === "string"
      && typeof value.institutionId === "string"
      ? {
          username: value.username,
          email: value.email === "" ? null : value.email,
          firstName: value.firstName,
          lastName: value.lastName,
          title: value.title,
          institutionId: value.institutionId,
          accessProfile: profile,
          locale: selectedLocale,
        }
      : null
    if (!input) {
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage("INVALID_REQUEST", locale),
      ), 400)
    }
    try {
      const created = await accountControl.create(input)
      return context.html(renderOneTimeAccountLink(
        created.oneTimeLink,
        locale,
        await accountLinkQrSvg(created.oneTimeLink.url),
      ), 201)
    } catch (error) {
      const code = error instanceof AccountControlError ? error.code : "ACCOUNT_CONTROL_FAILED"
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage(code, locale),
      ), 400)
    }
  })

  const accountLinkAction = async (
    context: Context,
    purpose: "ACTIVATION" | "RECOVERY",
  ) => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const userId = context.req.param("id")
    if (!userId || userId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(userId)) {
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage("INVALID_REQUEST", locale),
      ), 400)
    }
    try {
      const link = purpose === "ACTIVATION"
        ? await accountControl.reissueActivation(userId)
        : await accountControl.issueRecovery(userId)
      return context.html(renderOneTimeAccountLink(
        link,
        locale,
        await accountLinkQrSvg(link.url),
      ))
    } catch (error) {
      const code = error instanceof AccountControlError ? error.code : "ACCOUNT_CONTROL_FAILED"
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage(code, locale),
      ), 400)
    }
  }

  app.post("/status/accounts/:id/activation", context =>
    accountLinkAction(context, "ACTIVATION"))
  app.post("/status/accounts/:id/recovery", context =>
    accountLinkAction(context, "RECOVERY"))

  const accountAuthorityStatus = (code: string): 400 | 401 | 404 | 409 | 422 | 429 => {
    if (code === "INVALID_CREDENTIALS") return 401
    if (code === "RATE_LIMITED") return 429
    if (code.includes("NOT_FOUND")) return 404
    if (code === "INSTITUTION_CANNOT_HAVE_HOD") return 422
    if (code.includes("ALREADY") || code.includes("PROTECTED")
      || code.includes("MANAGED") || code.includes("LAST_")
      || code === "ACCOUNT_NOT_ACTIVE") return 409
    return 400
  }

  const accountAuthorityAction = async (
    context: Context,
    action: "ROLE" | "USERNAME",
  ) => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 8192) {
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage("INVALID_REQUEST", locale),
      ), 400)
    }
    const parsed = await context.req.parseBody().catch(() => ({}))
    const body = isRecord(parsed) ? parsed : {}
    const userId = context.req.param("id") ?? ""
    const reason = typeof body.reason === "string" ? body.reason.normalize("NFC").trim() : ""
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : ""
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)
      || reason.length < 10 || reason.length > 1000 || /\p{Cc}/u.test(reason)) {
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage("INVALID_REQUEST", locale),
      ), 400)
    }
    try {
      await auth.reauthenticatePassword(getCookie(context, COOKIE_NAME), currentPassword)
    } catch (error) {
      const code = error instanceof AuthError ? error.code : "INVALID_CREDENTIALS"
      return context.html(await unifiedAccountsPage(
        context,
        statusAdminMessage(code, locale),
      ), accountAuthorityStatus(code))
    }
    try {
      if (action === "ROLE") {
        const role = typeof body.role === "string"
          && ["MEMBER", "HEAD_OF_DEPT", "ADMIN"].includes(body.role)
          ? body.role as ClinicalAccountRole
          : null
        if (!role) throw new AccountControlError("INVALID_REQUEST")
        await accountControl.changeRole(userId, role, reason)
        return context.redirect("/status/accounts", 303)
      }
      const username = typeof body.username === "string" ? body.username : ""
      if (!/^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(username)) {
        throw new AccountControlError("INVALID_REQUEST")
      }
      const changed = await accountControl.changeUsername(userId, username, reason)
      return context.html(renderOneTimeAccountLink(
        changed.oneTimeLink,
        locale,
        await accountLinkQrSvg(changed.oneTimeLink.url),
      ))
    } catch (error) {
      const code = error instanceof AccountControlError ? error.code : "ACCOUNT_CONTROL_FAILED"
      return context.html(await unifiedAccountsPage(
        context,
        accountControlMessage(code, locale),
      ), accountAuthorityStatus(code))
    }
  }

  app.post("/status/accounts/:id/role", context => accountAuthorityAction(context, "ROLE"))
  app.post("/status/accounts/:id/username", context => accountAuthorityAction(context, "USERNAME"))

  const statusAdminActionStatus = (code: string): 400 | 401 | 409 | 429 => {
    if (code === "INVALID_CREDENTIALS") return 401
    if (code === "RATE_LIMITED") return 429
    if (["ADMIN_ALREADY_EXISTS", "ADMIN_STATE_INVALID", "PROTECTED_ADMIN", "LAST_ADMIN"]
      .includes(code)) return 409
    return 400
  }

  const statusAdminOneTimeUrl = (
    context: Context,
    purpose: "ACTIVATION" | "RECOVERY",
    token: string,
  ): string => {
    const path = purpose === "ACTIVATION" ? "/status/admin-activate" : "/status/admin-recover"
    return `${new URL(path, context.req.url).toString()}#statusAdminToken=${encodeURIComponent(token)}`
  }

  app.post("/status/status-admins", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 8192) {
      return context.html(await unifiedAccountsPage(
        context,
        statusAdminMessage("INVALID_INPUT", locale),
      ), 400)
    }
    const parsed = await context.req.parseBody().catch(() => ({}))
    const body = isRecord(parsed) ? parsed : {}
    try {
      const link = await auth.createStatusAdmin({
        sessionToken: getCookie(context, COOKIE_NAME),
        currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : "",
        email: typeof body.email === "string" ? body.email : "",
        displayName: typeof body.displayName === "string" ? body.displayName : "",
        reason: typeof body.reason === "string" ? body.reason : "",
      })
      const url = statusAdminOneTimeUrl(context, link.purpose, link.token)
      return context.html(renderStatusAdminOneTimeLink(
        { purpose: link.purpose, url, expiresAt: link.expiresAt },
        locale,
        await accountLinkQrSvg(url),
      ), 201)
    } catch (error) {
      const code = error instanceof AuthError ? error.code : "ADMIN_STATE_INVALID"
      return context.html(await unifiedAccountsPage(
        context,
        statusAdminMessage(code, locale),
      ), statusAdminActionStatus(code))
    }
  })

  const statusAdminLinkAction = async (
    context: Context,
    purpose: "ACTIVATION" | "RECOVERY",
  ) => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 8192) {
      return context.html(await unifiedAccountsPage(
        context,
        statusAdminMessage("INVALID_INPUT", locale),
      ), 400)
    }
    const parsed = await context.req.parseBody().catch(() => ({}))
    const body = isRecord(parsed) ? parsed : {}
    try {
      const link = await auth.issueStatusAdminLink({
        sessionToken: getCookie(context, COOKIE_NAME),
        currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : "",
        targetAdminId: context.req.param("id") ?? "",
        purpose,
        reason: typeof body.reason === "string" ? body.reason : "",
      })
      const url = statusAdminOneTimeUrl(context, link.purpose, link.token)
      return context.html(renderStatusAdminOneTimeLink(
        { purpose: link.purpose, url, expiresAt: link.expiresAt },
        locale,
        await accountLinkQrSvg(url),
      ))
    } catch (error) {
      const code = error instanceof AuthError ? error.code : "ADMIN_STATE_INVALID"
      return context.html(await unifiedAccountsPage(
        context,
        statusAdminMessage(code, locale),
      ), statusAdminActionStatus(code))
    }
  }

  app.post("/status/status-admins/:id/activation", context =>
    statusAdminLinkAction(context, "ACTIVATION"))
  app.post("/status/status-admins/:id/recovery", context =>
    statusAdminLinkAction(context, "RECOVERY"))
  app.post("/status/status-admins/:id/suspend", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 8192) {
      return context.html(await unifiedAccountsPage(
        context,
        statusAdminMessage("INVALID_INPUT", locale),
      ), 400)
    }
    const parsed = await context.req.parseBody().catch(() => ({}))
    const body = isRecord(parsed) ? parsed : {}
    try {
      await auth.suspendStatusAdmin({
        sessionToken: getCookie(context, COOKIE_NAME),
        currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : "",
        targetAdminId: context.req.param("id") ?? "",
        reason: typeof body.reason === "string" ? body.reason : "",
      })
      return context.redirect("/status/accounts", 303)
    } catch (error) {
      const code = error instanceof AuthError ? error.code : "ADMIN_STATE_INVALID"
      return context.html(await unifiedAccountsPage(
        context,
        statusAdminMessage(code, locale),
      ), statusAdminActionStatus(code))
    }
  })

  // ── research, Central and calculation-guidance control plane ─────────────
  //
  // Status receives policy and operational metadata only. Every mutation is
  // preceded by a fresh check of the current appliance-operator password; a
  // recovery session cannot use this surface. The private service bearer is
  // never sent to the browser and does not grant clinical/research data access.

  const controlDirectory = async () => {
    try {
      return { view: await controlPlane.get(), error: undefined }
    } catch (error) {
      const code = error instanceof ControlPlaneClientError ? error.code : "HOSPITAL_CONTROL_FAILED"
      return { view: null, error: code }
    }
  }

  const controlHtml = async (
    locale: StatusLocale,
    error?: string,
    notice?: string,
  ) => {
    const current = await controlDirectory()
    return renderControlPlane(
      current.view,
      locale,
      error ?? (current.error ? controlPlaneMessage(current.error, locale) : undefined),
      notice,
    )
  }

  type ControlStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503
  const controlErrorStatus = (code: string): ControlStatus => {
    if (code === "CONTROL_UNAVAILABLE") return 503
    if (code === "CENTRAL_CLINICAL_EXPORT_NOT_ENABLED"
      || code === "EXTERNAL_AI_SEAL_KEY_UNAVAILABLE"
      || code === "EXTERNAL_AI_PROVIDER_NOT_CONFIGURED"
      || code === "EHR_TRANSPORT_SEAL_KEY_UNAVAILABLE"
      || code === "EHR_TRANSPORT_NOT_CREDENTIALED") return 409
    if (code.includes("NOT_FOUND")) return 404
    if (code.includes("NOT_ACTIVE") || code.includes("TERMINAL")
      || code.includes("NOT_READY") || code.includes("NOT_LOCKED")
      || code.includes("NOT_APPROVABLE") || code.includes("NOT_RETRYABLE")
      || code.includes("UNAVAILABLE") || code.includes("ALREADY")) return 409
    if (code.includes("REQUIRED") || code.includes("MISMATCH")) return 422
    if (code === "HOSPITAL_CONTROL_FAILED" || code === "CONTROL_FAILED") return 500
    return 400
  }

  /**
   * A control that is audited but not password-gated, for work done in bulk.
   *
   * Everything below still applies — same origin, a real password session, a
   * bounded body — and only the per-change password prompt is dropped. It is
   * used for the laboratory code map, where an operator answers dozens of
   * questions in a sitting: demanding a password for each would see the screen
   * abandoned halfway and the site left half-mapped, which is worse than the
   * risk, because a wrong mapping is visible on the review screen and undone in
   * a click.
   *
   * Not for anything that decides whether a capability is on, or where clinical
   * data goes. Those keep the prompt.
   */
  const bulkControlAction = async (
    context: Context,
    action: (body: Record<string, unknown>) => Promise<void>,
    notice: (locale: StatusLocale) => string,
  ) => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") {
      return context.html(await controlHtml(locale, localize(
        locale,
        "Sign in with the administrator password to use hospital controls. Console recovery sessions cannot authorize these changes.",
        "Влезте с администраторската парола, за да използвате управлението. Аварийните сесии от конзолата не могат да разрешават тези промени.",
      )), 403)
    }
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 16_384) {
      return context.html(await controlHtml(locale, controlPlaneMessage("INVALID_CONTROL_REQUEST", locale)), 400)
    }
    const parsed = await context.req.parseBody().catch(() => null)
    const body = isRecord(parsed) ? parsed : null
    if (!body) {
      return context.html(await controlHtml(locale, controlPlaneMessage("INVALID_CONTROL_REQUEST", locale)), 400)
    }
    try {
      await action(body)
      return context.html(await controlHtml(locale, undefined, notice(locale)))
    } catch (error) {
      const code = error instanceof ControlPlaneClientError ? error.code : "HOSPITAL_CONTROL_FAILED"
      return context.html(
        await controlHtml(locale, controlPlaneMessage(code, locale)),
        controlErrorStatus(code),
      )
    }
  }

  /**
   * A control action behind the administrator password, with its outcome.
   *
   * `notice` receives whatever the action returned. Almost every action here
   * returns nothing and its notice ignores the argument; the read-only probe
   * is the exception, and it has something to say -- the numberings a real
   * response carried are the whole reason for running it.
   */
  const sensitiveControlAction = async <T>(
    context: Context,
    action: (body: Record<string, unknown>) => Promise<T>,
    notice: (locale: StatusLocale, result: T) => string,
  ) => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") {
      return context.html(await controlHtml(locale, localize(
        locale,
        "Sign in with the administrator password to use hospital controls. Console recovery sessions cannot authorize these changes.",
        "Влезте с администраторската парола, за да използвате управлението. Аварийните сесии от конзолата не могат да разрешават тези промени.",
      )), 403)
    }
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 16_384) {
      return context.html(await controlHtml(locale, controlPlaneMessage("INVALID_CONTROL_REQUEST", locale)), 400)
    }
    const parsed = await context.req.parseBody().catch(() => null)
    const body = isRecord(parsed) ? parsed : null
    if (!body || typeof body.password !== "string") {
      return context.html(await controlHtml(locale, controlPlaneMessage("INVALID_CONTROL_REQUEST", locale)), 400)
    }
    try {
      await auth.reauthenticatePassword(getCookie(context, COOKIE_NAME), body.password)
    } catch (error) {
      const rateLimited = error instanceof AuthError && error.code === "RATE_LIMITED"
      const message = rateLimited
        ? localize(locale, "Too many confirmation attempts. Wait 15 minutes before trying again.", "Твърде много опити за потвърждение. Изчакайте 15 минути, преди да опитате отново.")
        : localize(locale, "The administrator password was not accepted. Nothing was changed.", "Администраторската парола не беше приета. Нищо не е променено.")
      return context.html(await controlHtml(locale, message), rateLimited ? 429 : 401)
    }
    try {
      const result = await action(body)
      return context.html(await controlHtml(locale, undefined, notice(locale, result)))
    } catch (error) {
      const code = error instanceof ControlPlaneClientError ? error.code : "HOSPITAL_CONTROL_FAILED"
      return context.html(
        await controlHtml(locale, controlPlaneMessage(code, locale)),
        controlErrorStatus(code),
      )
    }
  }

  const formText = (
    body: Record<string, unknown>,
    name: string,
    minimum: number,
    maximum: number,
  ): string => {
    const value = body[name]
    if (typeof value !== "string") throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
    const normalized = value.trim()
    if (normalized.length < minimum || normalized.length > maximum) {
      throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
    }
    return normalized
  }
  const formBoolean = (body: Record<string, unknown>, name: string): boolean => body[name] === "true"
  const formId = (value: string | undefined): string => {
    if (!value || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
    }
    return value
  }

  app.get("/status/control", async context => {
    const locale = currentLocale(context)
    const session = passwordAccountSession(context)
    if (session === "missing") return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (session === "recovery") {
      return context.html(renderControlPlane(null, locale, localize(
        locale,
        "Sign in with the administrator password to use hospital controls.",
        "Влезте с администраторската парола, за да използвате управлението на болничната система.",
      )), 403)
    }
    return context.html(await controlHtml(locale))
  })

  app.post("/status/control/research/grants", context => sensitiveControlAction(
    context,
    async body => {
      const expiryDays = Number(formText(body, "expiryDays", 1, 3))
      const allInstitutions = formBoolean(body, "allInstitutions")
      const institutionId = typeof body.institutionId === "string" && body.institutionId.trim()
        ? formId(body.institutionId.trim()) : null
      const supersedesGrantId = typeof body.supersedesGrantId === "string" && body.supersedesGrantId.trim()
        ? formId(body.supersedesGrantId.trim()) : null
      const input: ResearchGrantInput = {
        userId: formId(formText(body, "userId", 1, 128)),
        institutionId: allInstitutions ? null : institutionId,
        allInstitutions,
        purpose: formText(body, "purpose", 3, 500),
        expiryDays,
        supersedesGrantId,
        canQuery: formBoolean(body, "canQuery"),
        canInspectCases: formBoolean(body, "canInspectCases"),
        canExportCsv: formBoolean(body, "canExportCsv"),
        canExportJson: formBoolean(body, "canExportJson"),
        canExportOmop: formBoolean(body, "canExportOmop"),
        canShare: formBoolean(body, "canShare"),
      }
      if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365
        || allInstitutions === Boolean(institutionId)) {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      await controlPlane.issueGrant(input)
    },
    locale => localize(locale, "The immutable research grant was issued and audited.", "Непроменимото разрешение за изследвания беше издадено и одитирано."),
  ))

  app.post("/status/control/research/grants/:id/revoke", context => sensitiveControlAction(
    context,
    body => controlPlane.revokeGrant(formId(context.req.param("id")), formText(body, "reason", 10, 1000)),
    locale => localize(locale, "The research grant was revoked and audited.", "Разрешението за изследвания беше отменено и одитирано."),
  ))

  app.post("/status/control/research/omop/:id/approve", context => sensitiveControlAction(
    context,
    body => controlPlane.approveOmop(formId(context.req.param("id")), formText(body, "reason", 10, 1000)),
    locale => localize(locale, "The exact frozen OMOP dataset was approved and audited.", "Точно този замразен OMOP набор беше одобрен и одитиран."),
  ))

  app.post("/status/control/central/transport", context => sensitiveControlAction(
    context,
    body => controlPlane.configureCentral({
      token: formText(body, "token", 20, 4096),
      centralBaseUrl: formText(body, "centralBaseUrl", 8, 2048),
      siteCode: formText(body, "siteCode", 2, 32),
      siteName: formText(body, "siteName", 2, 160),
      institutionId: formId(formText(body, "institutionId", 1, 128)),
      reason: formText(body, "reason", 10, 1000),
    }),
    locale => localize(locale, "Central transport was configured, locked, and audited.", "Преносът към Central беше настроен, заключен и одитиран."),
  ))

  app.post("/status/control/central/policy", context => sensitiveControlAction(
    context,
    body => {
      if (body.redactionProfile !== "bg-en-v1") {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.setCentralPolicy({
        enabled: formBoolean(body, "enabled"),
        includeRedactedText: formBoolean(body, "includeRedactedText"),
        redactionProfile: "bg-en-v1",
        reason: formText(body, "reason", 10, 1000),
      })
    },
    locale => localize(locale, "The separate Central clinical-export policy was saved and audited.", "Отделната политика за клиничен износ към Central беше запазена и одитирана."),
  ))

  app.post("/status/control/central/batches/:id/retry", context => sensitiveControlAction(
    context,
    body => controlPlane.retryCentralBatch(formId(context.req.param("id")), formText(body, "reason", 10, 1000)),
    locale => localize(locale, "The Central batch was queued for a controlled retry.", "Пакетът за Central беше поставен в опашката за контролиран нов опит."),
  ))

  app.post("/status/control/guidance", context => sensitiveControlAction(
    context,
    body => controlPlane.setGuidance({
      adultEnabled: formBoolean(body, "adultEnabled"),
      pediatricEnabled: formBoolean(body, "pediatricEnabled"),
      reason: formText(body, "reason", 10, 1000),
    }),
    locale => localize(locale, "The prospective guidance policy was saved and audited; historical records were not changed.", "Политиката за бъдещи насоки беше запазена и одитирана; старите записи не бяха променени."),
  ))

  app.post("/status/control/external-ai/policy", context => sensitiveControlAction(
    context,
    body => controlPlane.setExternalAiPolicy({
      externalAiEnabled: formBoolean(body, "externalAiEnabled"),
      reason: formText(body, "reason", 10, 1000),
    }),
    locale => localize(locale, "The external-AI policy was saved and audited.", "Политиката за външен ИИ беше запазена и одитирана."),
  ))

  app.post("/status/control/external-ai/credential", context => sensitiveControlAction(
    context,
    body => controlPlane.replaceExternalAiCredential({
      credential: formText(body, "credential", 1, 4096),
      reason: formText(body, "reason", 10, 1000),
    }),
    locale => localize(locale, "The Mistral credential was replaced and audited. Its value is not displayed or retained by Status.", "Данните за достъп до Mistral бяха заменени и одитирани. Стойността им не се показва и не се съхранява от Status."),
  ))

  app.post("/status/control/external-ai/credential/remove", context => sensitiveControlAction(
    context,
    body => {
      if (body.confirmation !== "REMOVE-MISTRAL-CREDENTIAL") {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.removeExternalAiCredential(formText(body, "reason", 10, 1000))
    },
    locale => localize(locale, "The Mistral credential was removed and the change was audited.", "Данните за достъп до Mistral бяха премахнати и промяната беше одитирана."),
  ))

  app.post("/status/control/external-ai/models", context => sensitiveControlAction(
    context,
    body => {
      // The private API accepts only its pinned list; this only keeps
      // anything that is not a model name from being forwarded at all.
      const advisorModel = typeof body.advisorModel === "string" ? body.advisorModel.trim() : ""
      const visionModel = typeof body.visionModel === "string" ? body.visionModel.trim() : ""
      if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(advisorModel) || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(visionModel)) {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.setExternalAiModels({ advisorModel, visionModel, reason: formText(body, "reason", 10, 1000) })
    },
    locale => localize(locale, "The external-AI models were saved and audited. The next AI request uses them.", "Моделите за външен ИИ бяха запазени и одитирани. Следващата заявка към ИИ ги използва."),
  ))

  app.post("/status/control/patient-identifier", context => sensitiveControlAction(
    context,
    body => controlPlane.setPatientIdentifierPolicy({
      egnPermitted: formBoolean(body, "egnPermitted"),
      reason: formText(body, "reason", 10, 1000),
    }),
    locale => localize(locale, "The national-identifier (ЕГН) policy was saved and audited.", "Политиката за национален идентификатор (ЕГН) беше запазена и одитирана."),
  ))

  app.post("/status/control/ehr-transport/policy", context => sensitiveControlAction(
    context,
    body => {
      // An empty selection means "no transport" (the adapter disabled), not
      // a fourth enum value -- EhrImportTransport has none for that state.
      const raw = typeof body.transport === "string" ? body.transport.trim() : ""
      const transport = raw === "" ? null : raw
      // HL7 v2 is not accepted. The option is shown disabled in the form so
      // its absence reads as "not yet" rather than as an oversight, but a
      // disabled option is a hint and not a boundary: a hand-posted form would
      // sail past it, and the private API refuses the value anyway.
      if (transport !== null && transport !== "FOLDER" && transport !== "FHIR") {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.setEhrTransportPolicy({
        transport,
        reason: formText(body, "reason", 10, 1000),
      })
    },
    locale => localize(locale, "The EHR import transport policy was saved and audited.", "Политиката за транспорта за внос на ЕЗД беше запазена и одитирана."),
  ))

  app.post("/status/control/ehr-transport/retention", context => sensitiveControlAction(
    context,
    body => {
      const raw = typeof body.days === "string" ? body.days.trim() : ""
      if (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 14) {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.setEhrStagingRetention({ days: Number(raw), reason: formText(body, "reason", 10, 1000) })
    },
    locale => localize(locale, "The EHR staging retention was saved and audited. The next daily retention run applies it.", "Срокът за пазене на данните от ЕЗД беше запазен и одитиран. Следващото ежедневно почистване го прилага."),
  ))

  app.post("/status/control/ehr-transport/discover", context => sensitiveControlAction(
    context,
    body => {
      const raw = typeof body.identifier === "string" ? body.identifier.trim() : ""
      return controlPlane.discoverEhrTransport(raw === "" ? {} : { identifier: raw })
    },
    (locale, result) => {
      // The numberings are the answer. Listed rather than chosen for the
      // operator: which of three is the admission number is theirs to say.
      if (result.identifierSystems.length > 0) {
        return localize(locale,
          `This server returned: ${result.identifierSystems.join(", ")}. Copy the one your record numbers use into the field below.`,`
          Сървърът върна: ${result.identifierSystems.join(", ")}. Копирайте тази, която използват вашите номера на ИЗ, в полето по-долу.`)
      }
      if (result.patientFound === false) {
        return localize(locale,
          "The server answered, but found no patient with that number. Try one you know exists — the numberings can only be read off a real record.",
          "Сървърът отговори, но не намери пациент с този номер. Опитайте с номер, за който сте сигурни — номеровите системи могат да бъдат прочетени само от реален запис.")
      }
      return localize(locale,
        "The server answered. Enter a real record number above to see which numberings it uses.",
        "Сървърът отговори. Въведете реален номер на ИЗ по-горе, за да видите какви номерови системи използва.")
    },
  ))

  app.post("/status/control/ehr-transport/endpoint", context => sensitiveControlAction(
    context,
    body => {
      // Blank means "not configured", not an empty string. A stored empty
      // endpoint would satisfy every presence check and fail at the point of
      // use, which is the failure the readiness gate exists to prevent.
      const optional = (field: string) => {
        const raw = typeof body[field] === "string" ? (body[field] as string).trim() : ""
        return raw === "" ? null : raw
      }
      const authMode = typeof body.authMode === "string" ? body.authMode.trim() : ""
      if (authMode !== "STATIC_BEARER" && authMode !== "OAUTH2_CLIENT_CREDENTIALS") {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.setEhrTransportEndpoint({
        endpoint: optional("endpoint"),
        authMode,
        tokenUrl: optional("tokenUrl"),
        clientId: optional("clientId"),
        scope: optional("scope"),
        reason: formText(body, "reason", 10, 1000),
      })
    },
    locale => localize(locale,
      "The EHR endpoint was saved and audited. Any stored credential was cleared, because a secret belongs to the arrangement it was issued for.",
      "Адресът на ЕЗД беше запазен и одитиран. Съхранените данни за достъп бяха изчистени, защото тайната принадлежи на настройката, за която е издадена."),
  ))

  app.post("/status/control/ehr-transport/identifier-systems", context => sensitiveControlAction(
    context,
    body => {
      // A field left out of the form is left alone; a field present and blank
      // clears that numbering. The two are different acts and the form
      // distinguishes them with a checkbox, because clearing returns matches
      // to unverified and should never happen by omission.
      const chosen = (field: string, clearField: string) => {
        if (body[clearField] === "on") return null
        const raw = typeof body[field] === "string" ? (body[field] as string).trim() : ""
        return raw === "" ? undefined : raw
      }
      const recordNumberSystem = chosen("recordNumberSystem", "clearRecordNumberSystem")
      const nationalIdentifierSystem = chosen("nationalIdentifierSystem", "clearNationalIdentifierSystem")
      if (recordNumberSystem === undefined && nationalIdentifierSystem === undefined) {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.setEhrIdentifierSystems({
        ...(recordNumberSystem !== undefined ? { recordNumberSystem } : {}),
        ...(nationalIdentifierSystem !== undefined ? { nationalIdentifierSystem } : {}),
        reason: formText(body, "reason", 10, 1000),
      })
    },
    locale => localize(locale,
      "The identifier numbering was saved and audited. Patient matches are now verified against it.",
      "Номеровата система беше запазена и одитирана. Съвпаденията по пациент вече се проверяват спрямо нея."),
  ))

  app.post("/status/control/ehr-transport/credential", context => sensitiveControlAction(
    context,
    body => controlPlane.replaceEhrTransportCredential({
      credential: formText(body, "credential", 1, 4096),
      reason: formText(body, "reason", 10, 1000),
    }),
    locale => localize(locale, "The EHR transport credential was replaced and audited. Its value is not displayed or retained by Status.", "Данните за достъп за преноса на ЕЗД бяха заменени и одитирани. Стойността им не се показва и не се съхранява от Status."),
  ))

  app.post("/status/control/ehr-lab-codes/map", context => bulkControlAction(
    context,
    body => controlPlane.mapEhrLabCode({
      system: formText(body, "system", 0, 512),
      code: formText(body, "code", 1, 512),
      test: formText(body, "test", 1, 200),
      // Blank means "read the unit from each result", which is the ordinary
      // case. Only a feed that sends no units at all needs this filled in.
      assumedUnit: formText(body, "assumedUnit", 0, 64) || null,
    }),
    locale => localize(locale, "The laboratory code was mapped and audited.", "Лабораторният код беше съпоставен и одитиран."),
  ))

  app.post("/status/control/ehr-lab-codes/unmap", context => bulkControlAction(
    context,
    body => controlPlane.unmapEhrLabCode({
      system: formText(body, "system", 0, 512),
      code: formText(body, "code", 1, 512),
    }),
    locale => localize(locale, "The mapping was removed and audited. The code returns to the list waiting for an answer.", "Съпоставката беше премахната и одитирана. Кодът се връща в списъка, който чака отговор."),
  ))

  app.post("/status/control/ehr-code-systems/answer", context => bulkControlAction(
    context,
    body => {
      // Blank takes the answer back; anything else must be one of the lists.
      const raw = formText(body, "list", 0, 32)
      if (raw !== "" && !EHR_CODE_LIST_ANSWERS.includes(raw as EhrCodeListAnswer)) {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.answerEhrCodeSystem({
        system: formText(body, "system", 1, 2048),
        list: raw === "" ? null : raw as EhrCodeListAnswer,
      })
    },
    locale => localize(locale, "The address was answered and audited. Codes from it are read that way from the next import.", "Адресът беше посочен и одитиран. Кодовете от него се четат така от следващия внос."),
  ))

  app.post("/status/control/ehr-transport/credential/remove", context => sensitiveControlAction(
    context,
    body => {
      if (body.confirmation !== "REMOVE-EHR-TRANSPORT-CREDENTIAL") {
        throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      }
      return controlPlane.removeEhrTransportCredential(formText(body, "reason", 10, 1000))
    },
    locale => localize(locale, "The EHR transport credential was removed and the change was audited.", "Данните за достъп за преноса на ЕЗД бяха премахнати и промяната беше одитирана."),
  ))

  // ── governed terminology generations ─────────────────────────────────────
  //
  // The browser sends only one fixed action and, for import/resume, one direct
  // directory label. It cannot select a path, command, manifest, database,
  // image or source URL. The root host agent derives the packaged operation,
  // shares the backup/update maintenance lock, and projects only bounded
  // provenance back into Status.

  const terminologyPage = async (
    locale: StatusLocale,
    kind: "password" | "recovery",
    extra: { notice?: string; error?: string } = {},
  ) => {
    const [state, agent, installation] = await Promise.all([
      readTerminologyAgentSignal(config.updateStateDir, now()),
      readAgentSignal(config.updateStateDir, now()),
      readAgentInstallationSignal(config.updateStateDir, now()),
    ])
    const agentFresh = agent !== null && now() - Date.parse(agent.observedAt) <= 10 * 60_000
    const terminologyFresh = state !== null && now() - Date.parse(state.observedAt) <= 10 * 60_000
    const agentMode = installation?.mode === "console-only" ? "console-only" as const
      : agentFresh ? "healthy" as const
        : installation?.mode === "agent" || agent !== null ? "failed" as const
          : "unconfigured" as const
    const blockedPhase = state !== null
      && ["accepted", "working", "needs-operator"].includes(state.phase)
    const packages = await readTerminologyPackagesSignal(config.updateStateDir, now())
    return renderTerminology({
      state,
      packages: packages?.packages ?? [],
      agentMode,
      recoverySession: kind === "recovery",
      mayManage: kind === "password" && agentMode === "healthy" && terminologyFresh && !blockedPhase,
      ...extra,
    }, locale, kind)
  }

  app.get("/status/terminology", async context => {
    const locale = currentLocale(context)
    const kind = auth.validateSessionKind(getCookie(context, COOKIE_NAME))
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    return context.html(await terminologyPage(locale, kind))
  })

  app.post("/status/terminology/actions", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (kind !== "password") {
      return context.html(await terminologyPage(locale, kind, {
        error: localize(
          locale,
          "Console-recovery sessions cannot change terminology. Nothing was requested.",
          "Аварийните сесии от конзолата не могат да променят терминологията. Не е подадена заявка.",
        ),
      }), 403)
    }
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 4096) {
      return context.html(await terminologyPage(locale, kind, {
        error: localize(locale, "The terminology request is invalid.", "Заявката за терминология е невалидна."),
      }), 400)
    }
    const parsed = await context.req.parseBody().catch(() => null)
    const body = isRecord(parsed) ? parsed : null
    const action = body?.action
    if (!body || typeof body.password !== "string"
      || !["import", "resume", "rollback", "finalize"].includes(String(action))) {
      return context.html(await terminologyPage(locale, kind, {
        error: localize(locale, "The terminology request is invalid.", "Заявката за терминология е невалидна."),
      }), 400)
    }
    const terminologyAction = action as "import" | "resume" | "rollback" | "finalize"
    const expectedConfirmation = {
      import: "STOP-CLINICAL-SERVICES",
      resume: "STOP-CLINICAL-SERVICES",
      rollback: "ROLLBACK-TERMINOLOGY",
      finalize: "DELETE-ROLLBACK-GENERATION",
    }[terminologyAction]
    const needsPackage = terminologyAction === "import" || terminologyAction === "resume"
    const packageDirectory = needsPackage && typeof body.packageDirectory === "string"
      ? body.packageDirectory.trim() : null
    if (body.confirmation !== expectedConfirmation
      || (needsPackage && (!packageDirectory
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(packageDirectory)))
      || (!needsPackage && body.packageDirectory !== undefined)) {
      return context.html(await terminologyPage(locale, kind, {
        error: localize(
          locale,
          "The required confirmation or package directory is invalid. Nothing was requested.",
          "Задължителното потвърждение или името на папката е невалидно. Не е подадена заявка.",
        ),
      }), 400)
    }

    const currentState = await readTerminologyAgentSignal(config.updateStateDir, now())
    const [agent, installation] = await Promise.all([
      readAgentSignal(config.updateStateDir, now()),
      readAgentInstallationSignal(config.updateStateDir, now()),
    ])
    const agentFresh = agent !== null && now() - Date.parse(agent.observedAt) <= 10 * 60_000
    const terminologyFresh = currentState !== null
      && now() - Date.parse(currentState.observedAt) <= 10 * 60_000
    const eligible = installation?.mode !== "console-only" && agentFresh && terminologyFresh
      && !["accepted", "working", "needs-operator"].includes(currentState?.phase ?? "needs-operator")
      && (terminologyAction !== "resume" || currentState?.pendingPhase !== undefined)
      && (terminologyAction !== "import" || currentState?.pendingPhase === undefined)
      && (!["rollback", "finalize"].includes(terminologyAction) || currentState?.rollbackAvailable === true)
    if (!eligible) {
      return context.html(await terminologyPage(locale, kind, {
        error: localize(
          locale,
          "The host is not currently offering that terminology operation. The page has been refreshed and nothing was requested.",
          "Сървърът в момента не предлага тази операция с терминология. Страницата е обновена и не е подадена заявка.",
        ),
      }), 409)
    }
    try {
      await auth.reauthenticatePassword(sessionToken, body.password)
    } catch (error) {
      const rateLimited = error instanceof AuthError && error.code === "RATE_LIMITED"
      return context.html(await terminologyPage(locale, kind, {
        error: rateLimited
          ? localize(locale, "Too many confirmation attempts. Wait 15 minutes before trying again.", "Твърде много опити за потвърждение. Изчакайте 15 минути, преди да опитате отново.")
          : localize(locale, "The administrator password was not accepted. Nothing was requested.", "Администраторската парола не беше приета. Не е подадена заявка."),
      }), rateLimited ? 429 : 401)
    }
    const administrator = auth.statusSessionPrincipal(sessionToken)
    if (!administrator || administrator.kind !== "password") {
      return context.html(await terminologyPage(locale, kind, {
        error: localize(locale, "The administrator identity is unavailable. Nothing was requested.", "Самоличността на администратора не е достъпна. Не е подадена заявка."),
      }), 409)
    }
    const requestId = newRequestId()
    const outcome = await submitTerminologyRequest(config.updateRequestsDir, {
      requestId,
      action: terminologyAction,
      packageDirectory,
      operatorRef: `status-operator-${sha256(administrator.email).slice(0, 16)}`,
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))
    if (outcome !== "submitted") {
      const message = outcome === "already-pending"
        ? localize(locale, "A terminology operation is already waiting on the host. Nothing replaced it.", "Операция с терминология вече чака на сървъра. Тя не е заменена.")
        : localize(locale, "The terminology request could not be recorded. Nothing was changed.", "Заявката за терминология не можа да бъде записана. Нищо не е променено.")
      return context.html(await terminologyPage(locale, kind, { error: message }), outcome === "already-pending" ? 409 : 500)
    }
    db.insertEvent({
      id: requestId,
      producer: "status-terminology",
      occurredAt: now(),
      code: `STATUS_TERMINOLOGY_${terminologyAction.toUpperCase()}_REQUESTED`,
      severity: "info",
      message: "A governed terminology operation was requested",
      facts: {},
    })
    return context.redirect("/status/terminology", 303)
  })

  // ── maintenance: backup now, restore drill, site settings ──────────────────
  //
  // Same shape as terminology: the browser sends a fixed action confirmed with
  // the administrator password. A settings change is previewed first, and the
  // confirmation is bound to this session and to the exact proposal. The root
  // host agent checks every request again and does the work.

  /** The pseudonymous reference a password session's requests carry. */
  const operatorRefOf = (sessionToken: string | undefined): string | null => {
    const administrator = auth.statusSessionPrincipal(sessionToken)
    return administrator?.kind === "password" ? `status-operator-${sha256(administrator.email).slice(0, 16)}` : null
  }

  const maintenanceView = async (
    kind: "password" | "recovery",
    { sessionToken, ...extra }: { notice?: string; error?: string; sessionToken?: string } = {},
  ): Promise<MaintenanceView> => {
    const [state, settings, offhost, hostOs, supportBundle, agent, installation, escrowOffer] = await Promise.all([
      readMaintenanceAgentSignal(config.updateStateDir, now()),
      readSiteConfigSignal(config.updateStateDir),
      readOffhostSignal(config.updateStateDir, now()),
      readHostOsSignal(config.updateStateDir, now()),
      readSupportBundle(config.updateStateDir),
      readAgentSignal(config.updateStateDir, now()),
      readAgentInstallationSignal(config.updateStateDir, now()),
      readSecretsEscrowOffer(config.updateStateDir, now()),
    ])
    const agentFresh = agent !== null && now() - Date.parse(agent.observedAt) <= 10 * 60_000
    const agentMode = installation?.mode === "console-only" ? "console-only" as const
      : agentFresh ? "healthy" as const
        : installation?.mode === "agent" || agent !== null ? "failed" as const
          : "unconfigured" as const
    const idle = state !== null && !["accepted", "working", "needs-operator"].includes(state.phase)
    return {
      agentMode,
      state,
      settings,
      offhost,
      hostOs,
      supportBundle,
      secretsEscrow: {
        offer: escrowOffer,
        mine: escrowOffer !== null && escrowOffer.operatorRef === operatorRefOf(sessionToken),
        statusOpenToAllPrivate: networkListsState(settings)?.statusOpenToAllPrivate !== false,
      },
      recoverySession: kind === "recovery",
      mayManage: kind === "password" && agentMode === "healthy" && idle,
      ...extra,
    }
  }
  const maintenancePage = async (
    locale: StatusLocale,
    kind: "password" | "recovery",
    extra: { notice?: string; error?: string; sessionToken?: string } = {},
    section?: string,
  ) => renderMaintenance(await maintenanceView(kind, extra), locale, kind, section)

  const maintenanceGet = async (context: Context, section?: string) => {
    const locale = currentLocale(context)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    return context.html(await maintenancePage(locale, kind, { sessionToken }, section))
  }

  app.get("/status/maintenance", context => maintenanceGet(context))
  // One address per maintenance section, each written out.
  //
  // Not a :section parameter: /status/maintenance/support-bundle is the
  // download itself, and a pattern that also matched it would hand back a page
  // where a file was expected. Static routes cannot shadow one another.
  //
  // Written as literals rather than a loop so the navigation registry test,
  // which scans this file for registered status paths, can still see them. A
  // route it cannot see is a route nobody is checking.
  app.get("/status/maintenance/backups", context => maintenanceGet(context, "backups"))
  app.get("/status/maintenance/offhost", context => maintenanceGet(context, "offhost"))
  app.get("/status/maintenance/host-os", context => maintenanceGet(context, "host-os"))
  app.get("/status/maintenance/escrow", context => maintenanceGet(context, "escrow"))
  app.get("/status/maintenance/support", context => maintenanceGet(context, "support"))
  app.get("/status/maintenance/rotation", context => maintenanceGet(context, "rotation"))
  app.get("/status/maintenance/settings", context => maintenanceGet(context, "settings"))
  app.get("/status/maintenance/advanced", context => maintenanceGet(context, "advanced"))

  /** The checks every maintenance POST shares, in order. A string is the refusal. */
  const maintenanceBody = async (
    context: Context,
    locale: StatusLocale,
    kind: "password" | "recovery",
  ): Promise<{ refusal: string; status: 400 | 403 } | { body: Record<string, unknown> }> => {
    if (kind !== "password") {
      return { refusal: await maintenancePage(locale, kind, {
        error: localize(locale, "Console-recovery sessions cannot request maintenance. Nothing was requested.", "Аварийните сесии от конзолата не могат да заявяват поддръжка. Не е подадена заявка."),
      }), status: 403 as const }
    }
    const contentLength = Number(context.req.header("content-length") ?? "0")
    const parsed = Number.isFinite(contentLength) && contentLength <= 8192
      ? await context.req.parseBody().catch(() => null) : null
    if (!isRecord(parsed)) {
      return { refusal: await maintenancePage(locale, kind, {
        error: localize(locale, "The maintenance request is invalid. Nothing was requested.", "Заявката за поддръжка е невалидна. Не е подадена заявка."),
      }), status: 400 as const }
    }
    return { body: parsed }
  }

  const confirmAdministrator = async (
    sessionToken: string | undefined,
    password: unknown,
    locale: StatusLocale,
  ): Promise<{ operatorRef: string } | { refusal: string; status: 401 | 409 | 429 }> => {
    if (typeof password !== "string") {
      return { refusal: await maintenancePage(locale, "password", {
        error: localize(locale, "The administrator password was not accepted. Nothing was requested.", "Администраторската парола не беше приета. Не е подадена заявка."),
      }), status: 401 }
    }
    try {
      await auth.reauthenticatePassword(sessionToken, password)
    } catch (error) {
      const rateLimited = error instanceof AuthError && error.code === "RATE_LIMITED"
      return { refusal: await maintenancePage(locale, "password", {
        error: rateLimited
          ? localize(locale, "Too many confirmation attempts. Wait 15 minutes before trying again.", "Твърде много опити за потвърждение. Изчакайте 15 минути, преди да опитате отново.")
          : localize(locale, "The administrator password was not accepted. Nothing was requested.", "Администраторската парола не беше приета. Не е подадена заявка."),
      }), status: rateLimited ? 429 : 401 }
    }
    const administrator = auth.statusSessionPrincipal(sessionToken)
    if (!administrator || administrator.kind !== "password") {
      return { refusal: await maintenancePage(locale, "password", {
        error: localize(locale, "The administrator identity is unavailable. Nothing was requested.", "Самоличността на администратора не е достъпна. Не е подадена заявка."),
      }), status: 409 }
    }
    return { operatorRef: `status-operator-${sha256(administrator.email).slice(0, 16)}` }
  }

  const notOffered = (locale: StatusLocale) => maintenancePage(locale, "password", {
    error: localize(locale, "The host is not offering maintenance right now. The page has been refreshed and nothing was requested.", "Сървърът в момента не предлага поддръжка. Страницата е обновена и не е подадена заявка."),
  })

  const submitted = (body: Record<string, unknown>) => {
    const values: Record<string, string> = {}
    for (const setting of EDITABLE_SETTINGS) {
      const value = body[setting.key]
      if (typeof value === "string") values[setting.key] = value.trim().replace(/\s+/g, " ")
    }
    return values
  }

  /** The proposal these values make, or the reason there is none. */
  const settingsProposal = async (context: Context, values: Record<string, string>, locale: StatusLocale) => {
    const invalid = EDITABLE_SETTINGS.filter(setting => values[setting.key] !== undefined
      && !validSettingValue(setting, values[setting.key]!))
    if (invalid.length > 0) {
      return { error: localize(
        locale,
        `These values are not valid: ${invalid.map(setting => setting.en).join(", ")}. Nothing was requested.`,
        `Тези стойности са невалидни: ${invalid.map(setting => setting.bg).join(", ")}. Не е подадена заявка.`,
      ) }
    }
    const current = await readSiteConfigSignal(config.updateStateDir)
    const proposal = current ? buildSettingsProposal(current, values) : null
    if (!current || !proposal) {
      return { error: localize(locale, "The host has not reported settings that can be changed here. Use the console: sudo losporctl config plan.", "Сървърът не е отчел настройки, които могат да се променят тук. Използвайте конзолата: sudo losporctl config plan.") }
    }
    // Nobody locks themselves out of this page from this page.
    const statusList = proposal.changes.find(change => change.key === "HOSPITAL_STATUS_ALLOWED_CIDRS")
    if (statusList && !cidrListContains(statusList.after, clientAddress(context.req.raw))) {
      return { error: localize(locale, "The new Status network list does not include the computer you are using, so saving it would lock you out. Nothing was requested.", "Новият мрежов списък за Status не включва компютъра, който използвате, и запазването му би ви заключило отвън. Не е подадена заявка.") }
    }
    return { proposal }
  }

  app.post("/status/maintenance/actions", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const parsed = await maintenanceBody(context, locale, kind)
    if ("refusal" in parsed) return context.html(parsed.refusal, parsed.status)
    const action = parsed.body.action
    if (action !== "backup" && action !== "drill" && action !== "offhost-test" && action !== "offhost-drill" && action !== "offhost-disable"
      && action !== "os-update" && action !== "os-reboot" && action !== "support-bundle" && action !== "rotate-credentials") {
      return context.html(await maintenancePage(locale, kind, {
        error: localize(locale, "The maintenance request is invalid. Nothing was requested.", "Заявката за поддръжка е невалидна. Не е подадена заявка."),
      }), 400)
    }
    // Rotation signs everyone out of the clinical apps, so it needs the literal
    // confirmation as well as the password.
    if (action === "rotate-credentials" && parsed.body.confirmation !== "ROTATE-CREDENTIALS") {
      return context.html(await maintenancePage(locale, kind, {
        error: localize(locale, "Confirm that everyone signs in again before rotating the credentials. Nothing was requested.", "Потвърдете, че всички ще влязат отново, преди да смените данните за достъп. Не е подадена заявка."),
      }), 400)
    }
    const offered = await maintenanceView(kind)
    // A restart is offered only when Ubuntu asks for one; at any other time it
    // is a console decision (sudo losporctl host reboot).
    if (!offered.mayManage || (action.startsWith("offhost-") && !offered.offhost?.destination)
      || (action.startsWith("os-") && !offered.hostOs) || (action === "os-reboot" && !offered.hostOs?.rebootRequired)) {
      return context.html(await notOffered(locale), 409)
    }
    const confirmed = await confirmAdministrator(sessionToken, parsed.body.password, locale)
    if ("refusal" in confirmed) return context.html(confirmed.refusal, confirmed.status)
    const requestId = newRequestId()
    const outcome = await submitMaintenanceRequest(config.updateRequestsDir, {
      requestId, action, operatorRef: confirmed.operatorRef,
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))
    if (outcome !== "submitted") {
      return context.html(await maintenancePage(locale, kind, {
        error: outcome === "already-pending"
          ? localize(locale, "A maintenance request is already waiting on the host. Nothing replaced it.", "Заявка за поддръжка вече чака на сървъра. Тя не е заменена.")
          : localize(locale, "The maintenance request could not be recorded. Nothing was changed.", "Заявката за поддръжка не можа да бъде записана. Нищо не е променено."),
      }), outcome === "already-pending" ? 409 : 500)
    }
    db.insertEvent({
      id: requestId,
      producer: "status-maintenance",
      occurredAt: now(),
      code: ({
        backup: "STATUS_MAINTENANCE_BACKUP_REQUESTED",
        drill: "STATUS_MAINTENANCE_DRILL_REQUESTED",
        "offhost-test": "STATUS_MAINTENANCE_OFFHOST_TEST_REQUESTED",
        "offhost-drill": "STATUS_MAINTENANCE_OFFHOST_DRILL_REQUESTED",
        "offhost-disable": "STATUS_MAINTENANCE_OFFHOST_DISABLE_REQUESTED",
        "os-update": "STATUS_MAINTENANCE_OS_UPDATE_REQUESTED",
        "os-reboot": "STATUS_MAINTENANCE_OS_REBOOT_REQUESTED",
        "support-bundle": "STATUS_MAINTENANCE_SUPPORT_BUNDLE_REQUESTED",
        "rotate-credentials": "STATUS_MAINTENANCE_ROTATION_REQUESTED",
      } as const)[action],
      severity: "info",
      message: ({
        backup: "A backup was requested from Status",
        drill: "A restore drill was requested from Status",
        "offhost-test": "An off-host connection test was requested from Status",
        "offhost-drill": "A drill from the off-host copy was requested from Status",
        "offhost-disable": "Turning off off-host copies was requested from Status",
        "os-update": "Installing Ubuntu security updates was requested from Status",
        "os-reboot": "A server restart was requested from Status",
        "support-bundle": "A support bundle was requested from Status",
        "rotate-credentials": "A credential rotation was requested from Status",
      } as const)[action],
      facts: { operatorRef: confirmed.operatorRef },
    })
    return context.redirect("/status/maintenance", 303)
  })

  // The newest support bundle, as a download. losporctl reduced it to
  // allowlisted fields and it is checked again here; a console-recovery session
  // may view the page but not take the file away.
  app.get("/status/maintenance/support-bundle", async context => {
    const locale = currentLocale(context)
    const kind = auth.validateSessionKind(getCookie(context, COOKIE_NAME))
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (kind !== "password") {
      return context.html(await maintenancePage(locale, kind, {
        error: localize(locale, "Console-recovery sessions cannot download the support bundle.", "Аварийните сесии от конзолата не могат да изтеглят файла за поддръжка."),
      }), 403)
    }
    const bundle = await readSupportBundle(config.updateStateDir)
    if (!bundle) {
      return context.html(await maintenancePage(locale, kind, {
        error: localize(locale, "There is no support bundle to download. Write one first.", "Няма файл за поддръжка за изтегляне. Първо запишете такъв."),
      }), 404)
    }
    return context.body(bundle.content, 200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="lospor-support-${bundle.createdAt.replace(/[^0-9TZ]/g, "")}.json"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    })
  })

  // Secrets escrow from Status. Taking every secret of the installation away is
  // the most sensitive thing Status does, so beyond the ordinary maintenance
  // checks it needs Status limited to the IT management networks, the password
  // and a fresh authenticator code. Status generates the passphrase, shows it
  // once and keeps nothing; the host writes and checks the copy, allows three a
  // day, and records escrow when Status reports the download.
  app.post("/status/maintenance/escrow", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const parsed = await maintenanceBody(context, locale, kind)
    if ("refusal" in parsed) return context.html(parsed.refusal, parsed.status)
    const offered = await maintenanceView(kind, { sessionToken })
    if (!offered.mayManage) return context.html(await notOffered(locale), 409)
    if (offered.secretsEscrow?.statusOpenToAllPrivate !== false) {
      return context.html(await maintenancePage(locale, kind, {
        sessionToken,
        error: localize(locale, "Status still opens from every private network. Set its network list first. Nothing was requested.", "Status все още се отваря от всички частни мрежи. Първо задайте мрежите му. Не е подадена заявка."),
      }), 409)
    }
    const { password, code } = parsed.body
    const refused = (message: [string, string], status: 401 | 429) => maintenancePage(locale, kind, {
      sessionToken, error: localize(locale, message[0], message[1]),
    }).then(html => context.html(html, status))
    if (typeof password !== "string" || typeof code !== "string") {
      return refused(["The password and authenticator code were not accepted. Nothing was requested.", "Паролата и кодът за удостоверяване не бяха приети. Не е подадена заявка."], 401)
    }
    try {
      await auth.reauthenticateWithMfa(sessionToken, password, code)
    } catch (error) {
      return error instanceof AuthError && error.code === "RATE_LIMITED"
        ? refused(["Too many confirmation attempts. Wait 15 minutes before trying again.", "Твърде много опити за потвърждение. Изчакайте 15 минути, преди да опитате отново."], 429)
        : refused(["The password and authenticator code were not accepted. Nothing was requested.", "Паролата и кодът за удостоверяване не бяха приети. Не е подадена заявка."], 401)
    }
    const operatorRef = operatorRefOf(sessionToken)
    if (!operatorRef) return context.html(await notOffered(locale), 409)
    const passphrase = generateEscrowPassphrase(randomBytes)
    const content = `${passphrase}\n`
    const requestId = newRequestId()
    const outcome = await submitMaintenanceRequest(config.updateRequestsDir, {
      requestId, action: "secrets-escrow", operatorRef, proposal: { content, sha256: sha256(content) },
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))
    if (outcome !== "submitted") {
      return context.html(await maintenancePage(locale, kind, {
        sessionToken,
        error: outcome === "already-pending"
          ? localize(locale, "A maintenance request is already waiting on the host. Nothing replaced it.", "Заявка за поддръжка вече чака на сървъра. Тя не е заменена.")
          : localize(locale, "The escrow request could not be recorded. Nothing was changed.", "Заявката за съхранение не можа да бъде записана. Нищо не е променено."),
      }), outcome === "already-pending" ? 409 : 500)
    }
    db.insertEvent({
      id: requestId,
      producer: "status-maintenance",
      occurredAt: now(),
      code: "STATUS_MAINTENANCE_ESCROW_REQUESTED",
      severity: "warning",
      message: "A secrets escrow copy was requested from Status",
      facts: { operatorRef },
    })
    context.header("cache-control", "no-store")
    return context.html(renderEscrowPassphrase(passphrase, locale, kind))
  })

  // The copy, once, to the administrator who asked for it and saw its password.
  // Handing it out is reported to the host, which records escrow and removes it.
  app.get("/status/maintenance/escrow/download", async context => {
    const locale = currentLocale(context)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const unavailable = async (message: [string, string], status: 403 | 404 | 409) =>
      context.html(await maintenancePage(locale, kind, { sessionToken, error: localize(locale, message[0], message[1]) }), status)
    if (kind !== "password") {
      return unavailable(["Console-recovery sessions cannot download the escrow copy.", "Аварийните сесии от конзолата не могат да изтеглят копието за съхранение."], 403)
    }
    const offer = await readSecretsEscrowOffer(config.updateStateDir, now())
    const operatorRef = operatorRefOf(sessionToken)
    if (!offer) {
      return unavailable(["There is no escrow copy to download. Create one first; a copy is offered for 30 minutes.", "Няма копие за съхранение за изтегляне. Първо създайте такова; копието се предлага 30 минути."], 404)
    }
    if (offer.operatorRef !== operatorRef) {
      return unavailable(["This escrow copy was made by another administrator. Only they saw its password, so only they can download it.", "Това копие за съхранение е направено от друг администратор. Само той видя паролата му, затова само той може да го изтегли."], 403)
    }
    const bytes = await readSecretsEscrowBundle(config.updateStateDir, offer)
    if (!bytes) {
      return unavailable(["The escrow copy on the server does not match what was offered. Create a new copy.", "Копието за съхранение на сървъра не съвпада с предложеното. Създайте ново копие."], 409)
    }
    const requestId = newRequestId()
    const outcome = await submitMaintenanceRequest(config.updateRequestsDir, {
      requestId, action: "secrets-escrow-delivered", operatorRef, delivered: offer.sha256,
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))
    if (outcome !== "submitted") {
      return unavailable(["Another maintenance request is waiting on the host. Download the escrow copy again in a minute.", "Друга заявка за поддръжка чака на сървъра. Изтеглете копието за съхранение отново след минута."], 409)
    }
    db.insertEvent({
      id: requestId,
      producer: "status-maintenance",
      occurredAt: now(),
      code: "STATUS_SECRETS_ESCROW_DOWNLOADED",
      severity: "warning",
      message: "A secrets escrow copy was downloaded from Status",
      facts: { operatorRef, sha256: offer.sha256 },
    })
    return context.body(new Uint8Array(bytes), 200, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${offer.fileName}"`,
      "content-length": String(bytes.length),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    })
  })

  // Setting up off-host copies names only a destination: a mount path, or an
  // SFTP host, port, user and directory. The host generates and keeps every key.
  app.post("/status/maintenance/offhost", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const parsed = await maintenanceBody(context, locale, kind)
    if ("refusal" in parsed) return context.html(parsed.refusal, parsed.status)
    const destination = offhostDestinationFromForm(parsed.body)
    if (!destination) {
      return context.html(await maintenancePage(locale, kind, {
        error: localize(locale, "The destination is not valid: a share needs an absolute mount path outside the appliance; SFTP needs a server, port, user and directory. Nothing was requested.", "Мястото е невалидно: споделената папка изисква абсолютен път извън системата; SFTP изисква сървър, порт, потребител и директория. Не е подадена заявка."),
      }), 400)
    }
    if (!(await maintenanceView(kind)).mayManage) return context.html(await notOffered(locale), 409)
    const confirmed = await confirmAdministrator(sessionToken, parsed.body.password, locale)
    if ("refusal" in confirmed) return context.html(confirmed.refusal, confirmed.status)
    const requestId = newRequestId()
    const outcome = await submitMaintenanceRequest(config.updateRequestsDir, {
      requestId, action: "offhost-config", operatorRef: confirmed.operatorRef, proposal: buildOffhostProposal(destination),
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))
    if (outcome !== "submitted") {
      return context.html(await maintenancePage(locale, kind, {
        error: outcome === "already-pending"
          ? localize(locale, "A maintenance request is already waiting on the host. Nothing replaced it.", "Заявка за поддръжка вече чака на сървъра. Тя не е заменена.")
          : localize(locale, "The destination could not be recorded. Nothing was changed.", "Мястото не можа да бъде записано. Нищо не е променено."),
      }), outcome === "already-pending" ? 409 : 500)
    }
    db.insertEvent({
      id: requestId,
      producer: "status-maintenance",
      occurredAt: now(),
      code: "STATUS_MAINTENANCE_OFFHOST_CONFIG_REQUESTED",
      severity: "info",
      message: "An off-host backup destination was requested from Status",
      facts: { operatorRef: confirmed.operatorRef, type: destination.type },
    })
    return context.redirect("/status/maintenance", 303)
  })

  // Changes nothing. A POST so the preview cannot be prefetched or linked to.
  app.post("/status/maintenance/settings/preview", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const parsed = await maintenanceBody(context, locale, kind)
    if ("refusal" in parsed) return context.html(parsed.refusal, parsed.status)
    if (!(await maintenanceView(kind)).mayManage) return context.html(await notOffered(locale), 409)
    const values = submitted(parsed.body)
    const result = await settingsProposal(context, values, locale)
    if ("error" in result) return context.html(await maintenancePage(locale, kind, { error: result.error }), 400)
    if (result.proposal.changes.length === 0) {
      return context.html(await maintenancePage(locale, kind, {
        notice: localize(locale, "Nothing to change: these are the settings already in use.", "Няма какво да се промени: това са настройките, които вече се използват."),
      }))
    }
    const confirmation = mintConfirmation(config.rateLimitKey, sha256(sessionToken!), result.proposal.sha256, now())
    return context.html(renderSettingsConfirm(result.proposal, values, confirmation, locale))
  })

  app.post("/status/maintenance/settings/apply", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const parsed = await maintenanceBody(context, locale, kind)
    if ("refusal" in parsed) return context.html(parsed.refusal, parsed.status)
    const result = await settingsProposal(context, submitted(parsed.body), locale)
    if ("error" in result) return context.html(await maintenancePage(locale, kind, { error: result.error }), 400)
    const proposal = result.proposal
    // The settings on the host must still be the ones the preview was built on,
    // and the confirmation must be this session's, for this exact proposal.
    if (parsed.body.proposalSha256 !== proposal.sha256
      || !verifyConfirmation(config.rateLimitKey, sha256(sessionToken!), proposal.sha256, String(parsed.body.confirmation ?? ""), now())) {
      return context.html(await maintenancePage(locale, kind, {
        error: localize(locale, "That confirmation has expired, or the settings on the host changed while you were reviewing. Nothing was requested; start again.", "Потвърждението е изтекло или настройките на сървъра се промениха, докато ги преглеждахте. Не е подадена заявка; започнете отново."),
      }), 409)
    }
    if (proposal.changes.length === 0 || !(await maintenanceView(kind)).mayManage) {
      return context.html(await notOffered(locale), 409)
    }
    const confirmed = await confirmAdministrator(sessionToken, parsed.body.password, locale)
    if ("refusal" in confirmed) return context.html(confirmed.refusal, confirmed.status)
    const requestId = newRequestId()
    const outcome = await submitMaintenanceRequest(config.updateRequestsDir, {
      requestId,
      action: "config",
      operatorRef: confirmed.operatorRef,
      proposal: { content: proposal.content, sha256: proposal.sha256 },
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))
    if (outcome !== "submitted") {
      return context.html(await maintenancePage(locale, kind, {
        error: outcome === "already-pending"
          ? localize(locale, "A maintenance request is already waiting on the host. Nothing replaced it.", "Заявка за поддръжка вече чака на сървъра. Тя не е заменена.")
          : localize(locale, "The settings request could not be recorded. Nothing was changed.", "Заявката за настройките не можа да бъде записана. Нищо не е променено."),
      }), outcome === "already-pending" ? 409 : 500)
    }
    db.insertEvent({
      id: requestId,
      producer: "status-maintenance",
      occurredAt: now(),
      code: "STATUS_MAINTENANCE_SETTINGS_REQUESTED",
      severity: "info",
      message: "A site settings change was requested from Status",
      facts: { operatorRef: confirmed.operatorRef, settings: proposal.changes.map(change => change.key).join(" ") },
    })
    return context.redirect("/status/maintenance", 303)
  })

  // Advanced settings follow the site-settings shape exactly: preview, then a
  // confirmation bound to this session and this exact advanced.env, then the
  // administrator password. "Return every value to its default" is a preview
  // of the defaults. The host checks every value against its limits again.

  const advancedSubmitted = async (body: Record<string, unknown>) => {
    const values: Record<string, string> = {}
    if (body.reset === "all") {
      const current = await readSiteConfigSignal(config.updateStateDir)
      for (const label of ADVANCED_SETTINGS) {
        const setting = current?.advanced?.[label.key]
        if (setting) values[label.key] = advancedDisplayValue(label, setting.default)
      }
      return values
    }
    for (const label of ADVANCED_SETTINGS) {
      const value = body[label.key]
      if (typeof value === "string") values[label.key] = value.trim().replace(",", ".")
    }
    return values
  }

  const advancedProposal = async (values: Record<string, string>, locale: StatusLocale) => {
    const current = await readSiteConfigSignal(config.updateStateDir)
    const result = current ? buildAdvancedProposal(current, values) : null
    if (!result) {
      return { error: localize(locale, "The host has not reported advanced settings that can be changed here. Use the console: sudo losporctl config advanced", "Сървърът не е отчел разширени настройки, които могат да се променят тук. Използвайте конзолата: sudo losporctl config advanced") }
    }
    if ("invalid" in result) {
      const names = (language: "en" | "bg") => result.invalid
        .map(key => ADVANCED_SETTINGS.find(label => label.key === key)?.[language] ?? key).join(", ")
      return { error: localize(locale, `These values are outside their limits: ${names("en")}. Nothing was requested.`, `Тези стойности са извън допустимите граници: ${names("bg")}. Не е подадена заявка.`) }
    }
    return { proposal: result }
  }

  // Changes nothing. A POST so the preview cannot be prefetched or linked to.
  app.post("/status/maintenance/advanced/preview", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const parsed = await maintenanceBody(context, locale, kind)
    if ("refusal" in parsed) return context.html(parsed.refusal, parsed.status)
    if (!(await maintenanceView(kind)).mayManage) return context.html(await notOffered(locale), 409)
    const values = await advancedSubmitted(parsed.body)
    const result = await advancedProposal(values, locale)
    if ("error" in result) return context.html(await maintenancePage(locale, kind, { error: result.error }), 400)
    if (result.proposal.changes.length === 0) {
      return context.html(await maintenancePage(locale, kind, {
        notice: localize(locale, "Nothing to change: these are the values already in use.", "Няма какво да се промени: това са стойностите, които вече се използват."),
      }))
    }
    const confirmation = mintConfirmation(config.rateLimitKey, sha256(sessionToken!), result.proposal.sha256, now())
    return context.html(renderAdvancedConfirm(result.proposal, values, confirmation, locale))
  })

  app.post("/status/maintenance/advanced/apply", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    const parsed = await maintenanceBody(context, locale, kind)
    if ("refusal" in parsed) return context.html(parsed.refusal, parsed.status)
    const result = await advancedProposal(await advancedSubmitted(parsed.body), locale)
    if ("error" in result) return context.html(await maintenancePage(locale, kind, { error: result.error }), 400)
    const proposal = result.proposal
    if (parsed.body.proposalSha256 !== proposal.sha256
      || !verifyConfirmation(config.rateLimitKey, sha256(sessionToken!), proposal.sha256, String(parsed.body.confirmation ?? ""), now())) {
      return context.html(await maintenancePage(locale, kind, {
        error: localize(locale, "That confirmation has expired, or the values on the host changed while you were reviewing. Nothing was requested; start again.", "Потвърждението е изтекло или стойностите на сървъра се промениха, докато ги преглеждахте. Не е подадена заявка; започнете отново."),
      }), 409)
    }
    if (proposal.changes.length === 0 || !(await maintenanceView(kind)).mayManage) {
      return context.html(await notOffered(locale), 409)
    }
    const confirmed = await confirmAdministrator(sessionToken, parsed.body.password, locale)
    if ("refusal" in confirmed) return context.html(confirmed.refusal, confirmed.status)
    const requestId = newRequestId()
    const outcome = await submitMaintenanceRequest(config.updateRequestsDir, {
      requestId,
      action: "advanced",
      operatorRef: confirmed.operatorRef,
      proposal: { content: proposal.content, sha256: proposal.sha256 },
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))
    if (outcome !== "submitted") {
      return context.html(await maintenancePage(locale, kind, {
        error: outcome === "already-pending"
          ? localize(locale, "A maintenance request is already waiting on the host. Nothing replaced it.", "Заявка за поддръжка вече чака на сървъра. Тя не е заменена.")
          : localize(locale, "The advanced settings request could not be recorded. Nothing was changed.", "Заявката за разширените настройки не можа да бъде записана. Нищо не е променено."),
      }), outcome === "already-pending" ? 409 : 500)
    }
    db.insertEvent({
      id: requestId,
      producer: "status-maintenance",
      occurredAt: now(),
      code: "STATUS_MAINTENANCE_ADVANCED_REQUESTED",
      severity: "info",
      message: "An advanced settings change was requested from Status",
      facts: { operatorRef: confirmed.operatorRef, settings: proposal.changes.map(change => change.key).join(" ") },
    })
    return context.redirect("/status/maintenance", 303)
  })

  // ── clinical go-live readiness ─────────────────────────────────────────────
  //
  // The verdict is computed from the stored component observations and the
  // terminology projection on every request, so it cannot lag what the
  // dashboard shows. Only the attestations a person makes are stored.

  // Where a password sign-in lands: the Go-live journey while the appliance is
  // installed but not yet approved, so the next step is the first thing seen,
  // and the overview otherwise. During maintenance or recovery the overview's
  // "needs attention" list is what matters, so it is not redirected there.
  const signedInLanding = async () => {
    const [terminology, siteConfig] = await Promise.all([
      readTerminologyAgentSignal(config.updateStateDir, now()),
      readSiteConfigSignal(config.updateStateDir),
    ])
    const { state } = evaluateGoLive({
      components: db.getDashboard(now()).components,
      terminology,
      networkLists: networkListsState(siteConfig),
      signoffs: db.listGoLiveSignoffs(),
      now: now(),
    })
    return state === "GO_LIVE_BLOCKED" ? "/status/go-live" : "/status/"
  }

  const goLivePage = async (
    locale: StatusLocale,
    kind: "password" | "recovery",
    extra: { notice?: string; error?: string } = {},
  ) => {
    const [terminology, siteConfig] = await Promise.all([
      readTerminologyAgentSignal(config.updateStateDir, now()),
      readSiteConfigSignal(config.updateStateDir),
    ])
    const view = evaluateGoLive({
      components: db.getDashboard(now()).components,
      terminology,
      networkLists: networkListsState(siteConfig),
      signoffs: db.listGoLiveSignoffs(),
      now: now(),
    })
    return renderGoLive({ ...view, mayManage: kind === "password", recoverySession: kind === "recovery", ...extra }, locale, kind)
  }

  app.get("/status/go-live", async context => {
    const locale = currentLocale(context)
    const kind = auth.validateSessionKind(getCookie(context, COOKIE_NAME))
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    return context.html(await goLivePage(locale, kind))
  })

  app.post("/status/go-live/signoff", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const sessionToken = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(sessionToken)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (kind !== "password") {
      return context.html(await goLivePage(locale, kind, {
        error: localize(locale, "Console-recovery sessions cannot record sign-offs. Nothing was changed.", "Аварийните сесии от конзолата не могат да записват потвърждения. Нищо не е променено."),
      }), 403)
    }
    const contentLength = Number(context.req.header("content-length") ?? "0")
    const parsed = Number.isFinite(contentLength) && contentLength <= 4096
      ? await context.req.parseBody().catch(() => null) : null
    const body = isRecord(parsed) ? parsed : null
    const note = typeof body?.note === "string" ? body.note.trim() : ""
    const action = body?.action
    if (!body || typeof body.password !== "string" || !isGoLiveSignoffItem(body.item)
      || (action !== "sign" && action !== "withdraw")
      || (action === "sign" && (note.length < 3 || note.length > 300
        || [...note].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)))) {
      return context.html(await goLivePage(locale, kind, {
        error: localize(locale, "The sign-off request is invalid. A note of 3 to 300 characters is required. Nothing was changed.", "Заявката за потвърждение е невалидна. Нужна е бележка от 3 до 300 знака. Нищо не е променено."),
      }), 400)
    }
    try {
      await auth.reauthenticatePassword(sessionToken, body.password)
    } catch (error) {
      const rateLimited = error instanceof AuthError && error.code === "RATE_LIMITED"
      return context.html(await goLivePage(locale, kind, {
        error: rateLimited
          ? localize(locale, "Too many confirmation attempts. Wait 15 minutes before trying again.", "Твърде много опити за потвърждение. Изчакайте 15 минути, преди да опитате отново.")
          : localize(locale, "The administrator password was not accepted. Nothing was changed.", "Администраторската парола не беше приета. Нищо не е променено."),
      }), rateLimited ? 429 : 401)
    }
    const administrator = auth.statusSessionPrincipal(sessionToken)
    if (!administrator || administrator.kind !== "password") {
      return context.html(await goLivePage(locale, kind, {
        error: localize(locale, "The administrator identity is unavailable. Nothing was changed.", "Самоличността на администратора не е достъпна. Нищо не е променено."),
      }), 409)
    }
    const operatorRef = `status-operator-${sha256(administrator.email).slice(0, 16)}`
    if (action === "sign") {
      db.recordGoLiveSignoff({ item: body.item, operatorRef, note, signedAt: now() })
    } else {
      db.withdrawGoLiveSignoff(body.item)
    }
    db.insertEvent({
      id: newRequestId(),
      producer: "status-go-live",
      occurredAt: now(),
      code: action === "sign" ? "STATUS_GO_LIVE_SIGNOFF_RECORDED" : "STATUS_GO_LIVE_SIGNOFF_WITHDRAWN",
      severity: "info",
      message: action === "sign" ? "A go-live sign-off was recorded" : "A go-live sign-off was withdrawn",
      facts: { item: body.item, operatorRef },
    })
    return context.redirect("/status/go-live", 303)
  })

  // ── the release page and its two-step confirmation ─────────────────────────
  //
  // All under /status/, so the Caddyfile allowlist already covers them and no
  // new boundary is introduced. Every one checks the session and the origin,
  // exactly as POST /status/login does.

  const releaseView = async (
    locale: StatusLocale,
    extra: { notice?: string; error?: string; mayApply?: boolean } = {},
  ): Promise<ReleaseView> => {
    const update = await readUpdateSignal(config.signalsDir, now())
    const [agent, installation] = await Promise.all([
      readAgentSignal(config.updateStateDir, now()),
      readAgentInstallationSignal(config.updateStateDir, now()),
    ])
    const agentFresh = agent !== null && now() - Date.parse(agent.observedAt) <= 10 * 60_000
    const agentMode = installation?.mode === "console-only" ? "console-only" as const
      : agentFresh ? "healthy" as const
        : installation?.mode === "agent" || agent !== null ? "failed" as const
          : "unconfigured" as const
    const operatorBlocked = agent?.phase === "needs-operator"
    const installedVersion = config.installedVersion ?? update?.installedVersion ?? "-"
    const fetchedVersion = agent?.preparedVersion ?? update?.fetchedVersion
    const [installedDossier, fetchedDossier] = await Promise.all([
      readReleaseDossier(config.updateStateDir, installedVersion),
      readReleaseDossier(config.updateStateDir, fetchedVersion),
    ])
    return {
      ...(installedDossier ? { installedDossier } : {}),
      ...(fetchedDossier ? { fetchedDossier } : {}),
      installedVersion: config.installedVersion ?? update?.installedVersion ?? "-",
      ...(update?.latestVersion === undefined ? {} : { latestVersion: update.latestVersion }),
      ...((agent?.preparedVersion ?? update?.fetchedVersion) === undefined ? {} : { fetchedVersion: agent?.preparedVersion ?? update?.fetchedVersion }),
      ...((agent?.preparedLockSha256 ?? update?.fetchedLockSha256) === undefined ? {} : { fetchedLockSha256: agent?.preparedLockSha256 ?? update?.fetchedLockSha256 }),
      ...(agent?.rollbackPolicy === undefined ? {} : { rollbackPolicy: agent.rollbackPolicy }),
      ...(agent?.phase === undefined ? {} : { agentPhase: agent.phase }),
      ...(agent?.resultCode === undefined ? {} : { agentCode: agent.resultCode }),
      ...(agent?.scheduledFor === undefined ? {} : { scheduledFor: agent.scheduledFor }),
      windowDescription: windowDescription(locale),
      agentMode,
      ...extra,
      mayPrepare: agentMode === "healthy" && !operatorBlocked,
      mayApply: (extra.mayApply ?? true) && agentMode === "healthy" && !operatorBlocked,
    }
  }

  app.get("/status/release", async context => {
    const locale = currentLocale(context)
    const session = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(session)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    return context.html(renderRelease(await releaseView(locale, { mayApply: kind === "password" }), locale, kind))
  })

  app.post("/status/actions/fetch", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    // A recovery session may download. Nothing running changes, and refusing it
    // would block the harmless half of the job for no benefit.
    const kind = auth.validateSessionKind(getCookie(context, COOKIE_NAME))
    if (!kind) {
      return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    }
    const view = await releaseView(locale)
    if (!view.mayPrepare || !view.latestVersion || view.latestVersion === view.installedVersion) {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "No healthy update agent can prepare that release.", "Няма работещ агент за обновяване, който да подготви тази версия."),
      }), locale))
    }
    const outcome = await requestFetch(config.updateRequestsDir, view.latestVersion, now())
      .catch(error => maintenanceRequestFailed(newRequestId(), error))
    if (outcome === "already-pending") {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "A release is already waiting to be prepared.", "Вече има версия, която чака да бъде подготвена."),
      }), locale))
    }
    if (outcome === "failed") {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "The preparation request could not be recorded. Nothing was downloaded.", "Заявката за подготовка не можа да бъде записана. Нищо не е изтеглено."),
      }), locale))
    }
    return context.redirect("/status/release", 303)
  })

  // Acts on nothing. A POST rather than a GET so the confirmation cannot be
  // prefetched, bookmarked, or arrived at by a link someone was sent.
  app.post("/status/actions/apply", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(session)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (kind !== "password") {
      return context.html(renderRelease(await releaseView(locale, { mayApply: false }), locale))
    }

    const body = await context.req.parseBody().catch(() => ({}))
    const target = isRecord(body) ? String(body.targetLockSha256 ?? "") : ""
    const view = await releaseView(locale)
    // The digest the page offered has to match the one still on offer. If a
    // newer release landed while the operator was reading, this is where they
    // find out rather than approving something they never saw.
    if (!/^[a-f0-9]{64}$/.test(target) || target !== view.fetchedLockSha256) {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "That release is no longer the one ready to apply. This page has been refreshed.", "Тази версия вече не е готовата за прилагане. Страницата е обновена."),
      }), locale))
    }

    const confirmation = mintConfirmation(config.rateLimitKey, sha256(session!), target, now())
    return context.html(renderApplyConfirm(
      view.fetchedVersion ?? localize(locale, "the downloaded release", "изтеглената версия"),
      target, confirmation, windowDescription(locale), locale, view.rollbackPolicy,
    ))
  })

  app.post("/status/actions/apply/confirm", async context => {
    const locale = currentLocale(context)
    if (!sameOrigin(context.req.raw)) return context.text(localize(locale, "Forbidden", "Забранено"), 403)
    const session = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(session)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth()), locale))
    if (kind !== "password") {
      return context.html(renderRelease(await releaseView(locale, { mayApply: false }), locale))
    }

    const body = await context.req.parseBody().catch(() => ({}))
    const target = isRecord(body) ? String(body.targetLockSha256 ?? "") : ""
    const confirmation = isRecord(body) ? String(body.confirmation ?? "") : ""
    const window = isRecord(body) && body.window === "override" ? "override" : "scheduled"

    if (!verifyConfirmation(config.rateLimitKey, sha256(session!), target, confirmation, now())) {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "That confirmation has expired or was not issued for this release. Start again.", "Потвърждението е изтекло или не е издадено за тази версия. Започнете отново."),
      }), locale))
    }

    const view = await releaseView(locale)
    if (target !== view.fetchedLockSha256 || view.fetchedVersion === undefined) {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "That release is no longer the one ready to apply. This page has been refreshed.", "Тази версия вече не е готовата за прилагане. Страницата е обновена."),
      }), locale))
    }

    const requestId = newRequestId()
    const outcome = await submitRequest(config.updateRequestsDir, {
      requestId,
      targetVersion: view.fetchedVersion,
      window,
    }, now()).catch(error => maintenanceRequestFailed(requestId, error))

    if (outcome === "already-pending") {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "An update is already waiting to be applied. Nothing further was requested.", "Обновяване вече чака да бъде приложено. Не е подадена нова заявка."),
      }), locale))
    }
    if (outcome === "failed") {
      return context.html(renderRelease(await releaseView(locale, {
        error: localize(locale, "The request could not be recorded. Nothing has been changed.", "Заявката не можа да бъде записана. Нищо не е променено."),
      }), locale))
    }
    return context.redirect("/status/release", 303)
  })
  app.get("/status/api/state", context => {
    if (!auth.validateSession(getCookie(context, COOKIE_NAME))) {
      return context.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
    }
    return context.json({ schemaVersion: 1, ...db.getDashboard(now()) })
  })

  app.notFound(context => context.json({ error: "Not found", code: "NOT_FOUND" }, 404))
  app.onError((_error, context) => context.json({ error: "Service unavailable", code: "INTERNAL_ERROR" }, 500))
  return app
}
