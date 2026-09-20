# Обновявания и съвместимост

**Български** | [English](updates-compatibility.md)

## Как сайтът получава версия

**Версии, които все още съществуват.** На 15 септември 2026 г., преди първите
изпълнения за 1.4.0, версиите от 1.0.0 до 1.3.2 бяха оттеглени: техните GitHub
Releases и GHCR образи бяха изтрити, а git таговете им са запазени като
история. Остава 1.3.3 като последната работеща версия преди 1.4.0. 1.4.0 се
инсталира наново; никоя болница не използва по-ранна версия, затова няма път за
обновяване от 1.3.x.

**При преминаване от 1.4.0 или 1.4.1 използвайте офлайн пътя.** Тези версии
носят собствено копие на проверката на публикуваните файлове, а то предхожда
Windows комплекта, който работният процес вече публикува до файловете за
инсталиране. Затова те отказват всяка версия, която съдържа такъв комплект, с
`UPDATE_RELEASE_METADATA_INVALID` и „публикуваният списък с файлове липсва, е
дублиран или съдържа неочакван файл“. Това не се отнася само за страницата за
състояние: всеки път, който разрешава публикувано GitHub издание, стига до
същото, включително от конзолата. Съберете седемте файла за инсталиране в
директория, както е описано в **Сайтове без достъп до регистър** по-долу, и
инсталирайте оттам. От 1.4.2 нататък комплектът се приема и обновяването
онлайн работи нормално.

Hospital images се изграждат еднократно като CI candidate от точен tag
`hospital-MAJOR.MINOR.PATCH`. Поддържащият преглежда обвързаните с run
publication request и SHA-256 на release lock, след което ръчно задейства
публикуването с произведения offline необработен Ed25519 signature и отделно
записания му SHA-256. Публикуването проверява signature два пъти, след което
повишава вече тестваните image identities, без да ги изгражда повторно. Всичките
десет release images се изграждат и сканират в публичния GHCR namespace на LOSPOR
и се записват в release lock. Клиентът не ги компилира и никога не използва
`latest`.

Хранилището, GitHub Releases и GHCR packages са публични; публичността не е
част от модела на доверие. Акаунтът на
поддържащия използва MFA, публикуването изисква отделни version-bound
потвърждения за публикацията и Immutable Releases, а полученият GitHub Release
трябва да е immutable. SHA-256 и image-digest проверките откриват промени спрямо
публикуваните и отделно записаните стойности, но сами по себе си не доказват кой
ги е публикувал: ако GitHub хранилището/акаунтът или USB custody chain са
компрометирани и всички сравнявани записи са заменени последователно, тези
проверки не могат да открият замяната.

Затова release се подписва и с Ed25519 key, който поддържащият пази извън
GitHub, а сайтът фиксира този ключ еднократно при инсталирането. Само
компрометиране на GitHub тогава не може да създаде release, който appliance ще
приеме, и appliance може да удостовери update, без човек предварително да
получи digest по телефона — условието за безопасно unattended download. Сайт,
който още не е фиксирал ключа, продължава да проверява всяка версия спрямо
получения digest, точно както преди. За пазенето и смяната на ключа вижте
[Проверка на версията](release-validation.bg.md).

Съществуващата версия е неизменяема. Промени в Web, PWA, Browser, API, Core,
clinical logic, migrations или включени reference data изискват нова версия,
нов candidate build и нова ръчна publication transaction. Инсталирана болнична
система никога не изтегля source code от Git. Site configuration, credentials,
runtime data и patient data остават в постоянното appliance storage и не се
заменят при image update.

За online update подгответе един точен immutable GitHub Release. Използвайте
**Изтегли и провери** в удостоверената Status release page или host-only
командата, когато инсталацията умишлено работи в console-only mode:

```sh
sudo sh /opt/lospor-hospital/current/scripts/prepare-verified-release.sh 1.4.3 -
```

Root-owned preparer приема само semantic version и незадължителен request ID с
фиксирана форма. Сам избира repository, tag, asset names, paths и verification
commands. Release metadata и assets се
четат анонимно от публичния GitHub Release, а образите се изтеглят анонимно в
throwaway Docker configuration, която се изтрива при всеки exit path. Системата
не пази данни за достъп до GitHub или регистъра. Не изпълнявайте
`docker login` ръчно.

