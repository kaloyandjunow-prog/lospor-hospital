# Свързване с Central

**Български** | [English](central-enrollment.md)

Свързването е изрична операция, която се извършва съвместно от операторите на
Hospital и Central.

1. При настройването на Hospital се създава `secrets/api/site-client.csr`.
2. Central подписва тази CSR със своя site-client CA:

   ```sh
   scripts/sign-site-csr.sh SITE_CODE hospital.csr hospital-cert.pem
   ```

3. Прехвърлете `hospital-cert.pem` и `site-client-ca.pem` на Central по одобрен
   защитен канал. Инсталирайте ги като:
   - `secrets/api/site-client-cert.pem`
   - `secrets/api/central-ca.pem`
4. Central създава еднократен токен за свързване с валидност 24 часа:

   ```sh
   scripts/create-enrollment-token.sh "Hospital name"
   ```

5. Болничният ИТ екип влиза в независимата страница Status и отваря
   `/status/control`. В **Central transport** се въвеждат HTTPS endpoint,
   кодът/името на сайта, институцията, еднократният токен, причината и текущата
   парола на администратора на appliance. Така се създава отделно одитираното
   заключване на transport.
6. В отделния формуляр **Central clinical export approval** решете дали
   clinical export да бъде разрешен. Потвърдете отново текущата парола.
   Свързването на transport не означава, че това одобрение е дадено.
7. От двете страни потвърдете кода на сайта, отпечатъците и валидността на
   сертификата и CA, ID на signing key, поддържаната версия на manifest,
   състоянието на опашката и подписана тестова receipt.

Предишните API за свързване чрез clinical ADMIN, промяна на export policy и
задействане на доставка, както и авторитетният процес
`scripts/enroll-central.sh`, са премахнати във версия 1.2.1, защото не могат да
наложат отделните потвърждения с парола в Status и одитните заключвания. Вижте
[Управление на Central чрез Status](central-status-control.bg.md).

Не изпращайте към Central частни ключове, patient keys, данни за достъп до
базата данни или необработения идентификатор на пациента.

## Синтетично доказателство при release

Release gate не изисква checkout или работещо копие на продукта Central.
`npm run test:central-full-story` стартира test-only HTTP fixture, изграден от
фиксирания чист exchange contract, и изпълнява истинския Hospital delivery
worker срещу disposable мигрирана PostgreSQL база. Няма import от съседно
repository и fixture не може да се използва като production fallback.

Проверката започва с конфигуриран transport, но без одобрен clinical export, и
потвърждава, че Hospital не изпраща заявка. След одобрение тя проверява
автоматичното изпращане на всеки финализиран случай, който отговаря на условията,
криптиран multipart UPSERT, подписана от Central receipt, local checkpoint,
оттегляне, повторно изпращане и крайно прието състояние. Негативните проверки
доказват, че receipt с невалиден подпис и
невалидна sequence/previous-batch checkpoint верига не могат да придвижат local
checkpoint. Същият положителен сценарий се изпълнява с текущата и непосредствено
предишната версия от `scripts/exchange-contract-support.json`.

Fixture записва само обобщени наблюдения. Тестът поставя ясно различим
local-only sentinel за patient identifier и доказва, че той отсъства от
декриптираните exchange таблици, manifest, проверката на криптирания artifact,
case UI projection и прихванатите worker logs. Това е release доказателство за
protocol и application path; mTLS договарянето и реална deployed Central база
остават част от disposable installation acceptance drill.
