# Reference data / Справочни данни

## Български

Поставете одобрения от институцията пакет в собствена подпапка тук. Изходните
файлове остават извън Git и изданията, защото някои терминологии имат отделни
лицензи. Не копирайте лицензирани файлове в документацията или хранилището.

Всеки пакет има `manifest.json` с източник, версия, лицензно одобрение, SHA-256
на всеки файл и минимални очаквани бройки. Примерът е в
`docs/terminology-manifest.example.json`. Поддържаните команди са:

```sh
sh scripts/import-terminology.sh <подпапка-на-пакета> --operator "Име на оператора"
sh scripts/doctor.sh --go-live
```

Командата използва пакетирания локален `tsx`, а не `npx`. Тя проверява точните
байтове, клонира действащата база в отделно поколение, изпълнява каноничния ред
ICD/ATC/BG → LOINC → Athena/връзки → ConceptMap, проверява бройки и връзки и
едва тогава сменя името на базата. При прекъсване използвайте същия пакет с
`--resume`. Предишната база остава налична за
`sh scripts/rollback-terminology.sh --confirm` до изрично финализиране.

## English

Place the institution-approved package in its own subdirectory here. Source
files stay outside Git and releases because some terminologies have separate
licences. Never copy licensed files into documentation or the repository.

Every package carries `manifest.json` with source, version, licence approval,
each file's SHA-256, and minimum expected counts. See
`docs/terminology-manifest.example.json`. The supported commands are:

```sh
sh scripts/import-terminology.sh <package-subdirectory> --operator "Operator name"
sh scripts/doctor.sh --go-live
```

The wrapper uses packaged local `tsx`, never `npx`. It verifies the exact
bytes, clones the live database into an isolated generation, runs the canonical
ICD/ATC/BG → LOINC → Athena/relationships → ConceptMap order, validates counts
and relationships, and only then switches the database name. After interruption
run the exact package with `--resume`. The prior database remains available to
`sh scripts/rollback-terminology.sh --confirm` until explicit finalization.
