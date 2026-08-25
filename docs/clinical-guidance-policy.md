# Adult and pediatric calculation-guidance policy

[Български](clinical-guidance-policy.bg.md) | **English**

Hospital 1.2.0 treats calculation policy and clinical-baseline readiness as two
independent facts, separately for adult and pediatric cases. Selecting **Yes**
for a policy never claims that the corresponding rules are present or approved.

Pediatric charting itself is a fixed Hospital capability. A clinician can
create, view, and manually document a pediatric case whether calculated
guidance is on, off, ready, or not ready. The bundled Core release review is
also not database readiness.

On a fresh guided installation, Hospital IT answers two independent questions:

- enable bundled guided/precalculated adult dosing; and
- enable bundled guided/precalculated pediatric dosing.

Each defaults to yes. The choices seed the singleton `ClinicalGuidancePolicy`
only when it does not yet exist; re-running bootstrap or applying an update
cannot overwrite a later Status choice. Separately, a clean install invokes the
owner API release provisioner once with explicit `--apply`. It atomically
publishes and selects the reviewed adult and pediatric baselines under a fixed
release-owned technical principal, failing on collisions, partial state,
conflicting selections, or exact-content drift. The installer requires the
read-only report to show **Ready** for both before acceptance. This does not
couple the two policy switches and does not remove manual charting.

## Exact baseline readiness

The API, both clinical-rules runtime routes, the public Hospital capability
projection, the private control plane, the installer report, and Status use one
Hospital database assessment. For each population, **Ready** requires all of
the following:

- a platform selection exists;
- the selected preset is the exact bundled v2 preset identity for that mode,
  with no institution or user owner;
- the preset is published and has a publication timestamp;
- every stored rule validates for publication and its stored key matches its
  payload;
- the rule count and the drug, infusion, fluid, and total profile counts match
  the bundled v2 snapshot; and
- a deterministic SHA-256 over the exact persistence-normalized payloads and
  ordered source references matches the bundled v2 snapshot.

The digest deliberately excludes rule storage-revision labels and every
publisher/selector identity. Status receives only preset identity, version,
status, counts, SHA-256 values, and a fixed reason code—never rule JSON, source
references, names, free text, or actor identifiers.

Status displays **policy enabled**, **baseline readiness**, and **calculated
guidance available now** separately in Bulgarian and English. A missing or
changed baseline is explicitly **Not ready**, even when the policy checkbox is
on. The checkbox cannot publish, select, repair, or approve a baseline.

The authenticated runtime response contains:

```json
{
  "productionReady": false,
  "guidance": {
    "enabled": false,
    "policyEnabled": true,
    "baselineReady": false,
    "prospectiveOnly": true
  }
}
```

`productionReady` now represents baseline content readiness. `guidance.enabled`
is true only when both policy and baseline readiness are true. This keeps Web
and PWA fail-closed while preserving manual-record identity, provenance, routes,
hidden-drug policy, and already recorded or historical case data.

Turning policy off removes future prefilled doses, per-kg/BSA hints,
quick-dose/rate/volume choices, suggested rates/volumes,
concentration/formulation suggestions, calculation-audit proposals, and
reviewed pediatric guidance profiles. Turning it back on exposes suggestions
only if the exact baseline is still ready; neither action recalculates or
rewrites old events. A cached pre-1.2.0 snapshot without explicit policy fails
closed until refreshed.
