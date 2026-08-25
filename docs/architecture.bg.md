# Архитектура на LOSPOR Hospital

**Български** | [English](architecture.md)

## Продуктова граница

LOSPOR Hospital е независим продукт. Той импортира прегледани snapshots на
публичните клинични приложения, но Hospital-only кодът, файловете за
внедряване, обработката на самоличността на пациентите и логиката за доставка
към Central се намират само в това хранилище.

Публичната serverless демонстрация не е upstream база данни и не е fallback
runtime. Hospital инсталацията остава клинично използваема, когато datacenter
на Central или интернет връзката не са достъпни.

## Runtime услуги

- `postgres`: каноничната локална оперативна база данни.
- `api`: удостоверяване, права за достъп, клинични записи, одит, научни цели и
  export policy.
- `web`: клиничното приложение за настолен компютър.
- `pwa`: инсталируем browser client с offline клинични чернови.
- `browser`: локално работно пространство за научни цели и одит.
- `delivery-worker`: повтаря одобрените OMOP доставки към Central.
- `backup`: създава ежедневни database dumps с контролни суми.
- `status`: удостоверено оперативно наблюдение със собствен SQLite data volume
  и резервен HTTPS, достъпен само през loopback.
- `caddy`: TLS termination и единствената публикувана мрежова граница.

При референтната инсталация всички услуги работят на един Ubuntu Server 24.04
LTS amd64 Docker host. При Windows Server този Ubuntu host е Hyper-V виртуална
машина; това не е внедряване с Windows containers. PostgreSQL, вътрешните части
на API и workers нямат публикувани host ports.

## Граница на Status monitor

Status е отделен production container, а не страница, обслужвана от clinical
API. При стартиране той не зависи от API, PostgreSQL, Web, PWA, Browser, worker,
backup service или Caddy. Собственият му SQLite volume съхранява само
самоличността и verifier за удостоверяване на appliance operator, server-side
сесиите, проверени operational events, наблюдения за достъпността и история на
инцидентите.

Status получава оперативно състояние чрез тесни интерфейси:

- преки liveness/readiness проверки на клиничните услуги;
- `SELECT 1` чрез отделно read-only PostgreSQL role без права върху таблици;
- строго проверен aggregate appliance snapshot от API;
- backup и delivery-worker markers с фиксирана schema от read-only signal
  volume;
- строги host-agent данни само за четене за версията и терминологията, заедно с
  една папка за фиксирани заявки, чиито root процеси отказват пътища, команди,
  непознати полета, повторно изпълнение и небезопасни inode обекти; и
- разрешени operational event codes, изпратени по вътрешната monitoring мрежа.

Заявката за терминология съдържа само фиксирано действие и име на една директна
папка на пакет; сървърът намира и проверява одобрения пакет и не допуска
едновременно изпълнение с архивиране или обновяване. Status не може да преглежда
лицензирани изходни файлове или журнали на сървъра.

Status контейнерът няма Docker socket, patient-data volume, директория с
API/Central ключове или общо database credential. Clinical API вижда само
собствената си директория `secrets/api/` и двата отделни Status tokens, които са
му необходими за публикуване на aggregate snapshot и безопасни events.

Обичайният път е browser → Caddy → `/status/`. Caddy ограничава този път до
`HOSPITAL_STATUS_ALLOWED_CIDRS`, след което Status изисква собствен вход. Същият
Status контейнер прекратява private TLS и на loopback port `3443` на хоста.
При отказ на Caddy болничният ИТ екип може да достигне listener-а чрез SSH
tunnel.

Тази изолация предпазва при отказ на клиничното приложение или базата данни.
Тя не създава втори appliance: Status също ще бъде недостъпен при отказ на
хоста, Docker daemon, Status container или volume, електрозахранването или
болничната мрежа. Вижте [Наблюдение чрез Status](status-monitor.bg.md) за
процедурите за достъп, данни за достъп, възстановяване и тестове.

## Самоличност на пациента

Необработеният болничен номер на пациента се нормализира и съхранява единствено
в локалната таблица `PatientLink`:

- търсенето използва HMAC с обхват на институцията;
- възстановяването използва AES-256-GCM encrypted ciphertext;
- обичайните екрани получават само маскирана стойност;
- clinical JSON, audit details, logs и Central exports никога не го получават.

За Central се използва отделен keyed pseudonym. Един и същ пациент в една
институция се съпоставя последователно между процедурите. Различните институции
създават несвързани pseudonyms.

Ключовете за encryption, lookup и export умишлено са различни. Загубата на
encryption key прави необработените локални идентификатори невъзстановими.
Загубата на pseudonym key прекъсва бъдещото longitudinal linkage. И двата
изискват защитено offline escrow.

## Доставка към Central

Допустими са само локално одобрени, завършени случаи. Hospital създава frozen
revision set, съпоставя го към осем OMOP 5.4 CSV таблици, подписва manifest,
шифрова архива с AES-256-GCM, обвива ключа към RSA public key на Central и го
качва с mutual TLS.

Central връща подписана receipt. Локалният checkpoint напредва само след
проверка на тази receipt. Неуспешната доставка никога не блокира локалното
документиране и се повтаря с lease и backoff. Withdrawal е друга подписана
доставка с receipt.

Central не може да прави заявки към Hospital базата данни, да изтегля случаи
или да записва обратно в случай.

## Мрежова граница

Clinical web, PWA и API могат да бъдат достъпни през интернет зад политиката на
болничната защитна стена. Research Browser е ограничен до настроени VPN/LAN
мрежи и продължава да изисква права в приложението. Status е ограничен до
`HOSPITAL_STATUS_ALLOWED_CIDRS` и своя независим вход за appliance
administrator. Болничният ИТ екип трябва да предпочита VPN или identity-aware
gateway за всеки административен интерфейс.

## Референтен обхват

Това хранилище е production-oriented референтен appliance с един node. Само по
себе си то не предоставя предварително изграден VHDX, hypervisor clustering,
втори PostgreSQL node, off-site backup storage, endpoint management или
интеграция с болничен identity provider. Това са отговорности на внедряването,
а не скрити допускания.
