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
  /** Shown and guided, but neither blocks go-live nor counts in progress. */
  optional?: boolean
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
  /** Every check and sign-off, in the order the journey takes them. */
  steps: GoLiveStep[]
  /** The first required step not done, or null when every one is. */
  nextStep: GoLiveStep | null
  progress: { done: number; total: number }
}

// ── the journey ──────────────────────────────────────────────────────────────
//
// The checks and sign-offs above are what go-live requires. This is how a
// person gets through them: in an order where each step is possible once the
// ones before it are done, with why it matters, who does it, and where. It adds
// no requirement and stores nothing -- the verdict above is unchanged, and
// because every step is read from current observations, leaving and coming back
// resumes exactly where the appliance now stands.

export type GoLiveStage = "reach" | "protect" | "maintain" | "content" | "people"
export type GoLiveOwner = "appliance" | "hospital-it" | "clinical-lead"

export type GoLiveAction =
  /** A page in Status where the step is done. */
  | { kind: "link"; href: string; en: string; bg: string }
  /** A console command, for what Status deliberately cannot do. */
  | { kind: "command"; command: string; en: string; bg: string }

export type GoLiveGuide = {
  stage: GoLiveStage
  owner: GoLiveOwner
  whyEn: string
  whyBg: string
  action?: GoLiveAction
}

export type GoLiveStep = {
  id: string
  kind: "check" | "signoff"
  en: string
  bg: string
  satisfied: boolean
  optional?: boolean
  guide: GoLiveGuide
}

export const GO_LIVE_STAGES: readonly { id: GoLiveStage; en: string; bg: string }[] = [
  { id: "reach", en: "1. Reach the appliance safely", bg: "1. Безопасен достъп до системата" },
  { id: "protect", en: "2. Protect the data", bg: "2. Защита на данните" },
  { id: "maintain", en: "3. Keep it maintained", bg: "3. Поддръжка" },
  { id: "content", en: "4. Clinical content", bg: "4. Клинично съдържание" },
  { id: "people", en: "5. Accepted by people", bg: "5. Приемане от хората" },
]

export const GO_LIVE_OWNERS: Record<GoLiveOwner, { en: string; bg: string }> = {
  "appliance": { en: "Checked automatically", bg: "Проверява се автоматично" },
  "hospital-it": { en: "Hospital IT", bg: "Болничен ИТ екип" },
  "clinical-lead": { en: "Clinical lead", bg: "Клиничен ръководител" },
}

const STATUS_COMMAND = { kind: "command", command: "sudo losporctl status", en: "Shows in plain words what is wrong", bg: "Показва с обикновени думи какво не е наред" } as const
const SITE_SETTINGS = "/status/maintenance#maintenance-settings"

