# Защитна граница за клиничния baseline

Mobile и exported PWA приемат `/v1/clinical/rules/runtime?mode=...` като
недоверени runtime данни. Бъдещи medication стойности се разрешават само за
избран preset с точен mode, положителна version, `PUBLISHED` status (когато е
подаден), `productionReady: true` и изцяло валидни effective rules. Клиентът
отхвърля изпратените profile arrays и извежда отново adult и pediatric профилите
от effective rules.

Ако избраният baseline липсва, е невалиден, draft/retired, с грешен
mode/version или по друга причина не е production-ready, остават достъпни
medication identity, кодовете, routes, ruleset hidden-state, search-only
документирането и ръчното въвеждане. Изключват се dose/rate/volume prefills,
concentrations/default preparations, quick values, profile ranges, formulation
choices, agent quick percentages, premedication defaults/route recalculation и
adult/pediatric fluid calculations. В това състояние изборът на fluid и смяната
на route или concentration не могат да задействат hard-coded bag-volume fallback
или pediatric 4-2-1 calculation. Mode-tagged hook state не допуска Adult snapshot
при преход към Pediatric, нито обратното.

Валиден избран baseline може да подаде редактируема изчислена предварителна
стойност. UI не показва dose ranges, advisory текст, source текст или
calculation arithmetic. Вече записаните стойности се запазват; границата спира
новите бъдещи стойности и не изтрива въведени от клинициста данни.

Нормализираните snapshot записи използват cache namespace `clinical-rules:v4`.
Старите cache записи с недоверени transport данни не се смесват с новия
contract. Unit/component тестовете покриват evaluator и manual границите за
drug/infusion/fluid/agent/premedication, а PWA browser contract подава adult baseline с
`productionReady: false` и изисква празна manual dose без concentration или
quick-value guidance.
