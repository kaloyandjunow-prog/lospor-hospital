import type { AuditActionCode } from "@/lib/audit-actions"

export type HospitalAuditRequirement =
  | "ACCOUNT_PROVISION"
  | "TOKEN_REISSUE"
  | "ACTIVATION"
  | "APPROVAL_REJECTION"
  | "ROLE_CHANGE"
  | "ADMIN_AUTHORITY"
  | "INSTITUTION_CHANGE"
  | "PASSWORD_CHANGE_RECOVERY"
  | "SESSION_REVOCATION"
  | "SUSPEND_REACTIVATE"
  | "DELETE_RESTORE_ANONYMISE"
  | "LEGAL_ACCEPTANCE"
  | "RESEARCH_CHANGE"
  | "CLINICAL_RULE_GOVERNANCE"
  | "CENTRAL_CONTROL"

type TransactionSource = Readonly<{
  path: string
  actionCodes: readonly AuditActionCode[]
  transactionMarker: "$transaction" | "withDirectTransaction"
}>

type TransactionalCoverage = Readonly<{
  id: string
  requirement: HospitalAuditRequirement
  transition: string
  disposition: "HOSPITAL_TRANSACTIONAL"
  sources: readonly TransactionSource[]
  rollback: Readonly<{
    kind: "UNIT_INJECTION" | "POSTGRES_INTEGRATION"
    evidencePath: string
    marker: string
  }>
}>

type NoMutationCoverage = Readonly<{
  id: string
  requirement: HospitalAuditRequirement
  transition: string
  disposition: "HOSPITAL_NO_MUTATION"
  evidencePath: string
  marker: string
  limit: string
}>

type ProvenanceBlockedCoverage = Readonly<{
  id: string
  requirement: HospitalAuditRequirement
  transition: string
  disposition: "PROVENANCE_BLOCKED"
  blockedSources: readonly string[]
  limit: string
}>

type DecisionBlockedCoverage = Readonly<{
  id: string
  requirement: HospitalAuditRequirement
  transition: string
  disposition: "DECISION_BLOCKED"
  blockedSources: readonly string[]
  limit: string
}>

export type HospitalAuditGovernanceCoverage =
  | TransactionalCoverage
  | NoMutationCoverage
  | ProvenanceBlockedCoverage
  | DecisionBlockedCoverage

const DATABASE_ROLLBACK = {
  kind: "POSTGRES_INTEGRATION",
  evidencePath: "src/__tests__/audit-atomicity-postgres.test.ts",
  marker: "HAUD_ROLLBACK:hospital-database-atomicity",
} as const

/**
 * Executable Hospital overlay inventory for HAUD-01.
 *
 * `PROVENANCE_BLOCKED` means the current owner tree has the generic lifecycle,
 * but Hospital's pinned public import does not. It must arrive through the
 * public release -> recorded vendor import path, not a hand-copied route.
 */
