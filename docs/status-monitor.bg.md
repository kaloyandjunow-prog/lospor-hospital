# Наблюдение на appliance чрез Status

**Български** | [English](status-monitor.md)

## Какво представлява

Status е удостоверена оперативна страница за болничния ИТ екип. Проектирана е
да продължи да отговаря, когато clinical API или PostgreSQL не са достъпни.
Наблюдава clinical API, database, Web, PWA, research Browser, gateway, backup и
delivery worker, database migrations, research export storage, email, Central
delivery configuration, research exports и синхронизирането на данните за
достъп на appliance administrator.

Status е отделен container със собствен SQLite volume и login verifier. Не е
public status service, patient-facing страница, raw log viewer или заместител на
host monitoring.

Българският е езикът на интерфейса по подразбиране. Английският остава достъпен
чрез видимия контрол БГ/EN на екрана за вход и удостоверените екрани. Изборът се
пази в cookie само за Status; Status има независима operator identity и не
заменя езиковото предпочитание на клинициста в клиничните приложения.

## Акаунти и връзки за активиране

Отворете **Акаунти и връзки за активиране** от dashboard на Status, докато сте
влезли с нормалната парола на appliance administrator. Саморегистрацията в
Hospital остава изключена. Страницата може да създава clinical members,
clinical heads of department и research-only accounts. Не може да създава
`ADMIN`, да изтрива акаунт или да понижава нечии права.

Връзката за активиране се показва веднъж и може да бъде копирана, разпечатана
или сканирана като QR code, генериран локално на appliance. Валидна е 72 часа.
По същия начин активните акаунти могат да получат осемчасова локална recovery
връзка. Издаването на заместваща връзка обезсилва предишните неизползвани
връзки; първото използване е атомарно. Не е необходим mail provider и нито
тайната, нито нейният digest попадат в Status SQLite, историята на Status,
operational events или request URL, виждан от сървъра.

Status не става clinical или research identity. Той извиква само тесен частен
account-lifecycle API чрез отделен service bearer във файл. Console-recovery
Status сесия не може да вижда или издава връзки за акаунти. Посоченият appliance
operator също е изключен от локалното account recovery; за този акаунт
използвайте синхронизирания host credential workflow. Пълното поведение,
начините за предаване, одитните действия и подготвената upstream зависимост са
описани в [Предоставяне на Hospital акаунти](account-provisioning.bg.md).

## Поколения терминология

Отворете **Поколения терминология**, за да видите идентичността и версията на
активния одобрен пакет, часа на активиране, SHA-256 на манифеста, наличието на
запазено поколение за връщане и ограниченото състояние на чакаща операция или
агента на сървъра. Страницата никога не получава лицензирани изходни файлове,
пътища, имена на бази, журнали, данни за вход или данни за пациенти.

Обикновена сесия с парола и MFA може да заяви импорт, възобновяване на точно
същия пакет, връщане и необратимо приключване след ново потвърждение с парола и
потвърждение за конкретното действие. Аварийната сесия от конзолата е само за
преглед. Браузърът подава единствено фиксирано действие и име на една директна
папка на пакет; агентът с права `root` свързва тази заявка с включените скриптове и
използва общото заключване с архивирането и обновяването. При режим само от
конзолата или остаряло състояние на агента бутоните са изключени. Прекъсната
промяна никога не се повтаря автоматично. Вижте
[Импорт на терминология](terminology-import.bg.md) за договорите за пакет,
манифест, въвеждане в експлоатация, връщане, поверителност и възстановяване на
сървъра.

## Достъп

Нормалният адрес е:

```text
https://<clinical-domain>/status/
```

Caddy допуска този path само от `HOSPITAL_STATUS_ALLOWED_CIDRS`; след мрежовата
проверка Status продължава да изисква вход. Задайте в `.env` точните болнични
management, VPN или trusted LAN мрежи, които трябва да имат достъп. Не
задавайте неограничен public range.

Status слуша и на HTTPS port `3443`, публикуван само на `127.0.0.1` на appliance
host. Ако Caddy или clinical stack не са достъпни, създайте tunnel от
администраторска workstation:

```sh
ssh -L 3443:127.0.0.1:3443 appliance-admin@hospital-host
```

След това отворете:

```text
https://localhost:3443/status/
```