/** The journey's order: each stage in turn, and within it the order listed. */
export const GO_LIVE_GUIDE: readonly ({ id: string } & GoLiveGuide)[] = [
  {
    id: "services", stage: "reach", owner: "appliance",
    whyEn: "Every clinical screen, every backup and this page depend on these services.",
    whyBg: "Всеки клиничен екран, всеки архив и тази страница зависят от тези услуги.",
    action: STATUS_COMMAND,
  },
  {
    id: "clock", stage: "reach", owner: "appliance",
    whyEn: "Record times, certificates and backups are only as right as the server clock.",
    whyBg: "Времената в записите, сертификатите и архивите са верни само колкото часовника на сървъра.",
    action: STATUS_COMMAND,
  },
  {
    id: "certificate", stage: "reach", owner: "hospital-it",
    whyEn: "Browsers and phones refuse the site without a valid certificate. With the hospital's own authority, place the certificate, key and CA files on the server first.",
    whyBg: "Браузърите и телефоните отказват сайта без валиден сертификат. При сертификат от собствения удостоверителен орган на болницата първо поставете файловете със сертификата, ключа и CA на сървъра.",
    action: { kind: "command", command: "sudo losporctl config certificate operator FULLCHAIN KEY CA", en: "Or: sudo losporctl config certificate acme EMAIL", bg: "Или: sudo losporctl config certificate acme ИМЕЙЛ" },
  },
  {
    id: "network-lists", stage: "reach", owner: "hospital-it",
    whyEn: "Status should open only from the IT management networks, and the Research website only from research computers.",
    whyBg: "Status трябва да се отваря само от мрежите за ИТ управление, а сайтът за изследвания само от компютрите за изследвания.",
    action: { kind: "link", href: SITE_SETTINGS, en: "Set the networks", bg: "Задайте мрежите" },
  },
  {
    id: "network-verified", stage: "reach", owner: "hospital-it",
    whyEn: "A list that reads right can still let the wrong computer in. Try it from real ones, then sign off here.",
    whyBg: "Списък, който изглежда правилен, пак може да пусне грешен компютър. Проверете от истински компютри и потвърдете тук.",
    action: { kind: "link", href: SITE_SETTINGS, en: "See the networks", bg: "Вижте мрежите" },
  },
  {
    id: "backup", stage: "protect", owner: "appliance",
    whyEn: "Without a current, verified backup a failed disk loses every case.",
    whyBg: "Без актуален проверен архив повреден диск губи всички случаи.",
    action: { kind: "link", href: "/status/maintenance#maintenance-backups", en: "Back up now", bg: "Резервно копие сега" },
  },
  {
    id: "offhost-backup", stage: "protect", owner: "hospital-it",
    whyEn: "A backup kept on the same server is lost together with the server.",
    whyBg: "Архив на същия сървър се губи заедно със сървъра.",
    action: { kind: "link", href: "/status/maintenance#maintenance-offhost", en: "Set up copies kept elsewhere", bg: "Настройте копия извън сървъра" },
  },
  {
    id: "key-escrow", stage: "protect", owner: "hospital-it",
    whyEn: "Backups hold only fingerprints of the secrets. If the server is lost and its secrets exist nowhere else, every stored patient identity is unreadable for good, even from a good backup. Plug a USB stick or mount a share outside this server first.",
    whyBg: "Архивите съдържат само отпечатъци на тайните. Ако сървърът се загуби и тайните му не съществуват другаде, всяка запазена самоличност на пациент става нечетима завинаги, дори от добър архив. Първо поставете USB памет или монтирайте споделена папка извън сървъра.",
    action: { kind: "command", command: "sudo losporctl secrets escrow /media/usb", en: "Writes the secrets, encrypted, to that USB stick or share, checks the copy and records it", bg: "Записва тайните шифровани на тази USB памет или споделена папка, проверява копието и го отбелязва" },
  },
  {
    id: "restore-drill", stage: "protect", owner: "hospital-it",
    whyEn: "Only a restore that was actually tried proves the copies can be used. It is due again every 92 days.",
    whyBg: "Само реално опитано възстановяване доказва, че копията могат да се използват. Повтаря се на всеки 92 дни.",
    action: { kind: "link", href: "/status/maintenance#maintenance-offhost", en: "Run the off-host drill", bg: "Пуснете проверката на външното копие" },
  },
  {
    id: "update-route", stage: "maintain", owner: "appliance",
    whyEn: "Security fixes reach the appliance only through a working update route.",
    whyBg: "Поправките за сигурност достигат системата само по работещ маршрут за обновявания.",
    action: { kind: "command", command: "sudo losporctl update check", en: "Checks the route to new releases", bg: "Проверява маршрута до нови версии" },
  },
  {
    id: "host-os", stage: "maintain", owner: "appliance",
    whyEn: "Ubuntu's own security updates protect everything that runs on it.",
    whyBg: "Обновленията за сигурност на Ubuntu пазят всичко, което работи върху него.",
    action: { kind: "link", href: "/status/maintenance#maintenance-host-os", en: "See Ubuntu maintenance", bg: "Вижте поддръжката на Ubuntu" },
  },
  {
    id: "host-patch-policy", stage: "maintain", owner: "hospital-it",
    whyEn: "Someone has to own the server: its maintenance window, its monitoring and who is called.",
    whyBg: "Някой трябва да отговаря за сървъра: прозореца за поддръжка, наблюдението и кого да търсят.",
    action: { kind: "link", href: "/status/maintenance#maintenance-host-os", en: "See Ubuntu maintenance", bg: "Вижте поддръжката на Ubuntu" },
  },
  {
    id: "terminology", stage: "content", owner: "hospital-it",
    whyEn: "Optional. This release already carries ICD-10 with Bulgarian names, procedures, the drug list, English diagnosis synonyms and the research numbers for all of them. Import an Athena package only when research needs a newer vocabulary release; place the package folder on the server first.",
    whyBg: "По избор. Тази версия вече съдържа МКБ-10 с български наименования, процедури, списъка с лекарства, английски синоними на диагнозите и изследователските кодове за всички тях. Импортирайте пакет от Athena само ако изследванията изискват по-нова версия на речниците; първо поставете папката на пакета на сървъра.",
    action: { kind: "link", href: "/status/terminology#term-actions", en: "Import a package", bg: "Импортирайте пакет" },
  },
  {
    id: "mfa-recovery-stored", stage: "people", owner: "hospital-it",
    whyEn: "Without its recovery codes, a lost phone locks an administrator out.",
    whyBg: "Без кодовете за възстановяване загубен телефон заключва администратора навън.",
    action: { kind: "link", href: "/status/accounts", en: "See accounts", bg: "Вижте профилите" },
  },
  {
    id: "clinical-acceptance", stage: "people", owner: "clinical-lead",
    whyEn: "The people who will chart on it confirm that the web app, phone app, printed record and offline use work for them.",
    whyBg: "Хората, които ще документират в нея, потвърждават, че уеб приложението, мобилното приложение, печатният запис и работата без мрежа им вършат работа.",
  },
]

function journey(checks: readonly GoLiveCheck[], signoffs: readonly GoLiveSignoffView[]) {
  const byId = new Map<string, Omit<GoLiveStep, "guide">>([
    ...checks.map(check => [check.id, { id: check.id, kind: "check", en: check.en, bg: check.bg, satisfied: check.satisfied, ...(check.optional ? { optional: true } : {}) }] as const),
    ...signoffs.map(item => [item.id, { id: item.id, kind: "signoff", en: item.en, bg: item.bg, satisfied: item.satisfied }] as const),
  ])
  const order = GO_LIVE_STAGES.map(stage => stage.id)
  const steps = [...GO_LIVE_GUIDE]
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage))
    .flatMap(({ id, ...guide }) => {
      const step = byId.get(id)
      return step ? [{ ...step, guide }] : []
    })
  const required = steps.filter(step => !step.optional)
  return {
    steps,
    nextStep: required.find(step => !step.satisfied) ?? null,
    progress: { done: required.filter(step => step.satisfied).length, total: required.length },
  }
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
      en: "Optional: an Athena terminology package is imported",
      bg: "По избор: импортиран е пакет терминология от Athena",
      satisfied: Boolean(input.terminology?.packageId && input.terminology.activatedAt)
        && input.terminology?.phase !== "needs-operator",
      // The release bundles the codes clinical use needs. A package that was
      // imported and then broke still stops go-live: see needs-operator below.
      optional: true,
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
  } else if (checks.every(check => check.satisfied || check.optional) && signoffs.every(signoff => signoff.satisfied)) {
    state = "GO_LIVE_READY"
  } else {
    state = "GO_LIVE_BLOCKED"
  }
  return { state, checks, signoffs, ...journey(checks, signoffs) }
}
