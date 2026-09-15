import type { GoLiveView } from "./go-live.js"
import type { HostOsSignal } from "./host-os.js"
import { networkListsState, type MaintenanceAgentSignal, type OffhostSignal, type SiteConfigSignal } from "./maintenance.js"
import type { ComponentView } from "./types.js"

// "Needs attention today": the checks Status already makes, turned into things
// to do. A component row says what is true; an item here says what a person
// should do about it, how soon, and where. Nothing is stored: the list is
// recomputed from current observations on every view, so it cannot go stale.

export type AttentionLevel = "now" | "today" | "soon" | "note"

export type AttentionItem = {
  id: string
  level: AttentionLevel
  en: string
  bg: string
  href: string
  actionEn: string
  actionBg: string
}

const DAY_MS = 24 * 60 * 60_000
const LEVEL_ORDER: Record<AttentionLevel, number> = { now: 0, today: 1, soon: 2, note: 3 }

const OVERVIEW = "/status/"
const MAINTENANCE = "/status/maintenance"

export function attentionItems(input: {
  components: readonly ComponentView[]
  maintenance: MaintenanceAgentSignal | null
  offhost: OffhostSignal | null
  hostOs: HostOsSignal | null
  siteConfig: SiteConfigSignal | null
  goLive: GoLiveView | null
  /** When a secrets escrow copy was last downloaded from Status, if ever. */
  escrowDownloadedAt?: number | null
  now: number
}): AttentionItem[] {
  const byComponent = new Map(input.components.map(component => [component.component, component]))
  const code = (component: string) => byComponent.get(component)?.code
  const status = (component: string) => byComponent.get(component)?.status
  const items: AttentionItem[] = []
  const add = (item: AttentionItem) => { if (!items.some(existing => existing.id === item.id)) items.push(item) }

  if (status("host-activation-lock") === "outage" || code("host-restore-lock") === "HOST_RESTORE_LOCK_INVALID") {
    add({ id: "recovery", level: "now", en: "An update or restore stopped part way. Nothing else should be changed until Hospital IT has looked.", bg: "Обновяване или възстановяване спря по средата. Нищо друго не бива да се променя, преди болничният ИТ екип да провери.", href: OVERVIEW, actionEn: "Hospital IT: sudo losporctl status", actionBg: "Болничен ИТ: sudo losporctl status" })
  }
  if (input.maintenance?.phase === "needs-operator") {
    add({ id: "maintenance-stopped", level: "now", en: "A maintenance operation stopped and needs Hospital IT at the console.", bg: "Операция по поддръжка спря и болничният ИТ екип трябва да провери конзолата.", href: MAINTENANCE, actionEn: "See Maintenance", actionBg: "Вижте „Поддръжка“" })
  }
  if (input.components.some(component => component.group === "clinical" && component.status === "outage")
    || status("host-services") === "outage") {
    add({ id: "services-down", level: "now", en: "Some appliance services are not running.", bg: "Някои услуги на системата не работят.", href: OVERVIEW, actionEn: "Hospital IT: sudo losporctl status", actionBg: "Болничен ИТ: sudo losporctl status" })
  }
  if (code("host-storage") === "HOST_STORAGE_CRITICAL") {
    add({ id: "disk", level: "now", en: "The server is almost out of disk space. Backups and updates will stop.", bg: "Сървърът почти няма свободно място. Архивите и обновяванията ще спрат.", href: OVERVIEW, actionEn: "Hospital IT: free space or add disk", actionBg: "Болничен ИТ: освободете място или добавете диск" })
  } else if (code("host-storage") === "HOST_STORAGE_LOW") {
    add({ id: "disk", level: "soon", en: "Disk space on the server is getting low.", bg: "Свободното място на сървъра намалява.", href: OVERVIEW, actionEn: "Hospital IT: plan more disk", actionBg: "Болничен ИТ: планирайте още място" })
  }
  const certificate = code("host-certificate")
  if (certificate === "HOST_CERTIFICATE_EXPIRED" || certificate === "HOST_CERTIFICATE_MISSING") {
    add({ id: "certificate", level: "now", en: "The HTTPS certificate has expired or is missing. Browsers and phones will refuse the site.", bg: "HTTPS сертификатът е изтекъл или липсва. Браузърите и телефоните ще отказват сайта.", href: OVERVIEW, actionEn: "Hospital IT: sudo losporctl config certificate", actionBg: "Болничен ИТ: sudo losporctl config certificate" })
  } else if (certificate === "HOST_CERTIFICATE_EXPIRING") {
    add({ id: "certificate", level: "soon", en: "The HTTPS certificate expires within 30 days.", bg: "HTTPS сертификатът изтича до 30 дни.", href: OVERVIEW, actionEn: "Hospital IT: renew it", actionBg: "Болничен ИТ: подновете го" })
  }
  if (status("host-backup") === "outage" || status("backup") === "outage") {
    add({ id: "backup", level: "today", en: "Backups have stopped or cannot be verified.", bg: "Архивите са спрели или не могат да бъдат проверени.", href: `${MAINTENANCE}#maintenance-backups`, actionEn: "Back up now", actionBg: "Резервно копие сега" })
  }
  if (code("host-clock") === "HOST_CLOCK_UNSYNCHRONIZED") {
    add({ id: "clock", level: "today", en: "The server clock is not synchronized. Record times and certificates depend on it.", bg: "Часовникът на сървъра не е синхронизиран. Времената в записите и сертификатите зависят от него.", href: OVERVIEW, actionEn: "Hospital IT: check time synchronization", actionBg: "Болничен ИТ: проверете синхронизацията на времето" })
  }
  const offhost = code("offhost-backup")
  if (offhost === "OFFHOST_BACKUP_NOT_CONFIGURED") {
    add({ id: "offhost", level: "soon", en: "Backups exist only on this server. Set up copies kept elsewhere.", bg: "Архивите съществуват само на този сървър. Настройте копия извън него.", href: `${MAINTENANCE}#maintenance-offhost`, actionEn: "Set up copies", actionBg: "Настройка на копия" })
  } else if (offhost && !["OFFHOST_BACKUP_ACKNOWLEDGED", "OFFHOST_BACKUP_PENDING"].includes(offhost)) {
    add({ id: "offhost", level: "today", en: "Copies kept elsewhere are late or failing.", bg: "Копията извън сървъра закъсняват или се провалят.", href: `${MAINTENANCE}#maintenance-offhost`, actionEn: "Test the connection", actionBg: "Проверка на връзката" })
  }
  const escrow = code("key-escrow")
  if (escrow === "KEY_ESCROW_STALE" || escrow === "KEY_ESCROW_EVIDENCE_INVALID") {
    add({ id: "escrow", level: "today", en: "The escrowed installation secrets no longer match the keys in use. Escrow them again.", bg: "Съхранените инсталационни тайни вече не съответстват на използваните ключове. Съхранете ги отново.", href: `${MAINTENANCE}#maintenance-escrow`, actionEn: "Create a new escrow copy", actionBg: "Създайте ново копие за съхранение" })
  } else if (escrow === "KEY_ESCROW_MISSING") {
    add({ id: "escrow", level: "soon", en: "The installation secrets have not been escrowed off the server.", bg: "Инсталационните тайни не са съхранени извън сървъра.", href: `${MAINTENANCE}#maintenance-escrow`, actionEn: "Create the escrow copy", actionBg: "Създайте копие за съхранение" })
  }
  // Every secret left the appliance in that file. Shown for a week, so a copy
  // nobody expected is noticed by whoever opens Status next.
  if (input.escrowDownloadedAt != null && input.now - input.escrowDownloadedAt <= 7 * DAY_MS) {
    add({ id: "escrow-downloaded", level: "note", en: `A secrets escrow copy was downloaded from Status on ${new Date(input.escrowDownloadedAt).toISOString().slice(0, 16).replace("T", " ")} UTC. If nobody at the hospital expected it, treat it as a security incident.`, bg: `Копие на тайните за съхранение е изтеглено от Status на ${new Date(input.escrowDownloadedAt).toISOString().slice(0, 16).replace("T", " ")} UTC. Ако никой в болницата не го е очаквал, третирайте го като инцидент със сигурността.`, href: `${MAINTENANCE}#maintenance-escrow`, actionEn: "See Secrets escrow", actionBg: "Вижте „Съхранение на тайните“" })
  }
  if (status("host-update-agent") === "degraded" || status("update-agent") === "outage" || status("update-agent") === "degraded") {
    add({ id: "agent", level: "today", en: "The host maintenance agent is not working, so updates and Maintenance requests will not run.", bg: "Агентът за поддръжка на сървъра не работи, затова обновяванията и заявките от „Поддръжка“ няма да се изпълняват.", href: "/status/release", actionEn: "See Updates", actionBg: "Вижте „Обновявания“" })
  }
  for (const component of ["retention", "case-close"] as const) {
    if (status(component) === "outage") {
      add({ id: component, level: "today", en: component === "retention" ? "The daily data-retention purge is failing or overdue." : "Cases are not being closed automatically.", bg: component === "retention" ? "Ежедневното изчистване според срока за съхранение се проваля или закъснява." : "Случаите не се приключват автоматично.", href: OVERVIEW, actionEn: "Hospital IT: sudo losporctl status", actionBg: "Болничен ИТ: sudo losporctl status" })
    }
  }
  const update = code("appliance-update")
  if (update === "UPDATE_AVAILABLE" || update === "UPDATE_DOWNLOADED_READY_TO_APPLY") {
    add({ id: "release", level: "soon", en: "A new LOSPOR release is available.", bg: "Налична е нова версия на LOSPOR.", href: "/status/release", actionEn: "See Updates", actionBg: "Вижте „Обновявания“" })
  }

  const hostOs = input.hostOs
  const os = code("host-os")
  const osHref = `${MAINTENANCE}#maintenance-host-os`
  if (os === "HOST_OS_UNSUPPORTED") {
    add({ id: "os-support", level: "today", en: "This Ubuntu release no longer receives security fixes. Plan a move to a supported release.", bg: "Тази версия на Ubuntu вече не получава поправки за сигурност. Планирайте преминаване към поддържана версия.", href: osHref, actionEn: "See Ubuntu", actionBg: "Вижте Ubuntu" })
  } else if (os === "HOST_OS_SUPPORT_ENDING") {
    add({ id: "os-support", level: "soon", en: "Standard support for this Ubuntu release ends within six months.", bg: "Стандартната поддръжка на тази версия на Ubuntu приключва до шест месеца.", href: osHref, actionEn: "See Ubuntu", actionBg: "Вижте Ubuntu" })
  }
  if (os === "HOST_OS_AUTOMATIC_UPDATES_OFF" || os === "HOST_OS_AUTOMATIC_UPDATES_FAILED") {
    add({ id: "os-automatic", level: "today", en: "Ubuntu's automatic security updates are off or failing.", bg: "Автоматичните обновления за сигурност на Ubuntu са изключени или се провалят.", href: osHref, actionEn: "Install security updates now", actionBg: "Инсталиране на обновленията сега" })
  }
  if (os === "HOST_OS_SECURITY_UPDATES_PENDING") {
    add({ id: "os-updates", level: "today", en: `${hostOs?.securityUpdates ?? "Some"} Ubuntu security updates are waiting.`, bg: `Чакат ${hostOs?.securityUpdates ?? "няколко"} обновления за сигурност на Ubuntu.`, href: osHref, actionEn: "Install security updates now", actionBg: "Инсталиране на обновленията сега" })
  }
  if (hostOs?.rebootRequired && os !== "HOST_OS_REBOOT_SCHEDULED") {
    const since = hostOs.rebootRequiredSince ? input.now - Date.parse(hostOs.rebootRequiredSince) : 0
    add({ id: "os-reboot", level: since > 7 * DAY_MS ? "today" : "soon", en: "Ubuntu needs a server restart to finish installing updates.", bg: "Ubuntu има нужда от рестартиране на сървъра, за да завърши обновленията.", href: osHref, actionEn: "Restart the server", actionBg: "Рестартиране на сървъра" })
  }
  if (hostOs?.dockerUpdates) {
    add({ id: "os-docker", level: "note", en: "Docker has updates. They restart every service, so Hospital IT installs them in the maintenance window.", bg: "Има обновления на Docker. Те рестартират всички услуги, затова болничният ИТ екип ги инсталира в прозореца за поддръжка.", href: osHref, actionEn: "Hospital IT: sudo losporctl host upgrade", actionBg: "Болничен ИТ: sudo losporctl host upgrade" })
  }

  // Restore drills: evidence from Status or from the off-host copy. The
  // go-live sign-off counts a drill for 92 days, so this asks at the same age.
  const drills = [...(input.maintenance?.drills ?? []), ...(input.offhost?.drills ?? [])]
    .sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt))
  const latest = drills.at(-1)
  if (latest?.result === "failed") {
    add({ id: "drill", level: "today", en: "The last restore drill failed: that backup could not be restored.", bg: "Последното пробно възстановяване се провали: архивът не можа да бъде възстановен.", href: `${MAINTENANCE}#maintenance-backups`, actionEn: "Take a backup and drill again", actionBg: "Направете архив и проверете отново" })
  } else if (!latest || input.now - Date.parse(latest.completedAt) > 92 * DAY_MS) {
    add({ id: "drill", level: "soon", en: latest ? "No restore drill in the last three months." : "No restore drill has been run from Status yet.", bg: latest ? "Няма пробно възстановяване през последните три месеца." : "Още няма пробно възстановяване, пуснато от Status.", href: `${MAINTENANCE}#maintenance-backups`, actionEn: "Run a restore drill", actionBg: "Пробно възстановяване" })
  }

  if (input.goLive?.state === "GO_LIVE_BLOCKED") {
    const remaining = input.goLive.checks.filter(check => !check.satisfied).length
      + input.goLive.signoffs.filter(signoff => !signoff.satisfied).length
    add({ id: "go-live", level: "note", en: `${remaining} go-live item(s) remain before clinical use.`, bg: `Остават ${remaining} точки преди клинична употреба.`, href: "/status/go-live", actionEn: "See Go-live", actionBg: "Вижте „Готовност“" })
  }
  const networks = networkListsState(input.siteConfig)
  if (networks?.statusOpenToAllPrivate) {
    add({ id: "status-networks", level: "today", en: "Status can be opened from every internal hospital network. Limit it to the IT management networks.", bg: "Status може да се отвори от всяка вътрешна мрежа на болницата. Ограничете го до мрежите за ИТ управление.", href: `${MAINTENANCE}#maintenance-settings`, actionEn: "Set the Status networks", actionBg: "Задайте мрежите за Status" })
  }
  if (networks?.researchClosed) {
    add({ id: "research-networks", level: "soon", en: "The Research website is closed to every network until its networks are set.", bg: "Сайтът за изследвания е затворен за всички мрежи, докато не се зададат мрежите му.", href: `${MAINTENANCE}#maintenance-settings`, actionEn: "Set the Research networks", actionBg: "Задайте мрежите за изследвания" })
  }
  const overridden = Object.values(input.siteConfig?.advanced ?? {}).filter(setting => setting.overridden).length
  if (overridden > 0) {
    add({ id: "advanced", level: "note", en: `${overridden} advanced setting(s) differ from the defaults on this appliance.`, bg: `${overridden} разширени настройки се различават от стойностите по подразбиране на тази система.`, href: `${MAINTENANCE}#maintenance-advanced`, actionEn: "See Advanced settings", actionBg: "Вижте „Разширени настройки“" })
  }

  return items.sort((left, right) => LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level])
}
