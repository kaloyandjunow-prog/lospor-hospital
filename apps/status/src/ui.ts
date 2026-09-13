import type {
  ComponentStatus,
  ComponentView,
  DashboardData,
  DayStatus,
  IncidentView,
  OperationalEventView,
} from "./types.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml, formatBytes } from "./util.js"
import type {
  AccountDirectory,
  ManagedAccount,
  OneTimeAccountLink,
} from "./account-control.js"
import type { ClinicalBaselineReadiness, ControlPlaneView } from "./control-plane.js"
import type { TerminologyAgentSignal } from "./signals.js"
import {
  EDITABLE_SETTINGS,
  type MaintenanceAgentSignal,
  type OffhostSignal,
  type SettingsProposal,
  type SiteConfigSignal,
} from "./maintenance.js"
import type { GoLiveSignoffView, GoLiveState, GoLiveView } from "./go-live.js"
import type { MfaLoginChallenge } from "./auth.js"
import { STATUS_SECURITY_EVENT_CODES } from "./auth.js"
import type { StatusAdminLinkPurpose, StatusAdminSummary } from "./db.js"

const STATUS_LABEL_EN: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Unavailable",
  unknown: "Unknown",
  "not-configured": "Not configured",
}

const STATUS_LABEL_BG: Record<ComponentStatus, string> = {
  operational: "Работи",
  degraded: "Ограничено",
  outage: "Недостъпно",
  unknown: "Неизвестно",
  "not-configured": "Не е настроено",
}

