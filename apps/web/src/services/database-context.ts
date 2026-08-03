import { getStudentSliceEnv } from '@openschool/config/server'
import type { DatabasePolicyContext, TenantDatabaseContext } from '@openschool/db'
import type { AllowedPolicyDecision, PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'

export function assertStudentSliceEnabled(): void {
  if (getStudentSliceEnv().OPENSCHOOL_STUDENT_SLICE_MODE !== 'forced_rls') {
    throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'STUDENT_SLICE_DISABLED' })
  }
}

/** Prevents a valid Policy Decision from being replayed under another DB context. */
export function assertDatabasePolicyContext(
  databaseContext: TenantDatabaseContext,
  policyContext: PolicyContext
): void {
  if (
    databaseContext.accountId !== policyContext.accountId ||
    databaseContext.personId !== policyContext.personId ||
    databaseContext.tenantId !== policyContext.tenantId ||
    databaseContext.assuranceLevel !== policyContext.assuranceLevel ||
    databaseContext.reauthenticatedAt !== policyContext.authenticatedAt ||
    databaseContext.activeEducationOrganizationId !== policyContext.activeEducationOrganizationId ||
    databaseContext.activeSchoolId !== policyContext.activeSchoolId
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'DATABASE_POLICY_CONTEXT_MISMATCH' })
  }
}

/** Converts only an allowed, Tenant-scoped Policy Decision into database scope. */
export function toDatabasePolicyContext(
  decision: AllowedPolicyDecision
): Readonly<DatabasePolicyContext> {
  const queryConstraints = decision.queryConstraints.map((constraint) => {
    if (constraint.kind === 'platform') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'DATABASE_POLICY_SCOPE_UNSUPPORTED' })
    }
    return Object.freeze({ ...constraint })
  })
  return Object.freeze({
    capability: decision.capability,
    policyVersion: decision.policyVersion,
    queryConstraints: Object.freeze(queryConstraints),
  })
}
