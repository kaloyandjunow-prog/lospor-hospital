# Проверка на Hospital версия

**Български** | [English](release-validation.md)

Hospital release е приемлив само след успешни automated quality workflow и
Linux appliance drill. Serverless демонстрацията не е част от упражнението.

Quality workflow трябва задължително да извика пълната проверка
`npm run test:update-pipeline`. Тя обхваща update compatibility, общото
заключване за backup/update, ограниченията за capacity и retention,
възстановяването при прекъсната activation, договорите за root agent и systemd,
update credentials, координацията с terminology, host observability и анализа
на подписаните release metadata. Собствените contract tests отхвърлят release
workflow, който пропуска тази команда.

CI трябва да изпълнява и именувания gate
`npm run test:central-full-story` срещу същата прясно мигрирана disposable
PostgreSQL услуга. Той използва истинските Hospital worker и crypto path с
contract-only синтетичен Central fixture. Проверката обхваща отказ при
configured-but-unapproved export, автоматичен UPSERT на всеки подходящ
финализиран случай, подписана receipt и checkpoint, withdrawal, повторно
изпращане, отказ на невалидни receipt и checkpoint, текущата и предишната
поддържана exchange версия и PII-free доказателства за wire/UI/log/artifact.
Пропуснат PostgreSQL тест не е успех: package командата изрично включва двата
integration flags и се проваля, ако disposable базата не е достъпна.

Синтетичният fixture не доказва mTLS договаряне, deployed Central база, replay
между два независимо deployed продукта или възстановяване на мрежата. Те
остават задължителни в Linux appliance acceptance drill по-долу.

CI изпълнява и `npm run test:operator-localization`. Проверката обхваща
сдвоените български и английски operator guides, пълната структура и
technical tokens на installation guide, договорите за network и terminology,
командите с български по подразбиране, изричния избор на английски и появата на
нови prompts само на английски. Release-workflow contract отхвърля и
пропускането на тази проверка.

Clinical job инсталира Chromium за трите клиента и изпълнява пълните Hospital
Web, PWA и Research Browser Playwright suites. Избрани smoke journeys не
заместват пълните suites; release-workflow contract изисква и трите aggregate
commands. Всеки suite създава наново или seed-ва своето disposable E2E
състояние преди употреба.

### Проверка при import на локализацията в клиентите

Този import е **завършен**. И четирите owner pins — API, Web, PWA и Browser —
са напреднали спрямо своите pre-localization baselines и
`npm run verify:client-localization-release` докладва:

```
Client localization owner import and Hospital E2E evidence are complete.
```

Проверката не се удовлетворява само от pins. След като установи, че даден pin е
напреднал, тя изисква и source capabilities, и изпълнимите Playwright
доказателства по-долу, така че състоянието `ready` е твърдение за работещо
поведение, а не за номера на версии.

Изискваните owner-source capabilities са:

- Web: `src/i18n/locales.ts`, `src/lib/account-locale.ts` и
  `src/components/AccountLocaleSync.tsx`.
- PWA: `src/lib/appliance-locale.ts` и `src/lib/account-locale.ts`, с избор на
  език в `app/(auth)/login.tsx`.
- Research Browser: `src/lib/locale.ts` и `src/lib/server-locale.ts`.
- API: `src/app/v1/locale/route.ts`, `src/app/v1/user/route.ts`,
  `src/app/v1/auth/session/route.ts` и `src/app/v1/auth/token/route.ts`, които
  носят contract за installation default и четене/запис на
  `preferences.ui.locale`, нужен на трите клиента.

Изискваните Hospital E2E доказателства са във Web `e2e/smoke.spec.ts` и
`e2e/smoke-authed.spec.ts`, PWA `e2e/sign-in.pwa.spec.ts`, и Browser
`e2e/login.spec.ts` плюс `e2e/authenticated.spec.ts`. Всеки приложим suite
доказва, че за устройство без предишен избор езикът по подразбиране е български,
че `Български` и `English` се виждат едновременно при вход и че след
authentication account locale поема управлението. Suites означават тези
доказателства с `HOSPITAL_LOCALE_E2E_DEFAULT_BG`,
`HOSPITAL_LOCALE_E2E_VISIBLE_CHOICES` и
`HOSPITAL_LOCALE_E2E_ACCOUNT_TAKEOVER`; проверката контролира и markers, и
конкретните локализирани assertions.

**Какво трябва да докаже отново бъдеща промяна на pin.** Tag-triggered candidate
workflow изпълнява строгата форма
`node scripts/client-localization-import-gate.mjs --require-ready` в своя
metadata job преди всяка работа по candidate. Затова промяна на който и да е
API, Web, PWA или Browser pin влиза отново в същата проверка: четирите трябва да
се движат като един общ provenance-preserving import, а capabilities и E2E
markers по-горе трябва да присъстват и в новоимпортираните sources. Връщането на
четирите към pre-localization baselines би върнало проверката в състояние
`pending`, което обикновената development quality допуска, но никой candidate не
може да публикува.

Status няма Playwright browser harness, затова тази проверка не измисля такъв.
Съществуващите unit/integration доказателства обхващат complete и MFA login с
български по подразбиране, ясно избиране на английски, locale cookies/redirects,
control-plane copy, account surfaces и terminology в
`apps/status/src/app.test.ts`, `app.control-plane.test.ts`,
`app.accounts.test.ts`, `app.terminology.test.ts` и `ui.locale.test.ts`.

## Какво се доставя