// Exported so a test can assert every code a signal can produce has a message.
// Without that, a new resultCode renders on the page as a bare identifier.
export const CODE_MESSAGE: Record<string, string> = {
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

  // The update agent. An update in progress is not a fault -- the appliance is
  // doing what it was asked to -- so these read as progress, not alarm.
  UPDATE_AGENT_READY: "The update agent is running. Nothing is waiting to be applied.",
  UPDATE_ACCEPTED: "Your request was received. The agent has it.",
  UPDATE_QUEUED: "Accepted, and waiting for the maintenance window. Nothing changes until then.",
  UPDATE_PREPARING: "Downloading and cryptographically verifying the exact release. Running services are unchanged.",
  UPDATE_PREPARED: "The exact signed release and its images are verified and ready to apply.",
  UPDATE_APPLYING: "Applying the update now. This page will stop responding for a few minutes and will come back on its own.",
  UPDATE_COMPLETED: "The update finished. The release shown above is now the one running.",
  UPDATE_ALREADY_INSTALLED: "That exact release is already installed and verified.",
  UPDATE_CANCELLED: "The waiting update request was explicitly cancelled. No release was changed.",
  UPDATE_PREPARE_FAILED: "The release could not be downloaded and verified. Running services were not changed.",
  UPDATE_APPLY_FAILED: "The prepared release could not be applied. Review the host update log before trying again.",
  UPDATE_ACTIVATION_LOCK_PRESENT: "An interrupted activation lock is present. Inspect it with the supported host recovery command; it is never cleared automatically.",
  UPDATE_ACTIVATION_NEEDS_RECOVERY: "Activation began but did not reach a verified end state. A technician must inspect and recover it before another update.",
  UPDATE_AMBIGUOUS_APPLY: "The agent restarted while an apply was in progress. It will not retry an ambiguous database or service mutation automatically.",
  UPDATE_COMMIT_MISMATCH: "Activation returned, but the installed release identity does not match the prepared release. Technical recovery is required.",
  UPDATE_INFLIGHT_CONFLICT: "More than one in-flight update request exists. Nothing will run until a technician reconciles them.",
  UPDATE_INFLIGHT_MISSING: "Durable state names an accepted update, but its root-owned request is missing. Technical reconciliation is required.",
  UPDATE_INFLIGHT_OWNERSHIP_FAILED: "The host could not take root ownership of the consumed request. It will not run.",
  UPDATE_ORPHANED_INFLIGHT: "A root-owned request exists without matching durable state. It will not run automatically.",
  UPDATE_PREPARED_DESCRIPTOR_INVALID: "Prepared release state is missing, changed, or inconsistent with its verified assets.",
  UPDATE_STATE_CORRUPT: "The root-owned update state failed strict validation. Nothing will be applied automatically.",
  UPDATE_REQUEST_EXPIRED: "The update request exceeded the configured maximum age in days and was refused.",
  UPDATE_REQUEST_FUTURE: "The request time is too far in the future. Check the appliance clock; nothing was applied.",
  UPDATE_REQUEST_LOCK_TIMEOUT: "The update agent could not obtain its request lock. No request was consumed.",
  UPDATE_REQUEST_MALFORMED: "The update request has an invalid or incomplete fixed-field format and was refused.",
  UPDATE_REQUEST_OVERSIZED: "The update request is larger than the allowed intent record and was refused.",
  UPDATE_REQUEST_POLICY_INVALID: "The configured request-age policy is invalid. No request will run until it is corrected.",
  UPDATE_REQUEST_REPLAYED: "That request ID already reached a terminal state and cannot be replayed.",
  UPDATE_REQUEST_UNSAFE: "The update request is not a safe regular file and was refused.",
  UPDATE_TIMEZONE_CALCULATION_FAILED: "The next maintenance-window instant could not be calculated in the configured timezone.",
  UPDATE_FAILED: "The update did not complete and was rolled back. The appliance is running the release it was on before.",
  UPDATE_NEEDS_OPERATOR: "An update stopped part-way and nobody has resolved it. Do not restart the appliance; contact whoever maintains it.",
  UPDATE_AGENT_UNAVAILABLE: "The update agent has not reported for ten minutes. Updates will not be applied until it is running again.",
  UPDATE_AGENT_CONFIGURED_FAILED: "The host update agent is configured but has no valid heartbeat. Browser update controls are unavailable.",
  UPDATE_CONSOLE_ONLY: "This appliance intentionally manages updates from the server console rather than from Status.",
  HOST_OBSERVABILITY_MISSING: "The host monitor has not published a valid observation. This state is unknown, not healthy.",
  HOST_OBSERVABILITY_STALE: "The host observation is more than three minutes old. This state is unknown until the host monitor reports again.",
  HOST_STORAGE_OK: "The monitored host filesystems have adequate free capacity.",
  HOST_STORAGE_LOW: "One or more monitored host filesystems are running low on free capacity.",
  HOST_STORAGE_CRITICAL: "One or more monitored host filesystems are critically low on free capacity.",
  HOST_STORAGE_UNKNOWN: "Host filesystem capacity could not be established.",
  HOST_CLOCK_SYNCHRONIZED: "The host clock reports network synchronization.",
  HOST_CLOCK_UNSYNCHRONIZED: "The host clock is not synchronized. TLS checks and clinical timestamps may be unreliable.",
  HOST_CLOCK_UNKNOWN: "Host clock synchronization could not be established.",
  HOST_BACKUP_FRESH: "The root-protected verified-backup evidence is within the four-hour recovery policy and grace period.",
  HOST_BACKUP_AGING: "The latest root-protected verified-backup evidence is approaching the overdue limit.",
  HOST_BACKUP_OVERDUE: "The latest root-protected verified-backup evidence is overdue.",
  HOST_BACKUP_MISSING: "No valid root-protected verified-backup evidence was found.",
  HOST_BACKUP_EVIDENCE_INVALID: "The root-protected verified-backup evidence is malformed or unsafe.",
  OFFHOST_BACKUP_ACKNOWLEDGED: "The newest verified backup has a current off-host acknowledgement.",
  OFFHOST_BACKUP_AGING: "The latest off-host acknowledgement is aging.",
  OFFHOST_BACKUP_PENDING: "The newest verified local backup is still awaiting off-host acknowledgement.",
  OFFHOST_BACKUP_OVERDUE: "The latest off-host backup acknowledgement is overdue.",
  OFFHOST_BACKUP_MISSING: "An off-host copy hook is configured, but no valid acknowledgement has been recorded.",
  OFFHOST_BACKUP_EVIDENCE_INVALID: "The off-host acknowledgement evidence is malformed or unsafe.",
  OFFHOST_BACKUP_NOT_CONFIGURED: "The appliance still uses the safe deferred hook; encrypted off-host backup is not configured.",
  KEY_ESCROW_ACKNOWLEDGED: "The installation secrets are acknowledged as escrowed off this appliance.",
  KEY_ESCROW_MISSING: "No acknowledgement that .env and secrets/ are escrowed off this appliance. Backups hold only their fingerprints, so losing them would permanently end every stored patient identity.",
  KEY_ESCROW_STALE: "The escrow acknowledgement no longer matches the keys in use. Escrow the current secrets and record it again.",
  KEY_ESCROW_EVIDENCE_INVALID: "The secrets escrow acknowledgement is malformed or unsafe.",
  HOST_UPDATE_AGENT_HEALTHY: "The host update-agent service is active and its heartbeat is current.",
  HOST_UPDATE_AGENT_STALE: "The host update-agent service is inactive or its heartbeat is stale.",
  HOST_UPDATE_AGENT_CONSOLE_ONLY: "Browser-managed updates are intentionally disabled; updates are managed from the host console.",
  HOST_UPDATE_AGENT_UNKNOWN: "The host update-agent installation state could not be established.",
  HOST_CERTIFICATE_VALID: "The HTTPS certificate is currently valid for more than 30 days.",
  HOST_CERTIFICATE_EXPIRING: "The HTTPS certificate expires within 30 days.",
  HOST_CERTIFICATE_EXPIRED: "The HTTPS certificate is expired.",
  HOST_CERTIFICATE_MISSING: "The configured operator-supplied HTTPS certificate is missing or unsafe.",
  HOST_CERTIFICATE_UNKNOWN: "HTTPS certificate expiry could not be established.",
  HOST_SERVICES_HEALTHY: "Every expected long-running appliance service is running and not unhealthy.",
  HOST_SERVICES_DEGRADED: "One or more expected appliance services are absent, stopped, or unhealthy.",
  HOST_SERVICES_UNKNOWN: "The host could not establish Docker service health.",
  HOST_RESTORE_LOCK_CLEAR: "No unfinished or unsafe restore journal is present.",
  HOST_RESTORE_LOCK_PRESENT: "A restore journal has not reached a safe terminal state. Review the supported host restore journal before another destructive operation.",
  HOST_RESTORE_LOCK_INVALID: "Restore lock evidence is malformed, unsafe, or inconsistent with its durable boundary marker.",
  HOST_ACTIVATION_LOCK_CLEAR: "No release activation lock is present.",
  HOST_ACTIVATION_LOCK_PRESENT: "A release activation lock is present. Use the supported host recovery command; never remove it manually.",
  HOST_ACTIVATION_LOCK_INVALID: "The release activation lock is not a safe root-owned private directory.",
  UPDATE_SUPPLY_OFFLINE: "Offline update supply is selected. Releases come from verified USB media.",
  UPDATE_SUPPLY_CONNECTED: "Connected update supply is selected. Releases are downloaded from the public GitHub release and verified by signature; no credentials are needed.",
  UPDATE_SUPPLY_MODE_INVALID: "The update supply mode is invalid; no update route can be considered ready.",
  BACKUP_VERIFIED: "The most recent backup passed checksum verification.",
  BACKUP_AGING: "A verified backup will soon be overdue.",
  BACKUP_OVERDUE: "A verified backup is overdue.",
  BACKUP_SIGNAL_MISSING: "No backup result has been recorded yet.",
  PG_DUMP_FAILED: "The database backup could not be created.",
  ARTIFACT_FINALIZE_FAILED: "The backup artifact could not be finalized.",
  BACKUP_CAPACITY_CHECK_FAILED: "The appliance could not check whether backup storage has enough free space.",
  BACKUP_CAPACITY_REFUSED: "The backup did not start because the required free storage capacity is unavailable.",
  BACKUP_CLOCK_INVALID: "The appliance clock could not provide a valid backup time.",
  BACKUP_COMPATIBILITY_METADATA_INVALID: "The backup compatibility information is invalid.",
  BACKUP_DATABASE_SIZE_FAILED: "The database size could not be measured before backup.",
  BACKUP_DUMP_CATALOG_INVALID: "The backup file catalogue is invalid.",
  BACKUP_FSYNC_FAILED: "The backup could not be synchronized safely to storage.",
  BACKUP_KEY_FINGERPRINT_INVALID: "The backup authentication key fingerprint is invalid.",
  BACKUP_LOCK_FAILED: "The backup process could not secure its exclusive lock.",
  BACKUP_MANIFEST_AUTH_FAILED: "The backup manifest failed authentication.",
  BACKUP_MANIFEST_AUTH_KEY_INVALID: "The key used to authenticate backup manifests is invalid.",
  BACKUP_MANIFEST_FINALIZE_FAILED: "The backup manifest could not be finalized.",
  BACKUP_MARKER_WRITE_FAILED: "The verified-backup marker could not be recorded.",
  BACKUP_MIGRATION_FINGERPRINT_FAILED: "The database migration fingerprint could not be recorded.",
  BACKUP_POSTGRES_VERSION_FAILED: "The PostgreSQL version could not be recorded for recovery compatibility.",
  BACKUP_PUBLISHED_VERIFY_FAILED: "The published backup failed its final verification.",
  BACKUP_RETENTION_PIN_FAILED: "The backup could not be protected from retention cleanup.",
  BACKUP_RUN_ID_INVALID: "The backup run identifier is invalid.",
  BACKUP_SCHEMA_FINGERPRINT_FAILED: "The database schema fingerprint could not be recorded.",
  BACKUP_SIGNAL_WRITE_FAILED: "The final backup result could not be written to Status.",
  BACKUP_TEMP_CREATE_FAILED: "Private temporary backup storage could not be created.",
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

export const CODE_MESSAGE_BG: Record<string, string> = {
  API_READY: "Клиничният API приема заявки.",
  API_NOT_LIVE: "Няма връзка с клиничния API.",
  API_NOT_READY: "API работи, но в момента не може да приема клинични заявки.",
  DATABASE_REACHABLE: "Клиничната база данни отговаря.",
  DATABASE_UNREACHABLE: "Няма връзка с клиничната база данни.",
  HTTP_REACHABLE: "Услугата отговаря.",
  HTTP_UNHEALTHY: "Услугата върна нездрав отговор.",
  HTTP_UNREACHABLE: "Няма връзка с услугата.",
  TCP_REACHABLE: "Входната точка на системата отговаря.",
  TCP_UNREACHABLE: "Няма връзка с входната точка на системата.",
  RELEASE_CURRENT: "Системата използва най-новата публикувана версия.",
  UPDATE_AVAILABLE: "Публикувана е по-нова версия. Нищо не е променено; прилагането е отделна, изрична стъпка.",
  UPDATE_DOWNLOADED_READY_TO_APPLY: "По-нова версия е изтеглена, проверена и готова за прилагане.",
  UPDATE_CHECK_FAILED: "Последната проверка не достигна регистъра с версии, затова не е известно дали има по-нова версия.",
  UPDATE_CHECK_STALE: "Повече от две седмици няма успешна проверка за по-нова версия.",
  UPDATE_CHECK_NEVER_RUN: "Системата още не е проверявала за по-нова версия.",
  UPDATE_AGENT_READY: "Агентът за обновяване работи. Няма версия, която чака прилагане.",
  UPDATE_ACCEPTED: "Заявката е приета от агента.",
  UPDATE_QUEUED: "Заявката е приета и чака прозореца за поддръжка. Дотогава нищо няма да се промени.",
  UPDATE_PREPARING: "Точната версия се изтегля и проверява криптографски. Работещите услуги не се променят.",
  UPDATE_PREPARED: "Точната подписана версия и нейните образи са проверени и готови за прилагане.",
  UPDATE_APPLYING: "Обновяването се прилага. Тази страница ще бъде недостъпна за няколко минути и ще се възстанови автоматично.",
  UPDATE_COMPLETED: "Обновяването завърши. Показаната по-горе версия вече работи.",
  UPDATE_ALREADY_INSTALLED: "Точната версия вече е инсталирана и проверена.",
  UPDATE_CANCELLED: "Чакащата заявка за обновяване беше изрично отменена. Няма променена версия.",
  UPDATE_PREPARE_FAILED: "Версията не можа да бъде изтеглена и проверена. Работещите услуги не са променени.",
  UPDATE_APPLY_FAILED: "Подготвената версия не можа да бъде приложена. Прегледайте дневника на агента, преди да опитате отново.",
  UPDATE_ACTIVATION_LOCK_PRESENT: "Има заключване от прекъснато активиране. Проверете го с поддържаната команда за възстановяване; то никога не се изчиства автоматично.",
  UPDATE_ACTIVATION_NEEDS_RECOVERY: "Активирането е започнало, но не е достигнало проверено крайно състояние. Необходим е техник преди друго обновяване.",
  UPDATE_AMBIGUOUS_APPLY: "Агентът е рестартиран по време на прилагане. Неясна промяна на базата или услугите няма да бъде повторена автоматично.",
  UPDATE_COMMIT_MISMATCH: "Активирането е приключило, но записаната версия не съвпада с подготвената. Необходимо е техническо възстановяване.",
  UPDATE_INFLIGHT_CONFLICT: "Има повече от една започната заявка за обновяване. Нищо няма да се изпълни, докато техник не ги съгласува.",
  UPDATE_INFLIGHT_MISSING: "Устойчивото състояние сочи приета заявка, но защитеното ѝ копие липсва. Необходимо е техническо съгласуване.",
  UPDATE_INFLIGHT_OWNERSHIP_FAILED: "Сървърът не можа да поеме root собственост върху приетата заявка. Тя няма да бъде изпълнена.",
  UPDATE_ORPHANED_INFLIGHT: "Има защитена заявка без съответстващо устойчиво състояние. Тя няма да бъде изпълнена автоматично.",
  UPDATE_PREPARED_DESCRIPTOR_INVALID: "Състоянието на подготвената версия липсва, променено е или не съвпада с проверените файлове.",
  UPDATE_STATE_CORRUPT: "Защитеното състояние на обновяването не премина строгата проверка. Нищо няма да бъде приложено автоматично.",
  UPDATE_REQUEST_EXPIRED: "Заявката е надвишила настроения максимален срок в дни и е отказана.",
  UPDATE_REQUEST_FUTURE: "Часът на заявката е прекалено напред. Проверете часовника на системата; нищо не е приложено.",
  UPDATE_REQUEST_LOCK_TIMEOUT: "Агентът не можа да заключи опашката със заявки. Няма приета заявка.",
  UPDATE_REQUEST_MALFORMED: "Заявката има невалиден или непълен фиксиран формат и е отказана.",
  UPDATE_REQUEST_OVERSIZED: "Заявката е по-голяма от разрешения запис за намерение и е отказана.",
  UPDATE_REQUEST_POLICY_INVALID: "Настройката за максимална възраст на заявките е невалидна. Няма да се изпълняват заявки, докато не бъде поправена.",
  UPDATE_REQUEST_REPLAYED: "Този идентификатор вече е достигнал крайно състояние и не може да бъде изпълнен повторно.",
  UPDATE_REQUEST_UNSAFE: "Заявката не е безопасен обикновен файл и е отказана.",
  UPDATE_TIMEZONE_CALCULATION_FAILED: "Следващият прозорец за поддръжка не можа да бъде изчислен в настроената часова зона.",
  UPDATE_FAILED: "Обновяването не завърши и беше отменено. Системата използва предишната версия.",
  UPDATE_NEEDS_OPERATOR: "Обновяването е спряло по средата и изисква намеса. Не рестартирайте системата; свържете се с поддържащия екип.",
  UPDATE_AGENT_UNAVAILABLE: "Агентът за обновяване не е докладвал от десет минути. Обновявания няма да се прилагат, докато не заработи отново.",
  UPDATE_AGENT_CONFIGURED_FAILED: "Агентът на сървъра е настроен, но няма валиден сигнал. Управлението на обновяванията от браузъра не е достъпно.",
  UPDATE_CONSOLE_ONLY: "Тази система умишлено управлява обновяванията от конзолата на сървъра, а не през Status.",
  HOST_OBSERVABILITY_MISSING: "Наблюдението на сървъра не е публикувало валидно състояние. Състоянието е неизвестно, а не изправно.",
  HOST_OBSERVABILITY_STALE: "Състоянието от сървъра е по-старо от три минути. То остава неизвестно до нов доклад.",
  HOST_STORAGE_OK: "Наблюдаваните файлови системи имат достатъчно свободно място.",
  HOST_STORAGE_LOW: "Свободното място в една или повече наблюдавани файлови системи намалява.",
  HOST_STORAGE_CRITICAL: "Свободното място в една или повече наблюдавани файлови системи е критично малко.",
  HOST_STORAGE_UNKNOWN: "Свободното място на сървъра не можа да бъде установено.",
  HOST_CLOCK_SYNCHRONIZED: "Часовникът на сървъра съобщава, че е синхронизиран по мрежата.",
  HOST_CLOCK_UNSYNCHRONIZED: "Часовникът на сървъра не е синхронизиран. TLS проверките и клиничните времена може да са ненадеждни.",
  HOST_CLOCK_UNKNOWN: "Синхронизацията на часовника не можа да бъде установена.",
  HOST_BACKUP_FRESH: "Защитеното доказателство за проверен архив е в рамките на четиричасовата политика и допустимия срок.",
  HOST_BACKUP_AGING: "Последното защитено доказателство за проверен архив наближава крайния срок.",
  HOST_BACKUP_OVERDUE: "Последното защитено доказателство за проверен архив е просрочено.",
  HOST_BACKUP_MISSING: "Не е намерено валидно защитено доказателство за проверен архив.",
  HOST_BACKUP_EVIDENCE_INVALID: "Защитеното доказателство за проверен архив е невалидно или небезопасно.",
  OFFHOST_BACKUP_ACKNOWLEDGED: "Най-новият проверен архив има актуално потвърждение от външното хранилище.",
  OFFHOST_BACKUP_AGING: "Последното потвърждение от външното хранилище остарява.",
  OFFHOST_BACKUP_PENDING: "Най-новият проверен локален архив още чака потвърждение от външното хранилище.",
  OFFHOST_BACKUP_OVERDUE: "Последното потвърждение от външното хранилище е просрочено.",
  OFFHOST_BACKUP_MISSING: "Настроено е външно копиране, но няма валидно потвърждение.",
  OFFHOST_BACKUP_EVIDENCE_INVALID: "Доказателството за външно копие е невалидно или небезопасно.",
  OFFHOST_BACKUP_NOT_CONFIGURED: "Системата още използва безопасното отложено действие; шифрованото външно архивиране не е настроено.",
  KEY_ESCROW_ACKNOWLEDGED: "Потвърдено е, че тайните на инсталацията са съхранени извън този модул.",
  KEY_ESCROW_MISSING: "Няма потвърждение, че .env и secrets/ са съхранени извън този модул. Архивите съдържат само отпечатъци, така че загубата им завинаги прекратява всяка запазена самоличност на пациент.",
  KEY_ESCROW_STALE: "Потвърждението за съхранение вече не съответства на използваните ключове. Съхранете текущите тайни и го отбележете отново.",
  KEY_ESCROW_EVIDENCE_INVALID: "Потвърждението за съхранение на тайните е невалидно или небезопасно.",
  HOST_UPDATE_AGENT_HEALTHY: "Услугата на агента за обновяване е активна и сигналът ѝ е актуален.",
  HOST_UPDATE_AGENT_STALE: "Услугата на агента за обновяване не е активна или сигналът ѝ е остарял.",
  HOST_UPDATE_AGENT_CONSOLE_ONLY: "Управлението на обновяванията от браузъра е изключено; използва се конзолата на сървъра.",
  HOST_UPDATE_AGENT_UNKNOWN: "Състоянието на инсталацията на агента за обновяване не можа да бъде установено.",
  HOST_CERTIFICATE_VALID: "HTTPS сертификатът е валиден за повече от 30 дни.",
  HOST_CERTIFICATE_EXPIRING: "HTTPS сертификатът изтича в следващите 30 дни.",
  HOST_CERTIFICATE_EXPIRED: "HTTPS сертификатът е изтекъл.",
  HOST_CERTIFICATE_MISSING: "Настроеният HTTPS сертификат от болницата липсва или е небезопасен.",
  HOST_CERTIFICATE_UNKNOWN: "Срокът на HTTPS сертификата не можа да бъде установен.",
  HOST_SERVICES_HEALTHY: "Всички очаквани постоянни услуги работят и не са в нездраво състояние.",
  HOST_SERVICES_DEGRADED: "Една или повече очаквани услуги липсват, спрени са или са в нездраво състояние.",
  HOST_SERVICES_UNKNOWN: "Състоянието на Docker услугите не можа да бъде установено.",
  HOST_RESTORE_LOCK_CLEAR: "Няма незавършен или небезопасен дневник за възстановяване.",
  HOST_RESTORE_LOCK_PRESENT: "Дневник за възстановяване не е достигнал безопасно крайно състояние. Прегледайте поддържания дневник на сървъра преди друга операция, която променя данни.",
  HOST_RESTORE_LOCK_INVALID: "Данните за заключването при възстановяване са невалидни, небезопасни или не съответстват на запазения маркер за границата преди промяна на данните.",
  HOST_ACTIVATION_LOCK_CLEAR: "Няма заключване за активиране на версия.",
  HOST_ACTIVATION_LOCK_PRESENT: "Има заключване за активиране на версия. Използвайте поддържаната команда за възстановяване на сървъра и никога не го премахвайте ръчно.",
  HOST_ACTIVATION_LOCK_INVALID: "Заключването за активиране на версия не е защитена директория, собственост на root и достъпна само за него.",
  UPDATE_SUPPLY_OFFLINE: "Избрано е офлайн предоставяне на обновявания. Версиите идват от проверен USB носител.",
  UPDATE_SUPPLY_CONNECTED: "Избрано е свързано обновяване. Версиите се изтеглят от публичното издание в GitHub и се проверяват по подпис; не са нужни данни за достъп.",
  UPDATE_SUPPLY_MODE_INVALID: "Режимът за предоставяне на обновявания е невалиден; няма готов маршрут за обновяване.",
  BACKUP_VERIFIED: "Последният архив премина проверката на контролната сума.",
  BACKUP_AGING: "Провереният архив скоро ще бъде просрочен.",
  BACKUP_OVERDUE: "Провереният архив е просрочен.",
  BACKUP_SIGNAL_MISSING: "Още няма записан резултат от архивиране.",
  PG_DUMP_FAILED: "Архивът на базата данни не можа да бъде създаден.",
  ARTIFACT_FINALIZE_FAILED: "Архивният файл не можа да бъде завършен.",
  BACKUP_CAPACITY_CHECK_FAILED: "Не можа да се провери дали има достатъчно свободно място за архива.",
  BACKUP_CAPACITY_REFUSED: "Архивирането не започна, защото няма изискваното свободно място.",
  BACKUP_CLOCK_INVALID: "Системният часовник не предостави валиден час за архива.",
  BACKUP_COMPATIBILITY_METADATA_INVALID: "Информацията за съвместимост на архива е невалидна.",
  BACKUP_DATABASE_SIZE_FAILED: "Размерът на базата данни не можа да бъде измерен преди архивирането.",
  BACKUP_DUMP_CATALOG_INVALID: "Каталогът с файловете на архива е невалиден.",
  BACKUP_FSYNC_FAILED: "Архивът не можа да бъде записан надеждно върху носителя.",
  BACKUP_KEY_FINGERPRINT_INVALID: "Отпечатъкът на ключа за удостоверяване на архива е невалиден.",
  BACKUP_LOCK_FAILED: "Процесът за архивиране не можа да заключи ресурса за изключителна работа.",
  BACKUP_MANIFEST_AUTH_FAILED: "Манифестът на архива не премина проверката за автентичност.",
  BACKUP_MANIFEST_AUTH_KEY_INVALID: "Ключът за удостоверяване на архивните манифести е невалиден.",
  BACKUP_MANIFEST_FINALIZE_FAILED: "Манифестът на архива не можа да бъде завършен.",
  BACKUP_MARKER_WRITE_FAILED: "Маркерът за проверен архив не можа да бъде записан.",
  BACKUP_MIGRATION_FINGERPRINT_FAILED: "Отпечатъкът на миграциите на базата данни не можа да бъде записан.",
  BACKUP_POSTGRES_VERSION_FAILED: "Версията на PostgreSQL не можа да бъде записана за проверка на възстановяването.",
  BACKUP_PUBLISHED_VERIFY_FAILED: "Публикуваният архив не премина окончателната проверка.",
  BACKUP_RETENTION_PIN_FAILED: "Архивът не можа да бъде защитен от автоматично изтриване.",
  BACKUP_RUN_ID_INVALID: "Идентификаторът на архивирането е невалиден.",
  BACKUP_SCHEMA_FINGERPRINT_FAILED: "Отпечатъкът на схемата на базата данни не можа да бъде записан.",
  BACKUP_SIGNAL_WRITE_FAILED: "Крайният резултат от архивирането не можа да бъде записан в страницата за състояние.",
  BACKUP_TEMP_CREATE_FAILED: "Не можа да бъде създадено защитено временно хранилище за архива.",
  CHECKSUM_FAILED: "Контролната сума на архива не можа да бъде потвърдена.",
  DELIVERY_WORKER_ACTIVE: "Процесът за изпращане към Central докладва редовно.",
  DELIVERY_WORKER_DELAYED: "Докладът от процеса за изпращане се забавя.",
  DELIVERY_WORKER_STALE: "Процесът за изпращане спря да докладва.",
  API_UNAVAILABLE: "Процесът за изпращане няма връзка с API.",
  PROCESS_REQUEST_REJECTED: "API отхвърли заявката на процеса за изпращане.",
  DELIVERY_WORKER_SIGNAL_MISSING: "Още няма записан доклад от процеса за изпращане.",
  MIGRATIONS_CURRENT: "Миграциите на базата данни са актуални.",
  MIGRATIONS_FAILED: "Миграция на базата данни изисква техническа намеса.",
  MIGRATIONS_UNKNOWN: "Състоянието на миграциите не можа да бъде установено.",
  STORAGE_CAPACITY_OK: "Има достатъчно свободно място за изследователски експорти.",
  STORAGE_CAPACITY_LOW: "Свободното място за изследователски експорти намалява.",
  STORAGE_CAPACITY_CRITICAL: "Мястото за изследователски експорти е почти изчерпано.",
  STORAGE_CAPACITY_UNKNOWN: "Свободното място не можа да бъде установено.",
  EMAIL_CONFIGURED: "Електронната поща на системата е настроена.",
  EMAIL_NOT_CONFIGURED: "Електронната поща на системата не е настроена.",
  CENTRAL_NOT_CONFIGURED: "Системата работи без изпращане към Central.",
  CENTRAL_ENROLMENT_INCOMPLETE: "Настройката за изпращане към Central не е завършена.",
  CENTRAL_READY: "Изпращането към Central е настроено.",
  RESEARCH_EXPORTS_OK: "Няма неуспешни изследователски експорти, които изискват внимание.",
  RESEARCH_EXPORTS_FAILED: "Един или повече изследователски експорти изискват внимание.",
  APPLIANCE_SNAPSHOT_UNAVAILABLE: "Последната системна информация е остаряла или недостъпна.",
  PROBE_NOT_CONFIGURED: "Тази проверка не е настроена.",
  API_PROBE_NOT_CONFIGURED: "Проверката на API не е настроена.",
  DATABASE_PROBE_NOT_CONFIGURED: "Проверката на базата данни не е настроена.",
  OPERATOR_CREDENTIALS_SYNCHRONIZED: "Данните за вход на клиничния и системния администратор са синхронизирани.",
  OPERATOR_CREDENTIALS_DIVERGED: "Данните за вход на клиничния и системния администратор трябва да бъдат синхронизирани.",
  OPERATOR_CREDENTIALS_UNKNOWN: "Синхронизацията на администраторските данни за вход не можа да бъде установена.",
  STATUS_HISTORY_AVAILABLE: "Историята на достъпността се съхранява.",
  STATUS_HISTORY_UNAVAILABLE: "Текущите проверки продължават, но историята временно не може да се съхранява.",
}

export const EVENT_MESSAGE_BG: Record<string, string> = {
  AUDIT_WRITE_FAILED: "Записът в клиничния одит е неуспешен",
  EMAIL_DELIVERY_FAILED: "Системен имейл не можа да бъде изпратен",
  AI_PROVIDER_REQUEST_FAILED: "Незадължителна заявка към ИИ е неуспешна",
  RESEARCH_EXPORT_WORKER_FAILED: "Обработката на изследователски експорт е неуспешна",
  CENTRAL_DELIVERY_FAILED: "Изпращането към Central е неуспешно и ще изисква нов опит",
  CLINICAL_DATA_SYNC_FAILED: "Синхронизацията на клинични данни е неуспешна",
  CLINICAL_WRITE_FAILED: "Операция върху клиничен запис е неуспешна",
  RESEARCH_REQUEST_FAILED: "Изследователска заявка е неуспешна",
  CLINICAL_DOCUMENT_RENDER_FAILED: "Клиничен документ не можа да бъде създаден",
  CLINICAL_RULES_OPERATION_FAILED: "Операция с клинични правила е неуспешна",
  APPLIANCE_OPERATOR_CHANGED: "Данните за вход на системния администратор са променени",
  STATUS_AUTH_INITIALIZED: "Данните за вход на системния администратор в Status са инициализирани",
  STATUS_AUTH_CHANGE_PREPARED: "Подготвена е промяна на данните за вход на системния администратор",
  STATUS_AUTH_CHANGED: "Данните за вход на системния администратор в Status са променени",
  STATUS_AUTH_CHANGE_ABORTED: "Чакаща промяна на данните за вход на системния администратор е отменена",
  STATUS_RECOVERY_TOKEN_ISSUED: "Издаден е еднократен Status token за аварийно възстановяване",
  STATUS_LOGIN_SUCCEEDED: "Системен администратор влезе в Status",
  STATUS_RECOVERY_LOGIN_SUCCEEDED: "Използван е Status token за аварийно възстановяване",
  STATUS_LOGIN_FAILED: "Опит за вход в Status е неуспешен",
  STATUS_LOGIN_RATE_LIMITED: "Опитите за вход в Status са временно ограничени",
  STATUS_MFA_CHALLENGE_ISSUED: "Издадена е заявка за MFA потвърждение в Status",
  STATUS_MFA_ENROLLED: "MFA на системния администратор в Status е настроено",
  STATUS_MFA_LOGIN_SUCCEEDED: "Системен администратор завърши MFA входа в Status",
  STATUS_MFA_RECOVERY_CODE_USED: "Използван е еднократен MFA код за възстановяване в Status",
  STATUS_MFA_LOGIN_FAILED: "Опит за MFA вход в Status е неуспешен",
  STATUS_MFA_LOGIN_RATE_LIMITED: "Опитите за MFA вход в Status са временно ограничени",
  STATUS_REAUTH_SUCCEEDED: "Чувствително действие в Status е потвърдено повторно",
  STATUS_REAUTH_FAILED: "Повторното потвърждение за чувствително действие в Status е неуспешно",
  STATUS_REAUTH_RATE_LIMITED: "Опитите за чувствителни действия в Status са временно ограничени",
  STATUS_ADMIN_CREATED: "Създадена е покана за администратор на Status",
  STATUS_ADMIN_ACTIVATION_ISSUED: "Издадена е връзка за активиране на администратор на Status",
  STATUS_ADMIN_ACTIVATED: "Администратор на Status е активиран",
  STATUS_ADMIN_RECOVERY_ISSUED: "Издадена е връзка за възстановяване на администратор на Status",
  STATUS_ADMIN_RECOVERED: "Администратор на Status завърши възстановяване",
  STATUS_ADMIN_SUSPENDED: "Администратор на Status е спрян",
  STATUS_TERMINOLOGY_IMPORT_REQUESTED: "Заявен е управляван импорт на терминология",
  STATUS_TERMINOLOGY_RESUME_REQUESTED: "Заявен е управляван възобновен импорт на терминология",
  STATUS_TERMINOLOGY_ROLLBACK_REQUESTED: "Заявено е управлявано връщане на терминология",
  STATUS_TERMINOLOGY_FINALIZE_REQUESTED: "Заявено е окончателно приключване на поколение терминология",
  STATUS_GO_LIVE_SIGNOFF_RECORDED: "Записано е потвърждение за готовност за клинична употреба",
  STATUS_GO_LIVE_SIGNOFF_WITHDRAWN: "Оттеглено е потвърждение за готовност за клинична употреба",
  STATUS_MAINTENANCE_BACKUP_REQUESTED: "Заявено е резервно копие от Status",
  STATUS_MAINTENANCE_DRILL_REQUESTED: "Заявено е пробно възстановяване от Status",
  STATUS_MAINTENANCE_SETTINGS_REQUESTED: "Заявена е промяна на настройките на сайта от Status",
  STATUS_MAINTENANCE_OFFHOST_TEST_REQUESTED: "Заявена е проверка на връзката за копия извън сървъра от Status",
  STATUS_MAINTENANCE_OFFHOST_DRILL_REQUESTED: "Заявена е проверка от копието извън сървъра от Status",
  STATUS_MAINTENANCE_OFFHOST_CONFIG_REQUESTED: "Заявена е настройка на място за копия извън сървъра от Status",
  STATUS_MAINTENANCE_OFFHOST_DISABLE_REQUESTED: "Заявено е изключване на копията извън сървъра от Status",
}

for (const code of STATUS_SECURITY_EVENT_CODES) {
  if (!EVENT_MESSAGE_BG[code]) throw new Error(`Missing Bulgarian Status security event: ${code}`)
}

const COMPONENT_LABEL_BG: Record<string, string> = {
  api: "Клиничен API",
  database: "Клинична база данни",
  web: "Клинично уеб приложение",
  pwa: "Клинично PWA приложение",
  browser: "Изследователски Browser",
  proxy: "Входна точка на системата",
  backup: "Проверен архив",
  retention: "Изчистване според срока за съхранение",
  "case-close": "Автоматично приключване на случаи",
  "delivery-worker": "Процес за изпращане към Central",
  "appliance-update": "Версия на системата",
  "update-agent": "Агент за обновяване",
  "host-storage": "Място на сървъра",
  "host-clock": "Часовник на сървъра",
  "host-backup": "Актуалност на архива на сървъра",
  "offhost-backup": "Потвърждение за външен архив",
  "key-escrow": "Съхранение на инсталационните тайни",
  "host-update-agent": "Услуга за обновяване на сървъра",
  "host-certificate": "Срок на HTTPS сертификата",
  "host-services": "Услуги на сървъра",
  "host-restore-lock": "Заключване при възстановяване",
  "host-activation-lock": "Заключване при активиране на версия",
  "update-supply": "Маршрут за обновявания",
  migrations: "Миграции на базата данни",
  "research-storage": "Място за изследователски експорти",
  email: "Системна електронна поща",
  central: "Изпращане към Central",
  "research-exports": "Изследователски експорти",
  "operator-credentials": "Данни за вход на системния администратор",
  "status-history": "История на състоянието",
}

function statusLabel(status: ComponentStatus, locale: StatusLocale): string {
  return (locale === "bg" ? STATUS_LABEL_BG : STATUS_LABEL_EN)[status]
}

function codeMessage(code: string, locale: StatusLocale, fallback: string): string {
  return (locale === "bg" ? CODE_MESSAGE_BG[code] : CODE_MESSAGE[code]) ?? fallback
}

function componentLabel(component: { component: string; label: string }, locale: StatusLocale): string {
  return locale === "bg" ? COMPONENT_LABEL_BG[component.component] ?? component.label : component.label
}

function utcDate(value: number, locale: StatusLocale): string {
  return new Date(value).toLocaleString(locale === "bg" ? "bg-BG" : "en-GB", { timeZone: "UTC" })
}

const PAGE_STYLE = `
:root{color-scheme:light;--ink:#252521;--muted:#6d6b63;--line:#deddd6;--paper:#f7f6f2;--card:#fff;--good:#17804b;--warn:#aa6400;--bad:#b42b35;--unknown:#73716a;--info:#2864a8;font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}a{color:inherit}.shell{width:min(1040px,calc(100% - 2rem));margin:auto}.top{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 0}.brand{font-weight:760;letter-spacing:-.02em}.subbrand{color:var(--muted);font-size:.86rem}.banner{border-radius:14px;padding:1.15rem 1.25rem;color:#fff;margin:.75rem 0 2rem;display:flex;gap:.8rem;align-items:center}.banner.good{background:var(--good)}.banner.warn{background:var(--warn)}.banner.bad{background:var(--bad)}.banner.unknown{background:var(--unknown)}.banner strong{font-size:1.12rem}.dot{display:inline-grid;place-items:center;width:1.35rem;height:1.35rem;border:2px solid currentColor;border-radius:50%;font-size:.75rem;font-weight:bold;flex:none}.section{margin:2rem 0}.section h2{font-size:1.05rem;margin:0 0 .65rem}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}.component{padding:1rem 1.1rem;border-bottom:1px solid var(--line)}.component:last-child{border-bottom:0}.component-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.component-name{font-weight:670}.component-detail{font-size:.86rem;color:var(--muted);margin-top:.2rem}.state{white-space:nowrap;font-weight:650;font-size:.9rem}.state::before{content:"";display:inline-block;width:.62rem;height:.62rem;border-radius:50%;background:currentColor;margin-right:.4rem}.state.operational{color:var(--good)}.state.degraded{color:var(--warn)}.state.outage{color:var(--bad)}.state.unknown,.state.not-configured{color:var(--unknown)}.history{display:flex;gap:2px;height:1.65rem;margin-top:.85rem}.day{flex:1;min-width:2px;border-radius:2px;background:#ccc}.day.operational{background:#69bd8d}.day.degraded{background:#e9b361}.day.outage{background:#dd747b}.day.unknown,.day.not-configured{background:#d7d5ce}.history-caption{display:flex;justify-content:space-between;color:var(--muted);font-size:.72rem;margin-top:.2rem}.timeline{list-style:none;padding:0;margin:0}.timeline li{padding:1rem 1.1rem;border-bottom:1px solid var(--line)}.timeline li:last-child{border-bottom:0}.timeline time{display:block;color:var(--muted);font-size:.82rem}.pill{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.pill.info{color:var(--info)}.pill.warning{color:var(--warn)}.pill.critical{color:var(--bad)}.empty{padding:1.2rem;color:var(--muted)}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.7rem;padding:1rem}.fact{border:1px solid var(--line);border-radius:9px;padding:.75rem}.fact b{display:block;font-size:.76rem;text-transform:uppercase;color:var(--muted);letter-spacing:.04em}.login-wrap{min-height:100vh;display:grid;place-items:center;padding:1rem}.login{width:min(460px,100%);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.5rem}.login h1{margin:.2rem 0}.login p{color:var(--muted)}label{font-weight:650;display:block;margin-top:1rem}input,select,textarea{font:inherit;width:100%;border:1px solid #aaa89f;border-radius:8px;padding:.7rem;margin-top:.3rem;background:#fff;color:var(--ink)}textarea{min-height:7rem;resize:vertical}button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:.7rem 1rem;background:var(--ink);color:white;margin-top:1.25rem;cursor:pointer}.logout{margin:0}.logout button{margin:0;background:transparent;color:var(--ink);border:1px solid var(--line);padding:.4rem .7rem}.header-actions{display:flex;align-items:center;gap:.55rem}.top{flex-wrap:wrap;gap:.6rem 1rem}.ident{min-width:0}a.brand{text-decoration:none}.statusnav{display:flex;flex-wrap:wrap;gap:.15rem .35rem;order:3;width:100%;border-top:1px solid var(--line);padding-top:.55rem}.statusnav a{text-decoration:none;color:var(--muted);font-weight:650;font-size:.9rem;padding:.5rem .7rem;border-radius:8px;min-height:2.4rem;display:inline-flex;align-items:center}.statusnav a:hover{background:var(--card);color:var(--ink)}.statusnav a[aria-current=page]{color:var(--ink);background:var(--card);box-shadow:inset 0 -2px 0 var(--ink)}.statusnav a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}.language{display:flex;gap:.25rem;margin:0}.language button{margin:0;padding:.35rem .55rem;background:transparent;color:var(--ink);border:1px solid var(--line)}.language button[aria-pressed=true]{background:var(--ink);color:#fff}.login .language{justify-content:flex-end;margin-bottom:.75rem}.language-label{font-size:.78rem;color:var(--muted);align-self:center;margin-right:.2rem}.language-links{display:flex;justify-content:flex-end;gap:.35rem;margin-bottom:.75rem}.language-links a{border:1px solid var(--line);border-radius:8px;padding:.35rem .55rem;text-decoration:none}.language-links a[aria-current=true]{background:var(--ink);color:#fff}button.danger{background:var(--bad)}.error{border-left:4px solid var(--bad);background:#fff0f0;color:#711b22;padding:.75rem}.notice{border-left:4px solid var(--good);background:#effaf4;color:#185735;padding:.75rem}.divider{display:flex;align-items:center;gap:.7rem;color:var(--muted);margin:1.3rem 0}.divider::before,.divider::after{content:"";height:1px;background:var(--line);flex:1}.foot{color:var(--muted);font-size:.8rem;padding:1rem 0 2.5rem}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.2rem 1rem}.form-grid .wide{grid-column:1/-1}.account-row{display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(150px,1fr) minmax(145px,.8fr) auto;gap:1rem;align-items:center;padding:1rem 1.1rem;border-bottom:1px solid var(--line)}.account-row:last-child{border-bottom:0}.account-actions{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:flex-end}.account-actions form{margin:0}.account-actions button{margin:0;padding:.45rem .65rem;font-size:.82rem}.admin-action{border-top:1px solid var(--line);margin-top:.6rem;padding-top:.25rem}.admin-action summary{font-weight:650;cursor:pointer}.admin-action button{margin-top:.7rem}.secret{font:600 .9rem/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;direction:ltr}.secret-card{border:3px solid var(--ink);padding:1.25rem;background:#fff}.secret-card h2{margin-top:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.qr{display:grid;place-items:center;margin:1rem auto;padding:.5rem;width:max-content;max-width:100%;border:1px solid var(--line);background:#fff}.qr svg{display:block;max-width:248px;width:100%;height:auto}.checks{display:grid;gap:.45rem;margin:.75rem 0}.check{display:flex;align-items:flex-start;gap:.55rem;font-weight:500;margin:.25rem 0}.check input{width:auto;flex:none;margin:.25rem 0 0}.pad{padding:1rem}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}fieldset{border:1px solid var(--line);border-radius:9px;padding:.75rem 1rem;margin-top:1rem}legend{font-weight:650;padding:0 .3rem}
@media(max-width:760px){.shell{width:min(100% - 1rem,1040px)}.component{padding:.85rem}.component-head{display:block}.state{display:block;margin-top:.35rem}.history{gap:1px}.top{padding:.8rem .2rem}.subbrand{display:none}.statusnav{gap:.1rem}.statusnav a{flex:1 1 auto;justify-content:center;min-height:2.75rem}.form-grid{grid-template-columns:1fr}.account-row{grid-template-columns:1fr}.account-actions{justify-content:flex-start}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{body{background:#fff}.no-print,.header-actions,.statusnav,.foot{display:none!important}.shell{width:100%}.secret-card{break-inside:avoid}.secret{font-size:10pt;min-height:9rem}}
`

function languageSwitcher(locale: StatusLocale, returnTo: string): string {
  return `<form class="language" method="post" action="/status/language"><span class="language-label">${localize(locale, "Language", "Език")}</span><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><button type="submit" name="locale" value="bg" lang="bg" aria-pressed="${locale === "bg"}">БГ</button><button type="submit" name="locale" value="en" lang="en" aria-pressed="${locale === "en"}">EN</button></form>`
}

/** Which Status session is looking. Mirrors auth.ts's session `kind`. */
export type StatusNavAudience = "password" | "recovery"

export type StatusNavPath =
  | "/status/"
  | "/status/go-live"
  | "/status/accounts"
  | "/status/control"
  | "/status/terminology"
  | "/status/maintenance"
  | "/status/release"

/**
 * The authenticated Status destinations, in the order they are shown.
 *
 * One registry rather than a conditional in each renderer: which pages a
 * session may open is a fact about the session, and it was previously implied
 * five times over by whichever links a given page happened to print at the
 * bottom. `audiences` is navigation only -- every route still enforces its own
 * server-side check, and hiding a link is never authorization.
 */
export const STATUS_NAV: readonly {
  path: StatusNavPath
  en: string
  bg: string
  audiences: readonly StatusNavAudience[]
}[] = [
  { path: "/status/", en: "Status", bg: "Състояние", audiences: ["password", "recovery"] },
  { path: "/status/go-live", en: "Go-live", bg: "Готовност", audiences: ["password", "recovery"] },
  { path: "/status/accounts", en: "Accounts", bg: "Профили", audiences: ["password"] },
  { path: "/status/control", en: "Hospital controls", bg: "Управление", audiences: ["password"] },
  { path: "/status/terminology", en: "Terminology", bg: "Терминология", audiences: ["password", "recovery"] },
  { path: "/status/maintenance", en: "Maintenance", bg: "Поддръжка", audiences: ["password", "recovery"] },
  { path: "/status/release", en: "Updates", bg: "Обновявания", audiences: ["password", "recovery"] },
]

/**
 * The shared header for every authenticated Status page.
 *
 * A console recovery session is offered only what it can actually open, so it
 * is never sent to a predictable 403. Accounts and Hospital controls refuse it
 * server-side regardless.
 */
function statusHeader(
  activePath: StatusNavPath,
  locale: StatusLocale,
  audience: StatusNavAudience,
  subbrand: string,
): string {
  const links = STATUS_NAV
    .filter(entry => entry.audiences.includes(audience))
    .map(entry => {
      const current = entry.path === activePath
      return `<a href="${entry.path}"${current ? ' aria-current="page"' : ""}>${escapeHtml(locale === "bg" ? entry.bg : entry.en)}</a>`
    })
    .join("")
  const actions = `<div class="header-actions">${languageSwitcher(locale, activePath)}<form class="logout" method="post" action="/status/logout"><button type="submit">${localize(locale, "Sign out", "Изход")}</button></form></div>`
  return `<header class="top"><div class="ident"><a class="brand" href="/status/">LOSPOR Hospital</a><div class="subbrand">${subbrand}</div></div><nav class="statusnav" aria-label="${localize(locale, "Appliance administration", "Управление на системата")}">${links}</nav>${actions}</header>`
}

function page(title: string, body: string, locale: StatusLocale, refresh = false): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh ? '<meta http-equiv="refresh" content="15">' : ""}<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body>${body}</body></html>`
}

export function renderLogin(error: string | null, initialized: boolean, locale: StatusLocale = "bg"): string {
  const message = !initialized
    ? localize(locale,
      "The appliance operator has not been initialized. Hospital IT must complete installation from the server console.",
      "Системният администратор още не е инициализиран. Болничният ИТ екип трябва да завърши инсталацията от конзолата на сървъра.")
    : error
  return page(
    localize(locale, "Hospital appliance status — sign in", "Състояние на болничната система — вход"),
    `<main class="login-wrap"><section class="login" aria-labelledby="login-title">${languageSwitcher(locale, "/status/login")}<div class="brand">LOSPOR Hospital</div><h1 id="login-title">${localize(locale, "Appliance status", "Състояние на системата")}</h1><p>${localize(locale, "This independent page remains available if the clinical API or database is unavailable.", "Тази независима страница остава достъпна, ако клиничният API или базата данни са недостъпни.")}</p>${message ? `<div class="error" role="alert">${escapeHtml(message)}</div>` : ""}<form method="post" action="/status/login"><label for="email">${localize(locale, "Appliance administrator email", "Имейл на системния администратор")}</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">${localize(locale, "Password", "Парола")}</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit" ${initialized ? "" : "disabled"}>${localize(locale, "Sign in", "Вход")}</button></form><div class="divider">${localize(locale, "or use console recovery", "или използвайте аварийно възстановяване")}</div><form method="post" action="/status/login"><label for="recovery-token">${localize(locale, "Single-use recovery token", "Еднократен токен за възстановяване")}</label><input id="recovery-token" name="recoveryToken" type="password" autocomplete="off" maxlength="256" required><button type="submit" ${initialized ? "" : "disabled"}>${localize(locale, "Use recovery token", "Използване на токена")}</button></form></section></main>`,
    locale,
  )
}

function mfaLanguageSwitcher(locale: StatusLocale, challengeToken: string): string {
  return `<form class="language" method="post" action="/status/login/mfa"><span class="language-label">${localize(locale, "Language", "Език")}</span><input type="hidden" name="challengeToken" value="${escapeHtml(challengeToken)}"><button type="submit" name="locale" value="bg" lang="bg" aria-pressed="${locale === "bg"}" formnovalidate>БГ</button><button type="submit" name="locale" value="en" lang="en" aria-pressed="${locale === "en"}" formnovalidate>EN</button></form>`
}

export function renderMfaLogin(
  error: string | null,
  challenge: MfaLoginChallenge,
  qrSvg: string | null,
  locale: StatusLocale = "bg",
): string {
  const enrollment = challenge.enrollmentRequired
  const expiresAt = utcDate(Date.parse(challenge.expiresAt), locale)
  const instructions = enrollment
    ? localize(
      locale,
      "Scan this QR code with an authenticator app, or enter the setup key manually. Then enter the 6-digit code. The QR code is generated inside the appliance and is not sent anywhere.",
      "Сканирайте този QR код с приложение за удостоверяване или въведете ръчно ключа за настройка. След това въведете 6-цифрения код. QR кодът се създава в самата система и не се изпраща никъде.",
    )
    : localize(
      locale,
      "Enter the 6-digit code from your authenticator app. If the app is unavailable, enter one unused recovery code.",
      "Въведете 6-цифрения код от приложението за удостоверяване. Ако приложението не е достъпно, въведете един неизползван код за възстановяване.",
    )
  const setup = enrollment
    ? `${qrSvg ? `<div class="qr" aria-label="${localize(locale, "Authenticator QR code", "QR код за приложението за удостоверяване")}">${qrSvg}</div>` : ""}<div class="secret-card"><h2>${localize(locale, "Manual setup key", "Ключ за ръчна настройка")}</h2><div class="secret">${escapeHtml(challenge.manualKey ?? "")}</div></div>`
    : ""
  return page(
    localize(locale, "Hospital appliance status — verification", "Състояние на болничната система — потвърждение"),
    `<main class="login-wrap"><section class="login" aria-labelledby="mfa-title">${mfaLanguageSwitcher(locale, challenge.challengeToken)}<div class="brand">LOSPOR Hospital</div><h1 id="mfa-title">${enrollment ? localize(locale, "Set up two-step verification", "Настройване на потвърждение в две стъпки") : localize(locale, "Two-step verification", "Потвърждение в две стъпки")}</h1><p>${instructions}</p><p class="meta">${localize(locale, "This sign-in request expires", "Тази заявка за вход изтича")} ${escapeHtml(expiresAt)} UTC.</p>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}${setup}<form method="post" action="/status/login/mfa"><input type="hidden" name="challengeToken" value="${escapeHtml(challenge.challengeToken)}"><label for="mfa-code">${enrollment ? localize(locale, "6-digit verification code", "6-цифрен код за потвърждение") : localize(locale, "Verification or recovery code", "Код за потвърждение или възстановяване")}</label><input id="mfa-code" name="code" type="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" minlength="6" maxlength="32" ${enrollment ? 'inputmode="numeric" pattern="[0-9]{6}"' : ""} required autofocus><button type="submit">${localize(locale, "Verify and sign in", "Потвърждение и вход")}</button></form><p><a href="/status/login">${localize(locale, "Start sign-in again", "Започване на входа отначало")}</a></p></section></main>`,
    locale,
  )
}

export function renderMfaRecoveryCodes(codes: readonly string[], locale: StatusLocale = "bg"): string {
  return page(
    localize(locale, "Hospital appliance status — recovery codes", "Състояние на болничната система — кодове за възстановяване"),
    `<main class="login-wrap"><section class="login secret-card" aria-labelledby="recovery-title"><div class="brand">LOSPOR Hospital</div><h1 id="recovery-title">${localize(locale, "Save your recovery codes now", "Запазете кодовете за възстановяване сега")}</h1><div class="error" role="alert">${localize(locale, "These ten codes are shown only once. Each code can be used for one sign-in. Store them offline in the hospital IT password vault; anyone who has one can sign in as the appliance operator.", "Тези десет кода се показват само веднъж. Всеки код може да се използва за един вход. Съхранявайте ги офлайн в хранилището за пароли на болничния ИТ екип; всеки, който има такъв код, може да влезе като системния администратор.")}</div><ol class="secret">${codes.map(code => `<li>${escapeHtml(code)}</li>`).join("")}</ol><p>${localize(locale, "Print or save this page before continuing. The appliance stores only irreversible hashes of these codes.", "Разпечатайте или запазете тази страница, преди да продължите. Системата съхранява само необратими хешове на тези кодове.")}</p><p><a class="button" href="/status/">${localize(locale, "I saved the codes — continue", "Запазих кодовете — продължаване")}</a></p></section></main>`,
    locale,
  )
}

function banner(components: ComponentView[], locale: StatusLocale): { className: string; symbol: string; text: string } {
  const byId = new Map(components.map(item => [item.component, item]))
  const isOut = (id: string) => byId.get(id)?.status === "outage"
  const major = isOut("api") || isOut("database") || isOut("proxy") || (isOut("web") && isOut("pwa"))
  if (major) return { className: "bad", symbol: "!", text: localize(locale, "Major clinical service outage", "Съществено прекъсване на клиничните услуги") }
  const clinical = components.filter(item => item.group === "clinical")
  if (!clinical.length || clinical.some(item => item.status === "unknown")) {
    return { className: "unknown", symbol: "?", text: localize(locale, "Clinical status is being established", "Клиничното състояние се установява") }
  }
  if (clinical.some(item => item.status === "outage" || item.status === "degraded")) {
    return { className: "warn", symbol: "!", text: localize(locale, "Some clinical services are degraded", "Някои клинични услуги работят ограничено") }
  }
  return { className: "good", symbol: "✓", text: localize(locale, "Clinical services operational", "Клиничните услуги работят") }
}

function historyBars(history: DayStatus[] | undefined, locale: StatusLocale): string {
  const values = history ?? []
  const counts = values.reduce<Record<ComponentStatus, number>>((result, item) => {
    result[item.status] += 1
    return result
  }, { operational: 0, degraded: 0, outage: 0, unknown: 0, "not-configured": 0 })
  const description = locale === "bg"
    ? `${counts.operational} дни в работа, ${counts.degraded} дни с ограничения, ${counts.outage} дни без достъп, ${counts.unknown} дни с неизвестно състояние`
    : `${counts.operational} operational days, ${counts.degraded} degraded days, ${counts.outage} unavailable days, ${counts.unknown} unknown days`
  return `<div class="history" role="img" aria-label="${localize(locale, "90-day availability history", "История на достъпността за 90 дни")}: ${escapeHtml(description)}">${values.map(item => `<span class="day ${item.status}" title="${escapeHtml(item.day)}: ${statusLabel(item.status, locale)}"></span>`).join("")}</div><div class="history-caption" aria-hidden="true"><span>${localize(locale, "90 days ago", "Преди 90 дни")}</span><span>${localize(locale, "Today", "Днес")}</span></div>`
}

function componentRow(component: ComponentView, history: DayStatus[] | undefined, locale: StatusLocale): string {
  const fallback = localize(locale, "Operational state recorded by the appliance monitor.", "Оперативно състояние, записано от системния монитор.")
  return `<article class="component"><div class="component-head"><div><div class="component-name">${escapeHtml(componentLabel(component, locale))}</div><div class="component-detail">${escapeHtml(codeMessage(component.code, locale, fallback))}</div></div><div class="state ${component.status}">${statusLabel(component.status, locale)}</div></div>${historyBars(history, locale)}</article>`
}

function group(data: DashboardData, name: ComponentView["group"], title: string, locale: StatusLocale): string {
  const components = data.components.filter(item => item.group === name)
  return `<section class="section" aria-labelledby="${name}-title"><h2 id="${name}-title">${escapeHtml(title)}</h2><div class="card">${components.length ? components.map(item => componentRow(item, data.histories[item.component], locale)).join("") : `<div class="empty">${localize(locale, "Checks are being established.", "Проверките се установяват.")}</div>`}</div></section>`
}

function incidentItem(incident: IncidentView, locale: StatusLocale): string {
  const resolved = incident.resolvedAt !== null
  const fallback = localize(locale, "A service state changed.", "Състоянието на услуга се промени.")
  return `<li><strong>${escapeHtml(componentLabel(incident, locale))} — ${resolved ? localize(locale, "Resolved", "Разрешено") : localize(locale, "Active incident", "Активен инцидент")}</strong><div>${escapeHtml(codeMessage(incident.code, locale, fallback))}</div><time datetime="${new Date(incident.openedAt).toISOString()}">${localize(locale, "Started", "Начало")} ${utcDate(incident.openedAt, locale)} UTC${resolved ? ` · ${localize(locale, "resolved", "разрешено")} ${utcDate(incident.resolvedAt!, locale)} UTC` : ""}</time></li>`
}

function eventItem(event: OperationalEventView, locale: StatusLocale): string {
  const severity = locale === "bg"
    ? { info: "информация", warning: "предупреждение", critical: "критично" }[event.severity]
    : event.severity
  const message = locale === "bg" ? EVENT_MESSAGE_BG[event.code] ?? event.message : event.message
  return `<li><span class="pill ${event.severity}">${escapeHtml(severity)}</span><strong> ${escapeHtml(message)}</strong><time datetime="${new Date(event.occurredAt).toISOString()}">${escapeHtml(event.producer)} · ${utcDate(event.occurredAt, locale)} UTC</time></li>`
}

function applianceFacts(data: DashboardData, locale: StatusLocale): string {
  const snapshot = data.snapshot
  if (!snapshot) return `<div class="empty">${localize(locale, "Appliance details are not available yet.", "Системните данни още не са достъпни.")}</div>`
  const stale = !data.snapshotReceivedAt || Date.now() - data.snapshotReceivedAt > 45_000
  const storage = snapshot.research.storage
  const unknown = localize(locale, "Unknown", "Неизвестно")
  return `<div class="facts"><div class="fact"><b>${localize(locale, "Declared appliance release", "Декларирана версия на системата")}</b>${escapeHtml(snapshot.versions.hospital ?? unknown)}</div><div class="fact"><b>${localize(locale, "Vendored API / Core base", "Включена версия на API / Core")}</b>${escapeHtml(snapshot.versions.api ?? unknown)} / ${escapeHtml(snapshot.versions.core ?? unknown)}</div><div class="fact"><b>${localize(locale, "Clinical database size", "Размер на клиничната база данни")}</b>${escapeHtml(formatBytes(snapshot.database.logicalSize.bytes))}</div><div class="fact"><b>${localize(locale, "Research storage available", "Свободно място за изследвания")}</b>${escapeHtml(formatBytes(storage.availableBytes))}</div><div class="fact"><b>${localize(locale, "Cases awaiting Central acceptance", "Случаи, които чакат приемане от Central")}</b>${snapshot.central.casesWithUnacceptedChanges}</div><div class="fact"><b>${localize(locale, "Information freshness", "Актуалност на информацията")}</b>${stale ? localize(locale, "Cached — currently stale", "Кеширана — в момента остаряла") : localize(locale, "Current", "Актуална")}</div></div>`
}

function accountState(account: ManagedAccount, locale: StatusLocale): string {
  if (account.state === "DELETED") return localize(locale, "Deleted", "Изтрит")
  if (account.state === "PENDING_ACTIVATION") {
    return localize(locale, "Waiting for activation", "Очаква активиране")
  }
  return localize(locale, "Active", "Активен")
}

function accountProfile(account: ManagedAccount, locale: StatusLocale): string {
  if (account.accountKind === "RESEARCH_ONLY") {
    return localize(locale, "Research only", "Само за изследвания")
  }
  if (account.role === "HEAD_OF_DEPT") {
    return localize(locale, "Clinical — head of department", "Клиничен — началник на отделение")
  }
  if (account.role === "ADMIN") {
    return localize(locale, "Clinical administrator", "Клиничен администратор")
  }
  return localize(locale, "Clinical — member", "Клиничен — член")
}

function expiryLine(
  labelEn: string,
  labelBg: string,
  value: string | null,
  locale: StatusLocale,
): string {
  if (!value) return ""
  return `<div class="component-detail">${localize(locale, labelEn, labelBg)}: ${escapeHtml(utcDate(Date.parse(value), locale))} UTC</div>`
}

function managedAccountRow(account: ManagedAccount, locale: StatusLocale): string {
  let actions = ""
  const statusManagedAuthority = account.accountKind === "CLINICAL"
    ? account.role === "MEMBER" || account.role === "HEAD_OF_DEPT"
    : account.accountKind === "RESEARCH_ONLY" && account.role === "RESEARCHER"
  if (account.state === "PENDING_ACTIVATION"
    && statusManagedAuthority
    && !account.designatedApplianceOperator) {
    actions = `<form method="post" action="/status/accounts/${encodeURIComponent(account.id)}/activation"><button type="submit">${localize(locale, "Replace activation link", "Нова връзка за активиране")}</button></form>`
  } else if (account.state === "ACTIVE"
    && statusManagedAuthority
    && !account.designatedApplianceOperator) {
    actions = `<form method="post" action="/status/accounts/${encodeURIComponent(account.id)}/recovery"><button type="submit">${localize(locale, "Issue recovery link", "Връзка за възстановяване")}</button></form>`
  }
  if (account.state === "ACTIVE" && !account.designatedApplianceOperator) {
    const safeId = escapeHtml(account.id)
    const usernameRules = localize(
      locale,
      "Starts with a Latin letter; then Latin letters, numbers, dot, underscore, or hyphen. No spaces, @, slashes, controls, or non-Latin letters. Capitalization is preserved; login remains case-insensitive.",
      "Започва с латинска буква; след това латински букви, цифри, точка, долна черта или тире. Без интервали, @, наклонени черти, контролни знаци или букви извън латиницата. Регистърът се запазва; входът не различава главни и малки букви.",
    )
    actions += `<details class="admin-action"><summary>${localize(locale, "Change login username", "Промяна на потребителското име")}</summary><form method="post" action="/status/accounts/${encodeURIComponent(account.id)}/username"><label for="username-${safeId}">${localize(locale, "New login username", "Ново потребителско име за вход")}</label><input id="username-${safeId}" name="username" value="${escapeHtml(account.username)}" minlength="3" maxlength="64" pattern="[A-Za-z][A-Za-z0-9._-]{2,63}" autocomplete="off" spellcheck="false" required><p class="component-detail">${usernameRules} ${localize(locale, "The old username remains reserved. The user receives a one-use recovery link and all sessions are revoked.", "Старото потребителско име остава запазено. Потребителят получава еднократна връзка за възстановяване и всички сесии се прекратяват.")}</p><label for="username-reason-${safeId}">${localize(locale, "Reason (10–1000 characters)", "Причина (10–1000 знака)")}</label><input id="username-reason-${safeId}" name="reason" minlength="10" maxlength="1000" required><label for="username-password-${safeId}">${localize(locale, "Your current Status password", "Вашата текуща парола за Status")}</label><input id="username-password-${safeId}" name="currentPassword" type="password" autocomplete="current-password" maxlength="256" required><button type="submit">${localize(locale, "Change username and issue recovery", "Промяна на името и издаване на възстановяване")}</button></form></details>`
    if (account.accountKind === "CLINICAL") {
      const option = (role: "MEMBER" | "HEAD_OF_DEPT" | "ADMIN", en: string, bg: string) =>
        `<option value="${role}"${account.role === role ? " selected" : ""}>${localize(locale, en, bg)}</option>`
      actions += `<details class="admin-action"><summary>${localize(locale, "Change clinical role", "Промяна на клиничната роля")}</summary><form method="post" action="/status/accounts/${encodeURIComponent(account.id)}/role"><label for="role-${safeId}">${localize(locale, "Clinical role", "Клинична роля")}</label><select id="role-${safeId}" name="role" required>${option("MEMBER", "Member", "Член")}${option("HEAD_OF_DEPT", "Head of department", "Началник на отделение")}${option("ADMIN", "Clinical administrator", "Клиничен администратор")}</select><p class="component-detail">${localize(locale, "Role changes revoke active sessions and unused account links. Demoting a head of department does not remove or transfer their own cases.", "Промяната на ролята прекратява активните сесии и неизползваните връзки за профила. Понижаването на началник на отделение не премахва и не прехвърля собствените му случаи.")}</p><label for="role-reason-${safeId}">${localize(locale, "Reason (10–1000 characters)", "Причина (10–1000 знака)")}</label><input id="role-reason-${safeId}" name="reason" minlength="10" maxlength="1000" required><label for="role-password-${safeId}">${localize(locale, "Your current Status password", "Вашата текуща парола за Status")}</label><input id="role-password-${safeId}" name="currentPassword" type="password" autocomplete="current-password" maxlength="256" required><button type="submit">${localize(locale, "Apply clinical role", "Прилагане на клиничната роля")}</button></form></details>`
    }
  }
  const operator = account.designatedApplianceOperator
    ? `<div class="component-detail">${localize(locale, "Appliance operator — password is managed by the server credential workflow", "Системен администратор — паролата се управлява от сървърния процес за данни за вход")}</div>`
    : ""
  const contact = account.email
    ? ` · ${escapeHtml(account.email)}`
    : ""
  return `<div class="account-row"><div><div class="component-name">${escapeHtml(account.name)}</div><div class="component-detail">@${escapeHtml(account.username)}${contact}</div>${operator}</div><div><div>${escapeHtml(account.institutionName ?? localize(locale, "No institution", "Без институция"))}</div><div class="component-detail">${escapeHtml(accountProfile(account, locale))} · ${account.locale === "bg" ? "Български" : "English"}</div></div><div><strong>${escapeHtml(accountState(account, locale))}</strong>${expiryLine("Activation link expires", "Връзката за активиране изтича", account.activeActivationExpiresAt, locale)}${expiryLine("Recovery link expires", "Връзката за възстановяване изтича", account.activeRecoveryExpiresAt, locale)}</div><div class="account-actions">${actions}</div></div>`
}

function statusAdminState(admin: StatusAdminSummary, locale: StatusLocale): string {
  if (admin.state === "PENDING_ACTIVATION") {
    return localize(locale, "Waiting for activation", "Очаква активиране")
  }
  if (admin.state === "SUSPENDED") return localize(locale, "Suspended", "Спрян")
  return localize(locale, "Active", "Активен")
}

function statusAdminAction(
  admin: StatusAdminSummary,
  action: "activation" | "recovery" | "suspend",
  locale: StatusLocale,
): string {
  const labels = {
    activation: ["Issue activation link", "Издаване на връзка за активиране"],
    recovery: ["Issue recovery link", "Издаване на връзка за възстановяване"],
    suspend: ["Suspend administrator", "Спиране на администратора"],
  } as const
  const id = `${action}-${admin.id}`
  return `<details class="admin-action"><summary>${localize(locale, labels[action][0], labels[action][1])}</summary><form method="post" action="/status/status-admins/${encodeURIComponent(admin.id)}/${action}"><label for="${id}-reason">${localize(locale, "Reason (10–1000 characters)", "Причина (10–1000 знака)")}</label><input id="${id}-reason" name="reason" minlength="10" maxlength="1000" required><label for="${id}-password">${localize(locale, "Your current Status password", "Вашата текуща парола за Status")}</label><input id="${id}-password" name="currentPassword" type="password" autocomplete="current-password" maxlength="256" required><button type="submit"${action === "suspend" ? ' class="danger"' : ""}>${localize(locale, labels[action][0], labels[action][1])}</button></form></details>`
}

function statusAdminRow(
  admin: StatusAdminSummary,
  currentAdminId: string | undefined,
  locale: StatusLocale,
): string {
  const badges = [
    admin.initialChief && localize(locale, "Protected initial chief IT", "Защитен първоначален главен ИТ администратор"),
    admin.id === currentAdminId && localize(locale, "You", "Вие"),
  ].filter(Boolean).join(" · ")
  const expiry = admin.activeActivationExpiresAt
    ? `<div class="component-detail">${localize(locale, "Activation expires", "Активирането изтича")}: ${escapeHtml(utcDate(admin.activeActivationExpiresAt, locale))} UTC</div>`
    : admin.activeRecoveryExpiresAt
      ? `<div class="component-detail">${localize(locale, "Recovery expires", "Възстановяването изтича")}: ${escapeHtml(utcDate(admin.activeRecoveryExpiresAt, locale))} UTC</div>`
      : ""
  let actions = ""
  if (!admin.initialChief && admin.state !== "ACTIVE") {
    actions = statusAdminAction(admin, "activation", locale)
  } else if (admin.state === "ACTIVE") {
    actions = statusAdminAction(admin, "recovery", locale)
      + (admin.initialChief ? "" : statusAdminAction(admin, "suspend", locale))
  }
  return `<div class="account-row"><div><div class="component-name">${escapeHtml(admin.displayName)}</div><div class="component-detail">${escapeHtml(admin.email)}</div>${badges ? `<div class="component-detail">${escapeHtml(badges)}</div>` : ""}</div><div><strong>${localize(locale, "Full Status administrator", "Пълен администратор на Status")}</strong><div class="component-detail">${localize(locale, "Technical operations + clinical/research account supervision", "Технически операции + управление на клинични/изследователски профили")}</div></div><div><strong>${escapeHtml(statusAdminState(admin, locale))}</strong>${expiry}</div><div class="account-actions">${actions}</div></div>`
}

export function renderAccounts(
  directory: AccountDirectory | null,
  locale: StatusLocale = "bg",
  error?: string,
  statusAdmins: readonly StatusAdminSummary[] = [],
  currentStatusAdminId?: string,
  audience: StatusNavAudience = "password",
): string {
  const institutions = directory?.institutions ?? []
  const options = institutions.map(institution =>
    `<option value="${escapeHtml(institution.id)}">${escapeHtml(institution.name)} — ${escapeHtml(institution.city)}</option>`
  ).join("")
  const creation = directory
    ? `<form method="post" action="/status/accounts"><div class="form-grid"><div class="wide"><label for="username">${localize(locale, "Login username", "Потребителско име за вход")}</label><input id="username" name="username" minlength="3" maxlength="64" pattern="[A-Za-z][A-Za-z0-9._-]{2,63}" autocomplete="off" spellcheck="false" required><p class="component-detail">${localize(locale, "3–64 characters. Start with a Latin letter; then use Latin letters, numbers, dot, underscore, or hyphen. Uppercase and lowercase are allowed and preserved. Spaces, @, slashes, control characters, and non-Latin letters are not allowed.", "От 3 до 64 знака. Започва с латинска буква; след това използвайте латински букви, цифри, точка, долна черта или тире. Главните и малките букви са разрешени и се запазват. Интервали, @, наклонени черти, контролни знаци и букви извън латиницата не са разрешени.")}</p></div><div><label for="firstName">${localize(locale, "First name", "Име")}</label><input id="firstName" name="firstName" maxlength="80" autocomplete="off" required></div><div><label for="lastName">${localize(locale, "Last name", "Фамилия")}</label><input id="lastName" name="lastName" maxlength="80" autocomplete="off" required></div><div><label for="title">${localize(locale, "Title (optional)", "Титла (по желание)")}</label><input id="title" name="title" maxlength="40" autocomplete="off"></div><div><label for="email">${localize(locale, "Contact email (optional; never used to sign in)", "Имейл за контакт (по желание; никога не се използва за вход)")}</label><input id="email" name="email" type="email" maxlength="254" autocomplete="off"></div><div><label for="institutionId">${localize(locale, "Institution / department", "Лечебно заведение / отделение")}</label><select id="institutionId" name="institutionId" required>${options}</select></div><div><label for="accessProfile">${localize(locale, "Account access", "Достъп на профила")}</label><select id="accessProfile" name="accessProfile" required><option value="CLINICAL_MEMBER">${localize(locale, "Clinical member", "Клиничен член")}</option><option value="CLINICAL_HOD">${localize(locale, "Clinical head of department", "Клиничен началник на отделение")}</option><option value="RESEARCH_ONLY">${localize(locale, "Research only (no clinical app)", "Само за изследвания (без клиничното приложение)")}</option></select></div><div><label for="locale">${localize(locale, "Account language", "Език на профила")}</label><select id="locale" name="locale"><option value="bg">Български</option><option value="en">English</option></select></div><div class="wide"><button type="submit">${localize(locale, "Create account and activation link", "Създаване на профил и връзка за активиране")}</button></div></div></form>`
    : `<div class="empty">${localize(locale, "Account controls are currently unavailable.", "Управлението на профили в момента не е достъпно.")}</div>`
  const rows = directory?.accounts.length
    ? directory.accounts.map(account => managedAccountRow(account, locale)).join("")
    : `<div class="empty">${localize(locale, "No accounts are available.", "Няма налични профили.")}</div>`
  const statusAdminRows = statusAdmins.length
    ? statusAdmins.map(admin => statusAdminRow(admin, currentStatusAdminId, locale)).join("")
    : `<div class="empty">${localize(locale, "No Status administrators are available.", "Няма налични администратори на Status.")}</div>`
  const statusAdminCreation = `<form method="post" action="/status/status-admins"><div class="form-grid"><div><label for="status-admin-name">${localize(locale, "Administrator display name", "Име на администратора")}</label><input id="status-admin-name" name="displayName" maxlength="160" autocomplete="off" required></div><div><label for="status-admin-email">${localize(locale, "Status login email", "Имейл за вход в Status")}</label><input id="status-admin-email" name="email" type="email" maxlength="254" autocomplete="off" required></div><div class="wide"><label for="status-admin-reason">${localize(locale, "Reason (10–1000 characters)", "Причина (10–1000 знака)")}</label><input id="status-admin-reason" name="reason" minlength="10" maxlength="1000" required></div><div class="wide"><label for="status-admin-password">${localize(locale, "Your current Status password", "Вашата текуща парола за Status")}</label><input id="status-admin-password" name="currentPassword" type="password" autocomplete="current-password" maxlength="256" required></div><div class="wide"><button type="submit">${localize(locale, "Create Status administrator and activation link", "Създаване на администратор на Status и връзка за активиране")}</button></div></div></form>`
  return page(
    localize(locale, "Hospital accounts and access", "Болнични профили и достъп"),
    `<div class="shell">${statusHeader("/status/accounts", locale, audience, localize(locale, "Accounts and access", "Профили и достъп"))}<main>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}<section class="section" aria-labelledby="status-admin-create-title"><h2 id="status-admin-create-title">${localize(locale, "Status administrators", "Администратори на Status")}</h2><div class="card"><div class="component"><p><strong>${localize(locale, "There are no permission tiers.", "Няма нива на права.")}</strong> ${localize(locale, "Every Status administrator automatically receives both appliance technical controls and clinical/research account supervision and grants.", "Всеки администратор на Status автоматично получава едновременно техническото управление на системата и управлението на клинични/изследователски профили и разрешения.")}</p><p class="component-detail">${localize(locale, "A Status identity does not sign in to the clinical application and grants no access to clinical records by itself. Creating an administrator requires your current password after MFA and a recorded reason.", "Самоличността в Status не влиза в клиничното приложение и сама по себе си не дава достъп до клинични записи. Създаването на администратор изисква текущата ви парола след MFA и записана причина.")}</p>${statusAdminCreation}</div>${statusAdminRows}</div></section><section class="section" aria-labelledby="create-account-title"><h2 id="create-account-title">${localize(locale, "Create a clinical or research account", "Създаване на клиничен или изследователски профил")}</h2><div class="card"><div class="component"><p>${localize(locale, "Self-registration stays disabled. Create the profile here, then give the one-time activation link directly to the clinician, head of department, administrator, or researcher. No email service is required.", "Саморегистрацията остава изключена. Създайте профила тук, след което предайте еднократната връзка за активиране лично на клинициста, началника на отделение, администратора или изследователя. Не е необходима услуга за електронна поща.")}</p><p class="component-detail">${localize(locale, "Status uses only the private lifecycle control and never receives a clinical or research session.", "Status използва само частното управление на жизнения цикъл и никога не получава клинична или изследователска сесия.")}</p>${creation}</div></div></section><section class="section" aria-labelledby="accounts-title"><h2 id="accounts-title">${localize(locale, "Existing clinical and research accounts", "Съществуващи клинични и изследователски профили")}</h2><div class="card">${rows}</div></section></main><footer class="foot">${localize(locale, "Activation links expire after 72 hours. Recovery links expire after 8 hours. Issuing a replacement immediately invalidates every previous unused link of the same kind.", "Връзките за активиране изтичат след 72 часа. Връзките за възстановяване изтичат след 8 часа. Издаването на нова връзка незабавно обезсилва всички предишни неизползвани връзки от същия вид.")}</footer></div>`,
    locale,
  )
}

export function renderOneTimeAccountLink(
  link: OneTimeAccountLink,
  locale: StatusLocale = "bg",
  qrSvg: string | null = null,
): string {
  const activation = link.purpose === "ACTIVATION"
  const title = activation
    ? localize(locale, "One-time activation link", "Еднократна връзка за активиране")
    : localize(locale, "One-time recovery link", "Еднократна връзка за възстановяване")
  const hours = activation ? "72" : "8"
  const qr = qrSvg
    ? `<div class="qr" role="img" aria-label="${localize(locale, "QR code containing the complete one-time link", "QR код с цялата еднократна връзка")}">${qrSvg}</div>`
    : ""
  return page(
    title,
    `<div class="shell"><header class="top no-print"><div><div class="brand">LOSPOR Hospital</div><div class="subbrand">${escapeHtml(title)}</div></div></header><main><div class="banner warn" role="alert"><span class="dot" aria-hidden="true">!</span><strong>${localize(locale, "This link is shown once. Copy, scan, or print it before leaving this page.", "Тази връзка се показва само веднъж. Копирайте, сканирайте или отпечатайте я, преди да напуснете страницата.")}</strong></div><section class="section secret-card" aria-labelledby="one-time-link-title"><h2 id="one-time-link-title">${escapeHtml(title)}</h2><p>${localize(locale, `Give this exact link only to the intended account holder. It expires in ${hours} hours and stops working immediately after first use.`, `Предайте точната връзка само на определения притежател на профила. Тя изтича след ${hours} часа и спира да работи веднага след първото използване.`)}</p>${qr}<label for="one-time-link">${localize(locale, "Copy this complete link", "Копирайте цялата връзка")}</label><textarea id="one-time-link" class="secret" readonly dir="ltr" spellcheck="false">${escapeHtml(link.url)}</textarea><p><a href="${escapeHtml(link.url)}" rel="noreferrer" target="_blank">${localize(locale, "Open the link on this device", "Отваряне на връзката на това устройство")}</a></p><div class="component-detail">${localize(locale, "Expires", "Изтича")}: ${escapeHtml(utcDate(Date.parse(link.expiresAt), locale))} UTC</div></section><p class="no-print"><a href="/status/accounts">${localize(locale, "I have copied or printed it — back to accounts", "Копирах или отпечатах връзката — назад към профилите")}</a></p></main><footer class="foot">${localize(locale, "The QR code is generated locally. The secret is not stored in Status history and cannot be displayed again. A replacement link invalidates this one.", "QR кодът се създава локално. Тайната не се съхранява в историята на страницата за състояние и не може да бъде показана отново. Нова връзка обезсилва тази.")}</footer></div>`,
    locale,
  )
}

export function renderStatusAdminOneTimeLink(
  link: { purpose: StatusAdminLinkPurpose; url: string; expiresAt: string },
  locale: StatusLocale = "bg",
  qrSvg: string | null = null,
): string {
  const activation = link.purpose === "ACTIVATION"
  const title = activation
    ? localize(locale, "Status administrator activation", "Активиране на администратор на Status")
    : localize(locale, "Status administrator recovery", "Възстановяване на администратор на Status")
  const hours = activation ? 72 : 8
  return page(
    title,
    `<div class="shell"><header class="top no-print"><div><div class="brand">LOSPOR Hospital</div><div class="subbrand">${escapeHtml(title)}</div></div></header><main><div class="banner warn" role="alert"><span class="dot" aria-hidden="true">!</span><strong>${localize(locale, "This administrator link is shown once. Copy, scan, or print it before leaving.", "Тази връзка за администратор се показва само веднъж. Копирайте, сканирайте или отпечатайте я, преди да напуснете.")}</strong></div><section class="section secret-card" aria-labelledby="status-admin-link-title"><h2 id="status-admin-link-title">${escapeHtml(title)}</h2><p>${localize(locale, `Give this link directly to the intended IT administrator. It expires after ${hours} hours and is invalid after its first successful use.`, `Предайте връзката лично на определения ИТ администратор. Тя изтича след ${hours} часа и става невалидна след първото успешно използване.`)}</p>${qrSvg ? `<div class="qr" role="img" aria-label="${localize(locale, "QR code containing the complete one-time administrator link", "QR код с цялата еднократна връзка за администратор")}">${qrSvg}</div>` : ""}<label for="status-admin-one-time-link">${localize(locale, "Copy this complete link", "Копирайте цялата връзка")}</label><textarea id="status-admin-one-time-link" class="secret" readonly dir="ltr" spellcheck="false">${escapeHtml(link.url)}</textarea><p><a href="${escapeHtml(link.url)}" rel="noreferrer" target="_blank">${localize(locale, "Open the link on this device", "Отваряне на връзката на това устройство")}</a></p><div class="component-detail">${localize(locale, "Expires", "Изтича")}: ${escapeHtml(utcDate(Date.parse(link.expiresAt), locale))} UTC</div></section><p class="no-print"><a href="/status/accounts">${localize(locale, "I copied or printed it — back to accounts", "Копирах или отпечатах връзката — назад към профилите")}</a></p></main><footer class="foot">${localize(locale, "Status stores only an irreversible token digest. The URL fragment is never sent in the page request, and replacing the link invalidates this one.", "Status съхранява само необратим хеш на токена. Фрагментът на URL никога не се изпраща в заявката за страницата, а нова връзка обезсилва тази.")}</footer></div>`,
    locale,
  )
}

export function renderStatusAdminCredentialSetup(
  purpose: StatusAdminLinkPurpose,
  error: string | null,
  locale: StatusLocale = "bg",
): string {
  const activation = purpose === "ACTIVATION"
  const path = activation ? "/status/admin-activate" : "/status/admin-recover"
  const title = activation
    ? localize(locale, "Activate your Status administrator account", "Активирайте администраторския си профил в Status")
    : localize(locale, "Recover your Status administrator account", "Възстановете администраторския си профил в Status")
  const languageLinks = `<nav class="language-links" aria-label="${localize(locale, "Language", "Език")}"><a class="fragment-language" href="${path}?locale=bg" lang="bg" aria-current="${locale === "bg"}">БГ</a><a class="fragment-language" href="${path}?locale=en" lang="en" aria-current="${locale === "en"}">EN</a></nav>`
  return page(
    title,
    `<main class="login-wrap"><section class="login" aria-labelledby="status-admin-setup-title">${languageLinks}<div class="brand">LOSPOR Hospital</div><h1 id="status-admin-setup-title">${escapeHtml(title)}</h1><p>${localize(locale, "The one-time token is read from the link fragment inside this browser and is not sent until you submit this form. Choose your own password; Status never stores or shows it in plaintext.", "Еднократният токен се прочита от фрагмента на връзката само в този браузър и не се изпраща, докато не подадете формуляра. Изберете собствена парола; Status никога не я съхранява или показва като обикновен текст.")}</p>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}<form method="post" action="${path}"><input type="hidden" name="locale" value="${locale}"><label for="status-admin-token">${localize(locale, "One-time token", "Еднократен токен")}</label><input id="status-admin-token" name="token" type="password" autocomplete="off" minlength="32" maxlength="256" required><p class="component-detail">${localize(locale, "Opening the complete link fills this automatically. You may also paste the value after #statusAdminToken=.", "Отварянето на цялата връзка попълва това поле автоматично. Може и да поставите стойността след #statusAdminToken=.")}</p><label for="status-admin-new-password">${localize(locale, "New password", "Нова парола")}</label><input id="status-admin-new-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="256" required><p class="component-detail">${localize(locale, "8–256 characters with an uppercase letter, number, and special character.", "От 8 до 256 знака с главна буква, цифра и специален знак.")}</p><label for="status-admin-confirm-password">${localize(locale, "Confirm new password", "Потвърдете новата парола")}</label><input id="status-admin-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="256" required><button type="submit">${activation ? localize(locale, "Activate administrator", "Активиране на администратора") : localize(locale, "Replace password", "Смяна на паролата")}</button></form><p><a href="/status/login">${localize(locale, "Back to Status sign-in", "Назад към входа в Status")}</a></p><script src="/status/admin-link.js" defer></script></section></main>`,
    locale,
  )
}

export function renderStatusAdminCredentialSuccess(
  purpose: StatusAdminLinkPurpose,
  email: string,
  locale: StatusLocale = "bg",
): string {
  const activation = purpose === "ACTIVATION"
  return page(
    localize(locale, "Status administrator ready", "Администраторът на Status е готов"),
    `<main class="login-wrap"><section class="login" aria-labelledby="status-admin-success-title"><div class="brand">LOSPOR Hospital</div><h1 id="status-admin-success-title">${activation ? localize(locale, "Administrator activated", "Администраторът е активиран") : localize(locale, "Password replaced", "Паролата е сменена")}</h1><div class="notice" role="status">${localize(locale, "The one-time link is now invalid.", "Еднократната връзка вече е невалидна.")}</div><p>${localize(locale, "Sign in with", "Влезте с")} <span class="mono">${escapeHtml(email)}</span>. ${localize(locale, "The first sign-in for this credential generation requires setting up MFA and shows ten one-use recovery codes once.", "Първият вход за това поколение данни за вход изисква настройване на MFA и показва еднократно десет кода за възстановяване.")}</p><p><a href="/status/login">${localize(locale, "Continue to Status sign-in", "Към входа в Status")}</a></p></section></main>`,
    locale,
  )
}

function boolWord(value: boolean, locale: StatusLocale): string {
  return value ? localize(locale, "Yes", "Да") : localize(locale, "No", "Не")
}

function readinessWord(value: boolean, locale: StatusLocale): string {
  return value ? localize(locale, "Ready", "Готово") : localize(locale, "Not ready", "Не е готово")
}

function baselineStatusWord(
  status: NonNullable<ClinicalBaselineReadiness["selected"]>["status"],
  locale: StatusLocale,
): string {
  const labels = {
    DRAFT: ["Draft", "Чернова"],
    PUBLISHED: ["Published", "Публикуван"],
    RETIRED: ["Retired", "Изведен от употреба"],
  } as const
  return localize(locale, labels[status][0], labels[status][1])
}

function baselineReason(
  baseline: ClinicalBaselineReadiness,
  locale: StatusLocale,
): string {
  const reasons: Record<ClinicalBaselineReadiness["reasonCode"], [string, string]> = {
    READY: [
      "The exact selected, published v2 baseline matches the bundled release.",
      "Точно избраната и публикувана базова версия v2 съвпада с включената във версията на системата.",
    ],
    SELECTION_MISSING: [
      "No platform baseline is selected.",
      "Няма избрана базова конфигурация за цялата система.",
    ],
    IDENTITY_MISMATCH: [
      "The selected platform preset is not the expected bundled v2 baseline.",
      "Избраният набор за цялата система не е очакваната включена базова версия v2.",
    ],
    VERSION_MISMATCH: [
      "The selected baseline is not the expected v2 version.",
      "Избраната базова конфигурация не е очакваната версия v2.",
    ],
    NOT_PUBLISHED: [
      "The selected baseline is not published.",
      "Избраната базова конфигурация не е публикувана.",
    ],
    RULE_COUNT_MISMATCH: [
      "The selected baseline has a different number of rules.",
      "Избраната базова конфигурация има различен брой правила.",
    ],
    RULES_INVALID: [
      "One or more stored rules fail the publication checks.",
      "Едно или повече съхранени правила не преминават проверките за публикуване.",
    ],
    PROFILE_COUNT_MISMATCH: [
      "The selected baseline has different drug, infusion, or fluid profile counts.",
      "Избраната базова конфигурация има различен брой профили за лекарства, инфузии или течности.",
    ],
    DIGEST_MISMATCH: [
      "The selected baseline content does not match the expected SHA-256.",
      "Съдържанието на избраната базова конфигурация не съвпада с очаквания SHA-256.",
    ],
  }
  const reason = reasons[baseline.reasonCode]
  return localize(locale, reason[0], reason[1])
}

function profileCountSummary(
  counts: ClinicalBaselineReadiness["expected"]["profileCounts"] | null,
  locale: StatusLocale,
): string | null {
  if (!counts) return null
  return localize(
    locale,
    `Drug ${counts.drug} · infusion ${counts.infusion} · fluid ${counts.fluid} · total ${counts.total}`,
    `Лекарства ${counts.drug} · инфузии ${counts.infusion} · течности ${counts.fluid} · общо ${counts.total}`,
  )
}

function clinicalBaselineFacts(
  labelEn: string,
  labelBg: string,
  policyEnabled: boolean,
  baseline: ClinicalBaselineReadiness,
  locale: StatusLocale,
): string {
  const selected = baseline.selected
  const active = policyEnabled && baseline.baselineReady
  return `<div class="component"><h3>${escapeHtml(localize(locale, labelEn, labelBg))}</h3><div class="facts">
    ${textFact(localize(locale, "Policy enabled", "Политиката е включена"), boolWord(policyEnabled, locale))}
    ${textFact(localize(locale, "Baseline readiness", "Готовност на базовата конфигурация"), readinessWord(baseline.baselineReady, locale))}
    ${textFact(localize(locale, "Calculated guidance available now", "Изчислителните насоки са налични сега"), boolWord(active, locale))}
    ${textFact(localize(locale, "Expected preset", "Очакван набор"), `${baseline.expected.presetId} · v${baseline.expected.version}`)}
    ${textFact(localize(locale, "Selected preset", "Избран набор"), selected ? `${selected.presetId} · v${selected.version} · ${baselineStatusWord(selected.status, locale)}` : null)}
    ${textFact(localize(locale, "Rules (selected / expected)", "Правила (избрани / очаквани)"), `${selected?.ruleCount ?? 0} / ${baseline.expected.ruleCount}`)}
    ${textFact(localize(locale, "Selected profile counts", "Брой избрани профили"), profileCountSummary(selected?.profileCounts ?? null, locale))}
    ${textFact(localize(locale, "Expected profile counts", "Брой очаквани профили"), profileCountSummary(baseline.expected.profileCounts, locale))}
    ${hashFact(localize(locale, "Selected baseline SHA-256", "SHA-256 на избраната базова конфигурация"), selected?.digestSha256 ?? null)}
    ${hashFact(localize(locale, "Expected baseline SHA-256", "SHA-256 на очакваната базова конфигурация"), baseline.expected.digestSha256)}
  </div><p><strong>${escapeHtml(readinessWord(baseline.baselineReady, locale))}.</strong> ${escapeHtml(baselineReason(baseline, locale))}</p></div>`
}

function permissionSummary(
  grant: ControlPlaneView["research"]["grants"][number],
  locale: StatusLocale,
): string {
  return [
    grant.canQuery && localize(locale, "query", "справки"),
    grant.canInspectCases && localize(locale, "inspect", "преглед"),
    grant.canExportCsv && "CSV",
    grant.canExportJson && "JSON",
    grant.canExportOmop && "OMOP",
    grant.canShare && localize(locale, "sharing", "споделяне"),
  ].filter(Boolean).join(", ")
}

function researchAccountRoleLabel(
  account: ControlPlaneView["research"]["accounts"][number],
  locale: StatusLocale,
): string {
  if (account.accountKind === "RESEARCH_ONLY") {
    return localize(locale, "research-only", "само за изследвания")
  }
  return {
    MEMBER: localize(locale, "clinical member", "клиничен член"),
    HEAD_OF_DEPT: localize(locale, "head of department", "началник на отделение"),
    ADMIN: localize(locale, "clinical administrator", "клиничен администратор"),
    RESEARCHER: localize(locale, "researcher", "изследовател"),
  }[account.role]
}

function centralQueueStatusLabel(status: string, locale: StatusLocale): string {
  const labels: Record<string, [string, string]> = {
    PENDING: ["Pending", "Очаква"],
    GENERATING: ["Generating", "Създава се"],
    READY: ["Ready", "Готов"],
    UPLOADING: ["Uploading", "Изпраща се"],
    AWAITING_RECEIPT: ["Awaiting receipt", "Очаква разписка"],
    ACCEPTED: ["Accepted", "Приет"],
    REJECTED: ["Rejected", "Отхвърлен"],
    RETRY: ["Retry", "Нов опит"],
    CANCELLED: ["Cancelled", "Отменен"],
  }
  const label = labels[status]
  return label ? localize(locale, label[0], label[1]) : status
}

function centralQueueSummary(queues: Record<string, number>, locale: StatusLocale): string {
  const entries = Object.entries(queues).sort(([left], [right]) => left.localeCompare(right))
  if (!entries.length) return localize(locale, "none waiting", "няма чакащи пакети")
  return entries.map(([status, count]) => `${centralQueueStatusLabel(status, locale)}: ${count}`).join(" · ")
}

function hashFact(label: string, value: string | null): string {
  return `<div class="fact"><b>${escapeHtml(label)}</b><span class="mono">${escapeHtml(value ?? "—")}</span></div>`
}

function textFact(label: string, value: string | null): string {
  return `<div class="fact"><b>${escapeHtml(label)}</b>${escapeHtml(value ?? "—")}</div>`
}

function dateFact(label: string, value: string | null, locale: StatusLocale): string {
  return `<div class="fact"><b>${escapeHtml(label)}</b>${value ? `${escapeHtml(utcDate(Date.parse(value), locale))} UTC` : "—"}</div>`
}

export function renderControlPlane(
  view: ControlPlaneView | null,
  locale: StatusLocale = "bg",
  error?: string,
  notice?: string,
  audience: StatusNavAudience = "password",
): string {
  const research = view?.research
  const optionalContact = (email: string | null, separator: string) =>
    email ? `${separator}${escapeHtml(email)}` : ""
  const accountOptions = research?.accounts.map(account =>
    `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}${optionalContact(account.email, " — ")} — ${escapeHtml(researchAccountRoleLabel(account, locale))}</option>`
  ).join("") ?? ""
  const institutionOptions = research?.institutions.map(institution =>
    `<option value="${escapeHtml(institution.id)}">${escapeHtml(institution.name)}</option>`
  ).join("") ?? ""
  const activeGrantOptions = research?.grants.filter(grant => grant.active).map(grant =>
    `<option value="${escapeHtml(grant.id)}">${escapeHtml(grant.userName)} — ${escapeHtml(grant.id)}</option>`
  ).join("") ?? ""
  const grantForm = view ? `<form method="post" action="/status/control/research/grants"><div class="form-grid">
    <div><label for="grant-user">${localize(locale, "Eligible active account", "Допустим активен профил")}</label><select id="grant-user" name="userId" required>${accountOptions}</select><p class="component-detail">${localize(locale, "Clinicians, heads of department, administrators and research-only accounts all require an explicit grant for detailed or exported research data.", "Клиницисти, началници на отделения, администратори и профили само за изследвания се нуждаят от изрично разрешение за подробни или експортирани изследователски данни.")}</p></div>
    <div><label for="grant-institution">${localize(locale, "Institution scope", "Обхват по лечебно заведение")}</label><select id="grant-institution" name="institutionId"><option value="">${localize(locale, "Select an institution", "Изберете лечебно заведение")}</option>${institutionOptions}</select><label class="check"><input type="checkbox" name="allInstitutions" value="true"> ${localize(locale, "All institutions", "Всички лечебни заведения")}</label></div>
    <div class="wide"><label for="grant-purpose">${localize(locale, "Specific research purpose", "Конкретна цел на изследването")}</label><textarea id="grant-purpose" name="purpose" maxlength="500" required></textarea></div>
    <div><label for="grant-expiry">${localize(locale, "Validity in days (default 90, maximum 365)", "Срок в дни (по подразбиране 90, максимум 365)")}</label><input id="grant-expiry" name="expiryDays" type="number" min="1" max="365" value="90" required></div>
    <div><label for="grant-supersedes">${localize(locale, "Replace an active grant (optional)", "Замяна на действащо разрешение (по желание)")}</label><select id="grant-supersedes" name="supersedesGrantId"><option value="">${localize(locale, "Issue a separate grant", "Издаване на отделно разрешение")}</option>${activeGrantOptions}</select></div>
    <fieldset class="wide"><legend>${localize(locale, "Separate permissions", "Отделни разрешения")}</legend><div class="checks">
      <label class="check"><input type="checkbox" name="canQuery" value="true" checked> ${localize(locale, "Aggregate queries", "Обобщени справки")}</label>
      <label class="check"><input type="checkbox" name="canInspectCases" value="true"> ${localize(locale, "Inspect pseudonymous cases", "Преглед на псевдонимизирани случаи")}</label>
      <label class="check"><input type="checkbox" name="canExportCsv" value="true"> CSV</label>
      <label class="check"><input type="checkbox" name="canExportJson" value="true"> JSON</label>
      <label class="check"><input type="checkbox" name="canExportOmop" value="true"> OMOP (${localize(locale, "also needs CSV or JSON and exact approval", "изисква и CSV или JSON, както и точно одобрение")})</label>
      <label class="check"><input type="checkbox" name="canShare" value="true"> ${localize(locale, "Share institution cohorts", "Споделяне на кохорти в лечебното заведение")}</label>
    </div></fieldset>
    <div class="wide"><label for="grant-password">${localize(locale, "Administrator password (confirm this change)", "Администраторска парола (потвърдете промяната)")}</label><input id="grant-password" name="password" type="password" autocomplete="current-password" maxlength="256" required></div>
    <div class="wide"><button type="submit">${localize(locale, "Issue immutable grant", "Издаване на непроменимо разрешение")}</button></div>
  </div></form>` : `<div class="empty">${localize(locale, "Controls are unavailable.", "Управлението не е достъпно.")}</div>`

  const grantRows = research?.grants.length ? research.grants.map(grant => {
    const state = grant.active
      ? localize(locale, "Active", "Действащо")
      : grant.supersededAt ? localize(locale, "Replaced", "Заменено")
        : grant.revokedAt ? localize(locale, "Revoked", "Отменено")
          : localize(locale, "Expired", "Изтекло")
    const revoke = grant.active ? `<form method="post" action="/status/control/research/grants/${encodeURIComponent(grant.id)}/revoke"><label>${localize(locale, "Revocation reason", "Причина за отмяна")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button class="danger" type="submit">${localize(locale, "Revoke", "Отмяна")}</button></form>` : ""
    return `<div class="component"><div class="component-head"><div><div class="component-name">${escapeHtml(grant.userName)}${optionalContact(grant.userEmail, " · ")}</div><div class="component-detail">${escapeHtml(grant.allInstitutions ? localize(locale, "All institutions", "Всички лечебни заведения") : grant.institutionName ?? "—")} · ${escapeHtml(permissionSummary(grant, locale))}</div><div class="component-detail">${localize(locale, "Purpose", "Цел")}: ${escapeHtml(grant.purpose)}</div><div class="component-detail">${localize(locale, "Expires", "Изтича")}: ${grant.expiresAt ? escapeHtml(utcDate(Date.parse(grant.expiresAt), locale)) : "—"} UTC · ${escapeHtml(grant.id)}</div></div><strong>${escapeHtml(state)}</strong></div>${revoke}</div>`
  }).join("") : `<div class="empty">${localize(locale, "No research grants.", "Няма разрешения за изследвания.")}</div>`

  const omopRows = research?.omopRequests.length ? research.omopRequests.map(request =>
    `<div class="component"><div class="component-name">${escapeHtml(request.name)} · ${escapeHtml(request.format.toUpperCase())}</div><div class="component-detail">${escapeHtml(request.requesterName)}${optionalContact(request.requesterEmail, " · ")} · ${localize(locale, "Grant", "Разрешение")} ${escapeHtml(request.grantId)}</div><p>${localize(locale, "Purpose", "Цел")}: ${escapeHtml(request.purpose ?? "—")}</p><div class="facts">${hashFact(localize(locale, "Definition SHA-256", "SHA-256 на дефиницията"), request.definitionHash)}${hashFact(localize(locale, "Snapshot SHA-256", "SHA-256 на моментната снимка"), request.snapshotHash)}<div class="fact"><b>${localize(locale, "Case count", "Брой случаи")}</b>${request.snapshotCaseCount}</div><div class="fact"><b>${localize(locale, "Institutions", "Лечебни заведения")}</b>${escapeHtml(request.scopeInstitutionIds.join(", "))}</div></div><form method="post" action="/status/control/research/omop/${encodeURIComponent(request.id)}/approve"><label>${localize(locale, "Approval reason", "Причина за одобрение")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Approve this exact dataset", "Одобряване на точно този набор")}</button></form></div>`
  ).join("") : `<div class="empty">${localize(locale, "No OMOP datasets await approval.", "Няма OMOP набори, които чакат одобрение.")}</div>`

  const central = view?.central
  const certificateFacts = central ? `<div class="facts">
    ${textFact(localize(locale, "Central endpoint", "Адрес на Central"), central.endpoint)}
    ${textFact(localize(locale, "Hospital site ID", "Идентификатор на болничния обект"), central.siteId)}
    ${textFact(localize(locale, "Hospital site code", "Код на болничния обект"), central.siteCode)}
    ${textFact(localize(locale, "Institution ID", "Идентификатор на лечебното заведение"), central.institutionId)}
    ${textFact(localize(locale, "Hospital signing key ID", "Идентификатор на ключа за подписване от болницата"), central.signingKeyId)}
    ${textFact(localize(locale, "Central encryption key ID", "Идентификатор на ключа за шифроване от Central"), central.centralEncryptionKeyId)}
    ${textFact(localize(locale, "Central receipt signing key ID", "Идентификатор на ключа за подписване на разписки от Central"), central.receiptSigningKeyId)}
    ${textFact(localize(locale, "Transport locked", "Преносът е заключен"), boolWord(central.transportLocked, locale))}
    ${hashFact(localize(locale, "Transport configuration SHA-256", "SHA-256 на настройката за пренос"), central.transportConfigurationHash)}
    ${dateFact(localize(locale, "Transport configured", "Преносът е настроен"), central.transportConfiguredAt, locale)}
    ${textFact(localize(locale, "Enrolled with Central", "Свързана с Central"), boolWord(central.enrolled, locale))}
    ${dateFact(localize(locale, "Enrolled", "Свързана на"), central.enrolledAt, locale)}
    ${dateFact(localize(locale, "Last capabilities check", "Последна проверка на възможностите"), central.lastCapabilitiesAt, locale)}
    ${dateFact(localize(locale, "Last delivery", "Последно изпращане"), central.lastDeliveryAt, locale)}
    ${hashFact(localize(locale, "Client certificate SHA-256", "SHA-256 на клиентския сертификат"), central.clientCertificate?.fingerprintSha256 ?? null)}
    ${dateFact(localize(locale, "Client certificate valid from", "Клиентският сертификат е валиден от"), central.clientCertificate?.validFrom ?? null, locale)}
    ${dateFact(localize(locale, "Client certificate valid to", "Клиентският сертификат е валиден до"), central.clientCertificate?.validTo ?? null, locale)}
    ${hashFact(localize(locale, "Central CA SHA-256", "SHA-256 на CA за Central"), central.caCertificate?.fingerprintSha256 ?? null)}
    ${dateFact(localize(locale, "Central CA valid from", "CA за Central е валиден от"), central.caCertificate?.validFrom ?? null, locale)}
    ${dateFact(localize(locale, "Central CA valid to", "CA за Central е валиден до"), central.caCertificate?.validTo ?? null, locale)}
    ${textFact(localize(locale, "Compatible manifest", "Съвместим манифест"), boolWord(central.compatibility.compatible, locale))}
    ${textFact(localize(locale, "Local manifest version", "Локална версия на манифеста"), central.compatibility.localManifestVersion)}
    ${textFact(localize(locale, "Central supported manifest versions", "Версии на манифеста, поддържани от Central"), central.compatibility.supportedManifestVersions.join(", ") || null)}
    ${textFact(localize(locale, "Maximum upload bytes", "Максимален размер за изпращане в байтове"), central.compatibility.maximumUploadBytes === null ? null : String(central.compatibility.maximumUploadBytes))}
    ${textFact(localize(locale, "Multipart chunk bytes", "Размер на част при изпращане в байтове"), central.compatibility.multipartChunkBytes === null ? null : String(central.compatibility.multipartChunkBytes))}
  </div>` : ""
  const transport = central ? `<form method="post" action="/status/control/central/transport"><div class="form-grid"><div><label>${localize(locale, "Central HTTPS endpoint", "HTTPS адрес на Central")}<input name="centralBaseUrl" type="url" value="${escapeHtml(central.endpoint ?? "")}" maxlength="2048" required></label></div><div><label>${localize(locale, "Hospital site code", "Код на болничния обект")}<input name="siteCode" value="${escapeHtml(central.siteCode ?? "")}" maxlength="32" required></label></div><div><label>${localize(locale, "Hospital site name", "Име на болничния обект")}<input name="siteName" maxlength="160" required></label></div><div><label>${localize(locale, "Institution", "Лечебно заведение")}<select name="institutionId" required>${institutionOptions}</select></label></div><div class="wide"><label>${localize(locale, "One-time Central enrollment token", "Еднократен токен за свързване с Central")}<input name="token" type="password" autocomplete="off" minlength="20" maxlength="4096" required></label><p class="component-detail">${localize(locale, "The token is sent directly to the private API and is never shown on this page again.", "Токенът се изпраща директно до частния API и повече не се показва на тази страница.")}</p></div><div class="wide"><label>${localize(locale, "Transport configuration reason", "Причина за настройване на преноса")}<input name="reason" minlength="10" maxlength="1000" required></label></div><div class="wide"><label>${localize(locale, "Administrator password (transport lock)", "Администраторска парола (заключване на преноса)")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label></div><div class="wide"><button type="submit">${localize(locale, "Configure and lock transport", "Настройване и заключване на преноса")}</button></div></div></form>` : ""
  const policy = central ? `<form method="post" action="/status/control/central/policy"><p class="component-detail">${localize(locale, "When enabled, every eligible finalized case is queued automatically. Drafts and incomplete cases remain local; clinicians do not approve cases one by one.", "Когато е включено, всеки подходящ финализиран случай автоматично се поставя за изпращане. Черновите и незавършените случаи остават локални; клиницистите не одобряват случаите един по един.")}</p><div class="checks"><label class="check"><input type="checkbox" name="enabled" value="true" ${central.policy?.enabled ? "checked" : ""}> ${localize(locale, "Approve automatic clinical delivery to Central", "Одобряване на автоматично клинично изпращане към Central")}</label><label class="check"><input type="checkbox" name="includeRedactedText" value="true" ${central.policy?.includeRedactedText !== false ? "checked" : ""}> ${localize(locale, "Include text after the BG/EN redaction policy", "Включване на текст след BG/EN политиката за премахване на идентификатори")}</label></div><input type="hidden" name="redactionProfile" value="bg-en-v1"><label>${localize(locale, "Clinical approval reason", "Причина за клиничното одобрение")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password (separate clinical lock)", "Администраторска парола (отделно клинично заключване)")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save clinical delivery policy", "Запазване на политиката за клинично изпращане")}</button></form>` : ""
  const batchRows = central?.batches.length ? central.batches.map(batch => {
    const retry = batch.status === "RETRY" || batch.status === "REJECTED"
      ? `<form method="post" action="/status/control/central/batches/${encodeURIComponent(batch.id)}/retry"><label>${localize(locale, "Retry reason", "Причина за нов опит")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Queue retry", "Поставяне за нов опит")}</button></form>` : ""
    return `<div class="component"><div class="component-head"><div><div class="component-name">#${batch.sequence} · ${escapeHtml(centralQueueStatusLabel(batch.status, locale))}</div><div class="component-detail">${localize(locale, "Cases", "Случаи")}: ${batch.caseCount} · ${localize(locale, "Attempts", "Опити")}: ${batch.attemptCount} · ${escapeHtml(batch.errorCode ?? localize(locale, "no failure", "без грешка"))}</div><div class="component-detail mono">${localize(locale, "Manifest", "Манифест")}: ${escapeHtml(batch.manifestHash ?? "—")} · ${localize(locale, "Receipt", "Разписка")}: ${escapeHtml(batch.receiptHash ?? "—")}</div></div><strong>${batch.acceptedAt ? escapeHtml(utcDate(Date.parse(batch.acceptedAt), locale)) + " UTC" : ""}</strong></div>${retry}</div>`
  }).join("") : `<div class="empty">${localize(locale, "No Central batches.", "Няма пакети за Central.")}</div>`

  const guidance = view?.guidance
  const pediatricMode = view?.pediatricMode
  const pediatricModeFacts = pediatricMode ? `<div class="component"><div class="facts">
      ${textFact(localize(locale, "Pediatric charting", "Документиране на педиатрични случаи"), boolWord(pediatricMode.enabled, locale))}
      ${textFact(localize(locale, "Bundled pediatric content release-reviewed", "Включеното педиатрично съдържание е прегледано за издаване"), boolWord(pediatricMode.releaseReviewed, locale))}
      ${textFact(localize(locale, "Bundled pediatric ruleset version", "Версия на включените педиатрични правила"), pediatricMode.bundledRulesetVersion)}
      ${textFact(localize(locale, "Minimum client version", "Минимална версия на приложението"), pediatricMode.minimumClientVersion)}
    </div><p>${localize(locale, "Pediatric charting is a fixed Hospital capability. Release review of bundled content, the selected database baseline, and the calculation policy are separate facts. Manual pediatric documentation remains available when calculated guidance is not ready or is turned off.", "Документирането на педиатрични случаи е постоянна възможност на Hospital. Прегледът на включеното съдържание за издаване, избраната базова конфигурация в базата данни и политиката за изчисляване са отделни факти. Ръчното документиране на педиатрични случаи остава достъпно, когато изчислителните насоки не са готови или са изключени.")}</p></div>` : ""
  const baselineFacts = guidance
    ? clinicalBaselineFacts("Adult calculation guidance", "Изчислителни насоки за възрастни", guidance.adultEnabled, guidance.baselines.adult, locale)
      + clinicalBaselineFacts("Pediatric calculation guidance", "Изчислителни насоки за деца", guidance.pediatricEnabled, guidance.baselines.pediatric, locale)
    : ""
  const guidanceForm = guidance ? `${pediatricModeFacts}${baselineFacts}<div class="component"><form method="post" action="/status/control/guidance"><div class="checks"><label class="check"><input type="checkbox" name="adultEnabled" value="true" ${guidance.adultEnabled ? "checked" : ""}> ${localize(locale, "Adult prospective calculation guidance policy", "Политика за бъдещи изчислителни насоки при възрастни")}</label><label class="check"><input type="checkbox" name="pediatricEnabled" value="true" ${guidance.pediatricEnabled ? "checked" : ""}> ${localize(locale, "Pediatric prospective calculation guidance policy", "Политика за бъдещи изчислителни насоки при деца")}</label></div><p>${localize(locale, "A policy switch cannot make a missing or changed baseline ready. Turning guidance off removes future drug, infusion and fluid suggestions. It does not alter anything already recorded or any historical case.", "Настройката на политиката не може да направи липсваща или променена базова конфигурация готова. Изключването премахва бъдещите предложения за лекарства, инфузии и течности. То не променя вече записани данни или стари случаи.")}</p><label>${localize(locale, "Change reason", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save guidance policy", "Запазване на политиката за насоки")}</button></form></div>` : ""

  const externalAi = view?.externalAi
  const externalAiCapability = externalAi
    ? externalAi.capability === "ENABLED"
      ? localize(locale, "Enabled", "Активен")
      : externalAi.capability === "DISABLED_BY_DEPLOYMENT"
        ? localize(locale, "Disabled by hospital policy", "Изключен от политиката на болницата")
        : localize(locale, "Mistral credential is not configured", "Данните за достъп до Mistral не са настроени")
    : "—"
  const externalAiControls = externalAi ? `
    <div class="component"><div class="facts">
      ${textFact(localize(locale, "Provider", "Доставчик"), "Mistral")}
      ${textFact(localize(locale, "External AI policy enabled", "Политиката за външен ИИ е включена"), boolWord(externalAi.externalAiEnabled, locale))}
      ${textFact(localize(locale, "Credential stored", "Има запазени данни за достъп"), boolWord(externalAi.credentialStored, locale))}
      ${textFact(localize(locale, "Provider configured", "Доставчикът е настроен"), boolWord(externalAi.providerConfigured, locale))}
      ${textFact(localize(locale, "Current capability", "Текуща възможност"), externalAiCapability)}
      ${dateFact(localize(locale, "Credential configured", "Данните за достъп са настроени на"), externalAi.credentialConfiguredAt, locale)}
      ${dateFact(localize(locale, "Credential last changed", "Данните за достъп са променени на"), externalAi.credentialChangedAt, locale)}
      ${dateFact(localize(locale, "Policy last changed", "Политиката е променена на"), externalAi.policyChangedAt, locale)}
      ${dateFact(localize(locale, "State last updated", "Състоянието е обновено на"), externalAi.updatedAt, locale)}
    </div><p>${localize(locale, "When this policy is enabled and the provider is configured, a clinician's explicit external-AI action may send its selected clinical payload to Mistral. Saving the policy itself sends no clinical data.", "Когато тази политика е включена и доставчикът е настроен, изрично действие на клиницист за външен ИИ може да изпрати избраните клинични данни към Mistral. Самото запазване на политиката не изпраща клинични данни.")}</p>
    <form method="post" action="/status/control/external-ai/policy"><div class="checks"><label class="check"><input type="checkbox" name="externalAiEnabled" value="true" ${externalAi.externalAiEnabled ? "checked" : ""}> ${localize(locale, "Allow external-AI features for this hospital", "Разрешаване на функциите с външен ИИ за тази болница")}</label></div><label>${localize(locale, "Policy change reason", "Причина за промяната на политиката")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save external-AI policy", "Запазване на политиката за външен ИИ")}</button></form></div>
    <div class="component"><h3>${localize(locale, "Replace the Mistral credential", "Замяна на данните за достъп до Mistral")}</h3><p class="component-detail">${localize(locale, "Enter a new credential. Status passes it once to the private API; neither the plaintext nor the sealed value is returned to or stored by Status.", "Въведете нови данни за достъп. Status ги предава еднократно към частния API; нито стойността в открит вид, нито защитената стойност се връща или съхранява от Status.")}</p><form method="post" action="/status/control/external-ai/credential"><label>${localize(locale, "New Mistral credential", "Нови данни за достъп до Mistral")}<input name="credential" type="password" autocomplete="off" minlength="1" maxlength="4096" required></label><label>${localize(locale, "Replacement reason", "Причина за замяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Replace credential", "Замяна на данните за достъп")}</button></form></div>
    <div class="component"><h3>${localize(locale, "Remove the Mistral credential", "Премахване на данните за достъп до Mistral")}</h3><p>${localize(locale, "Removal immediately prevents external-AI provider access. It does not silently change the policy checkbox or any historical record.", "Премахването незабавно спира достъпа до външния доставчик на ИИ. То не променя скрито отметката на политиката или исторически запис.")}</p><form method="post" action="/status/control/external-ai/credential/remove"><label class="check"><input type="checkbox" name="confirmation" value="REMOVE-MISTRAL-CREDENTIAL" required> ${localize(locale, "I understand that this removes the stored Mistral credential", "Разбирам, че това премахва запазените данни за достъп до Mistral")}</label><label>${localize(locale, "Removal reason", "Причина за премахването")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit" class="danger">${localize(locale, "Remove credential", "Премахване на данните за достъп")}</button></form></div>
  ` : `<div class="empty">${localize(locale, "External-AI controls are unavailable.", "Управлението на външен ИИ не е достъпно.")}</div>`

  const patientIdentifier = view?.patientIdentifier
  const patientIdentifierControls = patientIdentifier ? `
    <div class="component"><div class="facts">
      ${textFact(localize(locale, "National identifier (ЕГН) linking permitted", "Разрешено свързване с национален идентификатор (ЕГН)"), boolWord(patientIdentifier.egnPermitted, locale))}
      ${textFact(localize(locale, "Change reason recorded", "Записана причина за промяна"), boolWord(patientIdentifier.changeReasonRecorded, locale))}
      ${dateFact(localize(locale, "Policy last changed", "Политиката е променена на"), patientIdentifier.changedAt, locale)}
      ${dateFact(localize(locale, "State last updated", "Състоянието е обновено на"), patientIdentifier.updatedAt, locale)}
    </div><p>${localize(locale, "ЕГН is what joins a patient's separate admissions into one person; a record number alone restarts every January and cannot do that job. Recording it is nonetheless a heavier privacy commitment than a record number, and the hospital -- not this software's vendor -- is the data controller for it. Turning this off does not remove any ЕГН already recorded; it only stops new links from being created.", "ЕГН е това, което свързва отделните постъпвания на пациент в едно лице; номерът на История на заболяването сам по себе си се обновява всяка година и не може да върши тази работа. Записването му въпреки това е по-сериозен ангажимент за поверителност от номер на История на заболяването, а болницата -- не доставчикът на този софтуер -- е администраторът на тези данни. Изключването тук не премахва вече записан ЕГН; то само спира създаването на нови връзки.")}</p>
    <form method="post" action="/status/control/patient-identifier"><div class="checks"><label class="check"><input type="checkbox" name="egnPermitted" value="true" ${patientIdentifier.egnPermitted ? "checked" : ""}> ${localize(locale, "Permit ЕГН linking for this hospital", "Разрешаване на свързване с ЕГН за тази болница")}</label></div><label>${localize(locale, "Policy change reason", "Причина за промяната на политиката")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save national-identifier policy", "Запазване на политиката за национален идентификатор")}</button></form></div>
  ` : `<div class="empty">${localize(locale, "National-identifier controls are unavailable.", "Управлението на националния идентификатор не е достъпно.")}</div>`

  const ehrTransport = view?.ehrTransport
  const ehrTransportOption = (value: "FOLDER" | "FHIR" | "HL7V2", label: string, labelBg: string) =>
    `<option value="${value}" ${ehrTransport?.transport === value ? "selected" : ""}>${localize(locale, label, labelBg)}</option>`
  const ehrTransportCapability = ehrTransport
    ? ehrTransport.capability === "ENABLED"
      ? localize(locale, "Ready", "Готов")
      : ehrTransport.capability === "DISABLED_BY_DEPLOYMENT"
        ? localize(locale, "No transport chosen", "Не е избран транспорт")
        : localize(locale, "Credential not configured", "Данните за достъп не са настроени")
    : "—"
  const ehrTransportCredentialSection = ehrTransport && (ehrTransport.transport === "FHIR" || ehrTransport.transport === "HL7V2")
    ? `
    <div class="component"><h3>${localize(locale, "Replace the EHR transport credential", "Замяна на данните за достъп за преноса на ЕЗД")}</h3><p class="component-detail">${localize(locale, "Enter a new credential for the currently chosen transport. Status passes it once to the private API; neither the plaintext nor the sealed value is returned to or stored by Status.", "Въведете нови данни за достъп за избрания в момента транспорт. Status ги предава еднократно към частния API; нито стойността в открит вид, нито защитената стойност се връща или съхранява от Status.")}</p><form method="post" action="/status/control/ehr-transport/credential"><label>${localize(locale, "New transport credential", "Нови данни за достъп за транспорта")}<input name="credential" type="password" autocomplete="off" minlength="1" maxlength="4096" required></label><label>${localize(locale, "Replacement reason", "Причина за замяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Replace credential", "Замяна на данните за достъп")}</button></form></div>
    <div class="component"><h3>${localize(locale, "Remove the EHR transport credential", "Премахване на данните за достъп за преноса на ЕЗД")}</h3><p>${localize(locale, "Removal immediately prevents the FHIR/HL7v2 transport from reaching its endpoint. It does not change which transport is chosen or any historical record.", "Премахването незабавно спира достъпа на транспорта FHIR/HL7v2 до крайната му точка. То не променя избрания транспорт или исторически запис.")}</p><form method="post" action="/status/control/ehr-transport/credential/remove"><label class="check"><input type="checkbox" name="confirmation" value="REMOVE-EHR-TRANSPORT-CREDENTIAL" required> ${localize(locale, "I understand that this removes the stored transport credential", "Разбирам, че това премахва запазените данни за достъп на транспорта")}</label><label>${localize(locale, "Removal reason", "Причина за премахването")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit" class="danger">${localize(locale, "Remove credential", "Премахване на данните за достъп")}</button></form></div>
    ` : `<div class="empty">${localize(locale, "A watched folder needs no credential. Choose FHIR or HL7v2 above to configure one.", "Наблюдаваната папка не се нуждае от данни за достъп. Изберете FHIR или HL7v2 по-горе, за да настроите такива.")}</div>`
  // ── which numbering a patient's number belongs to ─────────────────────────
  //
  // A hospital numbers the same person several ways -- admission number,
  // permanent record number, national identifier -- and those are separate
  // namespaces holding numbers of the same shape. A search on value alone can
  // return one clean match belonging to a different numbering, which is what a
  // wrong-patient import looks like from here.
  //
  // Until both are answered a match is accepted and marked unverified on the
  // review screen, because a site cannot answer this before it has seen real
  // traffic. The discovery button is what lets it answer: nobody recalls an
  // OID, and everybody recognises their own admission number when shown one.
  const identifierSystemsSection = ehrTransport && ehrTransport.transport === "FHIR" ? `
    <div class="component"><h3>${localize(locale, "Which numbering a patient number belongs to", "Към коя номерова система принадлежи номерът на пациента")}</h3>
    <p class="component-detail">${localize(locale,
      "Until these are set, a patient found by number is accepted without being checked, and the review screen says so. Once set, a number found in the wrong numbering is refused. Use Look up a patient to see the numberings this server actually returns, or type one if the server will not answer.",
      "Докато не бъдат зададени, намереният по номер пациент се приема без проверка и екранът за преглед го отбелязва. След като бъдат зададени, номер, намерен в грешна номерова система, се отказва. Използвайте Търсене на пациент, за да видите системите, които сървърът връща, или въведете стойност, ако сървърът не отговаря.")}</p>
    <form method="post" action="/status/control/ehr-transport/discover">
      <label>${localize(locale, "Look up a record number", "Търсене по номер на ИЗ")}<input name="identifier" maxlength="64" placeholder="${localize(locale, "a real record number", "реален номер на ИЗ")}"></label>
      <label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
      <button type="submit">${localize(locale, "Ask the server", "Попитай сървъра")}</button>
    </form>
    <form method="post" action="/status/control/ehr-transport/identifier-systems">
      <label>${localize(locale, "Numbering for record numbers (ИЗ №)", "Номерова система за ИЗ №")}<input name="recordNumberSystem" maxlength="2048" value="${escapeHtml(ehrTransport.recordNumberSystem ?? "")}" placeholder="urn:oid:… ${localize(locale, "or", "или")} http://…"></label>
      <label class="inline"><input type="checkbox" name="clearRecordNumberSystem"> ${localize(locale, "Clear it instead", "Вместо това изчисти")}</label>
      <label>${localize(locale, "Numbering for national identifiers (ЕГН)", "Номерова система за ЕГН")}<input name="nationalIdentifierSystem" maxlength="2048" value="${escapeHtml(ehrTransport.nationalIdentifierSystem ?? "")}"></label>
      <label class="inline"><input type="checkbox" name="clearNationalIdentifierSystem"> ${localize(locale, "Clear it instead", "Вместо това изчисти")}</label>
      <label>${localize(locale, "Reason", "Причина")}<input name="reason" minlength="10" maxlength="1000" required></label>
      <label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
      <button type="submit">${localize(locale, "Save the numberings", "Запази номеровите системи")}</button>
    </form></div>
  ` : ""

  // ── where this appliance sends, and how it names a patient ────────────────
  //
  // The endpoint route has existed since the transport did and nothing ever
  // called it, so a site could choose FHIR, store a credential, and then had
  // nowhere to say where to send. That is also why the policy could report
  // itself ready with no endpoint: it was the only reachable state.
  const ehrEndpointSection = ehrTransport && ehrTransport.transport === "FHIR" ? `
    <div class="component"><h3>${localize(locale, "Where this appliance sends", "Къде изпраща този уред")}</h3>
    <p class="component-detail">${localize(locale,
      "The hospital FHIR base address and how this appliance identifies itself to it. Changing any of these clears the stored credential: a bearer token is not a client secret, and a secret issued for one authorisation server does not belong at another.",
      "Базовият FHIR адрес на болницата и как уредът се представя пред него. Промяна на което и да е от тези полета изчиства съхранените данни за достъп: bearer токенът не е клиентска тайна, а тайна, издадена за един сървър за оторизация, не принадлежи на друг.")}</p>
    <form method="post" action="/status/control/ehr-transport/endpoint">
      <label>${localize(locale, "FHIR base address", "Базов FHIR адрес")}<input name="endpoint" type="url" maxlength="2048" value="${escapeHtml(ehrTransport.endpoint ?? "")}" placeholder="https://fhir.hospital.example/r4"></label>
      <label>${localize(locale, "How this appliance authenticates", "Как уредът се удостоверява")}<select name="authMode">
        <option value="STATIC_BEARER" ${ehrTransport.authMode === "STATIC_BEARER" ? "selected" : ""}>${localize(locale, "A fixed token", "Фиксиран токен")}</option>
        <option value="OAUTH2_CLIENT_CREDENTIALS" ${ehrTransport.authMode === "OAUTH2_CLIENT_CREDENTIALS" ? "selected" : ""}>${localize(locale, "Client credentials (SMART on FHIR)", "Клиентски данни (SMART on FHIR)")}</option>
      </select></label>
      <label>${localize(locale, "Token address, for client credentials", "Адрес за токен, при клиентски данни")}<input name="tokenUrl" type="url" maxlength="2048" value="${escapeHtml(ehrTransport.tokenUrl ?? "")}"></label>
      <label>${localize(locale, "Client id", "Клиентски идентификатор")}<input name="clientId" maxlength="512" value="${escapeHtml(ehrTransport.clientId ?? "")}"></label>
      <label>${localize(locale, "Scope", "Обхват")}<input name="scope" maxlength="512" value="${escapeHtml(ehrTransport.scope ?? "")}"></label>
      <label>${localize(locale, "Reason", "Причина")}<input name="reason" minlength="10" maxlength="1000" required></label>
      <label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
      <button type="submit">${localize(locale, "Save the endpoint", "Запази адреса")}</button>
    </form></div>

    ${identifierSystemsSection}
  ` : ""

  const ehrTransportControls = ehrTransport ? `
    <div class="component"><div class="facts">
      ${textFact(localize(locale, "Chosen transport", "Избран транспорт"), ehrTransport.transport ?? localize(locale, "none", "няма"))}
      ${textFact(localize(locale, "Credential stored", "Има запазени данни за достъп"), boolWord(ehrTransport.credentialStored, locale))}
      ${textFact(localize(locale, "Current capability", "Текуща възможност"), ehrTransportCapability)}
      ${dateFact(localize(locale, "Credential configured", "Данните за достъп са настроени на"), ehrTransport.credentialConfiguredAt, locale)}
      ${dateFact(localize(locale, "Credential last changed", "Данните за достъп са променени на"), ehrTransport.credentialChangedAt, locale)}
      ${dateFact(localize(locale, "Transport last changed", "Транспортът е променен на"), ehrTransport.transportChangedAt, locale)}
      ${dateFact(localize(locale, "State last updated", "Състоянието е обновено на"), ehrTransport.updatedAt, locale)}
    </div><p>${localize(locale, "A watched folder is a filesystem path the hospital system writes into; it carries no secret and is fully configured the moment it is chosen. FHIR and HL7v2 reach outside the appliance and need a sealed credential below. Proposed values from any transport are staged for a clinician to review field by field -- nothing is written into a case on arrival.", "Наблюдаваната папка е път във файловата система, в който болничната система записва; тя не носи тайна и е напълно настроена в момента на избора си. FHIR и HL7v2 излизат извън системата и се нуждаят от защитени данни за достъп по-долу. Предложените стойности от всеки транспорт се поставят за преглед от клиницист поле по поле -- нищо не се записва в случай при пристигане.")}</p>
    <form method="post" action="/status/control/ehr-transport/policy"><label for="ehr-transport-select">${localize(locale, "EHR import transport", "Транспорт за внос на ЕЗД")}</label><select id="ehr-transport-select" name="transport"><option value="" ${!ehrTransport.transport ? "selected" : ""}>${localize(locale, "None (adapter disabled)", "Няма (адаптерът е изключен)")}</option>${ehrTransportOption("FOLDER", "Watched folder", "Наблюдавана папка")}${ehrTransportOption("FHIR", "FHIR", "FHIR")}<option value="HL7V2" disabled>${localize(locale, "HL7v2 — not yet available", "HL7v2 — все още не се предлага")}</option></select><label>${localize(locale, "Transport change reason", "Причина за промяната на транспорта")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save transport policy", "Запазване на политиката за транспорта")}</button></form></div>
    ${ehrTransportCredentialSection}
    ${ehrEndpointSection}
  ` : `<div class="empty">${localize(locale, "EHR transport controls are unavailable.", "Управлението на транспорта за внос на ЕЗД не е достъпно.")}</div>`

  // ── the laboratory code map ────────────────────────────────────────────────
  //
  // Entered from the hospital's side rather than ours. Asking an operator to
  // reproduce ХГБ from memory against our field list is recall, and one wrong
  // character fails silently forever; listing what actually arrived and letting
  // them pick one of our tests is recognition. The counts are the priority
  // order, and a code we already understand never appears — which is what makes
  // an empty first list mean finished rather than not started.
  const labCodes = view?.ehrLabCodes
  const testOptions = (selected: string | null) => (labCodes?.tests ?? []).map(test =>
    `<option value="${escapeHtml(test.name)}" ${test.name === selected ? "selected" : ""}>${escapeHtml(test.category)} · ${escapeHtml(test.name)} (${escapeHtml(test.unit)})</option>`).join("")
  const seenFact = (row: { seenCount: number; lastSeenAt: string | null }) => localize(locale,
    `seen ${row.seenCount}×${row.lastSeenAt ? `, last ${utcDate(Date.parse(row.lastSeenAt), locale)} UTC` : ""}`,
    `видян ${row.seenCount} пъти${row.lastSeenAt ? `, последно ${utcDate(Date.parse(row.lastSeenAt), locale)} UTC` : ""}`)
  const unmappedRows = (labCodes?.unmapped ?? []).map(row => `
    <div class="component"><form method="post" action="/status/control/ehr-lab-codes/map">
      <input type="hidden" name="system" value="${escapeHtml(row.system)}">
      <input type="hidden" name="code" value="${escapeHtml(row.code)}">
      <p><strong>${escapeHtml(row.code)}</strong>${row.reportedLabel ? ` — ${escapeHtml(row.reportedLabel)}` : ""}</p>
      <p class="component-detail">${row.system ? `${escapeHtml(row.system)} · ` : ""}${escapeHtml(seenFact(row))}</p>
      <label>${localize(locale, "Record this as", "Записвайте това като")}<select name="test" required><option value="">${localize(locale, "Choose a test…", "Изберете изследване…")}</option>${testOptions(null)}</select></label>
      <label>${localize(locale, "Unit these results arrive in, only if they arrive without one", "Мерна единица, в която пристигат тези резултати, само ако пристигат без такава")}<input name="assumedUnit" maxlength="64"></label>
      <button type="submit">${localize(locale, "Map this code", "Съпоставяне на кода")}</button>
    </form></div>`).join("")
  const mappedRows = (labCodes?.mapped ?? []).map(row => `
    <div class="component"><div class="facts">
      ${textFact(escapeHtml(row.code), escapeHtml(row.test))}
      ${textFact(localize(locale, "Reported as", "Изпраща се като"), row.reportedLabel ? escapeHtml(row.reportedLabel) : localize(locale, "no label sent", "няма изпратено име"))}
      ${textFact(localize(locale, "Assumed unit", "Приета мерна единица"), row.assumedUnit ? escapeHtml(row.assumedUnit) : localize(locale, "none — read from each result", "няма — чете се от всеки резултат"))}
      ${textFact(localize(locale, "Traffic", "Трафик"), escapeHtml(seenFact(row)))}
      ${dateFact(localize(locale, "Mapped on", "Съпоставен на"), row.mappedAt, locale)}
    </div><form method="post" action="/status/control/ehr-lab-codes/unmap">
      <input type="hidden" name="system" value="${escapeHtml(row.system)}">
      <input type="hidden" name="code" value="${escapeHtml(row.code)}">
      <button type="submit" class="danger">${localize(locale, "Unmap", "Премахване на съпоставката")}</button>
    </form></div>`).join("")
  const labCodeControls = labCodes ? `
    <div class="component"><p>${localize(locale, "A hospital may send several codes for one test — an analyser each — and every one of them can point at the same entry here. Nothing is blocked while a code is unmapped: the result still reaches the clinician under whatever the laboratory called it, and mapping only decides where it lands. Codes already understood never appear below, so an empty first list means there is nothing left to answer.", "Една болница може да изпраща няколко кода за едно изследване — по един на апарат — и всеки от тях може да сочи към един и същ запис тук. Нищо не се блокира, докато един код не е съпоставен: резултатът пак стига до клинициста с името, което лабораторията му е дала, а съпоставянето решава само къде попада. Кодовете, които вече разпознаваме, не се показват по-долу, така че празен пръв списък означава, че няма какво повече да се отговаря.")}</p></div>
    <h3>${localize(locale, "Waiting for an answer", "Чакат отговор")}</h3>
    ${unmappedRows || `<div class="empty">${localize(locale, "Every code this hospital has sent is understood.", "Всеки код, който тази болница е изпратила, е разпознат.")}</div>`}
    <h3>${localize(locale, "Already answered", "Вече отговорени")}</h3>
    ${mappedRows || `<div class="empty">${localize(locale, "No local codes have been mapped yet.", "Все още няма съпоставени местни кодове.")}</div>`}
  ` : `<div class="empty">${localize(locale, "The laboratory code map is unavailable.", "Картата на лабораторните кодове не е достъпна.")}</div>`

  return page(
    localize(locale, "Hospital controls", "Управление на болничната система"),
    `<div class="shell">${statusHeader("/status/control", locale, audience, localize(locale, "Research, Central, clinical guidance and external AI", "Изследвания, Central, клинични насоки и външен ИИ"))}<main>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ""}<div class="banner warn" role="status"><span class="dot" aria-hidden="true">!</span><strong>${localize(locale, "This Status login grants no clinical or research data access. It only performs the explicit control shown in each form.", "Този вход в страницата за състояние не дава достъп до клинични или изследователски данни. Той изпълнява само изричното действие във всеки формуляр.")}</strong></div>
    <section class="section"><h2>${localize(locale, "Research grants", "Разрешения за изследвания")}</h2><div class="card"><div class="component">${grantForm}</div>${grantRows}</div></section>
    <section class="section"><h2>${localize(locale, "Exact OMOP approvals", "Точни одобрения за OMOP")}</h2><div class="card">${omopRows}</div></section>
    <section class="section"><h2>${localize(locale, "Central transport (push-only)", "Пренос към Central (само изпращане)")}</h2><div class="card"><div class="component"><p><strong>${localize(locale, "Disabled by default.", "Изключено по подразбиране.")}</strong> ${localize(locale, "Central cannot query or write this hospital database.", "Central не може да чете или записва в болничната база данни.")}</p>${certificateFacts}${transport}</div></div></section>
    <section class="section"><h2>${localize(locale, "Central automatic clinical delivery", "Автоматично клинично изпращане към Central")}</h2><div class="card"><div class="component">${policy}</div></div></section>
    <section class="section"><h2>${localize(locale, "Central queues, batches and signed receipts", "Опашки, пакети и подписани разписки от Central")}</h2><div class="card"><div class="component-detail pad">${localize(locale, "Cases awaiting accepted receipt", "Случаи, които чакат приета разписка")}: ${central?.casesAwaitingExport ?? 0} · ${localize(locale, "Queues", "Опашки")}: ${escapeHtml(centralQueueSummary(central?.queuesByStatus ?? {}, locale))}</div>${batchRows}</div></section>
    <section class="section"><h2>${localize(locale, "Prospective calculation guidance", "Предварителни изчислителни насоки")}</h2><div class="card">${guidanceForm}</div></section>
    <section class="section"><h2>${localize(locale, "External AI (Mistral)", "Външен ИИ (Mistral)")}</h2><div class="card">${externalAiControls}</div></section>
    <section class="section"><h2>${localize(locale, "National identifier (ЕГН) policy", "Политика за национален идентификатор (ЕГН)")}</h2><div class="card">${patientIdentifierControls}</div></section>
    <section class="section"><h2>${localize(locale, "EHR import transport", "Транспорт за внос на ЕЗД")}</h2><div class="card">${ehrTransportControls}</div></section>
    <section class="section"><h2>${localize(locale, "Laboratory code map", "Карта на лабораторните кодове")}</h2><div class="card">${labCodeControls}</div></section>
    </main><footer class="foot">${localize(locale, "No enrollment token, password, AI credential, sealed credential value, certificate contents or clinical record is stored or displayed by this page.", "Тази страница не съхранява и не показва токен за свързване, парола, данни за достъп до ИИ, защитената им стойност, съдържание на сертификат или клиничен запис.")}</footer></div>`,
    locale,
  )
}