Preparation отказва draft, prerelease, mutable release, грешен tag или commit,
грешен publication marker, липсващ/допълнителен/повторен asset, несъвпадащи
GitHub asset size/digest, unsafe redirect, невалиден lock sidecar, липсващ/лош
Ed25519 signature, недекларирана migration boundary, неподдържана rollback
policy или OCI identity mismatch. След това изтегля точните registry digests и
проверява избрания `linux/amd64` manifest, image configuration digest и
подредените root-filesystem diff IDs. Едва след успех на всяка проверка
публикува атомарно root-owned prepared-release descriptor. Работещите услуги не
се засягат.

### Установяване, че има обновяване

Свързан сайт може да попита registry какво е публикувано:

```sh
sudo sh /opt/lospor-hospital/current/scripts/check-for-update.sh
```

Командата само чете. Не изтегля, не променя и записва отговора в
`.data/update-status.tsv` за последваща проверка. Exit status 0 означава, че
въпросът е получил отговор — независимо дали има update. Exit status 1 означава,
че не е получен отговор, а записаното състояние е `unknown`, никога `current`:
appliance не трябва да съобщава, че е актуален, защото мрежата не работи.

Безопасно е да се стартира от `cron` или systemd timer, защото не може да
промени инсталираната версия.

### Изтегляне без прилагане

Изтеглянето на няколко GiB и рестартирането на appliance са две различни
събития и не е нужно да се случват заедно. Preparation извършва download и
пълната identity verification, след което спира:

```sh
sudo sh /opt/lospor-hospital/current/scripts/prepare-verified-release.sh 1.4.3 -
```

Нищо работещо не се засяга. След това приложете само точния descriptor, записан
от preparation:

```sh
sudo sh /opt/lospor-hospital/current/scripts/apply-prepared-release.sh 1.4.3 -
```

Apply командата проверява отново descriptor, installed identity, от която е
подготвен, capacity, current и candidate images и activation locks. Не може да
ѝ се подаде избран от caller lock, directory, digest, repository, tag, Compose
file или command.

Това е препоръчителният модел за работеща болница: изтегляне през нощта и
прилагане в избран промеждутък между оперативните програми.

### Защо изтеглянето на lock от GitHub е безопасно

`.sha256` sidecar продължава да открива случайна повреда, но не е trust
boundary: нападател с контрол над GitHub може последователно да замени и lock,
и неговия digest. Фиксираният Ed25519 public key е независимият trust anchor.
Private key се пази извън GitHub и Actions, а preparation изисква валиден raw
signature върху точния lock. Тя обвързва и immutable metadata на GitHub Release
с прегледаните publication run, attempt, commit, lock SHA-256, signature
SHA-256 и точния final asset set. Само компрометиране на GitHub следователно не
може да създаде приемлив update.

## Сайтове без достъп до registry

Болнична мрежа може да инсталира и обновява без internet или registry access.
Поставете пълния final release asset set в една директория: manifest, deployment
archive, security-evidence archive, release lock, каноничен `.sha256` sidecar,
raw 64-byte `.sig` и всички подредени offline parts. За съществуваща инсталация
изпълнете:

```sh
sudo sh /opt/lospor-hospital/current/scripts/load-offline.sh \
  /media/lospor-1.4.3/lospor-hospital-1.4.3-release.lock \
  /media/lospor-1.4.3/lospor-hospital-1.4.3-release.lock.sha256 \
  /media/lospor-1.4.3
```

