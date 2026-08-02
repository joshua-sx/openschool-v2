import type { TenantDatabaseContext } from '@openschool/db'
import type { PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'

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
    databaseContext.activeEducationOrganizationId !== policyContext.activeEducationOrganizationId ||
    databaseContext.activeSchoolId !== policyContext.activeSchoolId
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'DATABASE_POLICY_CONTEXT_MISMATCH' })
  }
}
