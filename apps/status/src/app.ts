import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { AuthService } from "./auth.js"
import { AuthError } from "./auth.js"
import type { StatusConfig } from "./config.js"
import type { StatusDatabase } from "./db.js"
import { parseSafeOperationalEvent } from "./event-contract.js"
import { readAgentSignal, readUpdateSignal } from "./signals.js"
import type { ReleaseView } from "./ui.js"
import { renderApplyConfirm, renderDashboard, renderLogin, renderRelease } from "./ui.js"
import {
  mintConfirmation,
  newRequestId,
  requestFetch,
  submitRequest,
  sweepExpired,
  verifyConfirmation,
} from "./update-requests.js"
import { constantTimeEqual, isRecord, safeJsonParse, sha256 } from "./util.js"

// Deliberately vague about the hours, and deliberately not read from
// configuration here. The maintenance window is the agent's to enforce; if
// Status held the values it could describe a window it does not control, and a
// page that names the wrong time is worse than one that names none. When a
// request is actually queued the agent reports the exact time, and that is what
// the page shows.
const WINDOW_DESCRIPTION =
  "Unless you choose to apply it immediately, this will be applied during the "
  + "overnight maintenance window, when no list is running."

const COOKIE_NAME = "lospor_status_session"
const NO_STORE = "private, no-store, max-age=0"

type AppDependencies = {
  db: StatusDatabase
  auth: AuthService
  config: StatusConfig
  now?: () => number
}

function securityHeaders(response: Response): void {
  response.headers.set("cache-control", NO_STORE)
  response.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
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
    if (constantTimeEqual(supplied, expected)) match = producer
  }
  return match
}