Hospital release се изгражда еднократно за `linux/amd64`. Десетте Hospital
images са API, Web, PWA, Browser, Status, migrator, tools, PostgreSQL, Caddy и
curl delivery worker. Всеки се изгражда като специфичен за run candidate от
одобрените digest-pinned bases; PostgreSQL, Caddy и curl са защитени Hospital
images, а не непроменени third-party release payloads. `Core` е компилиран в
приложенията; не е отделен container.

Всеки private GitHub Release съдържа:

- `lospor-hospital-<version>-deployment.tar.gz`;
- един или повече подредени файла `images.tar.gz.part-NNN`, всеки не по-голям
  от 1.9 GiB;
- ориентирания към одита JSON manifest;
- каноничния line-oriented `lospor-hospital-<version>-release.lock`, неговия
  `.sha256` sidecar и необработения 64-byte Ed25519 `release.lock.sig`; и
- security-evidence archive, покрит с контролна сума, който съдържа SBOMs,
  vulnerability reports, одобрените build inputs, image lock и точния
  risk-exception file, използван от policy.

PostgreSQL 17.11, zlib 1.3.2 и ACL 2.4.0 се компилират от точни release tarballs
с фиксиран SHA-256 срещу timestamped Debian Bookworm snapshots. Evidence
archive допълва package-manager SBOM на Trivy с обвързан с candidate image
CycloneDX component list и вградените source URLs/hashes, PostgreSQL configure
flags, compiler identity и пълен сортиран builder package manifest. Trivy не
vulnerability-map-ва тези три custom `/opt` компонента, затова допълнението
документира само provenance и не трябва да се тълкува като Trivy vulnerability
coverage. Committed release inputs в момента блокират публикацията, докато
reviewer не предостави тясно, специфично за версията решение с датирани
evidence URLs (или не бъде добавено поддържано automated vulnerability
coverage); workflow никога не извежда такова приемане от чист OS-package scan.

Release lock записва size и SHA-256 на всеки публикуван payload, а за всичките
десет images — top-level registry digest, избрания `linux/amd64` manifest
digest, configuration digest и подредените root-filesystem diff IDs. Тези
portable identities умишлено са независими от локалния Docker `.Id`, който
може да е различен при classic и containerd-backed image stores. Каноничният
sidecar съдържа точно lowercase SHA-256 на lock, два интервала, точния му
basename и newline. Веригата открива случайна повреда и всяка промяна спрямо
sidecar. Тя не идентифицира независимо publisher: всеки, който може да замени
едновременно lock и sidecar, може да създаде нова вътрешно последователна
двойка.

Actions candidate съдържа и standalone
`lospor-hospital-<version>-images.json`, както и обвързания с run
`lospor-hospital-<version>-publication-request.tsv`. Това са вътрешни
provenance inputs и отсъстват от final GitHub Release.

Line-oriented format позволява на болницата да проверява версия с `sha256sum`,
OpenSSL и обичайните Ubuntu tools. Node.js, npm, Git, Prisma, `jq` и database
clients не са host prerequisites.

## Доверие при разпространение и настройка на GitHub

Trust chain е:

1. private GitHub repository и private GHCR packages;
2. GitHub акаунтът на поддържащия, защитен с MFA;
3. точен tag-triggered candidate build и automated gates;
4. отделен manual publication run, обвързан с прегледаните candidate run,
   attempt, version, release-lock SHA-256 и raw-signature SHA-256;
5. repository-level Immutable Releases;
6. физическият контрол на поддържащия върху USB и on-site installation; и
7. Ed25519 signature върху `release.lock`, създаден извън GitHub и проверен
   спрямо ключ, който сайтът е фиксирал еднократно.

Първите шест осигуряват силен provenance в GitHub account и силни integrity
checks в доставения bundle. Само седмият е независим от GitHub и независимостта
му зависи изцяло от мястото, където се пази ключът.

Изисквайте MFA за maintainer account, защитавайте неговите recovery methods,
преглеждайте active sessions и access tokens и ограничете write access до
maintainer. Оставете всичките десет LOSPOR GHCR packages private. Дайте на всяка
свързана болница отделно revocable, read-only registry credential. Offline
route не изисква registry или internet access.

### Ключът за подписване на версия

Ключът е Ed25519, генериран и пазен от поддържащия, и **никога не се предоставя
на GitHub Actions**. Това е смисълът му. Ключ, който workflow може да използва,
се намира в същия trust domain като registry, към който workflow публикува:
тогава всеки, който може да публикува images, може и да ги подпише, а signature
не доказва нищо повече от registry. `release-workflow-contract-lib.mjs` налага
това, като оставя candidate workflow напълно unsigned и отказва private signing
material, signing commands или signing secrets в publication workflow.

Затова подписването е локална стъпка:

    printf '%s' "$(cat /path/to/maintainer.key)" | sh scripts/sign-release-lock.sh release.lock

Ключът се чете от standard input и никога от path argument, така че не попада в
process table или shell history. Script проверява собствения си резултат преди
изход; signature, който не може сам да провери, не се записва.

Полученият `release.lock.sig` е public authentication data, не тайна.
Прегледаните raw bytes се кодират като canonical base64 и се подават към manual
publication dispatch заедно с отделно записан SHA-256. И двата publication jobs
независимо декодират точно 64 bytes, проверяват този SHA-256, signature върху
точния candidate lock с прегледания public key и че candidate и publication
commits съдържат същия public key. След това write job добавя точно тези raw
bytes към final asset allowlist, преди да промени image или Release. Candidates
остават unsigned; изоставените candidates никога не изглеждат като публикувани
версии.

