import type {
  ComponentStatus,
  ComponentView,
  DashboardData,
  DayStatus,
  IncidentView,
  OperationalEventView,
} from "./types.js"
import { escapeHtml, formatBytes } from "./util.js"

const STATUS_LABEL: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Unavailable",
  unknown: "Unknown",
  "not-configured": "Not configured",
}

const CODE_MESSAGE: Record<string, string> = {
  API_READY: "The clinical API is accepting work.",
  API_NOT_LIVE: "The clinical API cannot be reached.",
  API_NOT_READY: "The API is running but cannot currently accept clinical work.",
  DATABASE_REACHABLE: "The clinical database is responding.",
  DATABASE_UNREACHABLE: "The clinical database cannot be reached.",
  HTTP_REACHABLE: "The service is responding.",
  HTTP_UNHEALTHY: "The service returned an unhealthy response.",
  HTTP_UNREACHABLE: "The service cannot be reached.",
  TCP_REACHABLE: "The appliance gateway is responding.",
  TCP_UNREACHABLE: "The appliance gateway cannot be reached.",
  RELEASE_CURRENT: "This appliance is running the newest published release.",
  UPDATE_AVAILABLE: "A newer release has been published. Nothing here has changed; applying it is a separate, deliberate step.",
  UPDATE_DOWNLOADED_READY_TO_APPLY: "A newer release has been downloaded and verified, and is ready to be applied.",
  UPDATE_CHECK_FAILED: "The last check could not reach the release registry, so whether a newer release exists is unknown.",
  UPDATE_CHECK_STALE: "No successful check for a newer release in over two weeks.",
  UPDATE_CHECK_NEVER_RUN: "This appliance has never checked whether a newer release exists.",
  BACKUP_VERIFIED: "The most recent backup passed checksum verification.",
  BACKUP_AGING: "A verified backup will soon be overdue.",
  BACKUP_OVERDUE: "A verified backup is overdue.",
  BACKUP_SIGNAL_MISSING: "No backup result has been recorded yet.",
  PG_DUMP_FAILED: "The database backup could not be created.",
  ARTIFACT_FINALIZE_FAILED: "The backup artifact could not be finalized.",
  CHECKSUM_FAILED: "The backup checksum could not be verified.",
  DELIVERY_WORKER_ACTIVE: "The Central delivery worker is checking in.",
  DELIVERY_WORKER_DELAYED: "The delivery worker check-in is delayed.",
  DELIVERY_WORKER_STALE: "The delivery worker has stopped checking in.",
  API_UNAVAILABLE: "The delivery worker cannot reach the API.",
  PROCESS_REQUEST_REJECTED: "The API rejected the delivery worker request.",
  DELIVERY_WORKER_SIGNAL_MISSING: "No delivery-worker check-in has been recorded yet.",
  MIGRATIONS_CURRENT: "Database migrations are current.",
  MIGRATIONS_FAILED: "A database migration needs technical attention.",
  MIGRATIONS_UNKNOWN: "Migration state could not be established.",
  STORAGE_CAPACITY_OK: "Research export storage has adequate free capacity.",
  STORAGE_CAPACITY_LOW: "Research export storage is running low.",
  STORAGE_CAPACITY_CRITICAL: "Research export storage is almost full.",
  STORAGE_CAPACITY_UNKNOWN: "Storage capacity could not be established.",
  EMAIL_CONFIGURED: "Appliance email is configured.",
  EMAIL_NOT_CONFIGURED: "Appliance email has not been configured.",
  CENTRAL_NOT_CONFIGURED: "This appliance is operating without Central delivery.",
  CENTRAL_ENROLMENT_INCOMPLETE: "Central delivery configuration is incomplete.",
  CENTRAL_READY: "Central delivery is configured.",
  RESEARCH_EXPORTS_OK: "No failed research exports require attention.",
  RESEARCH_EXPORTS_FAILED: "One or more research exports require attention.",
  APPLIANCE_SNAPSHOT_UNAVAILABLE: "The last appliance information is stale or unavailable.",
  PROBE_NOT_CONFIGURED: "This health check has not been configured.",
  API_PROBE_NOT_CONFIGURED: "The API health check has not been configured.",
  DATABASE_PROBE_NOT_CONFIGURED: "The database health check has not been configured.",
  OPERATOR_CREDENTIALS_SYNCHRONIZED: "Clinical and status administrator credentials are synchronized.",
  OPERATOR_CREDENTIALS_DIVERGED: "Clinical and status administrator credentials require reconciliation.",
  OPERATOR_CREDENTIALS_UNKNOWN: "Administrator credential synchronization could not be established.",
  STATUS_HISTORY_AVAILABLE: "Availability history is being stored.",
  STATUS_HISTORY_UNAVAILABLE: "Live checks continue, but status history cannot currently be stored.",
}

