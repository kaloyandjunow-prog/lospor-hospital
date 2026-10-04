# Folder exchange with the hospital system

[Български](ehr-folder-format.bg.md) | **English**

This is the format for exchanging data with LOSPOR Hospital through a shared
folder, written for the team that builds the hospital system's side. It is
format version 1, introduced in LOSPOR Hospital 1.5.0.

The folder exchange carries the same content as the FHIR exchange: the same
admission fields offered to the anaesthetist, resolved through the same
laboratory, diagnosis and procedure mappings, and the same protocol and
safety findings sent back. Use it when the hospital system cannot offer a FHIR
server. The one thing it cannot do is answer a question: LOSPOR reads what you
drop and does not ask the hospital system for a patient.

## The folders

The appliance administrator chooses **Watched folder** under
**Hospital controls → EHR** in Status. Inside the shared directory:

| Folder | Written by | What it holds |
|---|---|---|
| `inbox/` | the hospital system | one JSON file per patient message |
| `results/` | LOSPOR | one answer per file read: `<name>.result.json` |
| `processed/` | LOSPOR | files that were read and offered to a clinician |
| `rejected/` | LOSPOR | files that could not be used, with the reason in `results/` |
| `outbox/` | LOSPOR | protocols and findings for the hospital system to collect |
| `.staging/` | LOSPOR | half-written outbox files; never read from it |

Files in `processed/`, `rejected/` and `results/` are deleted after the
site's retention window (14 days at most). Nothing in `inbox/` or `outbox/` is
ever deleted by LOSPOR.

## Writing a file into the inbox

- One patient per file, UTF-8, with a `.json` extension. A byte-order mark is
  allowed. Files without `.json` are not read, so write the file under another
  name (for example `adm-1234.json.tmp`) and rename it to `.json` when it is
  complete.
- LOSPOR reads the inbox every minute and reads a file only once it has not
  changed for 30 seconds, so a file still being written is never read half
  done.
- Do not put a patient number in the file name. File names appear in folder
  listings, backups and Status; the number belongs inside the file.
- Files larger than 5 MB are refused unread.

## The file

```json
{
  "formatVersion": 1,
  "identifier": "2026-004512",
  "identifierType": "IZ",
  "sourceMessageId": "HIS-ADM-88213",
  "fields": {
    "sex": "FEMALE",
    "weightKg": 72.5,
    "labResults": [
      { "test": "ХГБ", "value": "128", "unit": "g/L", "takenAt": "2026-10-04T07:45:00+03:00" }
    ]
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `formatVersion` | no | `1`. Any other number is refused, so a future format is never misread. |
| `identifier` | yes | The patient's number, as the hospital system records it. |
| `identifierType` | no | `IZ` (record number, ИЗ №, the default) or `EGN`. Any other value is refused rather than guessed. |
| `sourceMessageId` | no | The hospital system's own id for the message. Repeated in the answer; the file name is used when absent. |
| `fields` | yes | What to offer the anaesthetist. Unknown fields are ignored and listed in the answer. |

Any other top-level key is listed in the answer as unknown: it is usually a
misspelling.

A JSON Schema for the file is in
[ehr-folder/inbox-v1.schema.json](ehr-folder/inbox-v1.schema.json), with two
examples beside it:
[a full admission](ehr-folder/example-admission.json) and
[the smallest valid file](ehr-folder/example-minimal.json).

### Fields

Nothing is written into the case on arrival. Every field is offered to the
anaesthetist, who accepts or declines it item by item.

| Field | Value |
|---|---|
| `ageYears` | number |
| `ageValue`, `ageUnit` | number, and `DAYS`, `MONTHS` or `YEARS`, for a child |
| `sex` | `MALE`, `FEMALE`, `OTHER` or `UNKNOWN` |
| `heightCm`, `weightKg` | number |
| `bloodType` | `A`, `B`, `AB` or `O` |
| `rhFactor` | `POSITIVE` or `NEGATIVE` |
| `bpSystolic`, `bpDiastolic`, `heartRate`, `spO2`, `temperature`, `respiratoryRate` | number |
| `allergies`, `latexAllergy` | `true`, `false`, or `null` for "not recorded" |
| `diagnoses`, `comorbidities` | list of `{ "label", "code", "system" }`; ICD-10 codes |
| `procedures` | list of `{ "label", "code", "system" }`; КСМП or ICD-10-PCS |
| `currentMedications` | list of `{ "label", "atcCode", "inn", "dose", "route", "frequency" }` |
| `allergyDetails` | list of `{ "label", "atcCode", "inn" }` |
| `labResults` | list of results, below |

Upper and lower case are both accepted for the listed words. A number may be
sent as text, with a decimal point or comma (`"72,5"`). A value outside these
rules is not offered; the answer lists it as `invalid-value` and the rest of
the file is still used.

In lists only `label` is required. A code is used when present and makes the
item match LOSPOR's own coding. For diagnoses `system` may be left out (it means
ICD-10; `ICD10`, `МКБ-10` and the FHIR ICD-10 address are also understood). A
procedure code is used only with its list named: `KSMP` (or `КСМП`) or
`ICD-10-PCS`. A code list LOSPOR does not know is asked about once in Status.

### Laboratory results

```json
{ "test": "ХГБ", "value": "128", "unit": "g/L", "takenAt": "2026-10-04T07:45:00+03:00",
  "system": "urn:oid:1.2.3", "code": "1234" }