export function createStatusApp({ db, auth, config, now = Date.now }: AppDependencies): Hono {
  const app = new Hono()

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
  app.get("/status/login", context => {
    if (auth.validateSession(getCookie(context, COOKIE_NAME))) {
      return context.redirect("/status/", 303)
    }
    return context.html(renderLogin(null, Boolean(db.getAuth())))
  })
  app.get("/status/", context => {
    const session = getCookie(context, COOKIE_NAME)
    if (!auth.validateSession(session)) {
      return context.html(renderLogin(null, Boolean(db.getAuth())))
    }
    return context.html(renderDashboard(db.getDashboard(now())))
  })

  app.post("/status/login", async context => {
    if (!sameOrigin(context.req.raw)) return context.text("Forbidden", 403)
    const contentLength = Number(context.req.header("content-length") ?? "0")
    if (!Number.isFinite(contentLength) || contentLength > 2048) return context.text("Invalid request", 400)
    let body: Record<string, unknown>
    try {
      const parsed = await context.req.parseBody()
      body = isRecord(parsed) ? parsed : {}
    } catch {
      return context.html(renderLogin("The sign-in request was not accepted.", Boolean(db.getAuth())), 400)
    }
    try {
      const result = await auth.login({
        email: typeof body.email === "string" ? body.email : undefined,
        password: typeof body.password === "string" ? body.password : undefined,
        recoveryToken: typeof body.recoveryToken === "string" ? body.recoveryToken : undefined,
        clientAddress: clientAddress(context.req.raw),
      })
      setCookie(context, COOKIE_NAME, result.sessionToken, {
        path: "/status",
        httpOnly: true,
        secure: new URL(context.req.url).protocol === "https:"
          || context.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https",
        sameSite: "Strict",
        maxAge: 8 * 60 * 60,
      })
      return context.redirect("/status/", 303)
    } catch (error) {
      const status = error instanceof AuthError && error.code === "RATE_LIMITED" ? 429 : 401
      const message = error instanceof AuthError && error.code === "RATE_LIMITED"
        ? "Too many attempts. Wait 15 minutes before trying again."
        : error instanceof AuthError && error.code === "NOT_INITIALIZED"
          ? "The appliance operator has not been initialized."
          : "The credentials were not accepted."
      return context.html(renderLogin(message, Boolean(db.getAuth())), status)
    }
  })

  app.post("/status/logout", context => {
    if (!sameOrigin(context.req.raw)) return context.text("Forbidden", 403)
    auth.logout(getCookie(context, COOKIE_NAME))
    deleteCookie(context, COOKIE_NAME, {
      path: "/status",
      secure: new URL(context.req.url).protocol === "https:"
        || context.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https",
    })
    return context.redirect("/status/", 303)
  })

  // ── the release page and its two-step confirmation ─────────────────────────
  //
  // All under /status/, so the Caddyfile allowlist already covers them and no
  // new boundary is introduced. Every one checks the session and the origin,
  // exactly as POST /status/login does.

  const releaseView = async (
    extra: { notice?: string; error?: string; mayApply?: boolean } = {},
  ): Promise<ReleaseView> => {
    const update = await readUpdateSignal(config.signalsDir, now())
    const agent = await readAgentSignal(config.updateStateDir, now())
    return {
      installedVersion: update?.installedVersion ?? "-",
      ...(update?.latestVersion === undefined ? {} : { latestVersion: update.latestVersion }),
      ...(update?.fetchedVersion === undefined ? {} : { fetchedVersion: update.fetchedVersion }),
      ...(update?.fetchedLockSha256 === undefined ? {} : { fetchedLockSha256: update.fetchedLockSha256 }),
      ...(agent?.phase === undefined ? {} : { agentPhase: agent.phase }),
      ...(agent?.resultCode === undefined ? {} : { agentCode: agent.resultCode }),
      ...(agent?.scheduledFor === undefined ? {} : { scheduledFor: agent.scheduledFor }),
      windowDescription: WINDOW_DESCRIPTION,
      mayApply: extra.mayApply ?? true,
      ...extra,
    }
  }

  app.get("/status/release", async context => {
    const session = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(session)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth())))
    return context.html(renderRelease(await releaseView({ mayApply: kind === "password" })))
  })

  app.post("/status/actions/fetch", async context => {
    if (!sameOrigin(context.req.raw)) return context.text("Forbidden", 403)
    // A recovery session may download. Nothing running changes, and refusing it
    // would block the harmless half of the job for no benefit.
    if (!auth.validateSessionKind(getCookie(context, COOKIE_NAME))) {
      return context.html(renderLogin(null, Boolean(db.getAuth())))
    }
    // Downloading is the agent's own work on its own clock; this only asks it
    // to stop waiting for the next one.
    await requestFetch(config.updateRequestsDir, now()).catch(() => {})
    return context.redirect("/status/release", 303)
  })

  // Acts on nothing. A POST rather than a GET so the confirmation cannot be
  // prefetched, bookmarked, or arrived at by a link someone was sent.
  app.post("/status/actions/apply", async context => {
    if (!sameOrigin(context.req.raw)) return context.text("Forbidden", 403)
    const session = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(session)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth())))
    if (kind !== "password") {
      return context.html(renderRelease(await releaseView({ mayApply: false })))
    }

    const body = await context.req.parseBody().catch(() => ({}))
    const target = isRecord(body) ? String(body.targetLockSha256 ?? "") : ""
    const view = await releaseView()
    // The digest the page offered has to match the one still on offer. If a
    // newer release landed while the operator was reading, this is where they
    // find out rather than approving something they never saw.
    if (!/^[a-f0-9]{64}$/.test(target) || target !== view.fetchedLockSha256) {
      return context.html(renderRelease(await releaseView({
        error: "That release is no longer the one ready to apply. This page has been refreshed.",
      })))
    }

    const confirmation = mintConfirmation(config.rateLimitKey, sha256(session!), target, now())
    return context.html(renderApplyConfirm(
      view.fetchedVersion ?? "the downloaded release", target, confirmation, WINDOW_DESCRIPTION,
    ))
  })

  app.post("/status/actions/apply/confirm", async context => {
    if (!sameOrigin(context.req.raw)) return context.text("Forbidden", 403)
    const session = getCookie(context, COOKIE_NAME)
    const kind = auth.validateSessionKind(session)
    if (!kind) return context.html(renderLogin(null, Boolean(db.getAuth())))
    if (kind !== "password") {
      return context.html(renderRelease(await releaseView({ mayApply: false })))
    }

    const body = await context.req.parseBody().catch(() => ({}))
    const target = isRecord(body) ? String(body.targetLockSha256 ?? "") : ""
    const confirmation = isRecord(body) ? String(body.confirmation ?? "") : ""
    const window = isRecord(body) && body.window === "override" ? "override" : "scheduled"

    if (!verifyConfirmation(config.rateLimitKey, sha256(session!), target, confirmation, now())) {
      return context.html(renderRelease(await releaseView({
        error: "That confirmation has expired or was not issued for this release. Start again.",
      })))
    }

    const view = await releaseView()
    if (target !== view.fetchedLockSha256 || view.fetchedVersion === undefined) {
      return context.html(renderRelease(await releaseView({
        error: "That release is no longer the one ready to apply. This page has been refreshed.",
      })))
    }

    // A request nobody answered must not wedge the channel forever; one that is
    // still live must not be withdrawn from underneath the agent.
    await sweepExpired(config.updateRequestsDir, now()).catch(() => {})

    const outcome = await submitRequest(config.updateRequestsDir, {
      requestId: newRequestId(),
      targetVersion: view.fetchedVersion,
      targetLockSha256: target,
      expectedInstalledVersion: view.installedVersion,
      sessionKind: "password",
      window,
    }, now()).catch(() => "failed" as const)

    if (outcome === "already-pending") {
      return context.html(renderRelease(await releaseView({
        error: "An update is already waiting to be applied. Nothing further was requested.",
      })))
    }
    if (outcome === "failed") {
      return context.html(renderRelease(await releaseView({
        error: "The request could not be recorded. Nothing has been changed.",
      })))
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