### Какво и кога получава сайтът

Еднократно при инсталиране, по канал, който **не е** download: кратък
fingerprint, еднакъв за всеки сайт и всяка версия.

    SHA256:<43 base64 characters>

Installer го изисква, сравнява го с ключа във версията и при съвпадение фиксира
ключа към appliance. Това еднократно потвърждение замества 64-знаковия SHA-256
на `release.lock` за всяка версия, който иначе operator трябва да получава ръчно
преди всеки update — и прави unattended download безопасен, защото appliance
може да удостовери release без човешка намеса.

Копието на public key във версията **никога** не се приема без проверка.
Нападател, който може да замени release, предоставя свой ключ с него, а всеки
следващ update се проверява успешно срещу този ключ; appliance би бил
криптографски уверен, че го обновява лицето, което го е компрометирало. Затова:

- ако няма фиксиран ключ и fingerprint не е предоставен, ключът се игнорира и
  сайтът продължава с per-release digest — това не е грешка;
- ако е предоставен fingerprint, той се сравнява, а несъвпадение спира install,
  преди да се изтегли каквото и да е;
- ако вече има фиксиран ключ, release с различен ключ се **отказва** както от
  `install.sh`, така и от `update.sh`, преди backup и migration.

След фиксиране на ключ signature е **задължителен**, не настройка. Липсващ
`.sig` се отказва точно като невалиден. Ако премахнат signature просто
пропускаше проверката, всеки, който може да обслужи променен release, би могъл
да изтрие signature и appliance би се върнал към digest-only verification:
по-слабият режим, който pinning замества, би се включил тихо по избор на
нападателя. `HOSPITAL_REQUIRE_RELEASE_SIGNATURE=1` остава и означава друго —
отказва изобщо инсталиране, докато няма фиксиран ключ.

Pinning е незадължително и се отменя само ръчно: фиксираният ключ се намира в
`<appliance-home>/secrets/release-signing-public.pem`.

### Какво не осигурява подписването

То не превръща процеса във версия с двама души. Поддържащият изгражда и
одобрява release и държи signing key, затова компрометиране на неговата машина
може да създаде валиден signature върху злонамерен release. Signature добавя
защита срещу компрометиране само на *GitHub* — repository, account, packages
или release assets — което вече не е достатъчно, защото нападателят не може да
създаде signature, приемлив за фиксирания ключ.

Няма revocation и expiry. Rotation означава всеки сайт да получи новия
fingerprint по същия out-of-band канал като при инсталиране и умишлено да
фиксира нов ключ; appliance няма и не трябва сам да приема нов ключ. Пазете
private key offline и запазете копие на място, чиято загуба няма да остави
всеки appliance завинаги на per-release digests.

### Двата привилегировани workflows

Те умишлено имат различни права:

- `.github/workflows/release.yml` започва само от точен tag
  `hospital-MAJOR.MINOR.PATCH`. Изгражда, сканира, инсталира и пакетира
  candidate. Не може да публикува GitHub Release.
- `.github/workflows/publish-release.yml` започва само чрез manual dispatch.
  Приема identity на избрания candidate run, независимо проверен lock hash и
  literal publication confirmation. Повишава само вече тестваните image
  identities и публикува без повторно изграждане.

Одобрените `linux/amd64` build, runtime и scanner identities се намират във
versioned `release-inputs.json`. Всяка reference съдържа очакваните name,
version и immutable SHA-256 digest. Не обновявайте digest само за да мине run:
resolve-нете го за `linux/amd64`, прегледайте upstream identity, commit-нете го
и оставете обичайният quality gate да тества прегледания commit. Candidate
workflow отказва mutable, incorrectly named или wrong-platform input, преди да
изгради нещо.

Използвайте manual dispatch на `quality.yml` за source rehearsal без
публикуване. Неговите name и summary не твърдят, че са проверили image
promotion, offline archive или release publication.

## Процедура за версия с един поддържащ

### Къде се намира версията и колко дълго

Версията преминава през две различни хранилища с различен срок на живот, а
смесването им е най-лесният начин да се измисли несъществуващ краен срок.

| Етап | Хранилище | Срок |
| --- | --- | --- |
| candidate build output | GitHub Actions artifact | **изтича след 14 дни** |
| container images | GHCR package | докато бъдат изтрити |
| публикувани release assets | GitHub Release | докато бъдат изтрити |

Candidate artifact е междинна конструкция между две стъпки от процеса на
поддържащия. **Неговите 14 дни са прозорецът за публикуване, не за
разпространение.** След като стъпка 3 повиши candidate до immutable GitHub
Release, offline bundle, deployment archive, manifest, lock и evidence остават
в този release без срок: могат да се изтеглят след месец или година и да се
занесат в болница, когато е планирана инсталацията.

В GHCR също нищо не изтича. Container registries нямат retention window; image
остава, докато някой не го изтрие.

Следователно единственият истински краен срок е между изграждането на candidate
и неговото публикуване. Candidate, останал непубликуван повече от 14 дни,
просто се изгражда отново — не е изгубен release, защото непубликуваният
candidate никога не е бил release.

Бързото публикуване поддържа и Actions storage billing незначителен: bundle
заема платено artifact storage само през дните между build и publication и не
заема такова след това. Имайте предвид, че free GitHub account по подразбиране
има zero spending limit, който отказва всяко надвишаване, вместо да начисли
малка сума; увеличаването на този limit — не намаляването на bundle —
разблокира candidate build, неуспешен заради artifact storage.

