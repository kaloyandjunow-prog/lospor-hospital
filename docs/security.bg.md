# Модел за сигурност

**Български** | [English](security.md)

## Задължителни контроли

- full-disk encryption на хоста и всяко местоназначение за резервни копия;
- TLS за целия потребителски и Central трафик;
- mutual TLS и manifest signatures за доставка Hospital → Central;
- VPN или identity-aware достъп за научни цели и администрация;
- локални акаунти с минимални права и защитени administrator credentials;
- host firewall, автоматично инсталиране на security patches, malware/EDR
  policy, NTP и централизирано наблюдение;
- offline escrow за patient, pseudonym, site-delivery и database recovery keys.

Съдържанието на `secrets/`, `.env`, `backups/`, PostgreSQL volumes и runtime
export volumes е чувствително. То е изключено от Git, но въпреки това изисква
подходящи filesystem permissions и криптирани носители.

## Доверие при разпространение на софтуерна версия

Софтуерните версии на Hospital използват detached raw 64-byte Ed25519 signature
върху точния `release.lock`. Поддържащият генерира и пази release private key
извън GitHub и никога не го предоставя на Actions, repository secrets, USB
носителя за инсталиране или болница. Сайтът фиксира прегледания public key само
след съпоставяне на неговия fingerprint по отделен канал. Специфичните за
инсталацията ключове в `secrets/api/` остават необходими за обмен Hospital →
Central и никога не трябва да се приемат като данни за достъп за разпространение
на софтуер.

Границата на доверие за разпространението включва:

- публичното GitHub хранилище, неговите releases и публичните GHCR packages;
- GitHub акаунта на поддържащия, неговите MFA, recovery methods, sessions и
  scoped tokens;
- точния CI candidate, задействан от tag, и неговите test/security evidence;
- отделното ръчно решение на поддържащия за публикуване;
- Immutable Releases на ниво хранилище;
- SHA-256 проверки на release lock и всеки payload, както и точните registry,
  platform-manifest, configuration и root-filesystem identities; и
- непрекъснатия физически контрол на поддържащия върху USB носителя за
  инсталиране; и
- Ed25519 signature, проверен спрямо независимо фиксирания release public key.

Каноничният sidecar `release.lock.sha256` открива повреден или променен lock.
Провереният lock след това открива променени payload bytes и image identities.
Сам по себе си SHA-256 доказва само вътрешно съответствие със стойностите,
изтеглени или записани от GitHub. След като сайтът е фиксирал release public
key, Ed25519 signature независимо удостоверява точния lock: нападател, който
контролира само GitHub или заменя USB bundle, не може да създаде приемлив lock.
Сайт, който умишлено няма фиксиран ключ, остава на per-release out-of-band
digest verification. Immutable Releases предотвратяват замяна след
публикуване, но не заместват независимия signature.

Затова поддържащият трябва да използва MFA, да пази account recovery material
offline, да преглежда активните sessions и tokens и да запази repository write
permission само за release акаунта. Болниците не пазят registry credential;
публичният release е достъпен за всеки и се приема само чрез подписа си. Непосредствено преди изпращане
потвърдете визуално настройката Immutable Releases и въведете и двете точни
version-bound потвърждения, изисквани от workflow. Workflow не притежава
administrator token за тази проверка на настройката; след публикуване изисква
GitHub да отчете получената версия като immutable. Спрете публикуването, ако
candidate run, attempt, commit, tag, очакваният lock hash или настройката не
съответстват на независимо запазения release record.

За физическо предаване изтеглете окончателните assets от immutable
GitHub Release в нова празна директория на контролирана workstation. Проверете
lock sidecar, raw `release.lock.sig` срещу прегледания public key и пълния
payload set (manifest, deployment archive, security evidence и всяка offline
image part), преди да откачите чистия криптиран USB носител. Portable image
identities по-късно се проверяват от production online
launcher след digest-pinned pulls или от offline launcher след зареждането на
проверените image parts. On-site bootstrap при първо инсталиране проверява
deployment archive, преди да извлече вградения launcher, и след това отново
проверява пълния asset set. Запишете device identifier, version, lock hash,
download time и всяка промяна в custody. Поддържащият пази носителя под личен
контрол и извършва инсталирането на място; носителят не се използва за други
файлове.

Ако е възможно да са компрометирани хранилището/акаунтът, publication run,
release record, signing workstation или key, review workstation или USB
custody chain, спрете инсталирането и публикуването. Отменете засегнатите
sessions и tokens; запазете run, audit, endpoint,
signing и media evidence; оценете вече инсталираните сайтове; и издайте нова
версия от прегледан чист commit и candidate. Компрометиран release-signing key
изисква изричен key rotation и нов fingerprint, предаден на всеки сайт през
първоначалния out-of-band канал. Само повторното изчисляване на hashes от
съмнителния bundle не е достатъчно доказателство за възстановяване.

## Разделяне на тайните

Тайните са разделени по runtime граници:

- `.env` съдържа конфигурацията на appliance и application/database secrets;
- `secrets/api/` съдържа Hospital signing keypair, Central client key и CSR, а
  след свързването — client certificate и CA, издадени от Central; и
- `secrets/status/` съдържа Status snapshot/event tokens, rate-limit key,
  ограничената database-probe парола и TLS материалите за резервния loopback.

API контейнерът монтира `secrets/api/` и само отделните Status tokens за
snapshot и event producer. Не може да вижда останалата директория с тайни на
Status. Status не може да вижда API/Central key directory, clinical database
credential, patient-data volumes или Docker socket. Неговото PostgreSQL role
може да се свърже и изпълни `SELECT 1`, но няма права върху schema, table или
sequence.

## Кои ключове могат да се сменят

Промяната на файл не е равнозначна на безопасна смяна на данни за достъп.
Обикновените данни за достъп до базата, сесиите, работните/планираните задачи и
вътрешната връзка със Status използват поддържаната транзакция
подготовка/застъпване/прилагане/проверка/отмяна, описана в
[Смяна на оперативните данни за достъп](secret-rotation.bg.md). Независимата
парола на оператора в Status се сменя със
`scripts/appliance-operator.sh rotate`. Не редактирайте ръчно нито едно от
двете хранилища за проверка.

Смяната на ключа за сесии умишлено обезсилва всички текущи сесии. При токените
за работните услуги и Status временно се приемат текущата и предишната стойност,
работната услуга преминава към новата, след което старата се премахва и се
доказва, че е отказана. PostgreSQL ролята и всички зависими услуги преминават
под общото заключване за поддръжка. Фиксираният одит съдържа само обхват,
поколение, време, идентификатор на транзакцията и етап.

Самоличността на клиента/подписването към Central още не се поддържа от тази
обикновена команда. Необходим е разрешен от Central протокол за замяна, който
запазва същия сайт, поредност на партидите, потвърждения и история на
оттеглянията. Прякото презаписване на файловете е забранено.

**Не подлежи на смяна: `HOSPITAL_PATIENT_HMAC_KEY`.** Този ключ извежда
`PatientLink.identifierHash`, който е unique index за намиране на пациент, и
участва във всеки pseudonym, изпратен към Central. Замяната му не пре-шифрова
нищо — прави всяка съществуваща връзка ненамираема, защото същият patient
identifier вече се хешира до стойност, която не съвпада със записан ред.
Предишните операции на пациента престават да се свързват със следващата, а
всеки човек, вече изпратен към Central, придобива втора несвързана identity.

Няма процедура за re-key и тази версия не добавя такава. Създаването ѝ означава
повторно извеждане на всяка локална връзка и съгласуване на резултата с Central
— координирана migration между две системи, а не script.

Третирайте ключа като escrow-only: архивирайте го със същата грижа като базата
данни, пазете го през целия живот на инсталацията и не го сменяйте като част от
рутинната credential hygiene.

**Не подлежи на смяна във версия 1.2: `OMOP_PSEUDONYM_SALT`.** Системата
използва точния каноничен текст на солта, за да извежда устойчиви числови
изходни идентификатори в OMOP проекцията. Подмяната му би дала различни
идентификатори на възстановени или ново проектирани записи и би прекъснала
връзката със съществуващите проекции. Пазете суровата стойност в шифрованото
защитено копие на `.env` през целия живот на инсталацията. Нейният нетайен
SHA-256 отпечатък се записва в `.env`, удостоверява се във всеки архивен
манифест и се сравнява преди възстановяването да може да промени база данни.

Ако наистина е компрометиран, смяната му не е решение и няма да отмени
разкриването. Решението е процедурата при инцидент по-долу и решение с Central
относно идентификаторите на засегнатия сайт.

**Все още не подлежи на смяна: `HOSPITAL_PATIENT_ENCRYPTION_KEY`**, по сходна,
но по-лека причина. Редовете `PatientLink` съдържат версия на формата/ключа за
шифротекста, но системата още няма хранилище за запазени стари ключове и
транзакционна процедура за повторно шифроване. Замяната на единствения настроен
ключ оставя съществуващия шифротекст нечетим. Полето за версия не трябва да се
представя като поддържана процедура за смяна.

HMAC/криптографските ключове за пациентите, ключът за псевдоними при износ,
солта за OMOP псевдоними, криптографските ключове за MFA на
администраторите/Status, ключът за запечатване на външния ИИ и ключът за
удостоверяване на архивните манифести остават тайни, обвързани с миграция и
защитено резервно съхранение. Отпечатъците им карат възстановяване с грешна
тайна да спре безопасно; те не правят пряката замяна безопасна.

## Достъп и данни за достъп до Status

Нормалният маршрут `/status/` изисква едновременно адрес в
`HOSPITAL_STATUS_ALLOWED_CIDRS` и независимия вход в Status. Резервният listener
е свързан към loopback на хоста и трябва да се достига през удостоверен SSH
tunnel. `HOSPITAL_STATUS_PORT` променя само номера: appliance винаги го свързва
към loopback и това не трябва да се променя. Не публикувайте Status port към LAN
или public interface.