const PAGE_STYLE = `
:root{color-scheme:light;--ink:#252521;--muted:#6d6b63;--line:#deddd6;--paper:#f7f6f2;--card:#fff;--good:#17804b;--warn:#aa6400;--bad:#b42b35;--unknown:#73716a;--info:#2864a8;font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}a{color:inherit}.shell{width:min(1040px,calc(100% - 2rem));margin:auto}.top{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 0}.brand{font-weight:760;letter-spacing:-.02em}.subbrand{color:var(--muted);font-size:.86rem}.banner{border-radius:14px;padding:1.15rem 1.25rem;color:#fff;margin:.75rem 0 2rem;display:flex;gap:.8rem;align-items:center}.banner.good{background:var(--good)}.banner.warn{background:var(--warn)}.banner.bad{background:var(--bad)}.banner.unknown{background:var(--unknown)}.banner strong{font-size:1.12rem}.dot{display:inline-grid;place-items:center;width:1.35rem;height:1.35rem;border:2px solid currentColor;border-radius:50%;font-size:.75rem;font-weight:bold;flex:none}.section{margin:2rem 0}.section h2{font-size:1.05rem;margin:0 0 .65rem}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}.component{padding:1rem 1.1rem;border-bottom:1px solid var(--line)}.component:last-child{border-bottom:0}.component-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.component-name{font-weight:670}.component-detail{font-size:.86rem;color:var(--muted);margin-top:.2rem}.state{white-space:nowrap;font-weight:650;font-size:.9rem}.state::before{content:"";display:inline-block;width:.62rem;height:.62rem;border-radius:50%;background:currentColor;margin-right:.4rem}.state.operational{color:var(--good)}.state.degraded{color:var(--warn)}.state.outage{color:var(--bad)}.state.unknown,.state.not-configured{color:var(--unknown)}.history{display:flex;gap:2px;height:1.65rem;margin-top:.85rem}.day{flex:1;min-width:2px;border-radius:2px;background:#ccc}.day.operational{background:#69bd8d}.day.degraded{background:#e9b361}.day.outage{background:#dd747b}.day.unknown,.day.not-configured{background:#d7d5ce}.history-caption{display:flex;justify-content:space-between;color:var(--muted);font-size:.72rem;margin-top:.2rem}.timeline{list-style:none;padding:0;margin:0}.timeline li{padding:1rem 1.1rem;border-bottom:1px solid var(--line)}.timeline li:last-child{border-bottom:0}.timeline time{display:block;color:var(--muted);font-size:.82rem}.pill{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.pill.info{color:var(--info)}.pill.warning{color:var(--warn)}.pill.critical{color:var(--bad)}.empty{padding:1.2rem;color:var(--muted)}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.7rem;padding:1rem}.fact{border:1px solid var(--line);border-radius:9px;padding:.75rem}.fact b{display:block;font-size:.76rem;text-transform:uppercase;color:var(--muted);letter-spacing:.04em}.login-wrap{min-height:100vh;display:grid;place-items:center;padding:1rem}.login{width:min(460px,100%);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.5rem}.login h1{margin:.2rem 0}.login p{color:var(--muted)}label{font-weight:650;display:block;margin-top:1rem}input{font:inherit;width:100%;border:1px solid #aaa89f;border-radius:8px;padding:.7rem;margin-top:.3rem}button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:.7rem 1rem;background:var(--ink);color:white;margin-top:1.25rem;cursor:pointer}.logout{margin:0}.logout button{margin:0;background:transparent;color:var(--ink);border:1px solid var(--line);padding:.4rem .7rem}.error{border-left:4px solid var(--bad);background:#fff0f0;color:#711b22;padding:.75rem}.divider{display:flex;align-items:center;gap:.7rem;color:var(--muted);margin:1.3rem 0}.divider::before,.divider::after{content:"";height:1px;background:var(--line);flex:1}.foot{color:var(--muted);font-size:.8rem;padding:1rem 0 2.5rem}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.shell{width:min(100% - 1rem,1040px)}.component{padding:.85rem}.component-head{display:block}.state{display:block;margin-top:.35rem}.history{gap:1px}.top{padding:.8rem .2rem}.subbrand{display:none}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`