export function renderDashboard(data: DashboardData, locale: StatusLocale = "bg", audience: StatusNavAudience = "password"): string {
  const state = banner(data.components, locale)
  const checked = data.lastCheckedAt
    ? utcDate(data.lastCheckedAt, locale)
    : localize(locale, "not yet", "още няма проверка")
  return page(
    localize(locale, "Hospital appliance status", "Състояние на болничната система"),
    `<div class="shell">${statusHeader("/status/", locale, audience, localize(locale, "Independent appliance status", "Независимо състояние на системата"))}<main><div class="banner ${state.className}" role="status"><span class="dot" aria-hidden="true">${state.symbol}</span><strong>${escapeHtml(state.text)}</strong></div>${group(data, "clinical", localize(locale, "Clinical access", "Клиничен достъп"), locale)}${group(data, "research", localize(locale, "Research and data transfer", "Изследвания и пренос на данни"), locale)}${group(data, "safety", localize(locale, "Safety and maintenance", "Безопасност и поддръжка"), locale)}<section class="section" aria-labelledby="appliance-title"><h2 id="appliance-title">${localize(locale, "Appliance details", "Данни за системата")}</h2><div class="card">${applianceFacts(data, locale)}</div></section><section class="section" aria-labelledby="incidents-title"><h2 id="incidents-title">${localize(locale, "Incident history", "История на инцидентите")}</h2><div class="card">${data.incidents.length ? `<ol class="timeline">${data.incidents.map(item => incidentItem(item, locale)).join("")}</ol>` : `<div class="empty">${localize(locale, "No incidents have been recorded.", "Няма записани инциденти.")}</div>`}</div></section><section class="section" aria-labelledby="events-title"><h2 id="events-title">${localize(locale, "Recent operational events", "Последни оперативни събития")}</h2><div class="card">${data.events.length ? `<ol class="timeline">${data.events.map(item => eventItem(item, locale)).join("")}</ol>` : `<div class="empty">${localize(locale, "No operational events require attention.", "Няма оперативни събития, които изискват внимание.")}</div>`}</div></section></main><footer class="foot">${localize(locale, `Last checked: ${checked} UTC. This monitor contains operational information only, not clinical records. It cannot report loss of power, Docker, the physical server or the hospital network.`, `Последна проверка: ${checked} UTC. Този монитор съдържа само оперативна информация, а не клинични записи. Той не може да отчита прекъсване на електрозахранването, Docker, физическия сървър или болничната мрежа.`)}</footer></div>`,
    locale,
    true,
  )
}

