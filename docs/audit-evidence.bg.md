# Одитни доказателства в Hospital (HAUD-01)

**Български** | [English](audit-evidence.md)

Този документ описва одитната граница на Hospital 1.2.0. Това е доказателствена
следа, а не рутинна observability телеметрия: привилегировано lifecycle решение
не трябва да се запише, ако одитният му ред не може да се запише в същата
PostgreSQL транзакция.

## Инвентар на надеждните преходи

| Група преходи | Надеждни действия | Собственик на транзакцията |
|---|---|---|
| Издаване и използване на Hospital акаунт | `HOSPITAL_ACCOUNT_CREATED`, издаване/преиздаване и използване на activation/recovery връзка | `hospital/account-provisioning.ts` |
| Bootstrap/operator на инсталацията | първоначално лечебно заведение/администратор; initialize, rotate, transfer и reconcile на оператора | защитената bootstrap/operator транзакция |
| Съществуващо администраторско създаване/одобрение | `HOSPITAL_USER_CREATE`, `USER_APPROVE` | администраторските routes |
| Права и HOD решения | `ADMIN_ACCOUNT_AUTHORITY_CHANGE`, `ROLE_REQUEST_SUBMIT`, `HOD_ROLE_REQUEST_APPROVE`, `HOD_ROLE_REQUEST_REJECT` | role/request routes |
| Решения за принадлежност към лечебно заведение | заявка, самостоятелно напускане, одобрение, отказ | user/admin institution routes |
| Наличен в Hospital lifecycle на акаунт/правни приемания | заявка/администраторско изтриване, retention анонимизиране, password recovery, email verification, приемане на terms | съответният lifecycle route/service |
| Clinical-rules workbench | създаване, запис/изтриване на правило, замяна на педиатрични профили, публикуване, избор, премахване на избор | `clinical-rules/service.ts` |
| Hospital guidance/външен ИИ | policy и credential replace/remove кодове | Hospital control plane |
| Central | transport конфигурация, policy за автоматично изпращане, batch retry, действие за оттегляне/повторно изпращане на отделен случай | Hospital enrollment/control plane/case route |
| Научен достъп | create/update/delete на запазена cohort, създаване на export, общи grants, Hospital issue/supersede/revoke и едно OMOP одобрение | cohort/grant route, export транзакция или Hospital research control |

Създаването на акаунт и издаването на activation връзка умишлено създават два
реда: това са два различни прехода и всеки има точно един ред. Direct role
update без промяна, ruleset deletion без намерен ред и selection clear без
наличен избор не създават ред.

Рутинната високочестотна телеметрия за редакция/преглед на случаи и събития
остава best effort. Финализиране, отмяна на финализиране, прехвърляне,
корекция на patient link, research grants и други действия, променящи права,
остават надеждни.

## Стабилен договор за действия и показване

`apps/api/src/lib/audit-actions.ts` е append-only източникът на кодове,
категории и точни български/английски наименования. Код не може да бъде
преименуван или използван повторно. `GET /v1/admin/audit-logs` отхвърля
непознати точни филтри и връща същия catalog с всяка schema-version-1 страница.
Web и PWA четат този runtime catalog и нямат втори списък с действия.

Администраторският отговор изгражда отново само безопасните полета. Суровият
database `detail`, вътрешните target ID и actor ID остават на сървъра, защото
историческите редове са създадени преди privacy проверката. Името на извършилия
действието остава, защото е необходимо доказателство кой е взел решение.
Непознат исторически код получава общо локализирано наименование.

## Privacy на одитния детайл

Единственият writer отхвърля вложени полета, които могат да съдържат:

- пароли, тайни, credentials, private keys, връзки, URL-и или tokens;
- номера на пациенти, case codes, маскирани номера или clinical payload-и;
- пряко идентифициращи данни като email, телефон, адрес или имена;
- свободен текст за причини, бележки, цели, описания, съобщения или грешки.

Разрешеното доказателство е ограничено: opaque database ID, роли, action/
reason/error кодове, policy booleans, бройки, timestamps, hashes, версии и
изрични имена на променени полета. Човешката причина остава в управлявания
domain запис; audit редът пази само `reasonRecorded: true`.

## Проверки

`apps/api/src/lib/hospital/audit-governance-inventory.ts` е изпълнимата Hospital
overlay матрица. Тестът ѝ изисква точно състояние за всяка HAUD-01 група,
регистрирани action codes в посочения transaction owner и marker за rollback
доказателство. Матрицата фиксира и provenance/actor-principal блокерите по-долу,
за да не може бъдеща версия тихо да ги обяви за завършени.

Фокусираният suite проверява уникалност и двуезична пълнота на registry,
отхвърляне на непознати филтри, privacy на server отговора, вложени забранени
ключове, fail-closed client parsing, непоказване на detail/target полета,
пренасяне на clinical-rules audit failure и source drift за lifecycle
транзакциите. Съществуващият PostgreSQL atomicity test остава database rollback
доказателството при включена integration database gate.

## Все още подготвени provenance граници

Hospital API е фиксиран в `UPSTREAM_VERSIONS.json` към public API 9.3.0 commit
`a1e866f56c3040bc9332cc03d33a37108eff3d5f`. Текущата owner API работа съдържа
общи lifecycle структури, които този фиксиран Hospital import още няма:

- `AuthSession` и session revocation при suspend/reactivate/restore;
- `LegalAcceptance` и отделни versioned terms/privacy descriptors;
- `User.suspendedAt`, `User.recoveryRequiredAt` и `User.anonymizedAt`;
- `ClinicalRulesetPublicationEvidence` и неговия confirmation workflow.
- транзакционните generic reissue действия за email verification/password reset tokens.

Тази стъпка прави надеждно одитирани всички съответни промени, които вече
съществуват в Hospital, включително седемте clinical-rules прехода. Тя **не**
копира ръчно липсващите общи owner schemas/routes във vendored дървото.
Безопасният път остава обичайната public upstream версия, след това
provenance-recorded Hospital vendor import и overlay reconciliation. Дотогава
Hospital не може да заявява липсващите общи suspend/session, отделни legal-
acceptance или publication-confirmation workflows.

## Все още необходимо решение за actor principal

Шест съществуващи operator scripts променят управлявани записи, но не могат
вярно да посочат отговорното лице: петте create/append/prune scripts за clinical
rules, изброени в изпълнимата матрица, и `scripts/seed-play-reviewer.ts`.
Посочването на засегнатия акаунт като actor би било невярно. Изборът е между
изрично посочване на съществуващ администратор при всяко изпълнение и отделен,
тясно ограничен non-human system operator. До решението тези scripts остават
изрично decision-blocked, вместо да получат измислена audit самоличност.
