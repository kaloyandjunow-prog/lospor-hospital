# External AI control on a Hospital appliance

[Български](external-ai-control.bg.md) | **English**

LOSPOR Hospital supports Mistral as an optional external AI provider.
The guided installer asks whether external AI should be allowed and defaults
to **Yes**. That choice is only deployment permission: AI remains unavailable
until Hospital IT supplies a provider credential. The two safe unavailable
states are therefore different:

- `DISABLED_BY_DEPLOYMENT`: Hospital policy does not allow external AI.
- `PROVIDER_NOT_CONFIGURED`: policy allows it, but no usable sealed Mistral
  credential is present.

`ENABLED` is reported only when both policy and credential are usable. Policy
and credential are independent: disabling external AI retains the sealed
credential for a later re-enable, while removing the credential immediately
makes every AI capability unavailable without changing the policy choice.

## Status workflow

Only a normal password-authenticated appliance-operator session can change the
policy, replace the credential, or remove it at `/status/control`. Each action
asks for the current administrator password again and requires a reason.
Console-recovery sessions cannot use these controls. Each PostgreSQL mutation
and its audit row commit in the same transaction.

Status shows only Mistral, the policy choice, configured/operational state, and
change timestamps. The credential field is always empty. Status, responses,
SQLite, audits, capability documents, and logs never contain the credential,
its ciphertext, nonce, authentication tag, or seal key.

## Credential storage and restore

The credential travels once over the private Status-to-API control route. The
API immediately seals it with AES-256-GCM, a fresh 96-bit nonce, and the fixed
authenticated binding `local\0MISTRAL\0v1`. PostgreSQL stores only ciphertext,
nonce, authentication tag, key version, and the non-secret seal-key
fingerprint used to detect a restore mismatch without opening the provider
credential. The independent 32-byte seal key
is available only to API/tools through
`HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE`; it is not shared with Status and is not
the patient-identifier encryption key.

The key file contains canonical base64 for exactly 32 random bytes. Backups
carry only its `sha256:<hex>` fingerprint. Restore preflight must fail before
any database mutation when that fingerprint is missing or differs, because a
database restored with another seal key cannot authenticate or recover its
provider credential. The actual key must be escrowed and restored with the
other protected appliance secrets; it must never be embedded in a backup,
manifest, command argument, environment value, or log.

## Fresh-install credential handoff

The policy row is initialized only when absent from
`HOSPITAL_EXTERNAL_AI_DEFAULT` (`true` unless explicitly `false`, `no`, or
`0`). Re-running bootstrap during an update preserves both policy and
credential.

The optional guided-install credential is sent as raw standard input to the
one-shot tools command; it is never an argument or environment variable:

```text
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx --conditions=react-server \
  scripts/configure-hospital-external-ai.ts
```

Standard input is either one Mistral credential (maximum 4096 UTF-8 bytes,
with one final line ending allowed) or empty. Empty input exits successfully
with `{"ok":true,"configured":false,"skipped":true}`. A configured result
contains only `{"ok":true,"configured":true}`. Errors return a fixed code and
never echo input.

## Egress boundary

All four direct provider routes verify the persisted Hospital policy, complete
sealed tuple, and matching seal-key fingerprint before reading a clinical
request body, loading a case for AI, or constructing a prompt/image payload.
They recheck the state and open the credential only immediately before calling
Mistral. Hospital mode
never falls back to `MISTRAL_API_KEY`. A missing, malformed, mismatched, or
unreadable seal key fails closed as `PROVIDER_NOT_CONFIGURED`.

The public/serverless demo has no Status control-plane route or Hospital policy
table behavior. Its existing deployment-supplied provider configuration stays
separate from the appliance controls.
