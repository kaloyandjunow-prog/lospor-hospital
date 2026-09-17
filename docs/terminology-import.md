# Terminology import

[Български](terminology-import.bg.md) | **English**

Hospital does not distribute or silently download licensed terminology. The
institution obtains the permitted source package, approves its licence and
clinical scope, and keeps those source bytes under `reference-data/`, outside
Git and release artifacts.

## Package contract

Copy `docs/terminology-manifest.example.json` to `<package>/manifest.json` and
replace every placeholder. The manifest is strict and records:

- package ID, source, version, licence reference, approver, and approval date;
- every exact file, its role, whether it is required, and SHA-256; verified
  evidence adds the observed byte length;
- minimum accepted counts for ICD-10, Bulgarian labels, ATC, LOINC, Athena
  concepts/relationships/ancestors, and ConceptMap rows; and
- mandatory relationship integrity and at least one resolved standard mapping.

The required source filenames are `VOCABULARY.csv`, `DOMAIN.csv`,
`CONCEPT.csv`, `CONCEPT_RELATIONSHIP.csv`, `CONCEPT_ANCESTOR.csv`,
`CONCEPT_SYNONYM.csv`, and one `ICD10*.xlsx` Bulgarian workbook. Unlisted files,
missing files, checksum drift, unsafe paths, and zero/negative expectations are
rejected before any database is touched. Package/manifest/source entries must
be real, singly-linked regular files in a real package directory; symbolic
links, hard-link aliases, subdirectories, and other unlisted entry types are
also refused.

The clinical terminology owner must choose realistic minimum counts from the
approved package. The appliance cannot make that clinical/licensing decision.

## Status workflow

An appliance with the host agent enabled exposes **Status → Terminology
generations**. Hospital IT first places one approved package in a direct child
directory of `reference-data/`. The host probe lists, by name only, the direct
folders there that hold a `manifest.json`, and the import form offers those
names (a name can still be typed). Status never uploads, downloads, lists or
displays the licensed files themselves. The page shows only the active package ID/version,
activation time, manifest SHA-256, whether a rollback generation exists, and a
fixed pending/action state.

A normal Status password+MFA session may request import, exact-package resume,
rollback, or finalization only after entering the administrator password again
and checking the action-specific confirmation. Console-recovery sessions are
read-only. Import and resume accept one directory label matching
`[A-Za-z0-9][A-Za-z0-9._-]{0,79}`; paths, URLs, nested directories, commands,
manifest identities, database names, and source filenames cannot be supplied.

Status writes one fixed-field intent file as its unprivileged UID. The root host
agent validates its shape, age, inode/link state, action enum, package label,
and replay ID, then maps it to `scripts/terminology-host-operation.sh`. That
wrapper is the only privileged browser dispatcher and invokes only the packaged
import/resume/rollback/finalize scripts. It takes the persistent
`.data/io-mutation.lock`, shared with backup and release mutation, before a
terminology operation. Raw logs, source paths, licence text, database names,
run IDs, filenames, and credentials stay on the host; the Status projection is
an exact allowlist and rejects extra fields.

If the host stops while an operation is running, the agent retains the inflight
evidence, does not retry, and marks the page **needs operator**. Hospital IT
must review the protected host log and terminology state at the console. A
configured console-only update/host-agent mode also makes terminology controls
read-only; the console commands below remain supported.

## Supported import

Schedule a maintenance window: clinical, research, worker, backup, and Status
containers are stopped so no case write can be lost between database clone and
activation. Then run:

```sh
sudo sh /opt/lospor-hospital/current/scripts/import-terminology.sh package-directory --operator "Operator name"
```

The importer uses the signed tools image and its local `tsx`; it never invokes a
package manager or the network. It verifies the manifest, checks PostgreSQL
capacity, clones `lospor` into an isolated database, and imports in this order:

1. ICD-10/ATC and Bulgarian labels;
2. bundled canonical LOINC rows;
3. full Athena vocabulary, relationships, ancestors, and synonyms; and
4. local-to-standard concept maps.

It then checks all manifest minima, dangling relationships/ancestors, mapped
concept referential integrity, and bilingual ICD rows. Every package byte is
hashed again immediately before activation. Only a fully validated stage is
activated. The old live database is renamed and retained; the stage receives
the fixed `lospor` name. If the second rename fails, the first is reversed.
Before activation, the complete checksum evidence and hashes of the approved
minimum/count records are bound to the staged database itself. Host-side
evidence must match that marker, so stale evidence cannot approve an older
restored terminology generation.

An interruption leaves `pending.tsv`, the stage, logs, evidence, and the live
database intact. Re-run the exact package with `--resume`. A different package
cannot take over the pending generation.

## Go-live, rollback, and finalization

```sh
sudo sh /opt/lospor-hospital/current/scripts/terminology-status.sh --go-live
sudo sh /opt/lospor-hospital/current/scripts/doctor.sh --go-live
```

The package is optional: the release carries the codes clinical use needs.
`terminology-status.sh --go-live` fails until an approved manifest is active
and the live database still meets its count and integrity contract, and is how
an import is verified. `doctor.sh --go-live` applies that strict check only on
an appliance that has imported a package; without one it reports that the
bundled codes are in use. Emergency restore applies the same rule internally
before Caddy is reopened. If readiness fails after activation,
the importer automatically restores the retained prior database generation and
keeps public go-live refused.

During the review window, revert with:

```sh
sudo sh /opt/lospor-hospital/current/scripts/rollback-terminology.sh --confirm
```

The rejected generation is retained for investigation and the preceding
activation evidence is restored. Once the hospital accepts the new generation
and no longer needs instant rollback, permanently remove the retained database:

```sh
sudo sh /opt/lospor-hospital/current/scripts/finalize-terminology.sh --confirm-drop-rollback
```

Finalization is destructive and cannot be undone without a separate verified
backup. Status finalization first proves the active generation with
`terminology-status.sh --go-live`, removes the retained generation, and proves
readiness again. No command imports licensed terminology automatically during
install, update, CI, or release publication.
