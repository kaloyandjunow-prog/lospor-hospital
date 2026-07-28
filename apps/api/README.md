# LOSPOR Hospital API

The Hospital API owns the local operational database, authentication,
authorization, clinical writes, audit records, local research access, and
policy-controlled delivery to LOSPOR Central.

It is not the public serverless API. Production configuration comes from the
repository root `compose.yaml` and `.env`; `.env.example` here is only for local
API development.

Use the root installation and release documentation. Do not deploy this
directory independently.
