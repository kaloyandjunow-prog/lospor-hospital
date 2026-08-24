# LOSPOR Hospital PWA

[Български](README.bg.md) | **English**

The installable offline-capable clinical client for LOSPOR Hospital. Browser
requests use the same Hospital origin and cannot fall back to the public demo.

The native package identity is reserved as `org.lospor.hospital`, but the
reference appliance ships the PWA. A native Hospital build requires an
explicit Hospital web/API configuration and a separate release decision.

Use the repository root installation and release documentation.

## Administrator audit screen

The PWA parses only schema version 1 and takes all Bulgarian/English action
labels and filters from the API-owned catalog. It reconstructs privacy-safe
rows instead of retaining unexpected response fields, never displays raw audit
detail or internal target IDs, and uses localized errors when the contract is
unavailable or malformed.