function page(title: string, body: string, refresh = false): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh ? '<meta http-equiv="refresh" content="15">' : ""}<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body>${body}</body></html>`
}

export function renderLogin(error: string | null, initialized: boolean): string {
  const message = !initialized
    ? "The appliance operator has not been initialized. Hospital IT must complete installation from the server console."
    : error
  return page("Hospital appliance status — sign in", `<main class="login-wrap"><section class="login" aria-labelledby="login-title"><div class="brand">LOSPOR Hospital</div><h1 id="login-title">Appliance status</h1><p>This independent page remains available if the clinical API or database is unavailable.</p>${message ? `<div class="error" role="alert">${escapeHtml(message)}</div>` : ""}<form method="post" action="/status/login"><label for="email">Appliance administrator email</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit" ${initialized ? "" : "disabled"}>Sign in</button></form><div class="divider">or use console recovery</div><form method="post" action="/status/login"><label for="recovery-token">Single-use recovery token</label><input id="recovery-token" name="recoveryToken" type="password" autocomplete="off" maxlength="256" required><button type="submit" ${initialized ? "" : "disabled"}>Use recovery token</button></form></section></main>`)
}

function banner(components: ComponentView[]): { className: string; symbol: string; text: string } {
  const byId = new Map(components.map(item => [item.component, item]))
  const isOut = (id: string) => byId.get(id)?.status === "outage"
  const major = isOut("api") || isOut("database") || isOut("proxy") || (isOut("web") && isOut("pwa"))
  if (major) return { className: "bad", symbol: "!", text: "Major clinical service outage" }
  const clinical = components.filter(item => item.group === "clinical")
  if (!clinical.length || clinical.some(item => item.status === "unknown")) {
    return { className: "unknown", symbol: "?", text: "Clinical status is being established" }
  }
  if (clinical.some(item => item.status === "outage" || item.status === "degraded")) {
    return { className: "warn", symbol: "!", text: "Some clinical services are degraded" }
  }
  return { className: "good", symbol: "✓", text: "Clinical services operational" }
}

function historyBars(history: DayStatus[] | undefined): string {
  const values = history ?? []
  const counts = values.reduce<Record<ComponentStatus, number>>((result, item) => {
    result[item.status] += 1
    return result
  }, { operational: 0, degraded: 0, outage: 0, unknown: 0, "not-configured": 0 })
  const description = `${counts.operational} operational days, ${counts.degraded} degraded days, ${counts.outage} unavailable days, ${counts.unknown} unknown days`
  return `<div class="history" role="img" aria-label="90-day availability history: ${escapeHtml(description)}">${values.map(item => `<span class="day ${item.status}" title="${escapeHtml(item.day)}: ${STATUS_LABEL[item.status]}"></span>`).join("")}</div><div class="history-caption" aria-hidden="true"><span>90 days ago</span><span>Today</span></div>`
}

function componentRow(component: ComponentView, history: DayStatus[] | undefined): string {
  return `<article class="component"><div class="component-head"><div><div class="component-name">${escapeHtml(component.label)}</div><div class="component-detail">${escapeHtml(CODE_MESSAGE[component.code] ?? "Operational state recorded by the appliance monitor.")}</div></div><div class="state ${component.status}">${STATUS_LABEL[component.status]}</div></div>${historyBars(history)}</article>`
}