### 1. Еднократно включване на Immutable Releases

Преди първата production версия administrator включва repository-level
Immutable Releases. Непосредствено преди всеки publication dispatch
поддържащият визуално проверява настройката и предоставя version-bound
потвърждението, изисквано от workflow. И двата publication jobs независимо
проверяват literal confirmation; workflow не използва administrator token, за
да прочита или променя настройката. Той създава run-bound draft (или безопасно
възобновява точно него след прекъсване), качва точен asset list без замяна,
изтегля и сравнява remote assets, публикува draft и изисква GitHub да отчете
самия release като immutable.

След като release стане публичен в private repository, не се опитвайте да
заменяте неговите assets или да местите tag. Поправете проблема в source и
издайте нова версия.

### 2. Изграждане на candidate

Завършете и прегледайте release commit локално, потвърдете, че `package.json`
съдържа желаната версия, и прегледайте всеки entry в `release-inputs.json`.
Преди tag измерете представителен compressed offline bundle за точните десет
images. Потвърдете, че GitHub Actions artifact storage и billing могат да
поемат един пълен bundle плюс deployment archive, evidence и малките metadata
файлове за candidate retention window. Разделянето на 1.9 GiB не намалява общия
storage requirement; то съществува, защото един GitHub Release asset не може
да надхвърля 2 GiB, а offline bundle трябва да остане като release assets за
изтегляне дълго след publication. Осигурете и достатъчно свободен runner disk
едновременно за десетте loaded images, compressed parts, deployment archive и
security evidence. Workflow умишлено записва всяка pre-push local и portable
image identity, преди да почисти избрания Buildx cache и да премахне точно този
builder container; изтрива Trivy database и scanner image само след трайно
качване на scan evidence; и премахва само local images извън проверения набор
от десет. Никога не заменяйте тези насочени операции с `docker system prune`
или `docker image prune --all`: те могат да премахнат точните images, които
трябва да бъдат пакетирани.

След успех на обичайните quality checks и capacity check създайте и push-нете
точния release tag. Например:

```powershell
$Version = "1.3.0"
git tag --annotate "hospital-$Version" --message "LOSPOR Hospital $Version"
git push origin "hospital-$Version"
```

Не местете и не използвайте повторно този tag. Ако commit или inputs са грешни,
поправете source и използвайте нова версия.

Има едно изключение и то е тясно. Candidate, който **никога не е публикуван**,
може да бъде издаден отново със същата версия, защото нищо надолу по веригата не
може да го е използвало: болница вижда release само през публикуван GitHub
Release, а `X.Y.Z` image tags се създават при публикуване, не от `release.yml`.
Затова изключението важи само когато и двете са верни — няма GitHub Release за
този tag и няма `ghcr.io/…-<image>:X.Y.Z` tag. Изтрийте tag-а, качете поправения
commit и маркирайте отново. Изоставеният candidate става непубликуем от само
себе си: `publish-release.yml` обвързва `head_sha` на candidate run с това, към
което tag-ът сочи в момента, и го проверява три пъти.

След като release е публикуван, това изключение отпада и повторното издаване не
е просто нежелателно, а се отказва: инсталация, на която се предлага същата
версия с различен `release.lock` digest, спира с „Release X.Y.Z is already
installed with a different release identity“ вместо да я инсталира.

Изчакайте всички jobs в `release.yml` да преминат и запишете извън изтегления
candidate:

- candidate run ID и run attempt;
- пълния 40-character commit;
- version и tag; и
- 64-character release-lock SHA-256, изведен от успешния run.

Изтеглете само candidate artifact от този run в нова празна директория. Не
смесвайте файлове от различни runs или attempts:

```powershell
$Version = "1.3.0"
$Repository = "kaloyandjunow-prog/lospor-hospital"
$CandidateRunId = "12345678901"
$CandidateRunAttempt = "1"
$Commit = "0123456789abcdef0123456789abcdef01234567"
$ExpectedLockSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$ArtifactName = "hospital-$Version-$CandidateRunId-$CandidateRunAttempt-candidate"
$CandidateDirectory = Join-Path (Get-Location) "candidate-$Version-$CandidateRunId-$CandidateRunAttempt"

New-Item -ItemType Directory -Path $CandidateDirectory -ErrorAction Stop
gh run download $CandidateRunId --repo $Repository --name $ArtifactName `
  --dir $CandidateDirectory
```

Заменете всяка примерна стойност с candidate summary и прегледания tag.
Candidate се пази само за настроения период на workflow. Завършете review и
publication в този прозорец; никога не възстановявайте липсващ файл или не
добавяйте такъв от друг run.

На свързаната review workstation проверете candidate спрямо независимо
записаните commit и run identity. Candidate verifier проверява canonical
manifest и lock, lock sidecar, пълния member set, sizes, hashes и image
identities. Handoff verifier обвързва lock с official repository, candidate
workflow, run ID/attempt, version, tag и commit. Сравнете и действителния lock
hash със стойността, записана от успешния Actions run.

```powershell
node .\scripts\verify-release-candidate.mjs `
  $Version $CandidateDirectory candidate-assets $Commit
node .\scripts\verify-release-handoff.mjs `
  "$CandidateDirectory\lospor-hospital-$Version-publication-request.tsv" `
  "$CandidateDirectory\lospor-hospital-$Version-release.lock" `
  $Version $Commit $CandidateRunId $CandidateRunAttempt
