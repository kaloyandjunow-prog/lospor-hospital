# Reference data

Place the institution-approved vocabulary package here before import. It is
kept outside Git because some source vocabularies have separate licences.

Expected Athena/Bulgarian ICD import files:

- `CONCEPT.csv`
- `CONCEPT_SYNONYM.csv`
- `CONCEPT_RELATIONSHIP.csv`
- the official Bulgarian ICD-10 workbook (`ICD10_*.xlsx`)

Import after installation:

```sh
docker compose --profile tools run --rm tools \
  npx tsx scripts/seed-vocabularies.ts --vocab-dir /reference-data
```

The bundled Core catalog remains available as a deterministic fallback, but a
Hospital installation must import its approved terminology package before
clinical use.