// ── the release page ─────────────────────────────────────────────────────────

export type ReleaseView = {
  installedVersion: string
  latestVersion?: string
  fetchedVersion?: string
  fetchedLockSha256?: string
  /** What the agent is doing, if an agent is installed at all. */
  agentPhase?: string
  agentCode?: string
  scheduledFor?: string
  rollbackPolicy?: "service-compatible" | "backup-required"
  agentMode: "healthy" | "console-only" | "failed" | "unconfigured"
  mayPrepare: boolean
  /** When applying would happen if asked for now, in the operator's words. */
  windowDescription: string
  /** False for a recovery session, which may fetch but must not apply. */
  mayApply: boolean
  notice?: string
  error?: string
}

const releaseFact = (name: string, value: string) =>
  `<div class="fact"><b>${escapeHtml(name)}</b>${escapeHtml(value)}</div>`

export function renderRelease(view: ReleaseView, locale: StatusLocale = "bg", audience: StatusNavAudience = "password"): string {
  const readyToApply = view.fetchedVersion !== undefined
    && view.fetchedLockSha256 !== undefined

  const busy = view.agentPhase !== undefined
    && ["accepted", "queued", "preparing", "applying"].includes(view.agentPhase)

  const facts = [
    releaseFact(localize(locale, "Installed", "Инсталирана"), view.installedVersion),
    releaseFact(localize(locale, "Newest published", "Най-нова публикувана"), view.latestVersion ?? localize(locale, "not known", "неизвестна")),
    releaseFact(localize(locale, "Downloaded", "Изтеглена"), view.fetchedVersion ?? localize(locale, "none", "няма")),
    releaseFact(
      localize(locale, "Rollback after migration", "Връщане след миграция"),
      view.rollbackPolicy === "service-compatible"
        ? localize(locale, "proved service rollback", "доказано връщане на услугите")
        : view.rollbackPolicy === "backup-required"
          ? localize(locale, "verified backup recovery required", "изисква възстановяване от проверен архив")
          : localize(locale, "not known", "неизвестно"),
    ),
  ].join("")

  // What the agent is doing, in the same words the dashboard uses.
  const agent = view.agentMode === "healthy" && view.agentCode
    ? `<div class="component"><div class="component-name">${localize(locale, "Update agent", "Агент за обновяване")}</div><div class="component-detail">${escapeHtml(codeMessage(view.agentCode, locale, view.agentCode))}${
        view.scheduledFor ? ` ${localize(locale, "Scheduled for", "Насрочено за")} ${escapeHtml(view.scheduledFor)} UTC.` : ""
      }</div></div>`
    : view.agentMode === "failed"
      ? `<div class="component"><div class="component-name">${localize(locale, "Update agent", "Агент за обновяване")}</div><div class="component-detail">${localize(locale, "The update agent is configured but its heartbeat is stale. Preparation and Apply are unavailable until the host service is repaired.", "Агентът за обновяване е настроен, но сигналът му е остарял. Подготовката и прилагането не са достъпни, докато услугата на сървъра не бъде възстановена.")}</div></div>`
      : view.agentMode === "console-only"
        ? `<div class="component"><div class="component-name">${localize(locale, "Update agent", "Агент за обновяване")}</div><div class="component-detail">${localize(locale, "This appliance is intentionally console-only. Updates are prepared and applied from the server console.", "Тази система умишлено се обновява само от конзолата. Версиите се подготвят и прилагат от конзолата на сървъра.")}</div></div>`
        : `<div class="component"><div class="component-name">${localize(locale, "Update agent", "Агент за обновяване")}</div><div class="component-detail">${localize(locale, "Update mode has not been selected. Hospital IT must install the host agent or explicitly choose console-only updates.", "Не е избран режим за обновяване. Болничният ИТ екип трябва да инсталира агента на сървъра или изрично да избере обновяване само от конзолата.")}</div></div>`

  let action: string
  if (busy) {
    // Nothing to press. Offering a button that would be refused reads as a
    // broken page rather than as a considered refusal.
    action = `<p>${localize(locale, "An update is already under way. This page will follow it.", "Вече се изпълнява обновяване. Тази страница ще следи напредъка му.")}</p>`
  } else if (view.agentMode !== "healthy") {
    action = `<p>${localize(locale, "Browser update controls are unavailable because there is no healthy host update agent. No request can be submitted from this page.", "Управлението на обновяванията от браузъра не е достъпно, защото няма работещ агент на сървъра. От тази страница не може да бъде подадена заявка.")}</p>`
  } else if (!view.mayApply) {
    // A recovery session is break-glass for a lost password. It blocks nothing
    // legitimate: anyone who can issue a recovery token has console access.
    action = `<p>${localize(locale, "You signed in with a recovery token. Recovery sessions can download an update but cannot apply one, because applying restarts the clinical services. Sign in with the administrator password to apply it.", "Влезли сте с токен за възстановяване. Тази сесия може да изтегли обновяване, но не може да го приложи, защото прилагането рестартира клиничните услуги. Влезте с администраторската парола, за да го приложите.")}</p>`
  } else if (readyToApply) {
    action = `<form method="post" action="/status/actions/apply"><input type="hidden" name="targetLockSha256" value="${escapeHtml(view.fetchedLockSha256!)}"><p>${escapeHtml(view.windowDescription)}</p><button type="submit">${localize(locale, "Apply", "Прилагане на")} ${escapeHtml(view.fetchedVersion!)}</button></form>`
  } else if (view.mayPrepare && view.latestVersion && view.latestVersion !== view.installedVersion) {
    action = `<form method="post" action="/status/actions/fetch"><p>${localize(locale, "The release has not been downloaded yet. Downloading changes nothing that is running; it can be applied afterwards.", "Версията още не е изтеглена. Изтеглянето не променя работещите услуги; прилагането е отделна следваща стъпка.")}</p><button type="submit">${localize(locale, "Download and verify", "Изтегляне и проверка на")} ${escapeHtml(view.latestVersion)}</button></form>`
  } else {
    action = `<p>${localize(locale, "This appliance is running the newest release it knows about. Nothing to do.", "Системата използва най-новата известна версия. Не е необходимо действие.")}</p>`
  }

  const notice = view.notice ? `<div class="banner good" role="status"><strong>${escapeHtml(view.notice)}</strong></div>` : ""
  const error = view.error ? `<div class="error" role="alert">${escapeHtml(view.error)}</div>` : ""

  return page(
    localize(locale, "Hospital appliance release", "Версия на болничната система"),
    `<div class="shell">${statusHeader("/status/release", locale, audience, localize(locale, "Appliance release", "Версия на системата"))}<main>${notice}${error}<section class="section" aria-labelledby="release-title"><h2 id="release-title">${localize(locale, "This appliance", "Тази система")}</h2><div class="card"><div class="facts">${facts}</div>${agent}</div></section><section class="section" aria-labelledby="action-title"><h2 id="action-title">${localize(locale, "Updating", "Обновяване")}</h2><div class="card"><div class="component">${action}</div></div></section></main><footer class="foot">${localize(locale, "Applying an update restarts the clinical services and can change the database. It is deliberately a separate step from downloading one.", "Прилагането на обновяване рестартира клиничните услуги и може да промени базата данни. То е умишлено отделна стъпка от изтеглянето.")}</footer></div>`,
    locale,
    true,
  )
}

