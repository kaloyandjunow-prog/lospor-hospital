# Експлоатация

**Български** | [English](operations.md)

## Ежедневно

- наблюдавайте `docker compose ps`;
- наблюдавайте диска, паметта, изтичането на TLS, синхронизирането на часовника
  и възрастта на резервното копие;
- преглеждайте Status incidents, безопасните operational events, неуспешните
  Central deliveries и клиничните security audit events;
- преглеждайте в Status състоянието на политиката/доставчика за външен ИИ и
  проучвайте всяко неочаквано изключване или нечетимо credential;
- копирайте последното резервно копие в отделна криптирана система.

Приемайте off-host копието като част от ежедневната проверка за клинична
безопасност: потвърдете, че е пристигнал нов object `lospor-....backup`,
удостоверете затворения му `manifest.json` и проверете hash на `database.dump`
при местоназначението. Зелен индикатор за локалното резервно копие не може да
докаже, че отделното копиране е успешно; Status отчита отделно последния
потвърден off-host object. Поне веднъж на тримесечие извършвайте и документирайте
упражнение за възстановяване от истинския off-host носител. Пълните процедури
са в [Архивиране и възстановяване](backup-restore.bg.md) ([English](backup-restore.md)).

## Полезни команди

```sh
docker compose ps
docker compose logs --since 1h api
docker compose logs --since 1h delivery-worker
docker compose logs --since 1h postgres
docker compose logs --since 1h status
sudo sh /opt/lospor-hospital/current/scripts/backup-now.sh
sudo sh /opt/lospor-hospital/current/scripts/doctor.sh
sudo sh /opt/lospor-hospital/current/scripts/readiness-check.sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh state
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh state
```

За промени по CIDR или сертификатите използвайте
[Мрежови и TLS граници](network-boundaries.bg.md), а за управлявания staged
import, go-live, rollback и finalize —
[Импорт на терминология](terminology-import.bg.md). И двете процедури са
fail-closed и имат български изход за оператора и българска документация.

Не публикувайте PostgreSQL, worker route или sockets за управление на
контейнери. По време на клинична употреба не редактирайте ръчно редове в базата
данни или Status SQLite. Страницата Status съдържа само разрешени operational
events; за подробна диагностика използвайте host-only Compose logs с rotation.
Няма Sentry или външна услуга за logs/telemetry.

## Външен ИИ

Външният ИИ е незадължителен и е отделен от включеното насочване за
възрастни/деца. За включване или изключване и за замяна или премахване на
credential за Mistral използвайте единствено контрола в Status. Операцията
изисква нормална сесия на operator, удостоверена с парола, повторно
удостоверяване и причина за одита; console recovery сесия не може да я
извършва. Status показва само състоянието на доставчика/конфигурацията и
времената. Никога не получава credential или неговия ciphertext.

Не добавяйте `MISTRAL_API_KEY` към `.env` или Compose. Единственият поддържан
път е API sealing service, защитена чрез `secrets/api/external-ai-seal-key`.
Съхранявайте този файл offline с пълния набор тайни на appliance: загубата или
замяната му прави съхранените credentials нечетими и кара възстановяването да
спре безопасно преди промяна на базата данни. Вижте
[Управление на външен ИИ](external-ai-control.bg.md).

`readiness-check.sh` е само за четене. Изпълнявайте го след промени по хоста,
Docker, DNS, storage или time service. Без `--strict` той съобщава всеки проблем,
но връща управлението за диагностика; инсталирането използва strict mode и спира
при неизпълнено изискване.

## Status при прекъсване

От адрес, разрешен в `HOSPITAL_STATUS_ALLOWED_CIDRS`, използвайте
`https://<clinical>/status/`. Ако Caddy не е достъпен, създайте tunnel от
администраторска workstation към резервния listener, достъпен само през
loopback:

```sh
ssh -L 3443:127.0.0.1:3443 appliance-admin@hospital-host
```

След това отворете `https://localhost:3443/status/`. И двата номера следват
`HOSPITAL_STATUS_PORT`, така че сайт, който го е променил, трябва да тунелира
съответния порт. Очаква се предупреждение за локалния self-signed certificate
на инсталацията. Status работи при отказ на clinical API/database, но не и при
отказ на хоста, Docker daemon, Status container или volume,
електрозахранването или болничната мрежа.

## Appliance administrator

Appliance operator използва един email/парола в клиничното приложение и
Status, защитени с отделни verifiers. След паролата Status допълнително изисква
TOTP на системния администратор или един неизползван Status код за
възстановяване. Съхранявайте офлайн в хранилището за пароли на болничния ИТ екип
десетте еднократни кода, издадени при настройването. Използвайте само
координираните host команди:

```sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh verify
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh state
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh rotate
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh transfer
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh recovery-token
```

Паролите се въвеждат чрез скрити standard-input prompts. Никога не поставяйте
парола в environment variable, argument, shell history или ръчно написан JSON
файл. Вижте [Наблюдение чрез Status](status-monitor.bg.md) за процедурите за
инициализиране, прекъсната промяна, възстановяване и поправка.

## Смяна на обикновените данни за достъп

Не променяйте поотделно `.env`, PostgreSQL роля или токен на Status.
Поддържаната процедура на сървъра подготвя защитена транзакция, временно
застъпва данните за достъп, когато е необходимо, прилага и проверява новото
поколение, доказва отказа на старите стойности и автоматично отменя промяната
при неуспех:

```sh
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh prepare ordinary
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh state
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh commit
```