function group(data: DashboardData, name: ComponentView["group"], title: string): string {
  const components = data.components.filter(item => item.group === name)
  return `<section class="section" aria-labelledby="${name}-title"><h2 id="${name}-title">${escapeHtml(title)}</h2><div class="card">${components.length ? components.map(item => componentRow(item, data.histories[item.component])).join("") : '<div class="empty">Checks are being established.</div>'}</div></section>`
}

function incidentItem(incident: IncidentView): string {
  const resolved = incident.resolvedAt !== null
  return `<li><strong>${escapeHtml(incident.label)} — ${resolved ? "Resolved" : "Active incident"}</strong><div>${escapeHtml(CODE_MESSAGE[incident.code] ?? "A service state changed.")}</div><time datetime="${new Date(incident.openedAt).toISOString()}">Started ${new Date(incident.openedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC${resolved ? ` · resolved ${new Date(incident.resolvedAt!).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : ""}</time></li>`
}

function eventItem(event: OperationalEventView): string {
  return `<li><span class="pill ${event.severity}">${escapeHtml(event.severity)}</span><strong> ${escapeHtml(event.message)}</strong><time datetime="${new Date(event.occurredAt).toISOString()}">${escapeHtml(event.producer)} · ${new Date(event.occurredAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time></li>`
}

function applianceFacts(data: DashboardData): string {
  const snapshot = data.snapshot
  if (!snapshot) return '<div class="empty">Appliance details are not available yet.</div>'
  const stale = !data.snapshotReceivedAt || Date.now() - data.snapshotReceivedAt > 45_000
  const storage = snapshot.research.storage
  return `<div class="facts"><div class="fact"><b>Declared appliance release</b>${escapeHtml(snapshot.versions.hospital ?? "Unknown")}</div><div class="fact"><b>Vendored API / Core base</b>${escapeHtml(snapshot.versions.api ?? "Unknown")} / ${escapeHtml(snapshot.versions.core ?? "Unknown")}</div><div class="fact"><b>Clinical database size</b>${escapeHtml(formatBytes(snapshot.database.logicalSize.bytes))}</div><div class="fact"><b>Research storage available</b>${escapeHtml(formatBytes(storage.availableBytes))}</div><div class="fact"><b>Cases awaiting Central acceptance</b>${snapshot.central.casesWithUnacceptedChanges}</div><div class="fact"><b>Information freshness</b>${stale ? "Cached — currently stale" : "Current"}</div></div>`
}

export function renderDashboard(data: DashboardData): string {
  const state = banner(data.components)
  const checked = data.lastCheckedAt
    ? new Date(data.lastCheckedAt).toLocaleString("en-GB", { timeZone: "UTC" })
    : "not yet"
  return page("Hospital appliance status", `<div class="shell"><header class="top"><div><div class="brand">LOSPOR Hospital</div><div class="subbrand">Independent appliance status</div></div><form class="logout" method="post" action="/status/logout"><button type="submit">Sign out</button></form></header><main><div class="banner ${state.className}" role="status"><span class="dot" aria-hidden="true">${state.symbol}</span><strong>${escapeHtml(state.text)}</strong></div>${group(data, "clinical", "Clinical access")}${group(data, "research", "Research and data transfer")}${group(data, "safety", "Safety and maintenance")}<section class="section" aria-labelledby="appliance-title"><h2 id="appliance-title">Appliance details</h2><div class="card">${applianceFacts(data)}</div></section><section class="section" aria-labelledby="incidents-title"><h2 id="incidents-title">Incident history</h2><div class="card">${data.incidents.length ? `<ol class="timeline">${data.incidents.map(incidentItem).join("")}</ol>` : '<div class="empty">No incidents have been recorded.</div>'}</div></section><section class="section" aria-labelledby="events-title"><h2 id="events-title">Recent operational events</h2><div class="card">${data.events.length ? `<ol class="timeline">${data.events.map(eventItem).join("")}</ol>` : '<div class="empty">No operational events require attention.</div>'}</div></section></main><footer class="foot">Last checked: ${escapeHtml(checked)} UTC. This monitor contains operational information only, not clinical records. It cannot report loss of power, Docker, the physical server or the hospital network.</footer></div>`, true)
}