// ── governed terminology generations ───────────────────────────────────────

export type TerminologyView = {
  state: TerminologyAgentSignal | null
  agentMode: "healthy" | "console-only" | "failed" | "unconfigured"
  mayManage: boolean
  recoverySession: boolean
  notice?: string
  error?: string
}

function terminologyResult(code: string, locale: StatusLocale): string {
  const messages: Record<string, readonly [string, string]> = {
    TERMINOLOGY_AGENT_READY: ["The host is ready for a governed terminology operation.", "Сървърът е готов за управлявана операция с терминология."],
    TERMINOLOGY_REQUEST_ACCEPTED: ["The terminology request was accepted by the host.", "Заявката за терминология е приета от сървъра."],
    TERMINOLOGY_IMPORT_RUNNING: ["The approved package is being verified, staged and activated.", "Одобреният пакет се проверява, подготвя и активира."],
    TERMINOLOGY_RESUME_RUNNING: ["The unfinished package import is being resumed.", "Незавършеният импорт на пакета се възобновява."],
    TERMINOLOGY_ROLLBACK_RUNNING: ["The retained terminology generation is being restored.", "Запазеното поколение терминология се възстановява."],
    TERMINOLOGY_FINALIZE_RUNNING: ["The retained rollback generation is being permanently removed.", "Запазеното поколение за връщане се премахва окончателно."],
    TERMINOLOGY_IMPORT_COMPLETED: ["The terminology generation was activated and passed the go-live gate.", "Поколението терминология е активирано и премина проверката за въвеждане в експлоатация."],
    TERMINOLOGY_RESUME_COMPLETED: ["The resumed terminology generation was activated and passed the go-live gate.", "Възобновеното поколение терминология е активирано и премина проверката за въвеждане в експлоатация."],
    TERMINOLOGY_ROLLBACK_COMPLETED: ["The retained generation was restored and passed the go-live gate.", "Запазеното поколение е възстановено и премина проверката за въвеждане в експлоатация."],
    TERMINOLOGY_FINALIZE_COMPLETED: ["The rollback generation was permanently removed after the active generation passed readiness.", "Поколението за връщане е премахнато окончателно, след като активното поколение премина проверката за готовност."],
    TERMINOLOGY_IMPORT_FAILED: ["The import did not complete. The live generation was retained; review the host log before resuming.", "Импортът не завърши. Действащото поколение е запазено; прегледайте журнала на сървъра преди възобновяване."],
    TERMINOLOGY_RESUME_FAILED: ["The resumed import did not complete. The live generation was retained.", "Възобновеният импорт не завърши. Действащото поколение е запазено."],
    TERMINOLOGY_ROLLBACK_FAILED: ["Rollback did not complete safely. Keep clinical access closed and review the host.", "Връщането не завърши безопасно. Оставете клиничния достъп затворен и проверете сървъра."],
    TERMINOLOGY_FINALIZE_FAILED: ["Finalization did not complete safely. Review the host before another operation.", "Окончателното приключване не завърши безопасно. Проверете сървъра преди друга операция."],
    TERMINOLOGY_MAINTENANCE_BUSY: ["A backup or release operation is using the shared maintenance lock. Try again after it finishes.", "Архивиране или обновяване използва общото заключване за поддръжка. Опитайте отново след края му."],
    TERMINOLOGY_REQUEST_MALFORMED: ["The host refused an invalid terminology request.", "Сървърът отказа невалидна заявка за терминология."],
    TERMINOLOGY_REQUEST_UNSAFE: ["The host refused an unsafe terminology request file.", "Сървърът отказа небезопасен файл със заявка за терминология."],
    TERMINOLOGY_REQUEST_EXPIRED: ["The terminology request expired before it could be processed.", "Заявката за терминология изтече, преди да бъде обработена."],
    TERMINOLOGY_REQUEST_REPLAYED: ["The host refused a terminology request that was already completed.", "Сървърът отказа заявка за терминология, която вече е приключила."],
    TERMINOLOGY_INFLIGHT_CONFLICT: ["Another terminology operation needs host review.", "Друга операция с терминология изисква проверка на сървъра."],
    TERMINOLOGY_AMBIGUOUS_OPERATION: ["The host restarted during a terminology mutation. It will not guess or retry; Hospital IT must review it from the console.", "Сървърът е рестартиран по време на промяна на терминологията. Операцията няма да бъде отгатвана или повторена; болничният ИТ екип трябва да я провери от конзолата."],
    TERMINOLOGY_STATE_INVALID: ["The host terminology state is invalid and requires console review.", "Състоянието на терминологията на сървъра е невалидно и изисква проверка от конзолата."],
  }
  const message = messages[code]
  return message ? localize(locale, message[0], message[1]) : localize(
    locale,
    "The host reported an unrecognized terminology result. Hospital IT must review it from the console.",
    "Сървърът съобщи непознат резултат за терминологията. Болничният ИТ екип трябва да го провери от конзолата.",
  )
}