```

На offline signing workstation подпишете точно този прегледан lock. Оставете
private key извън GitHub и не го добавяйте в environment, repository secret или
Actions input:

```sh
printf '%s' "$(cat /secure/offline/maintainer.key)" \
  | sh scripts/sign-release-lock.sh \
      candidate-1.3.0-12345678901-1/lospor-hospital-1.3.0-release.lock
```

Върнете към review workstation само публичния `.sig`. Потвърдете, че е точно 64
bytes, изведете canonical base64 от тези bytes и запишете независимо SHA-256:

```powershell
$Lock = "$CandidateDirectory\lospor-hospital-$Version-release.lock"
$Signature = "$Lock.sig"
$SignatureBytes = [IO.File]::ReadAllBytes($Signature)
if ($SignatureBytes.Length -ne 64) { throw "Ed25519 signature must be exactly 64 bytes" }
$ReleaseSignatureBase64 = [Convert]::ToBase64String($SignatureBytes)
$ExpectedSignatureSha256 = (Get-FileHash -Algorithm SHA256 $Signature).Hash.ToLowerInvariant()
```

### 3. Ръчно публикуване на прегледания candidate

Dispatch-нете publication само когато сте влезли в private repository с
maintainer account и MFA. Подайте точните записани стойности и literal
confirmation, изисквано от workflow:

```powershell
$Repository = "kaloyandjunow-prog/lospor-hospital"
$Version = "1.3.0"
$CandidateRunId = "12345678901"
$CandidateRunAttempt = "1"
$ExpectedLockSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$ReleaseSignatureBase64 = "replace-with-the-canonical-base64-of-the-64-byte-signature"
$ExpectedSignatureSha256 = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"

gh workflow run publish-release.yml --repo $Repository --ref main `
  -f "candidate_run_id=$CandidateRunId" `
  -f "candidate_run_attempt=$CandidateRunAttempt" `
  -f "version=$Version" `
  -f "expected_lock_sha256=$ExpectedLockSha256" `
  -f "release_signature_base64=$ReleaseSignatureBase64" `
  -f "expected_signature_sha256=$ExpectedSignatureSha256" `
  -f "confirm_publication=PUBLISH hospital-$Version" `
  -f "confirm_immutable_releases=IMMUTABLE RELEASES ENABLED hospital-$Version"
