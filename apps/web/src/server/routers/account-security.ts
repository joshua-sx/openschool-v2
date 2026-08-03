import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { revokeIdentityAccess } from '../../services/identity-revocation'
import { protectedProcedure, router } from '../trpc'

const reason = z.string().trim().min(3).max(512)
const target = z.object({ targetId: z.uuid(), reason })

export const accountSecurityRouter = router({
  revokeSession: protectedProcedure(CAPABILITIES.ACCOUNTS_MANAGE)
    .input(target)
    .mutation(({ ctx, input }) =>
      revokeIdentityAccess(ctx.requestContext, ctx.policyContext, ctx.policyDecision, {
        action: 'account_session_revoke',
        ...input,
      })
    ),
  revokeAllSessions: protectedProcedure(CAPABILITIES.ACCOUNTS_MANAGE)
    .input(target)
    .mutation(({ ctx, input }) =>
      revokeIdentityAccess(ctx.requestContext, ctx.policyContext, ctx.policyDecision, {
        action: 'account_sessions_revoke',
        ...input,
      })
    ),
  disableAccount: protectedProcedure(CAPABILITIES.ACCOUNTS_MANAGE)
    .input(target)
    .mutation(({ ctx, input }) =>
      revokeIdentityAccess(ctx.requestContext, ctx.policyContext, ctx.policyDecision, {
        action: 'account_disable',
        ...input,
      })
    ),
  resetMfa: protectedProcedure(CAPABILITIES.ACCOUNTS_MANAGE)
    .input(target)
    .mutation(({ ctx, input }) =>
      revokeIdentityAccess(ctx.requestContext, ctx.policyContext, ctx.policyDecision, {
        action: 'account_mfa_reset',
        ...input,
      })
    ),
  revokeAffiliation: protectedProcedure(CAPABILITIES.ACCOUNTS_MANAGE)
    .input(target)
    .mutation(({ ctx, input }) =>
      revokeIdentityAccess(ctx.requestContext, ctx.policyContext, ctx.policyDecision, {
        action: 'affiliation_revoke',
        ...input,
      })
    ),
  revokeRole: protectedProcedure(CAPABILITIES.ACCOUNTS_MANAGE)
    .input(target)
    .mutation(({ ctx, input }) =>
      revokeIdentityAccess(ctx.requestContext, ctx.policyContext, ctx.policyDecision, {
        action: 'role_revoke',
        ...input,
      })
    ),
})
