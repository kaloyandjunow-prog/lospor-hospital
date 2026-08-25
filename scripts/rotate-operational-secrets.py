#!/usr/bin/env python3
"""Crash-recoverable rotation for ordinary LOSPOR Hospital credentials.

Secret values are generated and consumed only from protected files or process
stdin. They are never command-line arguments, audit facts, or console output.
Patient-linkage, data-encryption, MFA-encryption, backup-authentication, and
Central identity keys are deliberately outside this tool: each needs a
versioned data/protocol migration rather than a blind file replacement.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import secrets
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

try:
    import fcntl
except ImportError:  # Windows contract tests use the explicit test-only path.
    fcntl = None  # type: ignore[assignment]


SCHEMA_VERSION = 1
ENV_KEY = re.compile(r"^[A-Z][A-Z0-9_]{0,95}$")
ENV_LINE = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")
TRANSACTION_ID = re.compile(r"^[a-f0-9]{32}$")
SCOPES = {"sessions", "workers", "status-tokens", "database", "ordinary"}
PHASES = {
    "PREPARED",
    "APPLYING",
    "OVERLAP",
    "VERIFYING",
    "COMMITTED",
    "ROLLED_BACK",
    "ROLLBACK_REQUIRED",
}
ENV_SECRET_BYTES = {
    "LOSPOR_AUTH_SECRET": 48,
    "HOSPITAL_WORKER_TOKEN": 32,
    "RESEARCH_EXPORT_WORKER_SECRET": 32,
    "CRON_SECRET": 32,
    "OPTION_LIBRARY_SNAPSHOT_SECRET": 32,
    "HOSPITAL_POSTGRES_PASSWORD": 32,
}
WORKER_KEYS = (
    "HOSPITAL_WORKER_TOKEN",
    "RESEARCH_EXPORT_WORKER_SECRET",
    "CRON_SECRET",
    "OPTION_LIBRARY_SNAPSHOT_SECRET",
)
STATUS_TOKEN_NAMES = (
    "snapshot-token",
    "account-control-token",
    "api-event-token",
    "db-probe-password",
)

_OPERATOR_LOCALE = "bg"


def select_operator_locale(root: Path) -> str:
    explicit = os.environ.get("LOSPOR_OPERATOR_LOCALE") or os.environ.get("LOSPOR_DEFAULT_LOCALE")
    selected = explicit
    if selected is None:
        try:
            for line in (root / ".env").read_text(encoding="utf-8").splitlines():
                if line.startswith("LOSPOR_DEFAULT_LOCALE="):
                    selected = line.split("=", 1)[1].strip().strip('"')
        except (OSError, UnicodeError):
            selected = None
    return "en" if selected == "en" else "bg"


def operator_text(english: str, bulgarian: str) -> str:
    return english if _OPERATOR_LOCALE == "en" else bulgarian


def docker_label_bg(label: str) -> str:
    labels = {
        "recreate and wait for appliance services": "пресъздаване и изчакване на услугите на системата",
        "materialize runtime secrets": "създаване на временните тайни за изпълнение",
        "restart Status": "рестартиране на Status",
        "verify Status liveness": "проверка на достъпността на Status",
        "verify API readiness": "проверка на готовността на API",
        "prove retired HTTP credentials are rejected": "доказване, че изведените от употреба HTTP данни за достъп се отказват",
        "start database for rollback": "стартиране на базата данни за отмяна",
    }
    if label.startswith("rotate ") and label.endswith(" database credential"):
        role = label.removeprefix("rotate ").removesuffix(" database credential")
        return f"смяна на данните за достъп до базата данни за {role}"
    return labels.get(label, label)


class RotationError(RuntimeError):
    def __init__(self, english: str, bulgarian: str) -> None:
        super().__init__(operator_text(english, bulgarian))


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def fail(message: str, code: int = 1) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def scope_includes(scope: str, member: str) -> bool:
    return scope == "ordinary" or scope == member


def assert_safe_regular(path: Path, *, required: bool = True) -> os.stat_result | None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        if required:
            raise RotationError(
                f"Required protected file is missing: {path.name}",
                f"Необходимият защитен файл липсва: {path.name}",
            )
        return None
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise RotationError(
            f"Protected file is not a single regular file: {path.name}",
            f"Защитеният файл не е един обикновен файл: {path.name}",
        )
    # NTFS does not expose POSIX owner/group mode bits. Production rotation is
    # Linux-only and enforces 0600 there; Windows is used only for contract tests.
    if os.name != "nt" and info.st_mode & 0o077:
        raise RotationError(
            f"Protected file permissions are too broad: {path.name}",
            f"Правата на защитения файл са прекалено широки: {path.name}",
        )
    return info


def fsync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_bytes(path: Path, content: bytes, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}-{secrets.token_hex(4)}")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.close(descriptor)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
        fsync_directory(path.parent)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        temporary.unlink(missing_ok=True)
        raise


def atomic_text(path: Path, content: str, mode: int = 0o600) -> None:
    atomic_bytes(path, content.encode("utf-8"), mode)


def read_secret(path: Path, minimum: int = 24, maximum: int = 8192) -> str:
    assert_safe_regular(path)
    value = path.read_text(encoding="utf-8").strip()
    if len(value) < minimum or len(value) > maximum or any(char in value for char in "\r\n\0"):
        raise RotationError(
            f"Protected credential has an invalid format: {path.name}",
            f"Защитените данни за достъп са в невалиден формат: {path.name}",
        )
    return value


def parse_env(path: Path) -> tuple[list[str], dict[str, str]]:
    assert_safe_regular(path)
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    values: dict[str, str] = {}
    for line in lines:
        match = ENV_LINE.match(line)
        if not match:
            continue
        key, value = match.groups()
        if key in values:
            raise RotationError(
                f"Duplicate environment key: {key}",
                f"Дублиран ключ на средата: {key}",
            )
        values[key] = value
    return lines, values


def update_env(path: Path, changes: dict[str, str | None]) -> None:
    lines, _ = parse_env(path)
    for key, value in changes.items():
        if not ENV_KEY.fullmatch(key):
            raise RotationError(
                "Invalid environment key in rotation transaction",
                "Невалиден ключ на средата в транзакцията за смяна",
            )
        if value is not None and (len(value) > 8192 or any(char in value for char in "\r\n\0")):
            raise RotationError(
                f"Invalid protected value for {key}",
                f"Невалидна защитена стойност за {key}",
            )
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        match = ENV_LINE.match(line)
        if not match or match.group(1) not in changes:
            output.append(line)
            continue
        key = match.group(1)
        if key in seen:
            raise RotationError(
                f"Duplicate environment key: {key}",
                f"Дублиран ключ на средата: {key}",
            )
        seen.add(key)
        replacement = changes[key]
        if replacement is not None:
            output.append(f"{key}={replacement}")
    for key, value in changes.items():
        if key not in seen and value is not None:
            output.append(f"{key}={value}")
    atomic_text(path, "\n".join(output) + "\n")


class Rotation:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.env_path = self.root / ".env"
        self.rotation_dir = self.root / "secrets" / "rotation"
        self.pending = self.rotation_dir / "pending"
        self.audit_path = self.root / ".data" / "security" / "secret-rotations.v1.jsonl"
        self.test_only = os.environ.get("HOSPITAL_SECRET_ROTATION_TEST_ONLY") == "1"
        self._test_failure_used = False
        self.locale = self._locale()
        self._operation_lock = None
        self._io_lock = None

    def _test_fail(self, point: str) -> None:
        if (
            self.test_only
            and not self._test_failure_used
            and os.environ.get("HOSPITAL_SECRET_ROTATION_TEST_FAIL_POINT") == point
        ):
            self._test_failure_used = True
            raise RotationError(
                f"Injected test failure: {point}",
                f"Инжектиран тестов отказ: {point}",
            )

    def _locale(self) -> str:
        return _OPERATOR_LOCALE

    def say(self, english: str, bulgarian: str) -> None:
        print(english if self.locale == "en" else bulgarian)

    def _lock_file(self, path: Path, *, io_lock: bool = False) -> None:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        stream = path.open("a+b")
        os.chmod(path, 0o600)
        if not self.test_only:
            if fcntl is None:
                stream.close()
                raise RotationError(
                    "Secret rotation requires Linux file locking",
                    "Смяната на тайни изисква файлово заключване на Linux",
                )
            try:
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                stream.close()
                label = "maintenance" if io_lock else "secret-rotation"
                label_bg = "поддръжка" if io_lock else "смяна на тайни"
                raise RotationError(
                    f"Another {label} operation is already running",
                    f"Вече се изпълнява друга операция за {label_bg}",
                ) from error
        if io_lock:
            self._io_lock = stream
        else:
            self._operation_lock = stream

    def lock_operation(self) -> None:
        self.rotation_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.rotation_dir, 0o700)
        self._lock_file(self.rotation_dir / "operation.lock")

    def lock_io(self) -> None:
        io_path = self.root / ".data" / "io-mutation.lock"
        if not io_path.exists():
            atomic_text(io_path, "")
        self._lock_file(io_path, io_lock=True)

    def audit(self, metadata: dict[str, object], phase: str) -> None:
        record = {
            "schemaVersion": SCHEMA_VERSION,
            "occurredAt": utc_now(),
            "transactionId": metadata["transactionId"],
            "scope": metadata["scope"],
            "generation": metadata["generation"],
            "phase": phase,
        }
        self.audit_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        line = json.dumps(record, separators=(",", ":"), sort_keys=True) + "\n"
        descriptor = os.open(self.audit_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(descriptor, line.encode("utf-8"))
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.chmod(self.audit_path, 0o600)

    def metadata(self, directory: Path | None = None) -> dict[str, object]:
        path = (directory or self.pending) / "metadata.json"
        assert_safe_regular(path)
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            raise RotationError(
                "Pending rotation metadata is invalid",
                "Метаданните на чакащата смяна са невалидни",
            ) from error
        required = {"schemaVersion", "transactionId", "scope", "generation", "preparedAt", "phase"}
        if not isinstance(value, dict) or set(value) != required:
            raise RotationError(
                "Pending rotation metadata has an invalid schema",
                "Метаданните на чакащата смяна имат невалидна схема",
            )
        if value["schemaVersion"] != SCHEMA_VERSION or value["scope"] not in SCOPES:
            raise RotationError(
                "Pending rotation metadata has unsupported values",
                "Метаданните на чакащата смяна съдържат неподдържани стойности",
            )
        if not isinstance(value["transactionId"], str) or not TRANSACTION_ID.fullmatch(value["transactionId"]):
            raise RotationError(
                "Pending rotation identifier is invalid",
                "Идентификаторът на чакащата смяна е невалиден",
            )
        if not isinstance(value["generation"], int) or not 2 <= value["generation"] <= 1_000_000:
            raise RotationError(
                "Pending rotation generation is invalid",
                "Поколението на чакащата смяна е невалидно",
            )
        if value["phase"] not in PHASES:
            raise RotationError(
                "Pending rotation phase is invalid",
                "Етапът на чакащата смяна е невалиден",
            )
        return value

    def committed_residues(self) -> list[Path]:
        if not self.rotation_dir.exists():
            return []
        residues: list[Path] = []
        for path in self.rotation_dir.iterdir():
            match = re.fullmatch(r"\.committed-([a-f0-9]{32})", path.name)
            if match is None:
                continue
            info = path.lstat()
            if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
                raise RotationError(
                    f"Committed cleanup path is unsafe: {path.name}",
                    f"Пътят за почистване на приложена смяна е небезопасен: {path.name}",
                )
            metadata = self.metadata(path)
            if metadata["phase"] != "COMMITTED" or metadata["transactionId"] != match.group(1):
                raise RotationError(
                    f"Committed cleanup metadata is invalid: {path.name}",
                    f"Метаданните за почистване на приложена смяна са невалидни: {path.name}",
                )
            residues.append(path)
        return sorted(residues)

    def write_metadata(self, metadata: dict[str, object], phase: str) -> None:
        updated = {**metadata, "phase": phase}
        atomic_text(
            self.pending / "metadata.json",
            json.dumps(updated, indent=2, sort_keys=True) + "\n",
        )
        metadata.clear()
        metadata.update(updated)
        self.audit(metadata, phase)

    def prepare(self, scope: str) -> None:
        if scope not in SCOPES:
            raise RotationError("Unknown rotation scope", "Непознат обхват на смяната")
        if self.pending.exists():
            raise RotationError(
                "A prepared secret rotation already exists",
                "Вече съществува подготвена смяна на тайни",
            )
        if self.committed_residues():
            raise RotationError(
                "A committed rotation still needs protected cleanup; run cleanup first",
                "Приложена смяна все още изисква защитено почистване; първо изпълнете cleanup",
            )
        _, env_values = parse_env(self.env_path)
        generation_text = env_values.get("HOSPITAL_OPERATIONAL_SECRET_GENERATION", "1")
        if not generation_text.isdigit() or not 1 <= int(generation_text) < 1_000_000:
            raise RotationError(
                "HOSPITAL_OPERATIONAL_SECRET_GENERATION is invalid",
                "HOSPITAL_OPERATIONAL_SECRET_GENERATION е невалидно",
            )
        generation = int(generation_text) + 1
        transaction_id = secrets.token_hex(16)
        stage = self.rotation_dir / f".prepare-{transaction_id}"
        stage.mkdir(mode=0o700)
        published = False
        try:
            shutil.copyfile(self.env_path, stage / "original.env")
            os.chmod(stage / "original.env", 0o600)
            new_dir = stage / "new"
            new_dir.mkdir(mode=0o700)
            keys: list[str] = []
            if scope_includes(scope, "sessions"):
                keys.append("LOSPOR_AUTH_SECRET")
            if scope_includes(scope, "workers"):
                keys.extend(WORKER_KEYS)
            if scope_includes(scope, "database"):
                keys.append("HOSPITAL_POSTGRES_PASSWORD")
            for key in keys:
                old = env_values.get(key, "")
                if len(old) < 24 or any(char in old for char in "\r\n\0"):
                    raise RotationError(
                        f"Existing protected value is invalid: {key}",
                        f"Съществуващата защитена стойност е невалидна: {key}",
                    )
                atomic_text(new_dir / key, secrets.token_hex(ENV_SECRET_BYTES[key]))

            if scope_includes(scope, "status-tokens"):
                old_dir = stage / "status-original"
                new_status_dir = stage / "status-new"
                old_dir.mkdir(mode=0o700)
                new_status_dir.mkdir(mode=0o700)
                for name in STATUS_TOKEN_NAMES:
                    source = self.root / "secrets" / "status" / name
                    read_secret(source)
                    shutil.copyfile(source, old_dir / name)
                    os.chmod(old_dir / name, 0o600)
                    atomic_text(new_status_dir / name, secrets.token_hex(32))

            metadata: dict[str, object] = {
                "schemaVersion": SCHEMA_VERSION,
                "transactionId": transaction_id,
                "scope": scope,
                "generation": generation,
                "preparedAt": utc_now(),
                "phase": "PREPARED",
            }
            atomic_text(stage / "metadata.json", json.dumps(metadata, indent=2, sort_keys=True) + "\n")
            os.replace(stage, self.pending)
            published = True
            fsync_directory(self.rotation_dir)
            self._test_fail("after publishing prepared transaction")
            self.audit(metadata, "PREPARED")
        except BaseException:
            cleanup = self.pending if published else stage
            shutil.rmtree(cleanup, ignore_errors=True)
            fsync_directory(self.rotation_dir)
            raise
        self.say(
            f"Prepared protected credential rotation generation {generation}. Run commit after review.",
            f"Подготвена е защитена смяна на данните за достъп, поколение {generation}. След преглед изпълнете commit.",
        )

    def _docker(self, arguments: list[str], *, input_data: bytes | None = None, label: str) -> None:
        if self.test_only:
            log_path = os.environ.get("HOSPITAL_SECRET_ROTATION_DOCKER_LOG")
            if log_path:
                with Path(log_path).open("a", encoding="utf-8") as stream:
                    stream.write(json.dumps({"arguments": arguments, "hadStdin": input_data is not None}) + "\n")
            fail_label = os.environ.get("HOSPITAL_SECRET_ROTATION_TEST_FAIL_LABEL")
            if fail_label == label and not self._test_failure_used:
                self._test_failure_used = True
                raise RotationError(
                    f"Container step failed: {label}",
                    f"Стъпката в контейнер се провали: {docker_label_bg(label)}",
                )
            return
        result = subprocess.run(
            ["docker", "compose", *arguments],
            cwd=self.root,
            input=input_data,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0:
            raise RotationError(
                f"Container step failed: {label}",
                f"Стъпката в контейнер се провали: {docker_label_bg(label)}",
            )

    def _converge(self) -> None:
        self._docker(
            ["up", "-d", "--remove-orphans", "--wait", "--wait-timeout", "300"],
            label="recreate and wait for appliance services",
        )

    def _runtime_secrets(self) -> None:
        self._docker(
            ["run", "--rm", "--no-deps", "-T", "runtime-secrets-init"],
            label="materialize runtime secrets",
        )

    def _restart_status(self) -> None:
        self._docker(["restart", "status"], label="restart Status")
        self._docker(
            ["exec", "-T", "status", "node", "-e",
             "fetch('http://127.0.0.1:3004/internal/health/live',{signal:AbortSignal.timeout(10000)}).then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"],
            label="verify Status liveness",
        )

    def _alter_role(self, role: str, password: str) -> None:
        if role not in {"lospor", "lospor_status_probe"}:
            raise RotationError(
                "Unsupported database role in rotation transaction",
                "Неподдържана роля в базата данни в транзакцията за смяна",
            )
        if len(password) < 24 or len(password) > 8192 or any(char in password for char in "\r\n\0"):
            raise RotationError(
                "Invalid database credential in rotation transaction",
                "Невалидни данни за достъп до базата данни в транзакцията за смяна",
            )
        literal = password.replace("'", "''")
        sql = f"ALTER ROLE {role} WITH PASSWORD '{literal}';\n".encode("utf-8")
        self._docker(
            ["exec", "-T", "--user", "postgres", "postgres", "psql", "--no-psqlrc",
             "--set=ON_ERROR_STOP=1", "--username", "lospor", "--dbname", "postgres"],
            input_data=sql,
            label=f"rotate {role} database credential",
        )

    def _verify_db_password(self, role: str, password: str, *, accepted: bool) -> None:
        command = (
            "IFS= read -r candidate; export PGPASSWORD=\"$candidate\"; "
            f"psql --no-psqlrc -h 127.0.0.1 -U {role} -d lospor -c 'SELECT 1' >/dev/null 2>&1"
        )
        result = subprocess.run(
            ["docker", "compose", "exec", "-T", "postgres", "sh", "-c", command],
            cwd=self.root,
            input=(password + "\n").encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if (result.returncode == 0) != accepted:
            state = "accepted" if accepted else "retired"
            state_bg = "приета" if accepted else "изведена от употреба"
            raise RotationError(
                f"Database credential was not proven {state}: {role}",
                f"Не беше доказано, че данните за достъп до базата данни са {state_bg}: {role}",
            )

    def _status_event_file(self, current: str, alternate: str | None) -> None:
        payload: dict[str, str] = {"api": current}
        if alternate is not None and alternate != current:
            payload["api-previous"] = alternate
        atomic_text(
            self.root / "secrets" / "status" / "event-tokens.json",
            json.dumps(payload, separators=(",", ":"), sort_keys=True) + "\n",
        )

    def _install_secret(self, source: Path, destination: Path) -> None:
        value = read_secret(source)
        atomic_text(destination, value + "\n")

    def _status_overlap(self) -> None:
        source_dir = self.root / "secrets" / "status"
        old_dir = self.pending / "status-original"
        new_dir = self.pending / "status-new"
        for name in STATUS_TOKEN_NAMES[:3]:
            self._install_secret(new_dir / name, source_dir / f"{name}.previous")
        self._status_event_file(read_secret(old_dir / "api-event-token"), read_secret(new_dir / "api-event-token"))
        self._runtime_secrets()
        self._restart_status()

        for name in STATUS_TOKEN_NAMES[:3]:
            self._install_secret(new_dir / name, source_dir / name)
            self._install_secret(old_dir / name, source_dir / f"{name}.previous")
        self._status_event_file(read_secret(new_dir / "api-event-token"), read_secret(old_dir / "api-event-token"))
        self._runtime_secrets()
        self._restart_status()

        new_probe = read_secret(new_dir / "db-probe-password")
        self._alter_role("lospor_status_probe", new_probe)
        self._install_secret(new_dir / "db-probe-password", source_dir / "db-probe-password")
        self._runtime_secrets()
        self._restart_status()

    def _retire_status_overlap(self) -> None:
        source_dir = self.root / "secrets" / "status"
        for name in STATUS_TOKEN_NAMES[:3]:
            previous = source_dir / f"{name}.previous"
            info = assert_safe_regular(previous, required=False)
            if info is not None:
                previous.unlink()
        current_event = read_secret(source_dir / "api-event-token")
        self._status_event_file(current_event, None)
        self._runtime_secrets()
        self._restart_status()

    def _initial_env_changes(self, metadata: dict[str, object]) -> dict[str, str | None]:
        scope = str(metadata["scope"])
        _, original = parse_env(self.pending / "original.env")
        changes: dict[str, str | None] = {
            "HOSPITAL_OPERATIONAL_SECRET_GENERATION": str(metadata["generation"]),
        }
        if scope_includes(scope, "sessions"):
            changes["LOSPOR_AUTH_SECRET"] = read_secret(self.pending / "new" / "LOSPOR_AUTH_SECRET")
        if scope_includes(scope, "database"):
            changes["HOSPITAL_POSTGRES_PASSWORD"] = read_secret(
                self.pending / "new" / "HOSPITAL_POSTGRES_PASSWORD",
            )
        if scope_includes(scope, "workers"):
            for key in WORKER_KEYS:
                changes[key] = read_secret(self.pending / "new" / key)
                changes[f"{key}_PREVIOUS"] = original[key]
        return changes

    def _retire_worker_overlap(self) -> None:
        update_env(self.env_path, {f"{key}_PREVIOUS": None for key in WORKER_KEYS})
        self._converge()

    def _verify_services(self) -> None:
        self._docker(
            ["exec", "-T", "api", "node", "-e",
             "fetch('http://127.0.0.1:3002/health/ready',{signal:AbortSignal.timeout(10000)}).then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"],
            label="verify API readiness",
        )
        self._docker(
            ["exec", "-T", "status", "node", "-e",
             "fetch('http://127.0.0.1:3004/internal/health/live',{signal:AbortSignal.timeout(10000)}).then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"],
            label="verify Status liveness",
        )

    def _verify_retired_http_credentials(self, metadata: dict[str, object]) -> None:
        scope = str(metadata["scope"])
        payload: dict[str, str] = {}
        _, original = parse_env(self.pending / "original.env")
        if scope_includes(scope, "workers"):
            payload.update({key: original[key] for key in WORKER_KEYS})
        if scope_includes(scope, "status-tokens"):
            old_dir = self.pending / "status-original"
            payload.update({f"STATUS_{name}": read_secret(old_dir / name) for name in STATUS_TOKEN_NAMES[:3]})
        if not payload or self.test_only:
            return
        script = r"""
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',async()=>{
  const s=JSON.parse(raw);const checks=[];
  if(s.HOSPITAL_WORKER_TOKEN)checks.push(['delivery',fetch('http://127.0.0.1:3002/v1/internal/hospital-delivery/process',{method:'POST',headers:{authorization:'Bearer '+s.HOSPITAL_WORKER_TOKEN}}),403]);
  if(s.RESEARCH_EXPORT_WORKER_SECRET)checks.push(['research',fetch('http://127.0.0.1:3002/v1/internal/research-exports/process',{method:'POST',headers:{authorization:'Bearer '+s.RESEARCH_EXPORT_WORKER_SECRET}}),401]);
  if(s.CRON_SECRET)checks.push(['cron',fetch('http://127.0.0.1:3002/v1/internal/purge-deleted',{headers:{authorization:'Bearer '+s.CRON_SECRET}}),403]);
  if(s.OPTION_LIBRARY_SNAPSHOT_SECRET)checks.push(['snapshot',fetch('http://127.0.0.1:3002/v1/internal/option-library-snapshot',{headers:{'x-snapshot-secret':s.OPTION_LIBRARY_SNAPSHOT_SECRET}}),403]);
  if(s['STATUS_snapshot-token'])checks.push(['status-snapshot',fetch('http://127.0.0.1:3002/internal/appliance-status',{headers:{authorization:'Bearer '+s['STATUS_snapshot-token']}}),401]);
  if(s['STATUS_account-control-token'])checks.push(['status-control',fetch('http://127.0.0.1:3002/v1/internal/hospital/accounts',{headers:{authorization:'Bearer '+s['STATUS_account-control-token']}}),401]);
  if(s['STATUS_api-event-token'])checks.push(['status-event',fetch('http://status:3004/internal/events',{method:'POST',headers:{authorization:'Bearer '+s['STATUS_api-event-token'],'content-type':'application/json'},body:'{}'}),401]);
  for(const [name,promise,expected] of checks){const response=await promise;if(response.status!==expected)throw new Error(name)}
}).catch(()=>process.exit(1));
"""
        self._docker(
            ["exec", "-T", "api", "node", "-e", script],
            input_data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            label="prove retired HTTP credentials are rejected",
        )

    def commit(self) -> None:
        if self.pending.exists():
            metadata = self.metadata()
        else:
            residues = self.committed_residues()
            if len(residues) != 1:
                raise RotationError(
                    "No pending credential rotation exists",
                    "Няма чакаща смяна на данните за достъп",
                )
            metadata = self.metadata(residues[0])
            self._finalize_commit(metadata)
            self._say_committed(metadata)
            return
        scope = str(metadata["scope"])
        phase = str(metadata["phase"])
        if phase == "COMMITTED":
            self._finalize_commit(metadata)
            self._say_committed(metadata)
            return
        if phase in {"ROLLED_BACK", "ROLLBACK_REQUIRED"}:
            raise RotationError(
                "This transaction cannot be committed; run rollback",
                "Тази транзакция не може да бъде приложена; изпълнете rollback",
            )
        self.lock_io()
        try:
            self.write_metadata(metadata, "APPLYING")
            if scope_includes(scope, "database"):
                self._alter_role(
                    "lospor",
                    read_secret(self.pending / "new" / "HOSPITAL_POSTGRES_PASSWORD"),
                )
            update_env(self.env_path, self._initial_env_changes(metadata))
            if any(scope_includes(scope, member) for member in ("sessions", "workers", "database")):
                self._converge()
            if scope_includes(scope, "status-tokens"):
                self.write_metadata(metadata, "OVERLAP")
                self._status_overlap()
            self.write_metadata(metadata, "VERIFYING")
            self._verify_services()
            if scope_includes(scope, "database"):
                new_db = read_secret(self.pending / "new" / "HOSPITAL_POSTGRES_PASSWORD")
                old_db = parse_env(self.pending / "original.env")[1]["HOSPITAL_POSTGRES_PASSWORD"]
                if not self.test_only:
                    self._verify_db_password("lospor", new_db, accepted=True)
                    self._verify_db_password("lospor", old_db, accepted=False)
            if scope_includes(scope, "status-tokens") and not self.test_only:
                new_probe = read_secret(self.pending / "status-new" / "db-probe-password")
                old_probe = read_secret(self.pending / "status-original" / "db-probe-password")
                self._verify_db_password("lospor_status_probe", new_probe, accepted=True)
                self._verify_db_password("lospor_status_probe", old_probe, accepted=False)
            if scope_includes(scope, "workers"):
                self._retire_worker_overlap()
            if scope_includes(scope, "status-tokens"):
                self._retire_status_overlap()
            self._verify_retired_http_credentials(metadata)
            self._verify_services()
            self.write_metadata(metadata, "COMMITTED")
        except BaseException as error:
            # write_metadata persists the state before appending its audit fact.
            # If that final audit append failed, the verified rotation is already
            # committed and must never be reverted merely for bookkeeping.
            try:
                persisted_phase = self.metadata()["phase"]
            except BaseException:
                persisted_phase = None
            if persisted_phase == "COMMITTED":
                raise RotationError(
                    "Credential rotation committed and verified, but final bookkeeping is incomplete; "
                    "run commit again",
                    "Смяната на данните за достъп е приложена и проверена, но окончателното отчитане не е "
                    "завършено; изпълнете commit отново",
                ) from error
            try:
                self._rollback(metadata, automatic=True)
            except BaseException:
                self.write_metadata(metadata, "ROLLBACK_REQUIRED")
                raise RotationError(
                    "Rotation failed and automatic rollback could not be proven; use state and rollback",
                    "Смяната се провали и автоматичната отмяна не можа да бъде доказана; използвайте state и rollback",
                ) from error
            raise RotationError(
                "Rotation failed; the prior credentials were restored and verified",
                "Смяната се провали; предишните данни за достъп бяха възстановени и проверени",
            ) from error
        self._finalize_commit(metadata)
        self._say_committed(metadata)

    def _say_committed(self, metadata: dict[str, object]) -> None:
        self.say(
            f"Credential rotation generation {metadata['generation']} committed and verified.",
            f"Смяната на данните за достъп, поколение {metadata['generation']}, е приложена и проверена.",
        )

    def _finalize_commit(self, metadata: dict[str, object]) -> None:
        last = self.audit_path.parent / "last-secret-rotation.v1.json"
        residue = self.rotation_dir / f".committed-{metadata['transactionId']}"
        try:
            atomic_text(last, json.dumps(metadata, indent=2, sort_keys=True) + "\n")
            if self.pending.exists():
                if residue.exists():
                    raise RotationError(
                        "Committed cleanup target already exists",
                        "Целта за почистване на приложената смяна вече съществува",
                    )
                os.replace(self.pending, residue)
                fsync_directory(self.rotation_dir)
            self._test_fail("before removing committed residue")
            shutil.rmtree(residue)
            fsync_directory(self.rotation_dir)
        except BaseException as error:
            raise RotationError(
                "Credential rotation committed and verified, but final bookkeeping or protected cleanup is "
                "incomplete; run commit again, or run cleanup if state reports a committed residue",
                "Смяната на данните за достъп е приложена и проверена, но окончателното отчитане или "
                "защитеното почистване не е завършено; изпълнете commit отново или cleanup, ако state показва "
                "остатък от приложена смяна",
            ) from error

    def _restore_status_sources(self) -> None:
        source_dir = self.root / "secrets" / "status"
        old_dir = self.pending / "status-original"
        for name in STATUS_TOKEN_NAMES:
            self._install_secret(old_dir / name, source_dir / name)
        for name in STATUS_TOKEN_NAMES[:3]:
            previous = source_dir / f"{name}.previous"
            info = assert_safe_regular(previous, required=False)
            if info is not None:
                previous.unlink()
        self._status_event_file(read_secret(old_dir / "api-event-token"), None)

    def _rollback(self, metadata: dict[str, object], *, automatic: bool) -> None:
        scope = str(metadata["scope"])
        original_path = self.pending / "original.env"
        _, original = parse_env(original_path)
        if scope_includes(scope, "database") or scope_includes(scope, "status-tokens"):
            self._docker(["up", "-d", "postgres"], label="start database for rollback")
        if scope_includes(scope, "database"):
            self._alter_role("lospor", original["HOSPITAL_POSTGRES_PASSWORD"])
        if scope_includes(scope, "status-tokens"):
            self._alter_role(
                "lospor_status_probe",
                read_secret(self.pending / "status-original" / "db-probe-password"),
            )
            self._restore_status_sources()
        assert_safe_regular(original_path)
        atomic_bytes(self.env_path, original_path.read_bytes())
        if scope_includes(scope, "status-tokens"):
            self._runtime_secrets()
        self._converge()
        self._verify_services()
        self.write_metadata(metadata, "ROLLED_BACK")
        shutil.rmtree(self.pending)
        fsync_directory(self.rotation_dir)
        if not automatic:
            self.say(
                "The prepared rotation was rolled back and the prior appliance state was verified.",
                "Подготвената смяна е отменена и предишното състояние на системата е проверено.",
            )

    def rollback(self) -> None:
        metadata = self.metadata()
        if metadata["phase"] == "COMMITTED":
            raise RotationError(
                "A verified committed rotation cannot be rolled back; run commit to finish cleanup",
                "Проверена приложена смяна не може да бъде отменена; изпълнете commit, за да завършите почистването",
            )
        self.lock_io()
        self._rollback(metadata, automatic=False)

    def cleanup(self) -> None:
        if self.pending.exists():
            raise RotationError(
                "A rotation transaction is still pending; use commit or rollback",
                "Все още има чакаща транзакция за смяна; използвайте commit или rollback",
            )
        residues = self.committed_residues()
        for residue in residues:
            shutil.rmtree(residue)
        if residues:
            fsync_directory(self.rotation_dir)
        self.say(
            f"Protected cleanup complete. Removed {len(residues)} committed rotation residue(s).",
            f"Защитеното почистване приключи. Премахнати остатъци от приложени смени: {len(residues)}.",
        )

    def state(self) -> None:
        if not self.pending.exists():
            _, values = parse_env(self.env_path)
            generation = values.get("HOSPITAL_OPERATIONAL_SECRET_GENERATION", "1")
            residues = len(self.committed_residues())
            if residues:
                self.say(
                    f"No rotation is pending, but {residues} protected committed residue(s) need cleanup. "
                    f"Active generation: {generation}.",
                    f"Няма чакаща смяна, но {residues} защитени остатъка от приложена смяна трябва да се "
                    f"почистят. Активно поколение: {generation}.",
                )
                return
            self.say(
                f"No credential rotation is pending. Active generation: {generation}.",
                f"Няма чакаща смяна на данните за достъп. Активно поколение: {generation}.",
            )
            return
        metadata = self.metadata()
        self.say(
            f"Pending rotation: scope={metadata['scope']} generation={metadata['generation']} phase={metadata['phase']}.",
            f"Чакаща смяна: обхват={metadata['scope']} поколение={metadata['generation']} етап={metadata['phase']}.",
        )


def usage() -> NoReturn:
    fail(
        operator_text(
            "Usage: rotate-operational-secrets.py prepare "
            "<sessions|workers|status-tokens|database|ordinary> | commit | rollback | cleanup | state",
            "Употреба: rotate-operational-secrets.py prepare "
            "<sessions|workers|status-tokens|database|ordinary> | commit | rollback | cleanup | state",
        ),
        2,
    )


def main() -> None:
    global _OPERATOR_LOCALE
    arguments = sys.argv[1:]
    root_override = os.environ.get("HOSPITAL_SECRET_ROTATION_ROOT")
    root = Path(root_override) if root_override else Path(__file__).resolve().parent.parent
    _OPERATOR_LOCALE = select_operator_locale(root)
    if not 1 <= len(arguments) <= 2:
        usage()
    action = arguments[0]
    if action == "prepare" and len(arguments) != 2:
        usage()
    if action != "prepare" and len(arguments) != 1:
        usage()
    rotation = Rotation(root)
    if not rotation.test_only and hasattr(os, "geteuid") and os.geteuid() != 0:
        raise RotationError(
            "Operational credential rotation must run as root on the appliance host",
            "Смяната на оперативните данни за достъп трябва да се изпълни като root на хоста на системата",
        )
    rotation.lock_operation()
    if action == "prepare":
        rotation.prepare(arguments[1])
    elif action == "commit":
        rotation.commit()
    elif action == "rollback":
        rotation.rollback()
    elif action == "cleanup":
        rotation.cleanup()
    elif action == "state":
        rotation.state()
    else:
        usage()


if __name__ == "__main__":
    try:
        main()
    except RotationError as error:
        fail(str(error))