function terminologyActionForm(
  action: "import" | "resume",
  locale: StatusLocale,
): string {
  const resume = action === "resume"
  const prefix = resume ? "term-resume" : "term-import"
  return `<form method="post" action="/status/terminology/actions"><input type="hidden" name="action" value="${action}"><label for="${prefix}-package">${localize(locale, "Package directory label", "Име на папката на пакета")}</label><input id="${prefix}-package" name="packageDirectory" maxlength="80" pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,79}" autocomplete="off" required><p class="component-detail">${localize(locale, "Enter one direct folder name already placed by Hospital IT under reference-data. Paths, URLs and shell commands are not accepted.", "Въведете името на една директна папка, която болничният ИТ екип вече е поставил в reference-data. Пътища, URL адреси и команди не се приемат.")}</p><label class="check"><input type="checkbox" name="confirmation" value="STOP-CLINICAL-SERVICES" required><span>${localize(locale, "I understand this temporarily stops the clinical apps while an isolated generation is built and checked.", "Разбирам, че това временно спира клиничните приложения, докато се изгради и провери изолирано поколение.")}</span></label><label for="${prefix}-password">${localize(locale, "Confirm with administrator password", "Потвърдете с администраторската парола")}</label><input id="${prefix}-password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit">${resume ? localize(locale, "Resume this exact import", "Възобновяване на същия импорт") : localize(locale, "Verify, stage and activate", "Проверка, подготовка и активиране")}</button></form>`
}

