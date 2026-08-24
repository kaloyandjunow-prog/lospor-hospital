# Защитна граница за клиничния baseline

Web приема `/api/clinical/rules/runtime?mode=...` като недоверени runtime данни.
Избраният baseline може да подава редактируема изчислена предварителна стойност
само когато са изпълнени всички условия:

- mode съвпада точно с клиничния случай;
- preset е `PLATFORM`, `INSTITUTION` или `USER` и има положителна целочислена
  version;
- ако има status, той е `PUBLISHED`, `productionReady` е точно `true` и от
  правилата може да се изведе поне един подходящ за mode профил;
- всяко effective rule има валиден payload, стабилни identity/version и
  provenance, сочи към избрания preset и има уникален rule key.

Клиентът не се доверява на изпратените profile arrays, а ги извежда отново от
валидирани effective rules. При липсващ, draft/retired, грешен mode/version,
невалиден или по друга причина непригоден за production baseline остават
достъпни имената, кодовете, routes, hidden-state и ръчното документиране. Всички
бъдещи OptionLibrary стойности се изключват: изчислени dose, rate и volume,
concentration/default preparation, quick values и изчисляване на fluid
maintenance. Premedication defaults/route recalculation, inhalational-agent
процентите и N2O percentage default минават през същата граница. Смяната на
route или concentration не може да върне стойност след безопасно празно
отваряне.

Валиден избран baseline може да попълни редактируема изчислена стойност. Dose
ranges, advisory текст, weight arithmetic и quick-value препоръки не се показват
в clinical-entry UI. Вече записаните стойности остават достъпни като
исторически/ръчно въведени данни.

Runtime snapshot използва cache namespace `lospor:clinical-rules:v5`; старите
cache записи с недоверени profile arrays не се възстановяват. Нормализиран
валиден cached snapshot може да се използва при липса на мрежа, но отново се
проверява преди разрешаване на бъдещи стойности.

Pure evaluator, dose surfaces, flyout state, premedication/agent границите,
fluid route-change границата и browser contract са покрити с фокусирани тестове. Browser contract подава
baseline с `productionReady: false` и изисква празно ръчно въвеждане без
preparation или dose guidance.