Fallback използва специфичен за инсталацията self-signed certificate за
`localhost`, затова се очаква browser trust warning, освен ако болничният ИТ
екип изрично не му е добавил доверие. Оставете SSH session отворена, докато
използвате tunnel. Port `3443` никога не трябва да се публикува на host address,
различен от loopback.
Инсталацията и обновяването запазват изправния fallback certificate, докато му
остават поне 30 дни, и заменят изтичаща, повредена или несъответстваща двойка
едва след проверка на пълния заместител. Постоянен timer на сървъра повтаря
проверката два пъти дневно, рестартира само Status след подмяна и изтрива
трайния маркер за презареждане едва след като loopback listener подаде
fingerprint на заместителя. Проверката използва общото заключване за архивиране
и обновяване и затова изчаква по време на архивиране, миграция на базата данни или
активиране на версия. Наблюдението на сървъра включва този сертификат
заедно с двете public TLS identities. Ако self-signed сертификатът е бил
изрично добавен като trusted, след подмяната може да е необходимо това да се
направи отново.

Сигналът от сървъра съдържа само фиксирани състояния `clear`, `present` или
`invalid` за дневника при възстановяване и заключването при активиране на
версия. Status ги показва като отделни двуезични компоненти за
безопасност; никога не получава дневника, пътя, името на базата, идентичността
на архива, процеса или часа. Собствено наблюдение на болницата чрез Nagios/Icinga
може да използва командата с фиксиран изход, описана в
[Наблюдение на сървъра без лични данни](host-observability.bg.md).

## Какво остава достъпно при прекъсване

При спрян clinical API или database Status продължава да предоставя своя вход,
преките резултати, които все още може да измери, и запазената история.
Информацията, която може да дойде само от API aggregate snapshot, изрично става
unknown или stale; не се показва като healthy. Status пази live state в паметта
при неуспешен запис в историята и отчита history storage като degraded.

Нормалният адрес `/status/` изисква Caddy. Loopback listener е fallback при
недостъпен Caddy. Никой от двата маршрута не работи при загуба на сървъра,
Docker daemon, Status container или volume, електрозахранването или болничната
мрежа. Затова host health, RAID/storage, UPS, Docker и network monitoring
остават отговорност на болничния ИТ екип.

## Безопасни operational events, не journals

Страницата получава само versioned, allowlisted event codes с малки позволени
факти, например failure category или HTTP status. Тя отказва свободен текст,
неизвестни полета, nested objects, прекомерни bodies, неизвестни producers и
стари или бъдещи events. Aggregate snapshot по същия начин съдържа counts,
states, versions, dates и ограничени storage measurements, а не clinical
records.

Оперативните feeds никога не приемат Docker logs, stack traces, request bodies,
patient identifiers, email addresses, case IDs, database rows или произволни
application messages. Status отделно съхранява email на appliance operator като
част от своите login credentials. Raw service logs остават host-only
диагностичен интерфейс:

```sh
docker compose logs --since 1h api
docker compose logs --since 1h status
```

Compose прилага rotation на тези локални logs. Този appliance няма Sentry SDK,
external log drain или external telemetry service. Release gates налагат както
забраната за external telemetry, така и safe-runtime-log policy.

## Данни за достъп на appliance administrator

Инсталаторът пита веднъж за първоначалната парола на clinical administrator.
Същите email и парола могат да се използват за вход в clinical application и
Status, но двата продукта съхраняват отделни password hashes в отделни бази
данни. Те не споделят hash, session, cookie или live database lookup.
Monotonic credential generation позволява monitor да отчете несъответствие
между двата verifiers.

Паролата е само първата стъпка на входа. При първия вход в Status за дадено
поколение на данните за достъп сканирайте локално генерирания QR код с
приложението за удостоверяване на болничния ИТ екип (или въведете ръчния ключ),
след което въведете шестцифрения TOTP. Status показва десет еднократни кода за
възстановяване точно веднъж. Преди да продължите, съхранете ги офлайн в
хранилището за пароли на болничния ИТ екип; притежаването на един код е
достатъчно за един нормален вход като системен администратор. Status пази само
обвързани SHA-256 хешове на кодовете и отказва повторна употреба както на код за
възстановяване, така и на вече приета TOTP времева стъпка.

Промяната или прехвърлянето на данните за достъп до системата премахва MFA
материалите на старото поколение. Затова новият посочен системен администратор
настройва свое приложение при първия вход и получава нов комплект от десет
кода. Ако отделният MFA ключ на Status бъде изгубен, а Status volume остане,
използвайте аварийния вход от конзолата и поддържана смяна на данните за достъп;
не редактирайте SQLite и не копирайте MFA ключа на клиничните администратори в
Status.

Изпълнявайте credential operations само от appliance host. Паролите се четат
от скрит standard-input prompt и никога не се приемат като command-line
arguments или environment variables.

Проверете синхронизирането, без да извеждате email или hash:

```sh
./scripts/appliance-operator.sh state
./scripts/appliance-operator.sh verify
```

Поддържаните операции са:

| Необходимост | Команда | Какво въвежда операторът |
|---|---|---|
| Първо обновяване към версия със Status | `./scripts/appliance-operator.sh initialize` | Съществуващ активен clinical `ADMIN`, след това общата парола на appliance два пъти |
| Смяна на текущата парола на appliance | `./scripts/appliance-operator.sh rotate` | Email на текущия operator, след това новата парола два пъти |
| Определяне на друг administrator | `./scripts/appliance-operator.sh transfer` | Различен съществуващ активен clinical `ADMIN`, след това новата appliance парола на този administrator два пъти |
| Възстановяване на изгубен или празен Status credential store | `./scripts/appliance-operator.sh repair-status` | Текущия clinical appliance operator и съвпадащата парола |
| Съгласуване след възстановяване на по-стара база данни | `./scripts/appliance-operator.sh reconcile-restore` | Активен `ADMIN` в възстановената база и избраната парола |
| Преглед на generations | `./scripts/appliance-operator.sh state` | Нищо; identity или verifier не се извеждат |
| Доказване, че stores съвпадат | `./scripts/appliance-operator.sh verify` | Нищо; успехът не извежда текст |

`scripts/update.sh` автоматично открива първото обновяване към версия със
Status и изисква изричен избор `initialize`. Никога не отгатва кой съществуващ
administrator трябва да стане appliance operator.

Промените на данните за достъп се координират като prepare, промяна в clinical
database и Status commit. Ако команда бъде прекъсната, изпълнете отново същото
действие със същите предложени данни. Не изтривайте Status data и не
редактирайте ръчно нито една база. `abort-pending` е безопасно само когато
clinical database не е достигнала pending generation; командата проверява
условието и отказва unsafe abort:

```sh
./scripts/appliance-operator.sh abort-pending
```

### Console recovery

Ако нормалните данни за достъп до Status не могат да се използват, host
administrator може да издаде еднократен token:

```sh
./scripts/appliance-operator.sh recovery-token
```

По подразбиране token изтича след 15 минути. Поставете го в **Еднократен token
за възстановяване** на страницата за вход в Status. Издаването и използването се
записват като security events. Token дава временен достъп до Status; не променя
clinical или Status паролата. Използвайте `rotate`, `transfer`, `repair-status`
или restore workflow, за да поправите основното credential state.

## Локален development harness с два контейнера

Бързият harness стартира точно два постоянни контейнера:

1. истинския production Status image; и
2. един synthetic appliance fixture, който реализира само безопасните probe,
   snapshot, event и signal contracts.

Стартирайте го с:

```sh
./scripts/dev-status.sh up
```

Командата извежда локалните URL и development-only credential. Проверявайте
детерминирани състояния, без да стартирате clinical appliance:

```sh
./scripts/dev-status.sh scenario api-down
./scripts/dev-status.sh scenario database-down
./scripts/dev-status.sh scenario backup-failure
./scripts/dev-status.sh scenario healthy
./scripts/dev-status.sh logs
./scripts/dev-status.sh down
```

`reset` премахва harness volumes и ги създава отново:

```sh
./scripts/dev-status.sh reset
```

Изпълнете автоматизирания resilience smoke test с:

```sh
./scripts/test-status-dev.sh
```

Той доказва, че работят точно очакваните два контейнера, проверява входа в
Status през двата listeners, симулира прекъсване на API и database, рестартира
Status и проверява, че authentication/history остават в Status-owned volume.
Не стартира PostgreSQL, истинските API, Caddy, backup, worker, Web, PWA или
Browser, затова не може да потвърди реалната им интеграция.

## Пълна приемателна проверка на appliance

Пълното disposable упражнение е:

```sh
./scripts/test-install.sh
```

То инсталира истинския appliance от нулата, потвърждава двата входа с едни и
същи данни, проверява, че plaintext паролата не е запазена, сменя
координираните credentials, създава истинските backup/worker signals, спира API
и PostgreSQL заедно, след което спира всяка друга наблюдавана услуга и доказва,
че loopback fallback на Status остава достъпен.

Този тест умишлено е destructive за disposable Compose project, който създава.
Отказва да се изпълни, ако `.env` вече съществува или host ports 80/443 вече са
заети. Никога не го изпълнявайте върху инсталиран болничен appliance. Harness с
два контейнера е бързият development test; пълното упражнение е release
acceptance test. Никой от тях не заменя ръчните clinical и disaster-recovery
проверки в [Проверка на версията](release-validation.bg.md).
