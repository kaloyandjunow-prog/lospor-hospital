#!/usr/bin/env python3
"""Test fixture: a security-evidence archive holding a release dossier that
matches a locally built test release. Used by the installer and update pipeline
suites; real dossiers come only from create-release-dossier.mjs in release.yml.

    python3 scripts/release-dossier-fixture.py OUT.tar.gz --version V --commit C
        --run R --attempt A --deployment PATH [--offline PATH ...]
        --image NAME REFERENCE DIGEST  (ten times)
"""

import hashlib
import io
import json
import os
import sys
import tarfile


def artifact(path):
    with open(path, "rb") as handle:
        data = handle.read()
    return {"file": os.path.basename(path), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main(arguments):
    output, rest = arguments[0], arguments[1:]
    options = {"offline": [], "image": []}
    index = 0
    while index < len(rest):
        name = rest[index].lstrip("-")
        if name == "image":
            options["image"].append(rest[index + 1:index + 4])
            index += 4
        elif name == "offline":
            options["offline"].append(rest[index + 1])
            index += 2
        else:
            options[name] = rest[index + 1]
            index += 2
    version, commit, run, attempt = options["version"], options["commit"], options["run"], int(options["attempt"])
    repository = "kaloyandjunow-prog/lospor-hospital"
    names = [image[0] for image in options["image"]]
    placeholder = {"file": "fixture", "sha256": "0" * 64}
    dossier = {
        "schemaVersion": 1,
        "kind": "lospor-hospital-release-dossier",
        "release": {"version": version, "tag": f"hospital-{version}", "commit": commit, "platform": "linux/amd64",
                    "createdAt": "2026-09-14T00:00:00.000Z"},
        "build": {"repository": repository, "workflow": ".github/workflows/release.yml", "runId": run, "runAttempt": attempt,
                  "runUrl": f"https://github.com/{repository}/actions/runs/{run}/attempts/{attempt}"},
        "compatibility": {"schemaMinimum": "20260530000000_init", "schemaMaximum": "20260913130000_external_ai_models",
                          "rollbackPolicy": "backup-required", "rollbackWindowDays": 0},
        "images": [{"name": name, "reference": reference, "digest": digest} for name, reference, digest in options["image"]],
        "vulnerabilities": {"severities": ["CRITICAL", "HIGH"], "critical": 0, "high": 1,
                            "perImage": {name: {"critical": 0, "high": 1 if name == "postgres" else 0} for name in names},
                            "exceptions": [{"image": "postgres", "vulnerabilityId": "CVE-2026-16742", "package": "libsystemd0",
                                            "expiresAt": "2026-12-08"}]},
        "evidence": {"vulnerabilityReports": [{"image": name, **placeholder} for name in names],
                     "sboms": [{"image": name, **placeholder, "components": 100} for name in names],
                     "riskExceptions": placeholder, "imageLock": placeholder, "postgresSourceProvenance": placeholder},
        "artifacts": {"deployment": artifact(options["deployment"]), "offlineParts": [artifact(path) for path in options["offline"]]},
        "upstream": {"api": {"version": "9.9.5", "identity": "commit:" + "a" * 40}},
    }
    data = json.dumps(dossier, indent=2).encode("utf-8") + b"\n"
    with tarfile.open(output, "w:gz") as archive:
        info = tarfile.TarInfo("release-evidence/release-dossier.json")
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))


if __name__ == "__main__":
    main(sys.argv[1:])