Първоначалните email/парола на appliance се проверяват независимо от clinical
database и Status SQLite. За откриване на drift се сравняват credential
generations, не password hashes. Използвайте `scripts/appliance-operator.sh` за
всяко инициализиране, rotation, transfer, repair и reconcile след restore;
никога не редактирайте директно нито едно credential store. Console recovery
tokens са еднократни, по подразбиране изтичат след 15 минути и дават достъп
само до Status.

## Журнали и telemetry

Status приема само строги versioned aggregate snapshots, service markers с
фиксирана schema и разрешени operational event codes. Тези оперативни feeds
отказват произволен текст и не събират clinical payloads, raw identifiers,
request bodies, stack traces или Docker logs. Status съхранява email на
appliance operator само в своя отделен login credential store. Raw service
logs остават локално на host на appliance и размерът им се ограничава чрез
Compose rotation.

Appliance умишлено няма Sentry integration, external log drain или external
application telemetry. Версиите трябва да преминават:

```sh
npm run verify:no-external-telemetry
npm run verify:safe-runtime-logs
```

## Минимизиране на данните

Clinical model отказва вероятни директни идентификатори. Patient linkage е
отделна криптирана локална грижа. Central получава само одобрената
pseudonymized OMOP projection и technical provenance, необходим за проверката ѝ.

## Жизнен цикъл на сертификатите

Hospital site signing и mTLS keys са специфични за инсталацията и служат само
за обмен Hospital → Central. Нямат отношение към проверката на software
release. Сменяйте site keys при съмнение за компрометиране и по графика на
институцията. Central трябва да отмени сайт, преди да приеме заместваща
identity. Standalone setup създава CSR, но не и client certificate или Central
CA; те пристигат само чрез изрично свързване с Central. Отделният self-signed
Status fallback certificate е валиден единствено за loopback страницата
`localhost` за операции и няма роля в Central.

## Правило при инцидент

При съмнение за key compromise, unauthorized export, database exposure или
необясним revision mismatch:

1. спрете доставката към Central, без да изтривате опашката;
2. запазете logs, receipts и host evidence;
3. отменете сайта в Central;
4. уведомете болничния процес по информационна сигурност/защита на данните;
5. възстановете услугата само с прегледани заместващи credentials.

Стъпка 5 не включва `HOSPITAL_PATIENT_HMAC_KEY` или
`HOSPITAL_PATIENT_ENCRYPTION_KEY`. Вижте „Кои ключове могат да се сменят“
по-горе: замяната на който и да е от тях разрушава съществуващото patient
linkage, вместо да го защити, а компрометиране на HMAC key се обработва с
Central, не чрез rotation.

## Reverse proxies

Референтната Caddy услуга е public edge и не се доверява на forwarded client-IP
headers. Ако болничният ИТ екип постави друг proxy или CDN отпред, той трябва да
настрои само точните address ranges на този proxy и отново да провери всеки
VPN/LAN allowlist. Дотогава ограничените интерфейси спират безопасно зад
upstream proxy.

## Каналът за заявки за обновяване разширява възможностите при компрометиране на Status

Status може да поиска от host agent да приложи версия. Той не може да я приложи
сам — работи без привилегии, няма Docker socket и монтира state на agent само за
четене — но *е* оторизираният writer на заявката и това трябва да бъде заявено
ясно.

Следователно remote-code-execution дефект в Status app позволява фалшива
заявка. Shared secret не решава това: всяка тайна, която Status може да прочете,
за да подпише заявка, е четима и от нападател вътре в Status. Confirmation token
свързва потвърждението със session и release, което спира стара страница и
cross-site post; не спира код, изпълняван като Status.

Щетата се ограничава от собствената content check на agent. Заявката посочва
версията, която смята за инсталирана, и точната версия, която одобрява. Agent
сравнява и двете с независимо установеното от него, а
`release_state_assert_transition` вече отказва downgrade и повторно прилагане
на същата identity. Следователно най-лошият резултат от фалшива заявка е
**истинска, подписана от поддържащия, строго по-нова версия, приложена в
неудобен момент** — непланиран restart на клиничните услуги, а не произволен
код на appliance.

Това реално разширява blast radius спрямо appliance, който може да се обновява
само през console, и е цената на това сайтът да може да приложи security fix
без SSH session. Сайт, който не го желае, просто не инсталира agent: без него
status page отчита обновяванията и нищо повече, както преди.

Умишлено са добавени още две ограничения:

- **Recovery sessions не могат да прилагат версия.** Recovery token е
  break-glass средство за човек, изгубил паролата; единственото действие,
  което трябва да позволява, е поправка на данните за достъп. Agent проверява
  това независимо от Status, така че компрометиран Status не може да повиши
  собствената си session, като излъже как е удостоверена.
- **Maintenance window принадлежи на agent.** Status никога не го прочита,
  затова часовете, в които clinical services могат да бъдат рестартирани, не
  могат да се разширят от web страницата.