```

Същите осем полета могат да се въведат във формуляра GitHub Actions:
`candidate_run_id`, `candidate_run_attempt`, `version`,
`expected_lock_sha256`, `release_signature_base64`,
`expected_signature_sha256`, `confirm_publication` и
`confirm_immutable_releases`. Signature е публичен; private key никога не
трябва да се въвежда. Въведете последната стойност само след визуална проверка,
че Immutable Releases е включено за repository. Изберете само вече прегледаните
candidate run и attempt. Rerun е отделен candidate и изисква нов review и
manual decision.

Publication workflow спира, освен ако candidate run е успешен за точните tag и
commit, handoff и artifact identity съвпадат, lock има очаквания SHA-256 и
dispatch се изпълнява от разрешения branch. Преди да извлече нещо, проверява
API-reported ZIP SHA-256 на Actions artifact и приема само точния flat candidate
member set: обикновени файлове, contiguous offline parts, без duplicates,
directories, links, traversal, missing files или extras.

Отказва и missing, empty, malformed, noncanonical, wrong-length,
digest-mismatched, forged, wrong-key или altered-lock signatures. Точният
signature digest е част от resumable/immutable release transaction marker, така
че draft или replay с различни signature bytes се отказва.

Read-only stage изпълнява online и registry-independent offline installation
proofs. Write-enabled stage независимо проверява отново candidate provenance и
непроменените artifact ID/digest, преди да повиши final image tags и да създаде
release. Publication използва tested images и payload byte-for-byte и никога не
ги изгражда повторно.

Наблюдавайте целия workflow. Потвърдете всички final image digests, точния
release asset list и immutable status на GitHub. Запазете run URL, tag, commit,
candidate identity, lock SHA-256, signature SHA-256, release URL и timestamp
като release record.

### 4. Подготовка и пренасяне на USB за инсталиране

Използвайте чист криптиран USB под контрола на поддържащия. От authenticated
session в private repository изтеглете само assets на прегледания immutable
release в нова празна директория. Не копирайте Actions candidate или локално
възстановен bundle.

Тази стъпка няма краен срок и може да се повтаря. Release assets не изтичат,
затова същият проверен bundle може да се изтегли отново за втори сайт,
reinstall или replacement USB месеци след публикацията и всеки download се
проверява със същия lock. Подгответе носителя, когато инсталацията действително
е планирана, вместо да складирате устройства за несъществуващ краен срок.

Преди да откачите USB:

1. сканирайте workstation и USB според endpoint policy на поддържащия;
2. проверете точния syntax на sidecar, преизчислете SHA-256 на release lock и
   проверете съседния raw `.sig` срещу фиксирания/прегледания public key;
3. от trusted checkout на прегледания publication code изпълнете
   `scripts/verify-release.sh <lock> <sidecar> <asset-directory> all` върху
   manifest, deployment archive, security evidence и всяка offline part;
4. сравнете lock SHA-256 с независимо пазените successful-candidate и
   publication records; и
5. запишете USB identifier, release version, lock SHA-256, download time и
   custody transfer.

Поддържащият запазва физически контрол върху USB до инсталацията и я извършва
на място. Ако болничният ИТ екип трябва да свърже или mount-не носителя,
поддържащият остава на място и контролира избора на release. Не използвайте
устройството за несвързани файлове. След installation и acceptance го изтрийте
или архивирайте според release-retention policy.

## Автоматизиран gate

Repository workflow трябва да премине:

- clean installs за API, Web, PWA, Browser, Status, Core и exchange contract;
- pinned-source и exchange-contract verification;
- typecheck, strict lint, unit tests и production builds;
- PostgreSQL migrations и всички PostgreSQL concurrency tests;
- Status producer/consumer contracts и dependency-free fixture tests;
- safe-runtime-log и no-external-telemetry checks;
- dependency audit при high severity;
- и трите resolved Docker Compose models, всички application image builds и
  точния resilience smoke test на Status с два контейнера.

Release Compose contract се проверява спрямо `docker compose config --format
json`, а не чрез четене на YAML текст. Той доказва, че:

- `compose.yaml` дава controlled build definition на всичките десет Hospital
  release images;
- `compose.yaml` плюс `compose.publish.yaml` запазва тези builds и добавя
  точните versioned GHCR names;
- `compose.yaml` плюс `compose.release.yaml` има тези image names и няма local
  builds; и
- никой model не използва `latest`, не публикува PostgreSQL и не мести Status
  fallback от `127.0.0.1:3443`.

Изпълнете истинския contract и неговите destructive negative controls с:

```sh
node scripts/verify-release-compose.mjs
node --test scripts/verify-release-compose.test.mjs
```

Candidate workflow извиква обичайния quality workflow, след което изпълнява
пълния disposable installation test. Изгражда десет commit-specific candidates
с digest-pinned base и source-tarball inputs от `release-inputs.json` и сканира
всичките десет images. PostgreSQL evidence gate извлича embedded build records
от точния candidate, съпоставя ги с тези inputs и обвързва provenance hash с
configuration и ordered root filesystem на candidate. Всяка Critical и всяка
fixable High vulnerability блокира candidate. Unfixed High се допуска само от
точен entry в `release-risk-exceptions.json`, който посочва requested release,
logical image, vulnerability, package, смислена justification и бъдеща expiry
date. Stale, duplicate, inexact и unused exceptions водят до failure.

Всяко външно GitHub Action в quality, candidate и publication workflows е
фиксирано към прегледан full commit SHA с human-readable version до него.
Static negative gate отказва mutable tag или undocumented pin, преди да може да
се създаде candidate.

Едва след успех на тази policy се push-ват липсващите private, run-specific
image candidates. Retried workflow run използва повторно candidate само когато
commit, run и build-input hash съвпадат. Всеки reused или newly built image се
сканира отново и обвързва с evidence ledger. CI премахва local images, изтегля
обратно registry digests, тества migrations и стартира цял clean appliance от
точно тези identities. След това създава deployment archive, offline parts,
evidence, standalone image lock, canonical manifest, release lock, lock
sidecar и run-bound publication request. Offline archive се stream-ва направо
от `docker save` през gzip и part splitter; CI не записва допълнително
uncompressed image tar. Всички parts остават във temporary directory, докато
concatenation премине gzip integrity validation. След това се rename-ват към
`dist` на същата filesystem, а failed или interrupted run премахва всички
новопоказани final parts. Candidate workflow качва точния завършен set и спира.
Не може да push-не final version tags или да създаде GitHub Release.

Publication workflow независимо проверява candidate преди и по време на своя
write-enabled stage. Възобновява само собствения exact run-bound draft (същите
version, commit, candidate run/attempt, lock SHA-256, tag target, title, notes и
byte-identical subset от approved assets); всеки друг draft или mutable release
се отказва. Interrupted upload може да остави един или повече празни `starter`
asset records; само тези точни zero-byte, digest-free records се изтриват по
numeric asset ID след проверка на draft identity, след което одобрените им
файлове се качват отново. Всяко partial или ambiguous asset state спира
publication. Assets се качват без wildcards, replacement или `--clobber`;
целият нов draft се изтегля и сравнява преди publication. Вече immutable
release е idempotent no-op само когато пълният му asset set е byte-for-byte
идентичен. Всеки друг existing release спира run.

Изпълнете supply-chain negative controls с:

```sh
npm run verify:release-inputs
npm run verify:release-workflow
npm run test:release-workflow
npm run test:release-artifacts
```

Те покриват altered locks, sidecars и payloads; wrong repositories; `latest`;
missing и duplicate images; `linux/arm64`; Docker Hub digest-name
normalisation; oversized parts; unsafe или inexact Actions ZIP members; path
traversal; publication-handoff tampering; Critical/fixable High findings;
missing, malformed, forged, wrong-key, altered-lock и wrong-digest release
signatures; expired или unused exceptions; и възстановяване на prior services,
когато failed candidate е преместил versioned release tag към различен digest.

## Проверка и инсталиране при клиента

Final release съдържа raw `release.lock.sig` до lock, но не съдържа отделен
unarchived launcher. При първа инсталация проверете lock спрямо SHA-256, запазен
отделно от successful candidate/publication record, проверете deployment
archive от този lock и едва тогава извлечете неговия launcher в нова постоянна
bootstrap directory. Следва executable Ubuntu пример; заменете version, media
path и expected hash и го изпълнете като appliance service account:

```sh
set -eu
export LC_ALL=C

VERSION=1.3.0
MEDIA=/media/lospor-1.3.0
EXPECTED_LOCK_SHA256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
APPLIANCE_HOME=/opt/lospor-hospital

