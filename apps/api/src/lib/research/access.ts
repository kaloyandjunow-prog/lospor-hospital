import type {
  ResearchDataAction,
  ResearchMetadata,
  ResearchPermissionSet,
  ResearchScopeKind,
  ResearchScopeSummary,
} from "@lospor/core/research"
import type { Prisma } from "@/generated/prisma/client"
import type { AuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export type ResearchActionScope = ResearchScopeSummary & {
  allInstitutions: boolean
  caseScope: Prisma.CaseWhereInput
}

export type ResearchContext = {
  user: AuthUser
  action: ResearchDataAction
  actionScopes: Record<ResearchDataAction, ResearchActionScope>
  shareScope: ResearchActionScope
  activeScope: ResearchActionScope
  scopeKind: ResearchScopeKind
  institutionIds: string[]
  institutionLabels: string[]
  caseScope: Prisma.CaseWhereInput
  permissions: ResearchPermissionSet
}

const DENIED: ResearchPermissionSet = {
  query: false,
  inspectCases: false,
  compare: false,
  benchmark: false,
  savePrivateCohorts: false,
  shareInstitutionCohorts: false,
  export: false,
  exportOmop: false,
  manageAccess: false,
}

function allowed(overrides: Partial<ResearchPermissionSet>): ResearchPermissionSet {
  return {
    ...DENIED,
    query: true,
    compare: true,
    benchmark: true,
    savePrivateCohorts: true,
    ...overrides,
  }
}

function granularAllowed(
  query: boolean,
  overrides: Partial<ResearchPermissionSet>,
): ResearchPermissionSet {
  return {
    ...DENIED,
    query,
    compare: query,
    benchmark: query,
    savePrivateCohorts: query,
    ...overrides,
  }
}

const ACTIONS: ResearchDataAction[] = ["query", "inspectCases", "export", "exportOmop"]

function emptyScope(kind: ResearchScopeKind = "GRANT"): ResearchActionScope {
  return {
    kind,
    institutionIds: [],
    institutionLabels: [],
    allInstitutions: false,
    caseScope: { id: { in: [] } },
  }
}

function fixedScope(
  kind: ResearchScopeKind,
  institutions: Array<{ id: string; name: string }>,
  allInstitutions = false,
): ResearchActionScope {
  return {
    kind,
    institutionIds: institutions.map(item => item.id),
    institutionLabels: institutions.map(item => item.name),
    allInstitutions,
    caseScope: { institutionId: { in: institutions.map(item => item.id) } },
  }
}

function activateResearchScope(
  context: Omit<ResearchContext, "action" | "activeScope" | "scopeKind" | "institutionIds" | "institutionLabels" | "caseScope">,
  action: ResearchDataAction,
): ResearchContext {
  const activeScope = context.actionScopes[action]
  return {
    ...context,
    action,
    activeScope,
    scopeKind: activeScope.kind,
    institutionIds: activeScope.institutionIds,
    institutionLabels: activeScope.institutionLabels,
    caseScope: activeScope.caseScope,
  }
}

export function researchContextForAction(
  context: ResearchContext,
  action: ResearchDataAction,
): ResearchContext {
  return activateResearchScope({
    user: context.user,
    actionScopes: context.actionScopes,
    shareScope: context.shareScope,
    permissions: context.permissions,
  }, action)
}

function sameScopeForAllActions(scope: ResearchActionScope) {
  return Object.fromEntries(ACTIONS.map(action => [action, scope])) as Record<
    ResearchDataAction,
    ResearchActionScope
  >
}

export async function resolveResearchContext(user: AuthUser): Promise<ResearchContext | null> {
  const hospital = isHospitalDeployment()
  if (user.role === "ADMIN") {
    if (!hospital) {
      const institutions = await prisma.institution.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
      const scope = fixedScope("ALL", institutions, true)
      return activateResearchScope({
        user,
        actionScopes: sameScopeForAllActions(scope),
        shareScope: scope,
        permissions: allowed({
          inspectCases: true,
          shareInstitutionCohorts: true,
          export: true,
          exportOmop: true,
          manageAccess: true,
        }),
      }, "query")
    }
  }

  if (!hospital && user.role === "HEAD_OF_DEPT" && user.institutionId) {
    const institution = { id: user.institutionId, name: user.institutionName ?? "Institution" }
    const scope = fixedScope("INSTITUTION", [institution])
    return activateResearchScope({
      user,
      actionScopes: {
        query: scope,
        inspectCases: scope,
        export: scope,
        exportOmop: emptyScope("INSTITUTION"),
      },
      shareScope: scope,
      permissions: allowed({
        inspectCases: true,
        shareInstitutionCohorts: true,
        export: true,
      }),
    }, "query")
  }

  if (!hospital && user.role !== "RESEARCHER") return null
  if (hospital && !["ADMIN", "HEAD_OF_DEPT", "MEMBER", "RESEARCHER"].includes(user.role)) {
    return null
  }

  const now = new Date()
  const grants = await prisma.researchAccessGrant.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(hospital
        ? { supersededAt: null, expiresAt: { gt: now } }
        : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }),
    },
    include: { institution: { select: { id: true, name: true } } },
  })
  const implicitAdminQuery = hospital && user.role === "ADMIN"
  if (!grants.length && !implicitAdminQuery) return null

  const needsAllInstitutions = implicitAdminQuery || grants.some(grant => grant.allInstitutions)
  const allInstitutions = needsAllInstitutions
    ? await prisma.institution.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : []

  const actionGrants = (action: ResearchDataAction) => grants.filter(grant => {
    if (action === "query") return hospital ? grant.canQuery : true
    if (action === "inspectCases") return grant.canInspectCases
    if (action === "export") return hospital ? grant.canExportCsv || grant.canExportJson : grant.canExport
    return hospital
      ? grant.canExportOmop && (grant.canExportCsv || grant.canExportJson)
      : grant.canExport && grant.canExportOmop
  })
  const scopeFromGrants = (permitted: typeof grants): ResearchActionScope => {
    if (!permitted.length) return emptyScope()
    if (permitted.some(grant => grant.allInstitutions)) {
      return fixedScope("ALL", allInstitutions, true)
    }
    const institutions = permitted
      .flatMap(grant => grant.institution ? [grant.institution] : [])
      .filter((institution, index, values) =>
        values.findIndex(value => value.id === institution.id) === index)
    return fixedScope("GRANT", institutions)
  }
  const scopeFor = (action: ResearchDataAction): ResearchActionScope => {
    if (action === "query" && implicitAdminQuery) {
      return fixedScope("ALL", allInstitutions, true)
    }
    return scopeFromGrants(actionGrants(action))
  }

  const actionScopes = {
    query: scopeFor("query"),
    inspectCases: scopeFor("inspectCases"),
    export: scopeFor("export"),
    exportOmop: scopeFor("exportOmop"),
  }

  const queryAllowed = implicitAdminQuery || actionGrants("query").length > 0
  return activateResearchScope({
    user,
    actionScopes,
    shareScope: hospital
      ? scopeFromGrants(grants.filter(grant => grant.canShare))
      : emptyScope(),
    permissions: hospital ? granularAllowed(queryAllowed, {
      inspectCases: actionGrants("inspectCases").length > 0,
      shareInstitutionCohorts: grants.some(grant => grant.canShare),
      export: actionGrants("export").length > 0,
      exportOmop: actionGrants("exportOmop").length > 0,
    }) : allowed({
      inspectCases: actionGrants("inspectCases").length > 0,
      export: actionGrants("export").length > 0,
      exportOmop: actionGrants("exportOmop").length > 0,
    }),
  }, "query")
}