export function renderTerminology(view: TerminologyView, locale: StatusLocale = "bg", audience: StatusNavAudience = "password"): string {
  const state = view.state
  const notice = view.notice ? `<div class="banner good" role="status"><strong>${escapeHtml(view.notice)}</strong></div>` : ""
  const error = view.error ? `<div class="error" role="alert">${escapeHtml(view.error)}</div>` : ""
  const active = state?.packageId ? `<div class="facts">${[
    releaseFact(localize(locale, "Approved package", "Одобрен пакет"), state.packageId),
    releaseFact(localize(locale, "Version", "Версия"), state.packageVersion!),
    releaseFact(localize(locale, "Activated (UTC)", "Активирано (UTC)"), state.activatedAt!),
    releaseFact(localize(locale, "Manifest SHA-256", "SHA-256 на манифеста"), state.manifestSha256!),
    releaseFact(localize(locale, "Rollback generation", "Поколение за връщане"), state.rollbackAvailable ? localize(locale, "retained", "запазено") : localize(locale, "none", "няма")),
  ].join("")}</div>` : `<div class="empty">${localize(locale, "No approved active terminology generation is recorded. Clinical go-live is not approved.", "Няма записано активно одобрено поколение терминология. Клиничното въвеждане в експлоатация не е одобрено.")}</div>`
  const pendingLabel = state?.pendingPhase ? ({
    verified: localize(locale, "manifest verified", "манифестът е проверен"),
    staged: localize(locale, "isolated database staged", "изолираната база е подготвена"),
    importing: localize(locale, "data import in progress", "импортът на данни е в ход"),
    validated: localize(locale, "staged generation validated", "подготвеното поколение е валидирано"),
    activating: localize(locale, "activation interrupted", "активирането е прекъснато"),
  } as const)[state.pendingPhase] : null
  const pending = state?.pendingPhase
    ? `<div class="component"><div class="component-name">${localize(locale, "Unfinished staged generation", "Незавършено подготвено поколение")}</div><div class="component-detail">${localize(locale, "Recorded phase", "Записана фаза")}: ${escapeHtml(pendingLabel!)}. ${localize(locale, "Resume only with the same package directory.", "Възобновете само със същата папка на пакета.")}</div></div>`
    : ""
  let agent: string
  if (view.agentMode === "healthy" && state) {
    agent = `<div class="component"><div class="component-name">${localize(locale, "Terminology host workflow", "Процес за терминология на сървъра")}</div><div class="component-detail">${escapeHtml(terminologyResult(state.resultCode, locale))}</div></div>`
  } else if (view.agentMode === "console-only") {
    agent = `<div class="component"><div class="component-name">${localize(locale, "Console-only management", "Управление само от конзолата")}</div><div class="component-detail">${localize(locale, "Browser terminology requests are intentionally disabled. The supported terminology scripts remain available to Hospital IT on the server.", "Заявките за терминология от браузъра са изключени умишлено. Поддържаните скриптове за терминология остават достъпни за болничния ИТ екип на сървъра.")}</div></div>`
  } else {
    agent = `<div class="component"><div class="component-name">${localize(locale, "Terminology host workflow", "Процес за терминология на сървъра")}</div><div class="component-detail">${localize(locale, "No fresh, valid host projection is available. Browser operations are disabled rather than assuming the host is ready.", "Няма нова и валидна информация от сървъра. Операциите от браузъра са изключени, вместо да се приема, че сървърът е готов.")}</div></div>`
  }

  let actions: string
  if (!view.mayManage) {
    const detail = view.recoverySession
      ? localize(locale, "A console-recovery session can inspect this page but cannot change terminology. Sign in with the administrator password and MFA.", "Аварийна сесия от конзолата може да преглежда страницата, но не може да променя терминологията. Влезте с администраторската парола и MFA.")
      : state?.phase === "needs-operator"
        ? localize(locale, "The host has stopped after an ambiguous or invalid state. It will not retry from the browser; Hospital IT must review the console first.", "Сървърът е спрял след неясно или невалидно състояние. Операцията няма да бъде повторена от браузъра; болничният ИТ екип трябва първо да провери конзолата.")
        : state && ["accepted", "working"].includes(state.phase)
          ? localize(locale, "A terminology operation is already running. This page is read-only until it finishes.", "Вече се изпълнява операция с терминология. Страницата е само за преглед до приключването ѝ.")
          : localize(locale, "Browser terminology operations require a healthy host agent.", "Операциите с терминология от браузъра изискват работещ агент на сървъра.")
    actions = `<div class="empty">${detail}</div>`
  } else {
    const resume = state?.pendingPhase ? `<div class="component"><h3>${localize(locale, "Resume an unfinished import", "Възобновяване на незавършен импорт")}</h3>${terminologyActionForm("resume", locale)}</div>` : ""
    const rollback = state?.rollbackAvailable ? `<div class="component"><h3>${localize(locale, "Restore the retained generation", "Възстановяване на запазеното поколение")}</h3><p>${localize(locale, "Rollback switches the live database generation and temporarily stops the clinical apps. The currently rejected generation is retained for technical review.", "Връщането сменя действащото поколение на базата и временно спира клиничните приложения. Отхвърленото текущо поколение се запазва за техническа проверка.")}</p><form method="post" action="/status/terminology/actions"><input type="hidden" name="action" value="rollback"><label class="check"><input type="checkbox" name="confirmation" value="ROLLBACK-TERMINOLOGY" required><span>${localize(locale, "I intend to restore the retained terminology generation.", "Желая да възстановя запазеното поколение терминология.")}</span></label><label for="term-rollback-password">${localize(locale, "Confirm with administrator password", "Потвърдете с администраторската парола")}</label><input id="term-rollback-password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit" class="danger">${localize(locale, "Rollback terminology", "Връщане на терминологията")}</button></form></div>` : ""
    const finalize = state?.rollbackAvailable ? `<div class="component"><h3>${localize(locale, "Permanently remove the rollback generation", "Окончателно премахване на поколението за връщане")}</h3><p><strong>${localize(locale, "This cannot be undone.", "Това не може да бъде отменено.")}</strong> ${localize(locale, "Finalize only after the active generation has been clinically accepted. The host checks readiness again before deleting the retained database generation.", "Приключете окончателно само след клинично приемане на активното поколение. Сървърът проверява готовността отново, преди да изтрие запазеното поколение на базата.")}</p><form method="post" action="/status/terminology/actions"><input type="hidden" name="action" value="finalize"><label class="check"><input type="checkbox" name="confirmation" value="DELETE-ROLLBACK-GENERATION" required><span>${localize(locale, "I intend to permanently remove the only retained rollback generation.", "Желая окончателно да премахна единственото запазено поколение за връщане.")}</span></label><label for="term-finalize-password">${localize(locale, "Confirm with administrator password", "Потвърдете с администраторската парола")}</label><input id="term-finalize-password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit" class="danger">${localize(locale, "Permanently finalize", "Окончателно приключване")}</button></form></div>` : ""
    const importAction = state?.pendingPhase ? "" : `<div class="component"><h3>${localize(locale, "Import an approved package", "Импорт на одобрен пакет")}</h3><p>${localize(locale, "Hospital IT must obtain and place licensed source files. Status never uploads, downloads or displays them. The host verifies the exact manifest and every SHA-256 before activation.", "Болничният ИТ екип трябва да осигури и постави лицензираните изходни файлове. Status никога не ги качва, изтегля или показва. Сървърът проверява точния манифест и всеки SHA-256 преди активиране.")}</p>${terminologyActionForm("import", locale)}</div>`
    actions = `${importAction}${resume}${rollback}${finalize}`
  }
  return page(
    localize(locale, "Hospital terminology management", "Управление на терминологията"),
    `<div class="shell">${statusHeader("/status/terminology", locale, audience, localize(locale, "Governed terminology generations", "Управлявани поколения терминология"))}<main>${notice}${error}<section class="section" aria-labelledby="term-active"><h2 id="term-active">${localize(locale, "Active approved generation", "Активно одобрено поколение")}</h2><div class="card">${active}${pending}${agent}</div></section><section class="section" aria-labelledby="term-actions"><h2 id="term-actions">${localize(locale, "Supported workflow", "Поддържан процес")}</h2><div class="card">${actions}</div></section></main><footer class="foot">${localize(locale, "This page handles bounded operational intent and approved-package provenance only. It has no shell, database, patient-data, source-file or credential access.", "Тази страница обработва само ограничени оперативни заявки и произхода на одобрения пакет. Тя няма достъп до команден ред, база данни, данни за пациенти, изходни файлове или данни за вход.")}</footer></div>`,
    locale,
  )
}

export type GoLivePageView = GoLiveView & {
  mayManage: boolean
  recoverySession: boolean
  notice?: string
  error?: string
}

const GO_LIVE_BANNER: Record<GoLiveState, { tone: string; en: string; bg: string }> = {
  GO_LIVE_READY: {
    tone: "good",
    en: "Ready for clinical use",
    bg: "Готово за клинична употреба",
  },
  GO_LIVE_BLOCKED: {
    tone: "warn",
    en: "Installed, not yet approved for clinical use",
    bg: "Инсталирано, но все още не е одобрено за клинична употреба",
  },
  MAINTENANCE: {
    tone: "warn",
    en: "Maintenance in progress",
    bg: "В ход е поддръжка",
  },
  RECOVERY_REQUIRED: {
    tone: "bad",
    en: "Recovery required: Hospital IT must review the server console",
    bg: "Нужно е възстановяване: болничният ИТ екип трябва да провери конзолата на сървъра",
  },
}

function goLiveMark(satisfied: boolean, locale: StatusLocale): string {
  return satisfied
    ? `<span class="state operational">${localize(locale, "Done", "Изпълнено")}</span>`
    : `<span class="state degraded">${localize(locale, "Not done", "Неизпълнено")}</span>`
}

function goLiveSignoffRow(item: GoLiveSignoffView, view: GoLivePageView, locale: StatusLocale): string {
  const label = escapeHtml(locale === "bg" ? item.bg : item.en)
  const detail = item.signoff
    ? `${item.expired ? localize(locale, "Expired: ", "Изтекло: ") : ""}${localize(locale, "signed", "подписано")} ${escapeHtml(new Date(item.signoff.signedAt).toISOString().slice(0, 16).replace("T", " "))} UTC — ${escapeHtml(item.signoff.note)}`
    : localize(locale, "Not signed off", "Няма потвърждение")
  const validity = item.validForMs
    ? ` ${localize(locale, "Valid for 92 days.", "Валидно 92 дни.")}`
    : ""
  const form = view.mayManage
    ? `<details class="admin-action"><summary>${item.signoff ? localize(locale, "Sign again or withdraw", "Потвърдете отново или оттеглете") : localize(locale, "Sign off", "Потвърдете")}</summary><form method="post" action="/status/go-live/signoff"><input type="hidden" name="item" value="${item.id}"><label for="note-${item.id}">${localize(locale, "What was checked, by whom", "Какво е проверено и от кого")}</label><input id="note-${item.id}" name="note" maxlength="300" minlength="3" required><label for="password-${item.id}">${localize(locale, "Confirm with administrator password", "Потвърдете с администраторската парола")}</label><input id="password-${item.id}" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit" name="action" value="sign">${localize(locale, "Record sign-off", "Запишете потвърждението")}</button>${item.signoff ? `<button type="submit" name="action" value="withdraw" class="danger" formnovalidate>${localize(locale, "Withdraw", "Оттеглете")}</button>` : ""}</form></details>`
    : ""
  return `<div class="component"><div class="component-head"><div><div class="component-name">${label}</div><div class="component-detail">${detail}.${validity}</div></div>${goLiveMark(item.satisfied, locale)}</div>${form}</div>`
}

export function renderGoLive(view: GoLivePageView, locale: StatusLocale = "bg", audience: StatusNavAudience = "password"): string {
  const banner = GO_LIVE_BANNER[view.state]
  const notice = view.notice ? `<div class="notice" role="status">${escapeHtml(view.notice)}</div>` : ""
  const error = view.error ? `<div class="error" role="alert">${escapeHtml(view.error)}</div>` : ""
  const checks = view.checks.map(check =>
    `<div class="component"><div class="component-head"><div class="component-name">${escapeHtml(locale === "bg" ? check.bg : check.en)}</div>${goLiveMark(check.satisfied, locale)}</div></div>`).join("")
  const readOnly = view.recoverySession
    ? `<div class="empty">${localize(locale, "A console-recovery session can view this checklist but cannot record sign-offs.", "Аварийна сесия от конзолата може да преглежда списъка, но не може да записва потвърждения.")}</div>`
    : ""
  return page(
    localize(locale, "Clinical go-live readiness", "Готовност за клинична употреба"),
    `<div class="shell">${statusHeader("/status/go-live", locale, audience, localize(locale, "Installed is not the same as ready", "Инсталирано не означава готово"))}<main><div class="banner ${banner.tone}" role="status"><strong>${escapeHtml(locale === "bg" ? banner.bg : banner.en)}</strong></div>${notice}${error}<section class="section" aria-labelledby="golive-checks"><h2 id="golive-checks">${localize(locale, "Checked by the appliance", "Проверявани от системата")}</h2><div class="card">${checks}</div></section><section class="section" aria-labelledby="golive-signoffs"><h2 id="golive-signoffs">${localize(locale, "Confirmed by people", "Потвърждавани от хора")}</h2><div class="card">${view.signoffs.map(item => goLiveSignoffRow(item, view, locale)).join("")}${readOnly}</div></section></main><footer class="foot">${localize(locale, "The verdict is recomputed from current observations on every view. Sign-offs record only a short note and a pseudonymous operator reference.", "Оценката се изчислява наново от текущите наблюдения при всеки преглед. Потвържденията записват само кратка бележка и псевдонимен идентификатор на оператора.")}</footer></div>`,
    locale,
  )
}

export function renderApplyConfirm(
  version: string,
  targetLockSha256: string,
  confirmation: string,
  windowDescription: string,
  locale: StatusLocale = "bg",
  rollbackPolicy?: "service-compatible" | "backup-required",
): string {
  // Deliberately without the meta refresh: a page that reloads every fifteen
  // seconds while somebody is reading a warning loses their place mid-sentence,
  // and this is the one page that must be read.
  return page(
    localize(locale, "Apply this update?", "Прилагане на обновяването?"),
    `<div class="shell"><header class="top"><div><div class="brand">LOSPOR Hospital</div><div class="subbrand">${localize(locale, "Confirm update", "Потвърждение на обновяването")}</div></div></header><main><section class="section" aria-labelledby="confirm-title"><h2 id="confirm-title">${localize(locale, "Apply", "Прилагане на")} ${escapeHtml(version)}?</h2><div class="card"><div class="component"><p><strong>${localize(locale, "This restarts the clinical services.", "Това рестартира клиничните услуги.")}</strong> ${localize(locale, "Clinicians will not be able to open or save a case while it happens, and this page will stop responding for a few minutes. It comes back on its own.", "По време на обновяването клиницистите няма да могат да отварят или запазват случаи, а тази страница ще бъде недостъпна за няколко минути. Тя ще се възстанови автоматично.")}</p><p>${localize(locale, "The update may also change the database in ways that cannot be undone. A backup is taken first, automatically, before anything is altered.", "Обновяването може да промени базата данни по начин, който не може да бъде отменен. Преди промяната автоматично се създава архив.")}</p>${rollbackPolicy === "backup-required" ? `<div class="banner warn" role="alert"><strong>${localize(locale, "This release has no proved old-app/new-schema service rollback. If activation fails after migration starts, recovery uses the verified pre-update backup and requires a technician.", "За тази версия няма доказано връщане към старите услуги върху новата схема. Ако активирането се провали след началото на миграцията, възстановяването използва проверения архив преди обновяването и изисква техник.")}</strong></div>` : ""}<p>${escapeHtml(windowDescription)}</p></div><div class="component"><form method="post" action="/status/actions/apply/confirm"><input type="hidden" name="targetLockSha256" value="${escapeHtml(targetLockSha256)}"><input type="hidden" name="confirmation" value="${escapeHtml(confirmation)}"><input type="hidden" name="window" value="scheduled"><button type="submit">${localize(locale, "Yes, apply it", "Да, приложете го")}</button></form><form method="post" action="/status/actions/apply/confirm"><input type="hidden" name="targetLockSha256" value="${escapeHtml(targetLockSha256)}"><input type="hidden" name="confirmation" value="${escapeHtml(confirmation)}"><input type="hidden" name="window" value="override"><p class="component-detail">${localize(locale, "Or, if this cannot wait:", "Ако не може да изчака:")}</p><button type="submit" class="danger">${localize(locale, "Apply immediately, outside the maintenance window", "Прилагане веднага, извън прозореца за поддръжка")}</button></form><p><a href="/status/release">${localize(locale, "No, go back", "Не, назад")}</a></p></div></div></section></main></div>`,
    locale,
  )
}

// ── maintenance: backup now, restore drill, site settings ────────────────────

export type MaintenanceView = {
  agentMode: "healthy" | "console-only" | "failed" | "unconfigured"
  state: MaintenanceAgentSignal | null
  settings: SiteConfigSignal | null
  offhost: OffhostSignal | null
  mayManage: boolean
  recoverySession: boolean
  notice?: string
  error?: string
}