LOCK="$MEDIA/lospor-hospital-$VERSION-release.lock"
SIDECAR="$LOCK.sha256"
LOCK_NAME="$(basename "$LOCK")"
DEPLOYMENT_NAME="lospor-hospital-$VERSION-deployment.tar.gz"
DEPLOYMENT="$MEDIA/$DEPLOYMENT_NAME"

test "$(sha256sum "$LOCK" | awk '{print $1}')" = "$EXPECTED_LOCK_SHA256"
printf '%s  %s\n' "$EXPECTED_LOCK_SHA256" "$LOCK_NAME" | cmp - "$SIDECAR"

DEPLOYMENT_RECORD="$(awk -F '\t' -v file="$DEPLOYMENT_NAME" '
  $1 == "artifact" && $2 == "deployment" && $4 == file {
    count += 1; bytes = $5; digest = $6
  }
  END { if (count != 1) exit 1; print bytes, digest }
' "$LOCK")"
printf '%s\n' "$DEPLOYMENT_RECORD" \
  | grep -Eq '^[1-9][0-9]* [a-f0-9]{64}$'
set -- $DEPLOYMENT_RECORD
test "$(wc -c < "$DEPLOYMENT" | tr -d '[:space:]')" = "$1"
test "$(sha256sum "$DEPLOYMENT" | awk '{print $1}')" = "$2"

PREFIX="lospor-hospital-$VERSION/"
tar -tzf "$DEPLOYMENT" | awk -v prefix="$PREFIX" '
  index($0, prefix) != 1 { bad = 1 }
  $0 ~ /(^|\/)\.\.?($|\/)/ { bad = 1 }
  END { exit bad }
'
tar -tvzf "$DEPLOYMENT" \
  | awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { bad = 1 }
         END { exit bad }'

sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$APPLIANCE_HOME"
test ! -e "$APPLIANCE_HOME/current"
test ! -e "$APPLIANCE_HOME/.data/installed-release.tsv"
BOOTSTRAP_PARENT="$APPLIANCE_HOME/bootstrap-$VERSION"
test ! -e "$BOOTSTRAP_PARENT"
mkdir -m 0700 "$BOOTSTRAP_PARENT"
tar -xzf "$DEPLOYMENT" --no-same-owner --no-same-permissions \
  -C "$BOOTSTRAP_PARENT"
BOOTSTRAP_ROOT="$BOOTSTRAP_PARENT/lospor-hospital-$VERSION"
test -f "$BOOTSTRAP_ROOT/scripts/verify-release.sh"
test ! -e "$BOOTSTRAP_ROOT/.lospor-home"
ln -s "$APPLIANCE_HOME" "$BOOTSTRAP_ROOT/.lospor-home"

sh "$BOOTSTRAP_ROOT/scripts/verify-release.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA" all
```

Final asset directory в `MEDIA` трябва да е пълна: manifest, deployment
archive, security-evidence archive, release lock, sidecar, raw 64-byte
`release.lock.sig` и всяка ordered offline part. Проверката `all` отново
проверява всеки checksum-covered payload чрез launcher, чийто deployment
archive току-що е проверен. Тя умишлено не изисква candidate-only image lock
или `publication-request.tsv`.

За online първа инсталация запишете двете независими read-only credentials на
болницата в root-owned файлове с режим `0600`, след което стартирайте guided
installer:

```sh
sudo sh "$BOOTSTRAP_ROOT/scripts/provision-update-credentials.sh" github-release
sudo sh "$BOOTSTRAP_ROOT/scripts/provision-update-credentials.sh" ghcr
sh "$BOOTSTRAP_ROOT/scripts/install-guided.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

Всяка provisioning команда прочита credential чрез скрит standard-input
prompt. Никога не приема тайна като argument или environment variable и не
създава persistent Docker login. `HOSPITAL_UPDATE_SUPPLY_MODE` по подразбиране
е `connected`; този режим изисква и трите root-owned файла
`github-release-token`, `ghcr-user` и `ghcr-token` в `secrets/registry/`.

Той изисква release lock digest, изпратен ви отделно, сравнява го и спира при
несъответствие; след това събира site и administrator details, показва пълния
readiness report и стартира същия launcher по-долу. Той е само front end: всяка
проверка остава в извиканите scripts и никой съобщен failure не може да бъде
заобиколен. Когато `whiptail` не е достъпен, използва plain prompts, вместо да
изисква инсталиране на нещо на host.

Launcher може да се стартира и директно — това е последната стъпка на guided
installer и правилният път за non-interactive install:

```sh
sh "$BOOTSTRAP_ROOT/scripts/run-online-release.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

За registry-independent първа инсталация използвайте **същия guided installer**
със същите complete final asset directory и verified bootstrap root. Той пита
откъде да бъдат взети образите, така че болница без мрежа получава същото
посрещане на български, същото потвърждаване на digest, същото фиксиране на
ключа за подписване, същите въпроси за обекта и същия отчет за готовност като
свързаната:

```sh
sh "$BOOTSTRAP_ROOT/scripts/install-guided.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

Въпросът се предлага според носителя — offline, когато всички части на
образите, изброени в lock, са налични — но никога не избира мълчаливо и спира,
вместо да премине към другия път: избор на offline без частите спира
инсталацията, както и избор на connected без GHCR credentials. Задайте
`HOSPITAL_INSTALL_SUPPLY_MODE` на `connected` или `offline`, за да отговорите
без interactive prompt.