Първата инсталация още няма trusted `current` launcher. Използвайте
[`losporctl-install.sh`](release-validation.bg.md#проверка-и-инсталиране-при-клиента):
той проверява подписания lock и deployment archive, извлича го в нова bootstrap
directory, свързана с appliance home, фиксира ключа и предава управлението на
водената инсталация. Не изпълнявайте launcher направо от непроверен archive и
не подавайте custom install command.

И двата launchers проверяват и stage-ват checksum-covered deployment archive,
след което извикват собствените installer или updater на candidate kit. Така
по-стар installed Compose file или script не може да управлява по-нов набор
images. Само успешно activation обновява non-secret installed release
path/version/lock state; downgrades и same-version lock changes се отказват
преди backup или migration.

Всяка версия декларира една от две rollback policies. `service-compatible` се
приема само с подписано, hash-bound доказателство, че точното старо приложение
е преминало точната нова schema за декларирания прозорец. `backup-required`
означава, че отказ след database mutation не може да се възстанови чрез
догадка, че старите услуги са съвместими; activation запазва lock и изисква
удостоверения, проверен pre-update backup и техник. Версия 1.3.0 умишлено е
`backup-required`, защото за нея няма изпълнено old-app/new-schema
доказателство. Никога не добавяйте reverse SQL и не маркирайте версия като
`service-compatible` без задължителния evidence artifact.

Candidate workflow разделя compressed archive на parts не по-големи от 1.9
GiB. Actions пази големия candidate веднъж; и двата publication stages
независимо изтеглят и проверяват същия artifact и не се качва втори multi-GiB
Actions artifact. Standalone image lock и `publication-request.tsv` са
candidate-only provenance inputs и отсъстват от final release assets. Candidate
умишлено е unsigned; manual publication transaction добавя проверения raw
signature към точния final asset allowlist.

Offline launcher проверява точния lock-sidecar syntax, size и SHA-256 на всяка
part, пълния gzip stream и portable identity/platform на всичките десет loaded
images, преди да започне update. Sidecar открива повреда, но нападател, който
може да замени едновременно него и lock, може да създаде съвпадаща двойка.

При update, пренасян на ръка, поддържащият изтегля assets само от прегледания
immutable GitHub Release върху чист криптиран USB, проверява bundle,
записва неговия lock SHA-256 и запазва физически контрол до on-site
инсталацията. Не смесвайте assets от различни версии и не използвайте носителя
за несвързани файлове. Вижте [Проверка на Hospital
версия](release-validation.bg.md#процедура-за-версия-с-един-поддържащ) за
пълната процедура за candidate, publication, USB и installation.

## Изграждане от source

Пропускането на `compose.release.yaml` изгражда от vendored source. Това е
development path. `update.sh` открива resolved Compose model. Release model
спира безопасно, освен ако launcher с integrity verification не подаде своето
краткотрайно verification state; всяка release service използва
`pull_policy: never`, така че Compose не може тихо да замени проверен image при
стартиране на appliance.

Hospital PostgreSQL image остава съвместим с Debian Bookworm/glibc и volumes,
създадени от `postgres:17.6-bookworm`, но изгражда PostgreSQL 17.11, `pg_trgm`
и `pgcrypto` от upstream tarball с проверена контролна сума. Runtime libraries zlib 1.3.2 и
ACL 2.4.0 също се изграждат от source, а LDAP, libxml, UUID, readline/ncurses и
неизползваните package tools отсъстват. CI отваря точен 17.6 `en_US.utf8` data
volume в production image, сравнява collation metadata, ordering и indexed
lookup semantics и отделно доказва custom-format backup/restore и всички
migrations.

Patch update 17.11 отваря съществуваща version-17 data directory in place; не
изисква dump/restore или `pg_upgrade`. Преди migrations appliance отказва
logical-decoding slots и custom output plugins (Hospital не използва нито
едното), така че migrations не могат да издават WAL в неподдържаното състояние.
След migrations следва документираната PostgreSQL remediation чрез `ANALYZE` на
всяка persistent user table с GIN index, след което спира безопасно, ако
обновените `pg_class.reltuples` estimates останат non-finite или negative.
Restore изпълнява cluster-level preflight преди замяната на базата, след което
прилага същия migration/postflight ред; първата инсталация прави същото.

## Какво прави update.sh, по ред

1. създава и проверява database backup;
2. проверява identities на всичките десет loaded images за release или изгражда
   vendored source в development mode;
3. инсталира runtime secrets;
4. стартира PostgreSQL, изчаква ready и отказва неподдържани logical-decoding
   slots или custom output plugins;
5. прилага forward database migrations;
6. поправя и проверява статистиките на GIN таблиците с `ANALYZE`;
7. създава или обновява ограниченото Status database-probe role;
8. стартира Status независимо;
9. проверява съвпадението между clinical и Status credential generations; и
10. стартира останалите услуги и изпълнява health checks.

Първото обновяване от версия без Status изисква изричен избор на съществуващ
активен clinical `ADMIN` за appliance operator. `update.sh` пита, когато и двата
credential stores още не са инициализирани. Никога не избира administrator
мълчаливо. Следващи updates спират безопасно при pending credential transaction
или несъответствие на generations; прегледайте безопасното state с:

```sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh state
```

Database migrations са backward-compatible само когато подписаното
compatibility evidence на версията доказва точно това. Никога не връщайте
schema назад с ad hoc SQL. За `backup-required` release възстановете
удостоверения backup, направен преди mutation, чрез поддържания emergency
restore workflow.

## Съвместимост на обмена

Exchange manifest е изрично версиониран. Central обявява поддържаните версии, а
Hospital отказва несъвместимо enrollment. Когато съществува втора manifest
version, Central трябва да запази предишната production версия поне 24 месеца
или за договорения hospital upgrade window — което е по-дълго. Това е support
policy, а не разрешение за тиха data conversion.

## Прилагане на обновяване от Status page

Appliance в болнична LAN често не е достъпен по SSH, а човекът, който забелязва
update, рядко има console. Затова status page може да поиска обновяване, а host
agent го прилага.

Разделянето е важно. Status работи без привилегии, няма Docker socket и монтира
state на agent read-only — физически не може да приложи release, което прави
безопасно предлагането на control от browser. Той записва request в директория
на хоста; agent го прочита и решава.

Инсталирайте и проверете каноничния systemd agent:

```sh
sudo sh /opt/lospor-hospital/current/scripts/install-update-agent.sh
```

Ако сайтът умишлено избере updates през host console, вместо това запишете
истинския режим:

```sh
sudo sh /opt/lospor-hospital/current/scripts/install-update-agent.sh --console-only
```

Installer записва allowlisted root-only environment file, проверява unit,
enable-ва го, изчаква fresh heartbeat и записва non-secret mode marker.
`doctor.sh` приема enable-нат, active, fresh canonical agent като healthy,
изричен console-only marker като healthy, а настроен, но missing/stale agent
като failure. Status никога не предлага тихо browser controls при липсваща
host truth.

### Какво вижда операторът

`/status/release` посочва какво е инсталирано, какво е публикувано и кой е
точният подписан release, който е подготвен. Download е едно натискане, защото
не променя нищо работещо. Apply е две: първото не извършва действие и показва
потвърждение, което ясно казва, че clinical services ще се рестартират, а при
`backup-required` — че отказ след migration изисква verified-backup recovery
от техник.

Извън maintenance window заявката е **queued**, а не отказана, и страницата
показва времето, когато ще се изпълни. Незабавното apply е отделен control със
собствено натискане, така че заобикалянето на прозореца винаги е умишлено.

### Какво отказва agent

- Malformed, linked, multiply-linked, oversized, stale или replayed request.
  Browser може да подаде само action, random request ID, semantic version,
  creation time и maintenance-window intent; не може да подаде path, URL,
  digest или command.
- Request, подготвен от различна installed identity, или Apply за нещо,
  различно от точния root-owned prepared descriptor.
- Apply от console-recovery Status session. Recovery може да подготви update,
  но не може да рестартира clinical services.
- Каквото и да е, докато съществува `release-activation.lock`. Lock означава,
  че apply работи или rollback не е завършил и само човек може да различи
  случаите; agent спира и го съобщава. **Никога не премахва lock.**
- Работа, която влиза в конфликт с backup, restore, terminology import, друга
  preparation, недостатъчен Docker/data/backup capacity или невалиден/върнат
  назад часовник.

Неуспешният apply е terminal. Една request, един attempt: agent, който повтаря
след reboot, би превърнал едно намерение на operator в два опита върху clinical
database.

Приетите requests, transitions и terminal results са durable. Scheduled
request преживява restart до следващото истинско отваряне в настроената IANA
timezone, включително daylight-saving changes. Restart по време на безопасна
preparation може да възобнови точната in-flight request; restart след
нееднозначно Apply винаги спира в `NEEDS_OPERATOR` и никога не повтаря database
mutation.

### Проверка на прекъснато activation

Никога не изтривайте ръчно `.data/release-activation.lock`. Първо изпълнете
read-only двуезична проверка:

```sh
sudo sh /opt/lospor-hospital/current/scripts/recover-release-activation.sh inspect
```

Recovery tool проверява fixed journal, original boot/process identity,
old/candidate roots и lock hashes, rollback policy и записания pre-update
backup. `resume-rollback --confirm` е достъпно само за доказан
`service-compatible` release. При `backup-required` завършете authenticated
emergency restore на точно записания backup; след това `verify-and-clear
--confirm-clear` изисква root-only completed restore proof, current release
identity, image verification и `doctor.sh`, преди да архивира journal и да
премахне само познатите lock objects.

### Ако agent спре

Собственият му ред в status page става degraded след десет минути без heartbeat.
Без това спрял agent би останал невидим, докато update check стане stale след
четиринадесет дни — твърде дълго за откриване, че механизмът за прилагане на
security fixes не работи.