export const HOSPITAL_AUDIT_GOVERNANCE_INVENTORY = [
  {
    id: "hospital-provision-activation-recovery",
    requirement: "ACCOUNT_PROVISION",
    transition: "Issue a Hospital account and activation/recovery lifecycle",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [{
      path: "src/lib/hospital/account-provisioning.ts",
      actionCodes: [
        "HOSPITAL_ACCOUNT_CREATED",
        "HOSPITAL_ACCOUNT_ACTIVATION_ISSUED",
        "HOSPITAL_ACCOUNT_ACTIVATION_REISSUED",
        "HOSPITAL_ACCOUNT_RECOVERY_ISSUED",
        "HOSPITAL_ACCOUNT_ACTIVATED",
        "HOSPITAL_ACCOUNT_RECOVERY_CONSUMED",
      ],
      transactionMarker: "$transaction",
    }],
    rollback: {
      kind: "UNIT_INJECTION",
      evidencePath: "src/lib/hospital/account-provisioning.test.ts",
      marker: "HAUD_ROLLBACK:hospital-account-provisioning",
    },
  },
  {
    id: "appliance-bootstrap-and-operator",
    requirement: "ADMIN_AUTHORITY",
    transition: "Create the first appliance administrator and initialize/rotate/transfer/reconcile its operator",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "scripts/bootstrap-hospital-admin.ts",
        actionCodes: [
          "HOSPITAL_INSTALLATION_INSTITUTION_CREATE",
          "HOSPITAL_APPLIANCE_ADMIN_CREATED",
        ],
        transactionMarker: "$transaction",
      },
      {
        path: "scripts/lib/appliance-operator-db.ts",
        actionCodes: [
          "HOSPITAL_APPLIANCE_OPERATOR_INITIALIZE",
          "HOSPITAL_APPLIANCE_OPERATOR_ROTATE",
          "HOSPITAL_APPLIANCE_OPERATOR_TRANSFER",
          "HOSPITAL_APPLIANCE_OPERATOR_RECONCILE",
          "HOSPITAL_INSTALLATION_INSTITUTION_UPDATE",
        ],
        transactionMarker: "$transaction",
      },
    ],
    rollback: {
      kind: "UNIT_INJECTION",
      evidencePath: "src/__tests__/appliance-operator-db.test.ts",
      marker: "HAUD_ROLLBACK:appliance-operator",
    },
  },
  {
    id: "hospital-account-activation",
    requirement: "ACTIVATION",
    transition: "Consume a Hospital activation link or the retained generic verification link",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "src/lib/hospital/account-provisioning.ts",
        actionCodes: ["HOSPITAL_ACCOUNT_ACTIVATED"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/auth/verify-email/route.ts",
        actionCodes: ["ACCOUNT_ACTIVATE"],
        transactionMarker: "$transaction",
      },
    ],
    rollback: DATABASE_ROLLBACK,
  },
  {
    id: "existing-admin-account-and-approval",
    requirement: "APPROVAL_REJECTION",
    transition: "Create or approve an account through the existing administrator surface",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "src/app/v1/admin/users/route.ts",
        actionCodes: ["HOSPITAL_USER_CREATE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/admin/users/[id]/approve/route.ts",
        actionCodes: ["USER_APPROVE"],
        transactionMarker: "$transaction",
      },
    ],
    rollback: DATABASE_ROLLBACK,
  },
  {
    id: "role-and-institution-authority",
    requirement: "ROLE_CHANGE",
    transition: "Submit/resolve HOD authority and change institution membership",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "src/app/v1/admin/users/[id]/route.ts",
        actionCodes: ["ADMIN_ACCOUNT_AUTHORITY_CHANGE", "ADMIN_ACCOUNT_DELETE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/role-request/route.ts",
        actionCodes: ["ROLE_REQUEST_SUBMIT"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/admin/role-requests/[id]/route.ts",
        actionCodes: ["HOD_ROLE_REQUEST_APPROVE", "HOD_ROLE_REQUEST_REJECT"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/user/institution-request/route.ts",
        actionCodes: ["INSTITUTION_CHANGE_REQUEST_SUBMIT", "INSTITUTION_CHANGE_SELF_LEAVE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/admin/institution-requests/[id]/route.ts",
        actionCodes: ["INSTITUTION_CHANGE_APPROVE", "INSTITUTION_CHANGE_REJECT"],
        transactionMarker: "$transaction",
      },
    ],
    rollback: DATABASE_ROLLBACK,
  },
  {
    id: "existing-account-legal-lifecycle",
    requirement: "DELETE_RESTORE_ANONYMISE",
    transition: "Activate/recover/delete/anonymise an account and record the installed combined legal acceptance",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "src/app/v1/auth/verify-email/route.ts",
        actionCodes: ["ACCOUNT_ACTIVATE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/auth/password-reset/confirm/route.ts",
        actionCodes: ["PASSWORD_RECOVERY"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/user/delete/route.ts",
        actionCodes: ["ACCOUNT_DELETE_REQUEST"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/lib/purge-deleted.ts",
        actionCodes: ["ACCOUNT_ANONYMISED"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/user/accept-terms/route.ts",
        actionCodes: ["LEGAL_ACCEPTANCE_RECORD"],
        transactionMarker: "$transaction",
      },
    ],
    rollback: DATABASE_ROLLBACK,
  },
  {
    id: "institution-membership-decisions",
    requirement: "INSTITUTION_CHANGE",
    transition: "Request, leave, approve, or reject institution membership",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "src/app/v1/user/institution-request/route.ts",
        actionCodes: ["INSTITUTION_CHANGE_REQUEST_SUBMIT", "INSTITUTION_CHANGE_SELF_LEAVE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/admin/institution-requests/[id]/route.ts",
        actionCodes: ["INSTITUTION_CHANGE_APPROVE", "INSTITUTION_CHANGE_REJECT"],
        transactionMarker: "$transaction",
      },
    ],
    rollback: DATABASE_ROLLBACK,
  },
  {
    id: "clinical-rules-workbench",
    requirement: "CLINICAL_RULE_GOVERNANCE",
    transition: "Create/edit/delete/replace/publish/select/clear API-managed clinical rules",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [{
      path: "src/lib/clinical-rules/service.ts",
      actionCodes: [
        "CLINICAL_RULESET_CREATE",
        "CLINICAL_RULESET_RULE_UPSERT",
        "CLINICAL_RULESET_PEDIATRIC_DRUG_REPLACE",
        "CLINICAL_RULESET_RULE_DELETE",
        "CLINICAL_RULESET_PUBLISH",
        "CLINICAL_RULESET_SELECT",
        "CLINICAL_RULESET_SELECTION_CLEAR",
      ],
      transactionMarker: "$transaction",
    }],
    rollback: {
      kind: "UNIT_INJECTION",
      evidencePath: "src/__tests__/clinical-rule-service.test.ts",
      marker: "HAUD_ROLLBACK:clinical-rules-workbench",
    },
  },
  {
    id: "hospital-policy-and-central-control",
    requirement: "CENTRAL_CONTROL",
    transition: "Change guidance/external-AI/Central policy, transport, retry, or per-case export decision; privacy-minimal Central discovery remains read-only",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "src/lib/hospital/control-plane.ts",
        actionCodes: [
          "HOSPITAL_GUIDANCE_POLICY_UPDATE",
          "HOSPITAL_EXTERNAL_AI_POLICY_UPDATE",
          "HOSPITAL_EXTERNAL_AI_CREDENTIAL_REPLACE",
          "HOSPITAL_EXTERNAL_AI_CREDENTIAL_REMOVE",
          "HOSPITAL_CENTRAL_CLINICAL_POLICY_UPDATE",
          "HOSPITAL_CENTRAL_BATCH_RETRY",
        ],
        transactionMarker: "$transaction",
      },
      {
        path: "src/lib/hospital/enrollment.ts",
        actionCodes: ["HOSPITAL_CENTRAL_TRANSPORT_CONFIGURE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/hospital/cases/[id]/export-control/route.ts",
        actionCodes: ["CASE_CENTRAL_DELIVERY_ACTION"],
        transactionMarker: "withDirectTransaction",
      },
    ],
    rollback: DATABASE_ROLLBACK,
  },
  {
    id: "research-mutations",
    requirement: "RESEARCH_CHANGE",
    transition: "Change saved cohorts, export creation, grants, or OMOP approval",
    disposition: "HOSPITAL_TRANSACTIONAL",
    sources: [
      {
        path: "src/app/v1/research/cohorts/route.ts",
        actionCodes: ["RESEARCH_COHORT_CREATE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/research/cohorts/[id]/route.ts",
        actionCodes: ["RESEARCH_COHORT_UPDATE", "RESEARCH_COHORT_DELETE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/lib/research/exports.ts",
        actionCodes: ["RESEARCH_EXPORT_CREATE"],
        transactionMarker: "withDirectTransaction",
      },
      {
        path: "src/app/v1/research/grants/route.ts",
        actionCodes: ["RESEARCH_GRANT_CREATE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/app/v1/research/grants/[id]/route.ts",
        actionCodes: ["RESEARCH_GRANT_UPDATE", "RESEARCH_GRANT_REVOKE"],
        transactionMarker: "$transaction",
      },
      {
        path: "src/lib/hospital/research-control.ts",
        actionCodes: [
          "HOSPITAL_RESEARCH_GRANT_ISSUE",
          "HOSPITAL_RESEARCH_GRANT_SUPERSEDE",
          "HOSPITAL_RESEARCH_GRANT_REVOKE",
          "HOSPITAL_OMOP_EXPORT_APPROVE",
        ],
        transactionMarker: "$transaction",
      },
    ],
    rollback: DATABASE_ROLLBACK,
  },
  {
    id: "hospital-self-registration-disabled",
    requirement: "ACCOUNT_PROVISION",
    transition: "Public self-registration on the Hospital deployment",
    disposition: "HOSPITAL_NO_MUTATION",
    evidencePath: "src/app/v1/auth/register/route.ts",
    marker: "SELF_REGISTRATION_DISABLED",
    limit: "Hospital accounts are issued through Status; the public serverless branch is unreachable in Hospital mode.",
  },
  {
    id: "generic-token-issue-owner-import",
    requirement: "TOKEN_REISSUE",
    transition: "Revoke prior generic verification/reset tokens and issue one replacement with audit evidence",
    disposition: "PROVENANCE_BLOCKED",
    blockedSources: [
      "src/app/v1/auth/verify-email/resend/route.ts",
      "src/app/v1/auth/password-reset/request/route.ts",
    ],
    limit: "Current owner API implements these transactional reissue actions; Hospital's pinned 9.3.0 tree must receive them through a recorded public release/vendor import rather than a manual generic-route copy.",
  },
  {
    id: "owner-advanced-account-lifecycle-import",
    requirement: "SESSION_REVOCATION",
    transition: "Password change, session revocation, suspension/reactivation, restore, and separate legal acceptance",
    disposition: "PROVENANCE_BLOCKED",
    blockedSources: [],
    limit: "Pinned Hospital lacks owner AuthSession, LegalAcceptance, suspended/recovery/anonymized fields and their routes. Import the public owner release before implementing these generic workflows.",
  },
  {
    id: "owner-suspend-reactivate-import",
    requirement: "SUSPEND_REACTIVATE",
    transition: "Suspend or reactivate an account and revoke its sessions",
    disposition: "PROVENANCE_BLOCKED",
    blockedSources: [],
    limit: "The required owner schema and routes are absent from the pinned vendor tree.",
  },
  {
    id: "owner-password-change-import",
    requirement: "PASSWORD_CHANGE_RECOVERY",
    transition: "Authenticated password change with session revocation",
    disposition: "PROVENANCE_BLOCKED",
    blockedSources: [],
    limit: "The current owner route depends on session/recovery fields absent from Hospital's pinned import; existing password recovery completion is transactional.",
  },
  {
    id: "owner-legal-refresh-import",
    requirement: "LEGAL_ACCEPTANCE",
    transition: "Separate exact Terms and Privacy acceptance refresh",
    disposition: "PROVENANCE_BLOCKED",
    blockedSources: [],
    limit: "Hospital currently has the older combined terms fields; LegalAcceptance and separate descriptors must arrive from the public owner release.",
  },
  {
    id: "owner-clinical-publication-confirmation-import",
    requirement: "CLINICAL_RULE_GOVERNANCE",
    transition: "Independent immutable publication confirmation evidence",
    disposition: "PROVENANCE_BLOCKED",
    blockedSources: [],
    limit: "ClinicalRulesetPublicationEvidence is absent from the pinned Hospital schema and must not be hand-copied around provenance.",
  },
  {
    id: "actorless-operator-scripts",
    requirement: "CLINICAL_RULE_GOVERNANCE",
    transition: "Mutate rules or reviewer credentials from scripts that cannot name a truthful actor",
    disposition: "DECISION_BLOCKED",
    blockedSources: [
      "scripts/create-platform-clinical-drafts.ts",
      "scripts/create-pediatric-v2-platform-draft.ts",
      "scripts/append-pediatric-fluid-profiles-to-draft.ts",
      "scripts/append-pediatric-infusion-profiles-to-draft.ts",
      "scripts/prune-clinical-rulesets.ts",
      "scripts/seed-play-reviewer.ts",
    ],
    limit: "Choose an explicitly selected administrator or a narrowly scoped non-human system principal; do not falsely attribute the mutation to the affected account.",
  },
] as const satisfies readonly HospitalAuditGovernanceCoverage[]
