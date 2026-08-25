# Authentication deployment contract

LOSPOR Web 1.2 supports two deliberately separate authentication experiences.
The online Cloud Demo remains email-based and keeps public registration and
email recovery. A Hospital appliance switches to administrator-created
usernames only when the API explicitly reports that deployment policy.

## Capability response

`GET /v1/capabilities` (proxied to Web as `/api/capabilities`) must include:

```json
{
  "authentication": {
    "loginIdentifier": "EMAIL",
    "selfRegistration": true,
    "passwordRecovery": "EMAIL"
  }
}
```

The released Hospital tuple is:

```json
{
  "authentication": {
    "loginIdentifier": "USERNAME",
    "selfRegistration": false,
    "passwordRecovery": "ADMINISTRATOR"
  }
}
```

The exact usable frontend enums are `EMAIL | USERNAME` and
`EMAIL | ADMINISTRATOR`. A raw `UNAVAILABLE` recovery value is never exposed as
a usable Hospital capability: Web mounts no form for that fail-closed tuple.
For compatibility, an older email deployment's `UNAVAILABLE` value keeps email
login but hides the recovery link. Web also understands the pre-1.2 Cloud
response, which has `selfRegistration` and `passwordRecovery` but no
`loginIdentifier`, as email-based so an independently deployed Web update does
not break the public demo.

Only the exact `USERNAME` / `false` / `ADMINISTRATOR` tuple opens the Hospital
UI boundary: Web uses a username field, sends a username-shaped login request,
and suppresses public registration and email recovery. A partial,
`UNAVAILABLE`, unknown, or contradictory tuple mounts no form and never falls
back to email. The API remains authoritative and must reject those operations
too.

## Login request contract required from the API

For an `EMAIL` deployment, `POST /v1/auth/session` keeps accepting:

```json
{ "email": "clinician@example.org", "password": "…" }
```

For a `USERNAME` deployment, the same endpoint must accept exactly:

```json
{ "username": "Ivan.Petrov_2", "password": "…" }
```

Hospital mode must not accept email as a login fallback. The successful,
failed, rate-limited, and administrator-MFA continuation response shapes stay
unchanged, so the identifier changes without creating a second session flow.

The Hospital API must also independently disable public account creation and
email-initiated password recovery. Direct calls must not become available just
because a caller bypasses the hidden Web links. Administrator account creation
and administrator password reset are separate authenticated operations.

## Username storage and comparison

A Hospital username has these exact rules:

- 3–64 characters;
- first character is a Latin letter (`A–Z` or `a–z`);
- remaining characters are Latin letters, digits, dot, underscore, or hyphen;
- spaces, `@`, slash, backslash, non-Latin letters, and control characters are
  rejected.

Web validates the spelling but sends it exactly as entered, including letter
case. The API and database must retain that display spelling and derive a
separate ASCII-lowercase comparison key. A unique index on that key must make
matching and uniqueness case-insensitive across the appliance. Do not silently
trim or rewrite an invalid username. Existing first name, family name, title,
and full display-name fields remain separate and continue to allow Cyrillic.

Creation and rename operations must enforce the same rule and unique key inside
one transaction. A duplicate must return a stable machine-readable error code;
raw database or account details must not be exposed. Login failure should keep
the same non-enumerating response for an unknown username and a wrong password.

## Web route behavior

While the capability request is pending, Web does not mount an identifier,
registration, or recovery form. Once resolved:

- `EMAIL`: login renders the email field and links to `/register` and
  `/forgot-password` according to the reported self-service flags;
- `USERNAME`: login renders only the username field and administrator guidance;
- direct visits to `/register` and `/forgot-password` render an administrator-
  managed explanation in Hospital mode instead of mounting their public forms;
- Terms, Privacy, language selection, theme, MFA continuation, locale adoption,
  and safe callback navigation remain available in both modes.

A successful pre-1.2 Cloud response that contains the released authentication
object but omits only `loginIdentifier` retains email behavior. A missing,
malformed, unreachable, or non-successful policy response mounts no login,
registration, or recovery form, so Web cannot accidentally offer an email
fallback on a Hospital appliance. Server-side deployment policy remains
authoritative after the capability is loaded.
