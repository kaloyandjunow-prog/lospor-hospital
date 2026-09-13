import type { NetworkListsState } from "./maintenance.js"
import type { TerminologyAgentSignal } from "./signals.js"
import type { ComponentView } from "./types.js"

// Installed is not the same as ready for clinical use. This turns what Status
// already observes, plus the few facts only a person can attest, into one
// checklist and one verdict. Nothing here is stored as a state that could go
// stale: the verdict is recomputed from current observations on every view.

export type GoLiveState = "GO_LIVE_READY" | "GO_LIVE_BLOCKED" | "MAINTENANCE" | "RECOVERY_REQUIRED"

export type GoLiveSignoffItem =
  | "restore-drill"
  | "network-verified"
  | "mfa-recovery-stored"
  | "host-patch-policy"
  | "clinical-acceptance"

export const GO_LIVE_SIGNOFF_ITEMS: readonly {
  id: GoLiveSignoffItem
  en: string
  bg: string
  /** A sign-off older than this no longer counts. */
  validForMs?: number
}[] = [
  {
    id: "restore-drill",
    en: "A temporary restore from the real off-host backup copy was completed and checked",
    bg: "Извършено и проверено е временно възстановяване от истинското външно копие на архива",
    validForMs: 92 * 24 * 60 * 60_000,
  },
  {
    id: "network-verified",
    en: "The research and IT-management network allowlists were verified from representative computers",
    bg: "Мрежовите ограничения за изследователи и ИТ управление са проверени от представителни компютри",
  },
  {
    id: "mfa-recovery-stored",
    en: "Administrator MFA recovery codes are stored in the Hospital IT password vault",
    bg: "Кодовете за възстановяване на MFA на администраторите са съхранени в хранилището за пароли на ИТ",
  },
  {
    id: "host-patch-policy",
    en: "The host security-update policy, maintenance window and monitoring owner are recorded",
    bg: "Политиката за обновяване на сървъра, прозорецът за поддръжка и отговорникът за наблюдение са записани",
  },
  {
    id: "clinical-acceptance",
    en: "Clinicians accepted the web app, phone app, printed record and offline use",
    bg: "Клиницистите приеха уеб приложението, мобилното приложение, печатния запис и работата без мрежа",
  },
]

export type GoLiveSignoff = {
  item: GoLiveSignoffItem
  signedAt: number
  operatorRef: string
  note: string
}

export type GoLiveCheck = {
  id: string
  en: string
  bg: string
  satisfied: boolean
}

export type GoLiveSignoffView = (typeof GO_LIVE_SIGNOFF_ITEMS)[number] & {
  signoff: GoLiveSignoff | null
  expired: boolean
  satisfied: boolean
}

export type GoLiveView = {
  state: GoLiveState
  checks: GoLiveCheck[]
  signoffs: GoLiveSignoffView[]
}

export function isGoLiveSignoffItem(value: unknown): value is GoLiveSignoffItem {
  return GO_LIVE_SIGNOFF_ITEMS.some(item => item.id === value)
}

export function evaluateGoLive(input: {
  components: readonly ComponentView[]
  terminology: TerminologyAgentSignal | null
  networkLists: NetworkListsState | null
  signoffs: readonly GoLiveSignoff[]
  now: number
}): GoLiveView {
  const byComponent = new Map(input.components.map(component => [component.component, component]))
  const operational = (component: string) => byComponent.get(component)?.status === "operational"
  const code = (component: string) => byComponent.get(component)?.code

  const checks: GoLiveCheck[] = [
    {
      id: "certificate",
      en: "HTTPS certificate is valid",
      bg: "HTTPS сертификатът е валиден",
      satisfied: code("host-certificate") === "HOST_CERTIFICATE_VALID",
    },
    {
      id: "services",
      en: "All appliance services are healthy",
      bg: "Всички услуги на системата работят",
      satisfied: operational("host-services"),
    },
    {
      id: "clock",
      en: "The server clock is synchronized",
      bg: "Часовникът на сървъра е синхронизиран",
      satisfied: operational("host-clock"),
    },
    {
      id: "backup",
      en: "Local backups are current and verified",
      bg: "Локалните архиви са актуални и проверени",
      satisfied: operational("host-backup"),
    },
    {
      id: "offhost-backup",
      en: "The off-host backup copy is acknowledged",
      bg: "Външното копие на архива е потвърдено",
      satisfied: code("offhost-backup") === "OFFHOST_BACKUP_ACKNOWLEDGED",
    },
    {
      id: "key-escrow",
      en: "Installation secrets are escrowed off the appliance",
      bg: "Инсталационните тайни са съхранени извън системата",
      satisfied: code("key-escrow") === "KEY_ESCROW_ACKNOWLEDGED",
    },
    {
      id: "update-route",
      en: "The update route and host update agent are working",
      bg: "Маршрутът за обновявания и агентът за обновяване работят",
      satisfied: operational("update-supply") && operational("host-update-agent"),
    },
    {
      id: "host-os",
      en: "Ubuntu security updates are automatic and current",
      bg: "Обновленията за сигурност на Ubuntu са автоматични и актуални",
      satisfied: ["HOST_OS_CURRENT", "HOST_OS_REBOOT_SCHEDULED", "HOST_OS_SUPPORT_ENDING"].includes(code("host-os") ?? ""),
    },
    {
      id: "network-lists",
      en: "Hospital IT has set which networks may open Status and the Research website",
      bg: "Болничният ИТ екип е задал кои мрежи имат достъп до Status и до сайта за изследвания",
      satisfied: Boolean(input.networkLists && !input.networkLists.statusOpenToAllPrivate && !input.networkLists.researchClosed),
    },
    {
      id: "terminology",
      en: "An approved terminology package is active",
      bg: "Активен е одобрен пакет терминология",
      satisfied: Boolean(input.terminology?.packageId && input.terminology.activatedAt)
        && input.terminology?.phase !== "needs-operator",
    },
  ]

  const latest = new Map(input.signoffs.map(signoff => [signoff.item, signoff]))
  const signoffs = GO_LIVE_SIGNOFF_ITEMS.map(item => {
    const signoff = latest.get(item.id) ?? null
    const expired = Boolean(signoff && item.validForMs !== undefined && input.now - signoff.signedAt > item.validForMs)
    return { ...item, signoff, expired, satisfied: Boolean(signoff) && !expired }
  })

  const activationLock = code("host-activation-lock")
  const restoreLock = code("host-restore-lock")
  let state: GoLiveState
  if (activationLock === "HOST_ACTIVATION_LOCK_PRESENT" || activationLock === "HOST_ACTIVATION_LOCK_INVALID"
    || restoreLock === "HOST_RESTORE_LOCK_INVALID" || input.terminology?.phase === "needs-operator") {
    state = "RECOVERY_REQUIRED"
  } else if (restoreLock === "HOST_RESTORE_LOCK_PRESENT"
    || input.terminology?.phase === "accepted" || input.terminology?.phase === "working") {
    state = "MAINTENANCE"
  } else if (checks.every(check => check.satisfied) && signoffs.every(signoff => signoff.satisfied)) {
    state = "GO_LIVE_READY"
  } else {
    state = "GO_LIVE_BLOCKED"
  }
  return { state, checks, signoffs }
}