Използвайте `rollback`, за да отхвърлите или отмените чакаща транзакция.
Смяната на ключа за сесии умишлено извежда всички потребители; координираната
процедура за паролата на системния оператор по-горе е отделна. Ако `state`
покаже защитен остатък след проверено прилагане, поправете собствеността/правата
му и изпълнете `sh scripts/rotate-operational-secrets.sh cleanup`; почистването
не променя активното поколение. Вижте
[Смяна на оперативните данни за достъп](secret-rotation.bg.md) за отделните
обхвати, одитните доказателства, ограниченията и приемателното упражнение под
Linux.

## Акаунти

Саморегистрацията е изключена. Първоначалният administrator създава проверени и
одобрени локални потребители. Всеки акаунт принадлежи към институция и получава
минимално необходимото role. Премахвайте своевременно напусналите потребители
и редовно преглеждайте administrators. Вижте
[Предоставяне на Hospital акаунти](account-provisioning.bg.md).

## Съхранение на данни

Изтрит акаунт не се заличава веднага. Той се маркира като изтрит, а 30 дни
по-късно appliance го анонимизира и премахва свързаните с него rate-limit rows.
Забавянето позволява отмяна на случайно изтриване; след него заличаването е
постоянно и умишлено не може да се възстанови от работещата система.

Purge се изпълнява ежедневно в delivery worker по негов собствен часовник
(`HOSPITAL_RETENTION_INTERVAL_SECONDS`, по подразбиране 86400). Няма отделна
услуга и не е необходимо да се настройва host cron.

Страницата Status го отчита под **Data retention purge**:

| Показание | Значение |
| --- | --- |
| `RETENTION_COMPLETED` | Purge е завършил през последните 36 часа. |
| `RETENTION_AGING` | Няма успешен резултат от 36 часа. Проучете. |
| `RETENTION_OVERDUE` | Няма успешен резултат от 48 часа. Задължението се просрочва. |
| `RETENTION_API_UNAVAILABLE` | Worker не е успял да достигне API. |
| `RETENTION_REJECTED` | API е отказал заявката; проверете `CRON_SECRET`. |
| `RETENTION_SIGNAL_MISSING` | На този appliance никога не е записван purge. |

`RETENTION_SIGNAL_MISSING` се показва като unknown, никога като healthy.
Задължение за заличаване, за което никой не може да представи доказателство, не
трябва да се показва в зелено.

За незабавно изпълнение, без да чакате ежедневния цикъл:

```sh
docker compose exec delivery-worker sh -c \
  'curl -s -H "Authorization: Bearer $CRON_SECRET" \
     http://api:3002/v1/internal/purge-deleted'
```

Маршрутът е достъпен само във вътрешната мрежа на appliance; не се обслужва
през clinical hostname.

## Автоматично закриване на случаи

Случай, подаден за преглед, се финализира автоматично след изтичане на
тридесетминутния преглед, за да не остане завършен случай отворен само защото
никой не се е върнал да го подпише. До 1.3.0 appliance нямаше часовник за това:
обхождането се изпълняваше само в serverless инсталацията, а на хоспитален
сървър случай се закриваше единствено ако клиницист случайно го е гледал в
момента на изтичането.

Обхождането се изпълнява на всеки пет минути в delivery worker, по собствен
часовник (`HOSPITAL_CASE_CLOSE_INTERVAL_SECONDS`, по подразбиране 300). Няма
отделна услуга и няма host cron за конфигуриране.

Случай, който не може да бъде закрит — непълна документация — не се закрива. Той
се отлага с нарастващо изчакване, за да бъдат достигнати случаите след него, и
се финализира при следващо обхождане, след като липсващият запис бъде въведен.

Status страницата го показва под **Автоматично закриване на случаи**:

| Показание | Значение |
| --- | --- |
| `CASE_CLOSE_COMPLETED` | Обхождане е завършило през последните 20 минути. |
| `CASE_CLOSE_AGING` | Нищо не е успяло от 20 минути. Проверете. |
| `CASE_CLOSE_OVERDUE` | Нищо не е успяло от един час. Случаите остават отворени. |
| `CASE_CLOSE_API_UNAVAILABLE` | Worker не можа да достигне API. |
| `CASE_CLOSE_REJECTED` | API отказа заявката; проверете `CRON_SECRET`. |
| `CASE_CLOSE_SIGNAL_MISSING` | На този appliance никога не е записвано обхождане. |

За незабавно изпълнение:

```sh
docker compose exec delivery-worker sh -c \
  'curl -s -H "Authorization: Bearer $CRON_SECRET" \
     http://api:3002/v1/internal/close-expired-cases'
```

## Клиничен протокол за печат

Appliance предоставя разрешена HTML страница за печат; не генерира PDF файлове
на сървъра. Клиницистите използват **Печат / Запазване като PDF** в браузъра.
Приложението за телефон заявява петминутна връзка за печат с обхват до един
случай и отваря страницата в браузъра на устройството; не изтегля скрит PDF
файл. PDF може да бъде създаден само от браузъра или операционната система,
когато предлага **Запазване като PDF** като print destination.

За тази функция не инсталирайте Chrome, Chromium, Edge, Puppeteer или услуга за
PDF rendering на appliance. Hospital не изисква такъв third-party
renderer. При приемателната проверка потвърдете както достъп в същата
институция, така и отказ за различна институция, преди да печатате истински
клиничен случай.

## Прекъсване на Central

Клиничната работа продължава с локалната база данни. Одобрените доставки
остават в опашката и се повтарят след възстановяване на връзката. Никога не
заобикаляйте проверката на receipt и не маркирайте ръчно batch като приет.

## Обновявания на справочните данни

Импортирайте терминологични обновявания единствено чрез staged wrapper
`scripts/import-terminology.sh`. Неговият строг manifest записва source,
version, licence approval, checksums, minimums, import time и operator.
Изпълнете go-live gate и тествайте търсенето и на двата поддържани езика преди
клинично въвеждане; използвайте документираната rollback команда, а не директен
seed script.