const MAINTENANCE_RESULTS: Record<string, { en: string; bg: string }> = {
  MAINTENANCE_AGENT_READY: { en: "Ready.", bg: "В готовност." },
  MAINTENANCE_RUNNING: { en: "Working on the last request.", bg: "Изпълнява последната заявка." },
  MAINTENANCE_BACKUP_COMPLETED: { en: "The last backup completed and was verified.", bg: "Последното резервно копие завърши и беше проверено." },
  MAINTENANCE_BACKUP_FAILED: { en: "The last backup failed. Check Backup on the overview.", bg: "Последното резервно копие се провали. Проверете „Резервно копие“ в прегледа." },
  MAINTENANCE_DRILL_PASSED: { en: "The last restore drill passed.", bg: "Последното пробно възстановяване премина." },
  MAINTENANCE_DRILL_FAILED: { en: "The last restore drill failed: that backup could not be restored. Take a new backup and ask Hospital IT to review the console.", bg: "Последното пробно възстановяване се провали: архивът не можа да бъде възстановен. Направете ново резервно копие и помолете болничния ИТ екип да провери конзолата." },
  MAINTENANCE_DRILL_NO_BACKUP: { en: "There was no backup to drill. Take a backup first.", bg: "Нямаше архив за проверка. Първо направете резервно копие." },
  MAINTENANCE_CONFIG_APPLIED: { en: "The settings change was applied and the health check passed.", bg: "Промяната на настройките беше приложена и проверката на изправността премина." },
  MAINTENANCE_CONFIG_ROLLED_BACK: { en: "The settings change made the appliance unhealthy, so the previous settings were restored.", bg: "Промяната на настройките направи системата неизправна, затова предишните настройки бяха възстановени." },
  MAINTENANCE_CONFIG_REFUSED: { en: "The host refused the settings change. Nothing was changed.", bg: "Сървърът отказа промяната на настройките. Нищо не е променено." },
  MAINTENANCE_CONFIG_INVALID: { en: "The host found the proposed settings invalid. Nothing was changed.", bg: "Сървърът намери предложените настройки за невалидни. Нищо не е променено." },
  MAINTENANCE_CONFIG_CONSOLE_ONLY: { en: "The change touched a setting that can only be changed at the console. Nothing was changed.", bg: "Промяната засягаше настройка, която се променя само от конзолата. Нищо не е променено." },
  MAINTENANCE_CONFIG_PROPOSAL_MISMATCH: { en: "The proposal on the host was not the one confirmed. Nothing was changed.", bg: "Предложението на сървъра не беше потвърденото. Нищо не е променено." },
  MAINTENANCE_CONFIG_PROPOSAL_UNSAFE: { en: "The proposal file on the host was unsafe. Nothing was changed.", bg: "Файлът с предложението на сървъра беше небезопасен. Нищо не е променено." },
  MAINTENANCE_CONFIG_RECOVERY_REQUIRED: { en: "RECOVERY REQUIRED: the previous settings could not be brought back healthy. Hospital IT must use the console.", bg: "НУЖНО Е ВЪЗСТАНОВЯВАНЕ: предишните настройки не можаха да бъдат върнати в изправно състояние. Болничният ИТ екип трябва да използва конзолата." },
  MAINTENANCE_CONFIG_INTERRUPTED: { en: "A settings change was interrupted part way. Hospital IT must check the console before anything else is changed.", bg: "Промяна на настройките беше прекъсната. Болничният ИТ екип трябва да провери конзолата, преди да се променя друго." },
  MAINTENANCE_INTERRUPTED: { en: "The last operation was interrupted. It changed nothing clinical and can be requested again.", bg: "Последната операция беше прекъсната. Тя не е променила нищо клинично и може да бъде заявена отново." },
  MAINTENANCE_BUSY: { en: "Another maintenance operation was running. Nothing was changed; try again when it finishes.", bg: "Изпълняваше се друга операция по поддръжка. Нищо не е променено; опитайте отново, когато приключи." },
  MAINTENANCE_REQUEST_EXPIRED: { en: "The request waited too long and was not run. Request it again.", bg: "Заявката чака твърде дълго и не беше изпълнена. Заявете я отново." },
  MAINTENANCE_REQUEST_REPLAYED: { en: "A request that had already run was refused.", bg: "Вече изпълнена заявка беше отказана." },
  MAINTENANCE_OFFHOST_CONFIGURED: { en: "The off-host destination was saved. Test the connection next.", bg: "Мястото за копия извън сървъра е запазено. Следва проверка на връзката." },
  MAINTENANCE_OFFHOST_CONFIG_REFUSED: { en: "The host refused the off-host destination. For a share, check that it is mounted; for SFTP, that the server answers.", bg: "Сървърът отказа мястото за копия. За споделена папка проверете дали е монтирана; за SFTP — дали сървърът отговаря." },
  MAINTENANCE_OFFHOST_TEST_PASSED: { en: "The connection test passed: a test file was stored, read back unchanged and deleted.", bg: "Проверката на връзката премина: пробен файл беше записан, прочетен непроменен и изтрит." },
  MAINTENANCE_OFFHOST_TEST_FAILED: { en: "The connection test failed. For SFTP, check that the public key below is installed for the user.", bg: "Проверката на връзката се провали. За SFTP проверете дали публичният ключ по-долу е инсталиран за потребителя." },
  MAINTENANCE_OFFHOST_DRILL_PASSED: { en: "The off-host drill passed: the newest copy was fetched, authenticated, decrypted and restored into a temporary database.", bg: "Проверката от копието извън сървъра премина: най-новото копие беше изтеглено, удостоверено, дешифровано и възстановено във временна база данни." },
  MAINTENANCE_OFFHOST_DISABLED: { en: "Off-host copies are turned off. Copies already made stay at the destination, and the keys to read them are kept.", bg: "Копията извън сървъра са изключени. Вече направените копия остават на мястото, а ключовете за четенето им се пазят." },
  MAINTENANCE_OFFHOST_DISABLE_FAILED: { en: "Off-host copies could not be turned off. Hospital IT should run sudo losporctl backup offhost disable at the console.", bg: "Копията извън сървъра не можаха да бъдат изключени. Болничният ИТ екип трябва да изпълни sudo losporctl backup offhost disable в конзолата." },
  MAINTENANCE_OFFHOST_CUSTOM_HOOK: { en: "Refused: this appliance already has its own off-host copy script. Use one or the other; Hospital IT must remove that script first.", bg: "Отказано: тази система вече има собствен скрипт за копиране извън сървъра. Използвайте едното или другото; болничният ИТ екип трябва първо да премахне този скрипт." },
  MAINTENANCE_OFFHOST_DRILL_FAILED: { en: "The off-host drill failed. Hospital IT should review .data/offhost on the console.", bg: "Проверката от копието извън сървъра се провали. Болничният ИТ екип трябва да прегледа .data/offhost в конзолата." },
}

function maintenanceResult(code: string, locale: StatusLocale): string {
  const known = MAINTENANCE_RESULTS[code]
  return known ? localize(locale, known.en, known.bg) : localize(locale, `The host reported ${code}.`, `Сървърът отчете ${code}.`)
}

type ActionFacts = {
  prerequisites: [string, string]
  outage: [string, string]
  backup: [string, string]
  boundary: [string, string]
  verification: [string, string]
}

function actionFacts(facts: ActionFacts, locale: StatusLocale): string {
  const row = (en: string, bg: string, value: [string, string]) =>
    `<div class="fact"><b>${localize(locale, en, bg)}</b>${escapeHtml(localize(locale, value[0], value[1]))}</div>`
  return `<div class="facts">${[
    row("Needs", "Изисква", facts.prerequisites),
    row("Service interruption", "Прекъсване", facts.outage),
    row("Backup first", "Архив преди това", facts.backup),
    row("Maintenance lock", "Заключване за поддръжка", ["Shared with backups, updates and terminology: one operation at a time.", "Общо с архивите, обновяванията и терминологията: по една операция."]),
    row("Cannot be undone", "Не може да се отмени", facts.boundary),
    row("Checked afterwards", "Проверява се след това", facts.verification),
  ].join("")}</div>`
}

function passwordConfirm(id: string, locale: StatusLocale): string {
  return `<label for="${id}">${localize(locale, "Confirm with administrator password", "Потвърдете с администраторската парола")}</label><input id="${id}" name="password" type="password" autocomplete="current-password" maxlength="256" required>`
}

export function renderMaintenance(view: MaintenanceView, locale: StatusLocale = "bg", audience: StatusNavAudience = "password"): string {
  const notice = view.notice ? `<div class="notice" role="status">${escapeHtml(view.notice)}</div>` : ""
  const error = view.error ? `<div class="error" role="alert">${escapeHtml(view.error)}</div>` : ""
  const state = view.state
  const busy = state !== null && ["accepted", "working"].includes(state.phase)
  const blocked = state?.phase === "needs-operator"
  let current: string
  if (view.agentMode === "console-only") {
    current = localize(locale, "Browser maintenance is intentionally disabled on this appliance. Hospital IT uses losporctl at the console.", "Поддръжката от браузъра е изключена умишлено на тази система. Болничният ИТ екип използва losporctl от конзолата.")
  } else if (view.agentMode !== "healthy" || !state) {
    current = localize(locale, "No fresh report from the host maintenance agent. Browser maintenance is disabled rather than assuming the host is ready.", "Няма нов отчет от агента за поддръжка на сървъра. Поддръжката от браузъра е изключена, вместо да се приема, че сървърът е готов.")
  } else {
    current = maintenanceResult(state.resultCode, locale)
  }
  const disabledReason = view.recoverySession
    ? localize(locale, "A console-recovery session can view this page but cannot request maintenance.", "Аварийна сесия от конзолата може да преглежда страницата, но не може да заявява поддръжка.")
    : blocked
      ? localize(locale, "The host stopped and needs Hospital IT at the console before anything else is requested.", "Сървърът е спрял и болничният ИТ екип трябва да провери конзолата, преди да се заявява друго.")
      : busy
        ? localize(locale, "A maintenance operation is running. This page is read-only until it finishes.", "Изпълнява се операция по поддръжка. Страницата е само за преглед до приключването ѝ.")
        : localize(locale, "Browser maintenance needs a healthy host agent.", "Поддръжката от браузъра изисква работещ агент на сървъра.")
  const actionForm = (action: "backup" | "drill" | "offhost-test" | "offhost-drill" | "offhost-disable", label: string) => view.mayManage
    ? `<form method="post" action="/status/maintenance/actions"><input type="hidden" name="action" value="${action}">${passwordConfirm(`${action}-password`, locale)}<button type="submit">${escapeHtml(label)}</button></form>`
    : `<p class="component-detail">${escapeHtml(disabledReason)}</p>`

  const backupCard = `<div class="component"><div class="component-name">${localize(locale, "Back up now", "Резервно копие сега")}</div>${actionFacts({
    prerequisites: ["The database running.", "Работеща база данни."],
    outage: ["None.", "Няма."],
    backup: ["This is the backup.", "Това е архивът."],
    boundary: ["Nothing.", "Нищо."],
    verification: ["The backup is checksum-verified before it counts; see Backup on the overview.", "Архивът се проверява с контролна сума, преди да се зачете; вижте „Резервно копие“ в прегледа."],
  }, locale)}${actionForm("backup", localize(locale, "Back up now", "Резервно копие сега"))}</div>`

  const drills = state?.drills.length
    ? `<ol class="timeline">${[...state.drills].reverse().map(drill => `<li><time>${escapeHtml(drill.completedAt)}</time><strong>${drill.result === "passed" ? localize(locale, "Passed", "Премина") : localize(locale, "Failed", "Провали се")}</strong> <span class="mono">${escapeHtml(drill.backup)}</span></li>`).join("")}</ol>`
    : `<div class="empty">${localize(locale, "No restore drill has been run from Status yet.", "Още няма пробно възстановяване, пуснато от Status.")}</div>`
  const drillCard = `<div class="component"><div class="component-name">${localize(locale, "Restore drill", "Пробно възстановяване")}</div><div class="component-detail">${localize(locale, "Proves the newest backup can be restored: it is restored into a separate temporary database, migrated and validated, then the copy is removed. The live database is not touched.", "Доказва, че най-новият архив може да бъде възстановен: той се възстановява в отделна временна база данни, мигрира се и се проверява, след което копието се премахва. Действащата база данни не се засяга.")}</div>${actionFacts({
    prerequisites: ["At least one backup.", "Поне един архив."],
    outage: ["None. The server is busier for a minute or two.", "Няма. Сървърът е по-натоварен минута-две."],
    backup: ["No.", "Не."],
    boundary: ["Nothing. The temporary copy is removed.", "Нищо. Временното копие се премахва."],
    verification: ["The result is kept below. Record a passed drill on the Go-live page.", "Резултатът се пази по-долу. Отбележете успешна проверка на страницата „Готовност“."],
  }, locale)}${actionForm("drill", localize(locale, "Run a restore drill", "Пробно възстановяване"))}${drills}</div>`

  return page(
    localize(locale, "Appliance maintenance", "Поддръжка на системата"),
    `<div class="shell">${statusHeader("/status/maintenance", locale, audience, localize(locale, "Backups, drills and site settings", "Архиви, проверки и настройки"))}<main>${notice}${error}<section class="section" aria-labelledby="maintenance-now"><h2 id="maintenance-now">${localize(locale, "Host maintenance agent", "Агент за поддръжка на сървъра")}</h2><div class="card"><div class="component"><div class="component-detail">${escapeHtml(current)}</div></div></div></section><section class="section" aria-labelledby="maintenance-backups"><h2 id="maintenance-backups">${localize(locale, "Backups", "Архиви")}</h2><div class="card">${backupCard}${drillCard}</div></section>${offhostSection(view, disabledReason, actionForm, locale)}${settingsSection(view, disabledReason, locale)}</main><footer class="foot">${localize(locale, "Status only leaves a request. The host agent checks every request again and does the work; in-place restore and recovery stay at the console.", "Status само оставя заявка. Агентът на сървъра проверява всяка заявка отново и извършва работата; възстановяването на място и аварийното възстановяване остават в конзолата.")}</footer></div>`,
    locale,
  )
}

const OFFHOST_RESULTS: Record<string, { en: string; bg: string }> = {
  OFFHOST_COPY_ACKNOWLEDGED: { en: "copied and read back", bg: "копирано и прочетено обратно" },
  OFFHOST_COPY_FAILED: { en: "failed, will retry", bg: "неуспешно, ще се опита отново" },
  OFFHOST_BUSY: { en: "waited for another maintenance operation", bg: "изчака друга операция по поддръжка" },
  OFFHOST_CAPACITY_REFUSED: { en: "not enough free disk", bg: "няма достатъчно свободно място" },
  OFFHOST_ENCRYPT_FAILED: { en: "could not encrypt", bg: "шифроването се провали" },
  OFFHOST_CONFIG_INVALID: { en: "configuration invalid", bg: "невалидна настройка" },
  OFFHOST_TEST_PASSED: { en: "passed", bg: "премина" },
  OFFHOST_TEST_FAILED: { en: "failed", bg: "провали се" },
  OFFHOST_DRILL_PASSED: { en: "passed", bg: "премина" },
  OFFHOST_CUSTOM_HOOK_CONFLICT: { en: "stopped: a custom off-host script is also installed", bg: "спряно: инсталиран е и собствен скрипт за копиране" },
}

function offhostResult(result: { at: string; result: string } | undefined, locale: StatusLocale): string {
  if (!result) return localize(locale, "not yet", "още не")
  const known = OFFHOST_RESULTS[result.result]
  const words = known ? localize(locale, known.en, known.bg)
    : result.result.startsWith("OFFHOST_DRILL_") ? localize(locale, "failed", "провали се") : result.result
  return `${words} · ${result.at}`
}

function offhostSection(
  view: MaintenanceView,
  disabledReason: string,
  actionForm: (action: "offhost-test" | "offhost-drill" | "offhost-disable", label: string) => string,
  locale: StatusLocale,
): string {
  const offhost = view.offhost
  const destination = offhost?.destination
  const facts = actionFacts({
    prerequisites: ["A share Hospital IT has mounted under /mnt, /media or /srv, or an SFTP account that accepts the key below.", "Споделена папка, монтирана от болничния ИТ екип в /mnt, /media или /srv, или SFTP акаунт, който приема ключа по-долу."],
    outage: ["None.", "Няма."],
    backup: ["Copies are made from verified backups only.", "Копират се само проверени архиви."],
    boundary: ["Nothing here. Keep the encryption key escrowed: without it no copy can be read.", "Нищо тук. Пазете ключа за шифроване в сейфа: без него никое копие не може да бъде прочетено."],
    verification: ["Every copy is read back and compared before it counts; a drill restores one.", "Всяко копие се прочита обратно и се сравнява, преди да се зачете; проверката възстановява копие."],
  }, locale)
  let current: string
  if (!destination) {
    current = `<div class="empty">${localize(locale, "Off-host copies are not set up. A backup that exists only on this server is lost with it.", "Копията извън сървъра не са настроени. Архив, който съществува само на този сървър, се губи заедно с него.")}</div>`
  } else {
    const where = destination.type === "mount"
      ? localize(locale, `Share mounted at ${destination.path}`, `Споделена папка в ${destination.path}`)
      : `sftp://${destination.user}@${destination.host}:${destination.port}/${destination.directory}`
    const identities = destination.type === "sftp"
      ? `<div class="component"><div class="component-name">${localize(locale, `Install this public key for ${destination.user} on the SFTP server`, `Инсталирайте този публичен ключ за ${destination.user} на SFTP сървъра`)}</div><div class="component-detail mono">${escapeHtml(offhost?.sshPublicKey ?? "")}</div><div class="component-name">${localize(locale, "Server host keys pinned at setup — confirm them with the server's administrator", "Ключове на сървъра, закрепени при настройката — потвърдете ги с администратора на сървъра")}</div><div class="component-detail mono">${(offhost?.hostKeyFingerprints ?? []).map(escapeHtml).join("<br>")}</div></div>`
      : ""
    const drills = offhost?.drills.length
      ? `<ol class="timeline">${[...offhost.drills].reverse().map(drill => `<li><time>${escapeHtml(drill.completedAt)}</time><strong>${drill.result === "passed" ? localize(locale, "Passed", "Премина") : localize(locale, "Failed", "Провали се")}</strong> <span class="mono">${escapeHtml(drill.backup)}</span></li>`).join("")}</ol>`
      : ""
    current = `<div class="facts">${[
      releaseFact(localize(locale, "Destination", "Място"), where),
      releaseFact(localize(locale, "Last copy", "Последно копие"), offhostResult(offhost?.lastRun, locale)),
      releaseFact(localize(locale, "Last connection test", "Последна проверка на връзката"), offhostResult(offhost?.lastTest, locale)),
      releaseFact(localize(locale, "Last drill from off-host", "Последна проверка от копие"), offhostResult(offhost?.lastDrill, locale)),
      releaseFact(localize(locale, "Encryption key fingerprint", "Отпечатък на ключа за шифроване"), offhost?.encryptionKeyFingerprint ?? "-"),
    ].join("")}</div>${identities}${actionForm("offhost-test", localize(locale, "Test the connection", "Проверка на връзката"))}${actionForm("offhost-drill", localize(locale, "Drill from the newest off-host copy", "Проверка от най-новото копие"))}${drills}<details class="admin-action"><summary>${localize(locale, "Turn off off-host copies", "Изключване на копията извън сървъра")}</summary><p class="component-detail">${localize(locale, "New backups stop being copied elsewhere, and Status warns until copies are set up again. Copies already made stay at the destination and the keys to read them are kept.", "Новите архиви спират да се копират другаде и Status предупреждава, докато копията не бъдат настроени отново. Вече направените копия остават на мястото, а ключовете за четенето им се пазят.")}</p>${actionForm("offhost-disable", localize(locale, "Turn off", "Изключване"))}</details>`
  }
  const setup = view.mayManage
    ? `<details class="admin-action"${destination ? "" : " open"}><summary>${destination ? localize(locale, "Change the destination", "Смяна на мястото") : localize(locale, "Set up off-host copies", "Настройка на копия извън сървъра")}</summary><form method="post" action="/status/maintenance/offhost"><fieldset><legend>${localize(locale, "Mounted network share (SMB or NFS)", "Монтирана мрежова папка (SMB или NFS)")}</legend><label class="check"><input type="radio" name="type" value="mount" required><span>${localize(locale, "Use a share Hospital IT has already mounted", "Използване на папка, монтирана от болничния ИТ екип")}</span></label><label for="offhost-path">${localize(locale, "Mount path", "Път на монтиране")}</label><input id="offhost-path" name="path" placeholder="/mnt/lospor-backups" maxlength="200" autocomplete="off"></fieldset><fieldset><legend>SFTP</legend><label class="check"><input type="radio" name="type" value="sftp"><span>${localize(locale, "Use an SFTP server (key authentication only)", "Използване на SFTP сървър (само с ключ)")}</span></label><div class="form-grid"><div><label for="offhost-host">${localize(locale, "Server", "Сървър")}</label><input id="offhost-host" name="host" maxlength="253" autocomplete="off"></div><div><label for="offhost-port">${localize(locale, "Port", "Порт")}</label><input id="offhost-port" name="port" value="22" inputmode="numeric" maxlength="5"></div><div><label for="offhost-user">${localize(locale, "User", "Потребител")}</label><input id="offhost-user" name="user" maxlength="32" autocomplete="off"></div><div><label for="offhost-directory">${localize(locale, "Directory", "Директория")}</label><input id="offhost-directory" name="directory" value="lospor-backups" maxlength="200" autocomplete="off"></div></div></fieldset>${passwordConfirm("offhost-password", locale)}<button type="submit">${localize(locale, "Save the destination", "Запазване на мястото")}</button></form></details>`
    : `<p class="component-detail">${escapeHtml(disabledReason)}</p>`
  return `<section class="section" aria-labelledby="maintenance-offhost"><h2 id="maintenance-offhost">${localize(locale, "Copies kept elsewhere", "Копия извън сървъра")}</h2><div class="card"><div class="component"><div class="component-detail">${localize(locale, "Each verified backup is encrypted on this server, copied to the destination, read back and compared. Only then does it count as kept elsewhere.", "Всеки проверен архив се шифрова на този сървър, копира се на мястото, прочита се обратно и се сравнява. Едва тогава се счита за пазен извън сървъра.")}</div>${facts}${current}${setup}</div></div></section>`
}

function settingsSection(view: MaintenanceView, disabledReason: string, locale: StatusLocale): string {
  const title = `<h2 id="maintenance-settings">${localize(locale, "Site settings", "Настройки на сайта")}</h2>`
  if (!view.settings) {
    return `<section class="section" aria-labelledby="maintenance-settings">${title}<div class="card"><div class="empty">${localize(locale, "The host has not reported the site settings.", "Сървърът не е отчел настройките на сайта.")}</div></div></section>`
  }
  const settings = view.settings.settings
  const unrepresentable = Object.values(settings).some(setting => setting.value === null)
  const consoleOnly = Object.entries(settings).filter(([, setting]) => !setting.editable)
    .map(([key, setting]) => `<div class="fact"><b class="mono">${escapeHtml(key)}</b>${escapeHtml(setting.value ?? "")}</div>`).join("")
  const facts = actionFacts({
    prerequisites: ["A healthy host agent.", "Работещ агент на сървъра."],
    outage: ["Only the services whose settings changed restart, usually for under a minute.", "Рестартират се само услугите с променени настройки, обикновено за под минута."],
    backup: ["No: only settings change, and the previous settings are kept.", "Не: променят се само настройки, а предишните се пазят."],
    boundary: ["Nothing. If the health check fails, the previous settings are restored automatically.", "Нищо. Ако проверката на изправността се провали, предишните настройки се възстановяват автоматично."],
    verification: ["The full health check (doctor).", "Пълната проверка на изправността (doctor)."],
  }, locale)
  let form: string
  if (unrepresentable) {
    form = `<p class="component-detail">${localize(locale, "A setting on the host cannot be shown here exactly, so settings are changed at the console: sudo losporctl config plan.", "Настройка на сървъра не може да бъде показана тук точно, затова настройките се променят от конзолата: sudo losporctl config plan.")}</p>`
  } else if (!view.mayManage) {
    form = `<p class="component-detail">${escapeHtml(disabledReason)}</p>`
  } else {
    const fields = EDITABLE_SETTINGS.filter(setting => settings[setting.key]?.editable !== false).map(setting => {
      const value = settings[setting.key]?.value ?? ""
      return `<div><label for="setting-${setting.key}">${escapeHtml(localize(locale, setting.en, setting.bg))}</label><input id="setting-${setting.key}" name="${setting.key}" value="${escapeHtml(value)}" maxlength="300" autocomplete="off"></div>`
    }).join("")
    form = `<form method="post" action="/status/maintenance/settings/preview"><div class="form-grid">${fields}</div><button type="submit">${localize(locale, "Review the change", "Преглед на промяната")}</button></form>`
  }
  return `<section class="section" aria-labelledby="maintenance-settings">${title}<div class="card"><div class="component">${facts}${form}</div><div class="component"><div class="component-name">${localize(locale, "Changed only at the console", "Променят се само от конзолата")}</div><div class="component-detail">${localize(locale, "Names, certificate and ports change the address this page is reached at.", "Имената, сертификатът и портовете променят адреса, на който се отваря тази страница.")}</div><div class="facts">${consoleOnly}</div></div></div></section>`
}

export function renderSettingsConfirm(
  proposal: SettingsProposal,
  submitted: Record<string, string>,
  confirmation: string,
  locale: StatusLocale = "bg",
): string {
  const labels = new Map(EDITABLE_SETTINGS.map(setting => [setting.key, localize(locale, setting.en, setting.bg)]))
  const blank = localize(locale, "(blank)", "(празно)")
  const rows = proposal.changes.map(change =>
    `<div class="component"><div class="component-name">${escapeHtml(labels.get(change.key) ?? change.key)}</div><div class="component-detail mono">${escapeHtml(change.before || blank)} → ${escapeHtml(change.after || blank)}</div></div>`).join("")
  const hidden = EDITABLE_SETTINGS.filter(setting => submitted[setting.key] !== undefined)
    .map(setting => `<input type="hidden" name="${setting.key}" value="${escapeHtml(submitted[setting.key]!)}">`).join("")
  const networks = proposal.changes.some(change => change.key.endsWith("_CIDRS"))
    ? `<div class="banner warn" role="alert"><strong>${localize(locale, "Network lists decide who can open the site. The computer you are using now stays allowed, but check every other computer that needs access.", "Мрежовите списъци решават кой може да отваря сайта. Компютърът, който използвате сега, остава разрешен, но проверете всеки друг компютър, който има нужда от достъп.")}</strong></div>`
    : ""
  return page(
    localize(locale, "Apply these settings?", "Прилагане на тези настройки?"),
    `<div class="shell"><header class="top"><div><div class="brand">LOSPOR Hospital</div><div class="subbrand">${localize(locale, "Confirm settings change", "Потвърждение на промяната")}</div></div></header><main><section class="section" aria-labelledby="settings-confirm"><h2 id="settings-confirm">${localize(locale, "These settings will change", "Тези настройки ще се променят")}</h2><div class="card">${rows}<div class="component">${networks}<p>${localize(locale, "Services whose settings change restart, usually for under a minute. The health check runs afterwards, and if it fails the previous settings are restored automatically.", "Услугите с променени настройки се рестартират, обикновено за под минута. След това се изпълнява проверката на изправността и ако тя се провали, предишните настройки се възстановяват автоматично.")}</p><form method="post" action="/status/maintenance/settings/apply">${hidden}<input type="hidden" name="proposalSha256" value="${proposal.sha256}"><input type="hidden" name="confirmation" value="${escapeHtml(confirmation)}">${passwordConfirm("settings-password", locale)}<button type="submit">${localize(locale, "Apply these settings", "Прилагане на настройките")}</button></form><p><a href="/status/maintenance">${localize(locale, "No, go back", "Не, назад")}</a></p></div></div></section></main></div>`,
    locale,
  )
}