```

- `test` and `value` are required. Use the laboratory's own name for the test;
  `system` and `code` are optional and used first when present (LOINC, or the
  laboratory's own code list).
- `takenAt` is the sampling time with its offset. A result without one is
  offered as undated.
- A test LOSPOR does not recognise is still offered under your name, and the
  appliance administrator is asked once in Status what it means. After that it
  arrives under LOSPOR's name. A site can also state the unit for a code that
  arrives without one.
- Older files may call this list `labs`; it is read the same way.

## The answer for each file

For every file it reads, LOSPOR writes `results/<name>.result.json`:

```json
{
  "formatVersion": 1,
  "file": "adm-1234.json",
  "checkedAt": "2026-10-04T08:00:31.000Z",
  "outcome": "imported",
  "identifierType": "IZ",
  "sourceMessageId": "HIS-ADM-88213",
  "fields": {
    "accepted": ["sex", "weightKg", "labResults"],
    "ignored": [{ "field": "bmi", "reason": "not-importable" }]
  },
  "unknownKeys": [],
  "labs": { "received": 1, "undated": 0, "unmappedCodes": [] }
}
```

The answer never contains the patient number.

`outcome` is `imported` (offered to a clinician) or `rejected`. A rejected
file is moved to `rejected/` and its answer gives a `reason`:

| Reason | Meaning |
|---|---|
| `unreadable` | not a JSON object |
| `too-large` | larger than 5 MB |
| `unsupported-format-version` | a `formatVersion` other than 1 |
| `no-identifier` | no patient number |
| `unknown-identifier-type` | `identifierType` is neither `IZ` nor `EGN` |
| `nothing-importable` | no field that can be offered |

An ignored field's reason is `not-importable` (not a field this format takes),
`wrong-shape` (for example a list sent as text), `empty`, or `invalid-value`.

## Checking a file before it is dropped

In Status, **Hospital controls → EHR → The watched folder → Check a file**
runs exactly the reader described here on a file you choose and shows its
answer. Nothing is imported, moved or recorded. Files up to 1 MB can be
checked. The same card shows how many files are waiting, when the last file
was read, the day's counts and the latest refusals.

## What LOSPOR writes into the outbox

LOSPOR writes each file into `.staging/` and renames it into `outbox/`, so a
file in `outbox/` is always complete. The name is `<kind>-<delivery id>.json`;
a redelivery overwrites its own file.

| Kind | When | Content |
|---|---|---|
| `protocol` | the anaesthetic record is finalised | coded header (times, drugs and fluid totals, finalisation) and, beside it, `protocol-<id>.html`, the printable record |
| `safety_findings` | the record holds a difficult airway or an allergy | the findings alone, so they reach the next admission |
| `case_start`, `case_end` | the case starts or ends | the moment, for a hospital system that tracks theatre time |

Every outbox JSON file carries `patient: { "identifierType", "identifier" }`
so the hospital system can file it against its own record. An amended record
is sent again with `finalization.supersedes` naming the record it replaces.