export function metadataScope(
  context: ResearchContext,
  action: ResearchDataAction = "query",
): ResearchMetadata["scope"] {
  const scope = context.actionScopes[action]
  return {
    kind: scope.kind,
    institutionIds: scope.institutionIds,
    institutionLabels: scope.institutionLabels,
  }
}

export function metadataScopes(context: ResearchContext): ResearchMetadata["scopes"] {
  return Object.fromEntries(ACTIONS.map(action => [action, metadataScope(context, action)])) as ResearchMetadata["scopes"]
}

export function canInspectEntireQueryScope(context: ResearchContext): boolean {
  const query = context.actionScopes.query
  const inspect = context.actionScopes.inspectCases
  if (query.allInstitutions) return inspect.allInstitutions
  if (inspect.allInstitutions) return true
  return query.institutionIds.every(id => inspect.institutionIds.includes(id))
}

export function canUseInstitution(
  context: ResearchContext,
  institutionId: string,
  action: ResearchDataAction = context.action,
): boolean {
  const scope = context.actionScopes[action]
  return scope.allInstitutions || scope.institutionIds.includes(institutionId)
}

export function canShareInstitution(context: ResearchContext, institutionId: string): boolean {
  return context.shareScope.allInstitutions
    || context.shareScope.institutionIds.includes(institutionId)
}

/**
 * Select one active immutable grant that covers the complete frozen export.
 * Combining narrow grants into one artifact would make an exact Status
 * approval impossible to bind to one authority, so multi-institution exports
 * require an all-institutions grant.
 */
export async function researchGrantForExport(input: {
  userId: string
  format: "csv" | "json" | "omop-csv" | "omop-json"
  institutionIds: readonly string[]
}) {
  const now = new Date()
  const csv = input.format === "csv" || input.format === "omop-csv"
  const omop = input.format === "omop-csv" || input.format === "omop-json"
  const grants = await prisma.researchAccessGrant.findMany({
    where: {
      userId: input.userId,
      revokedAt: null,
      supersededAt: null,
      expiresAt: { gt: now },
      ...(csv ? { canExportCsv: true } : { canExportJson: true }),
      ...(omop ? { canExportOmop: true } : {}),
    },
    orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
  })
  return grants.find(grant => grant.allInstitutions
    || (input.institutionIds.length === 1
      && grant.institutionId === input.institutionIds[0])) ?? null
}