Offline launcher може да се изпълни и директно, което guided installer прави
последно и което всяка non-interactive инсталация трябва да използва:

```sh
sh "$BOOTSTRAP_ROOT/scripts/load-offline.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

При всяко следващо update не извличайте ръчно новия deployment archive.
Използвайте launcher от active, previously verified installation; той сам
проверява и stage-ва новото deployment. При зададени `VERSION`, `MEDIA`, `LOCK`
и `SIDECAR` за новата версия изпълнете точно една от:

```sh
sh /opt/lospor-hospital/current/scripts/run-online-release.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
sh /opt/lospor-hospital/current/scripts/load-offline.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

Първата команда е online alternative и прочита root-owned, per-hospital GitHub
Releases и GHCR credentials, без да съхранява Docker login. Тя проверява
използвания deployment payload; запазването на complete asset set върху
контролирания носител поддържа един последователен handoff. Втората е offline
alternative, задава `HOSPITAL_UPDATE_SUPPLY_MODE=offline`, не изисква registry
credential и строго изисква complete final asset set. Не изпълнявайте и двете
при един installation attempt.

И двата launchers проверяват lock sidecar и избраните payloads, преди да
докоснат работещата инсталация, след което проверяват portable configuration,
root-filesystem и `linux/amd64` platform identities. Те извличат candidate в
нова versioned directory, свързват site configuration, secrets, backups и
runtime data на болницата и извикват собствените installer/updater на candidate.
Само успешен run атомарно променя installed-release state. Downgrades и
различен lock digest за същата version се отказват.

Еднократната verification authorization никога не се записва в `.env`; само
non-secret release version, path и lock digest се запазват за fresh-shell
operator commands. Release Compose overlay използва `pull_policy: never`, така
че Docker не може тихо да замени verified image при стартиране на appliance.

Бързият Status test е:

```sh
./scripts/test-status-dev.sh
```

Той изпълнява истинския Status image срещу synthetic fixture в точно два
persistent containers. Това е development contract/resilience check, а не
заместител на истинския appliance drill.

Преди release изпълнете full disposable appliance test на чист host:

```sh
sh ./scripts/test-install.sh
```

Той отказва съществуващ `.env` и заети ports 80/443, защото унищожава
създадените от него disposable Compose project и volumes. Никога не го
насочвайте към инсталиран болничен appliance.

## Упражнение с disposable инсталация

1. Инсталирайте върху disposable encrypted Linux host с production-like DNS.
2. Изпълнете `scripts/install.sh`, импортирайте одобрените reference data и
   създайте двама потребители без административни права.
3. Създайте два случая за един и същ local patient number и един за различен
   пациент. Потвърдете, че raw number се вижда само в оторизираните local
   identity views и никога в logs, clinical JSON, audit details или exports.
4. Прекъснете Central и интернет. Завършете случай от PWA, свържете отново и
   проверете един последователен local case без duplicate events или изгубени
   fields.
5. Включете общата политика за клинично изпращане. Проверете, че всеки подходящ
   финализиран случай автоматично се поставя за изпращане, а черновите и
   незавършените случаи остават локални.
6. Прекъснете upload, рестартирайте worker и потвърдете, че същият batch
   продължава без втора publication.
7. Получете и проверете подписаната receipt на Central. Потвърдете, че local
   checkpoint напредва само след receipt verification.
8. Replay-нете accepted batch и потвърдете, че Central връща prior result без
   duplicate OMOP rows.
9. Подайте withdrawal, проверете подписаната receipt и local state, след това
   изпратете случая отново и проверете нов приет UPSERT.
10. Изпълнете `scripts/backup-now.sh`, възстановете на disposable host и
    сравнете case, audit, export-policy, delivery и checkpoint records.
11. Влезте в clinical и Status с едни и същи appliance credentials, сменете ги
    с `scripts/appliance-operator.sh rotate` и докажете, че старата парола се
    отказва и от двата независими verifiers.
12. Спрете едновременно API и PostgreSQL. Потвърдете, че Status login, saved
    history и internal liveness продължават да работят през loopback HTTPS
    fallback.
13. Спрете последователно Web, PWA, Browser, Caddy, backup и delivery-worker.
    Потвърдете, че Status остава достъпен през loopback listener и отчита всеки
    очакван failure, без да показва raw logs или identifiers.
14. Възстановете по-стар PostgreSQL dump, като запазите Status volume. Изпълнете
    поисканото credential reconciliation и докажете, че двете generations
    съвпадат.

Запишете software versions, contract version, database migration, timestamps,
checksums и operators, извършили упражнението.

## Задължителни тестове за отказ

- двама concurrent editors и finalization срещу clinical write;
- invalid или expired client certificate;
- altered manifest, ciphertext, release lock, lock sidecar, receipt или chunk
  checksum;
- липсваща Central connectivity;
- full disk и unavailable backup destination;
- едновременно unavailable clinical API и PostgreSQL;
- unavailable Caddy при оставащ достъпен loopback Status fallback;
- missing/stale backup и delivery-worker signals;
- Status restart със запазен SQLite volume;
- unsupported exchange version и out-of-order sequence;
- release, чийто `release.lock.sig` е създаден от различен ключ;
- release, чийто `release.lock` е променен след подписването; и
- release, който предлага signing key, различен от фиксирания в appliance, и
  срещу `install.sh`, и срещу `update.sh`.

Не създавайте tag на release, когато някой задължителен тест е пропуснат.
